import fregex from "./fregex.js";

let terminator = fregex.lookAhead(
	fregex.or(
		fregex.end,
		fregex.not('(')
	)
);
let property = fregex(
	fregex.or(
		fregex('.', {type: 'identifier'}), //.item
		fregex('[', fregex.or({type: 'string'}, {type: 'number'}), ']') // ['item']
	),
	terminator
);

let varExpressionCache = {};

var Parse = {
	/**
	 * Create a fregex to find expressions that start with "this" or with local variables.
	 * @param vars
	 * @returns {function(*): (boolean|number)} */
	createVarExpression_(vars=[]) {
		let key = vars.join(','); // Benchmarking shows this cache does speed things up a little.
		let result = varExpressionCache[key];
		if (result)
			return result;

		return varExpressionCache[key] = fregex(
			fregex.or(
				fregex('this', fregex.oneOrMore(property)),
				...vars.map(v => fregex(v, fregex.zeroOrMore(property)))
			),
			terminator
		);
	},


	/**
	 * @param tokens {Token[]}
	 * @returns {string[]} */
	filterArgNames(tokens) {
		let result = [];
		let find = 1; // Don't find identifiers after an =.
		for (let token of tokens) {
			if (find === 1 && token.type === 'identifier')
				result.push(token + '');
			find = {',': 1, '=': -1}[token] || find;
		}
		return result;
	},

	/**
	 * Recursively replace #{...} with ${Refract.htmlEncode(...)}
	 * @param tokenList {Token[]}
	 * @param mode
	 * @param className
	 * @returns {Token[]} */
	replaceHashExpr(tokenList, mode, className) {
		let result = [];
		let isHash = false;
		for (let token of tokenList) {
			// TODO: Completely recreate the original tokens, instead of just string versions of them:
			if (token.tokens) {
				let tokens = Parse.replaceHashExpr(token.tokens, token.mode, className);
				result.push(Object.assign(tokens.join(''), {type: token.type, tokens, mode: token.mode}));
			}
			else if (token == '#{' && token.type == 'expr') {
				result.push('${', className, '.', 'htmlEncode', '(');
				isHash = true;
			}
			else
				result.push(token+'');
		}

		if (isHash) { // Add the closing paren around htmlEncode
			let extra = [];
			if (mode === 'squote') // Escape quotes if we're inside an attribute
				extra = [',', `"'"`];
			else if (mode === 'dquote')
				extra = [',', `'"'`];

			result.splice(result.length - 1, 0, ...extra, ')');
		}


		return result;
	},

	/**
	 * Return the tokens if they're a single map() expression and nothing more.  E.g:
	 * this.items.map(x => x)
	 * or
	 * this.items.map(x => `<p>${... any other expressions ...}</p>`)
	 * or
	 * this.items.map((x, index, array) => `<p>${... any other expressions ...}</p>`)
	 *
	 * TODO:  this.items.map(function(x) { return x})
	 *
	 * @param tokens {Token[]}
	 * @param vars {string[]} Name of variables in scope.  So we can have more than just `this.varname`
	 * @returns {[string[], Token[]]|[null, null]} The loop param names and the loop body. */
	simpleMapExpression_(tokens, vars=[]) {

		let loopMatch = [
			Parse.createVarExpression_(vars),
			'.', 'map', '('
		];
		let loopParamMatch = [
			fregex.or([
				{type: 'identifier'},
				['(', Parse.argList, ')'] // match any number of arguments.
			]),
			'=>'
		];

		// this.array.map(
		let mapExpr = fregex.matchFirst(loopMatch, tokens)
		if (!mapExpr)
			return [null, null];

		// (item, i, array) =>
		let paramExpr = fregex.matchFirst(loopParamMatch, tokens.slice(mapExpr.length));
		if (!paramExpr)
			return [null, null];
		let loopParamNames = Parse.filterArgNames(tokens.slice(mapExpr.length, mapExpr.length + paramExpr.length));

		// Loop through remaining tokens, keep track of braceDepth, bracketDepth, and parenDepth, until we reach a closing ).
		let loopBody = [];
		let braceDepth=0, bracketDepth=0, parenDepth=0;
		let bodyTokens = tokens.slice(mapExpr.length + paramExpr.length);
		for (let i=0, token; token=bodyTokens[i]; i++) {

			braceDepth   += {'{':1, '}':-1}[token] | 0; // Single | gives the same result as double ||, yields smaller minified size.
			bracketDepth += {'[':1, ']':-1}[token] | 0;
			parenDepth   += {'(':1, ')':-1}[token] | 0;

			// We reached the closing parenthesee.
			if (braceDepth === 0 && bracketDepth === 0 && parenDepth === -1) {
				if (i === bodyTokens.length - 1)
					return [loopParamNames, loopBody];
				else // Has extra tokens at the end.  Therefore this isn't a simple map expr.
					break; // e.g. this.array.map(...).reduce(...)
			} else
				loopBody.push(token)

		}

		return [null, null];
	},

	/**
	 *
	 * It should match:
	 * Object.keys(this.obj).map(x => `...`);
	 * Object.values(this.obj).map(x => `...`);
	 * Object.entries(this.obj).map(([key, value]) => ``
	 *
	 *
	 * @param tokens
	 * @param vars
	 * @private
	 */
	objectMapExpression_(tokens, vars=[]) {



	},


	/**
	 * Find expressions that start with "this" or with local variables.
	 * @param tokens {Token[]}
	 * @param vars {string[]} List of local variables.
	 * @returns {Token[][]} */
	varExpressions_(tokens, vars=[]) {
		let result = fregex.matchAll(Parse.createVarExpression_(vars), tokens);

		// Discard any paths that come after a ".", which means they occur within another variable expression.
		// E.g. we dont' want to return "a.b" and also the "b" from the second part of that path.
		return result.filter(path => tokens[path.index-1] != '.');
	},

	/**
	 * ['this', '.', 'fruits', '[', '0', ']'] becomes ['this', 'fruits', '0']
	 * @param expr {string[]}
	 * @returns {string[]} */
	varExpressionToPath_(expr) {
		let result = [];
		for (let piece of expr)
			if (piece == 'this' || piece.type === 'identifier' || piece.type === 'number')
				result.push(piece + '');
			else if (piece.type === 'string') // part of this['that']['somethingElse']
				result.push(JSON.parse(piece)); // Evaluate string.
		return result;
	}
};

// Whitespace
Parse.ws = fregex.zeroOrMore(fregex.or(
	{type: 'whitespace'}, {type: 'ln'}
));


Parse.arg = fregex([
	{type: 'identifier'},
	Parse.ws,
	fregex.zeroOrOne([
		'=', Parse.ws, fregex.or([
			{type: 'hex'},
			{type: 'number'},
			{type: 'regex'},
			{type: 'string'},
			{type: 'identifier'},
		])
	])
]);
Parse.argList = fregex.zeroOrMore([
	Parse.arg,
	fregex.zeroOrMore([
		Parse.ws, ',', Parse.ws, Parse.arg
	])
]);



export default Parse;