import fregex from "./fregex.js";


let varExpressionCache = {};

var Parse = {
	/**
	 * Create a fregex to find expressions that start with "this" or with local variables.
	 * @param vars
	 * @return {function(*): (boolean|number)} */
	createVarExpression_(vars=[]) {
		let key = vars.join(','); // Benchmarking shows this cache does speed things up a little.
		let result = varExpressionCache[key];
		if (result)
			return result;

		return varExpressionCache[key] = fregex(
			fregex.or(
				fregex('this', Parse.ws, fregex.oneOrMore(property)),  // this.prop
				...vars.map(v => fregex(v, fregex.zeroOrMore(property)))    // item.prop
			),
			terminator
		);
	},


	/**
	 * Given theh tokens of a function(...) definition, find the argument names.
	 * @param tokens {Token[]}
	 * @return {string[]} */
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
	 * @param tokens {Token[]}
	 * @param mode
	 * @param className
	 * @return {Token[]} */
	replaceHashExpr(tokens, mode, className) {
		let result = [];
		let isHash = false;
		for (let token of tokens) {
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
	 *
	 * @param tokens {Token[]}
	 * @param start {int}
	 * @returns {int|null} */
	findFunctionStart(tokens, start=0) {
		for (let i=start, token; token=tokens[i]; i++) {
			if (token == 'function')
				return i;
			else if (token == '=>') {
				// TODO: Use findGroupEnd
				let depth = 0;
				for (let j=-1, token; token=tokens[i+j]; j--) {
					if (token.type === 'whitespace' || token.type === 'ln')
						continue;
					if (token == ')')
						depth++;
					else if (token == '(')
						depth--;
					if (depth === 0)
						return i+j;
				}
			}
		}
		return null;
	},

	/**
	 * TODO: test search direction.
	 * @param tokens {Token[]}
	 * @param start {int} Index directly after start token.
	 * @param dir {int} Direction.  Must be 1 or -1;  A value of 0 will cause an infinite loop.
	 * @param terminator {?Token|string}
	 * @return {?int} The index of the end token, or terminator if supplied.*/
	findGroupEnd(tokens, start=0, dir=1, terminator=null) {
		let depth = 0;
		for (let i=start, token; token = tokens[i]; i+= dir) {
			if (token == '(' || token == '{')
				depth+=dir;
			else if (token == ')' || token == '}') {
				depth-=dir;
				if (depth < 0)
					return i;
			}
			else if (!depth && token == terminator)
				return i;
		}
		return null;
	},

	/**
	 * Find all tokens that are function arguments, not counting any open or close parens.
	 * @param tokens {Token[]}
	 * @param start {int} Index of the first token of the function.
	 * E.g., below the first token is the start of the function.
	 *   function(a,b) {...}
	 *   function foo(a,b) {...}
	 *   a => a+1
	 *   (a) => a+1*/
	findFunctionArgs(tokens, start=0) {
		const isArrow = tokens[start] != 'function';
		if (isArrow && tokens[start] != '(')
			return [start, start+1];
		while (tokens[start] != '(' && start < tokens.length)
			start++;


		return [start+1, this.findGroupEnd(tokens, start+1)];
	},

	/**
	 * Find all tokens that are part of the function body, not counting open or close braces.
	 * @param tokens {Token[]}
	 * @param start {int} */
	findFunctionBody(tokens, start=0) {

	},

	/**
	 *
	 * @param tokens {Token[]}
	 * @param start
	 * @returns {int|null} */
	findFunctionEnd(tokens, start) {
		let isArrow = tokens[start] != 'function';
		let depth = 0, groups = isArrow ? 1 : 2;
		for (let i=start, token; token = tokens[i]; i++) {
			if (!depth && isArrow && (token == ';' || token == ')'))
				return i;

			// TODO: Use findGroupEnd
			if (token == '(' || token == '{')
				depth++;
			else if (token == ')' || token == '}') {
				depth--;
				if (!depth) {
					groups--;
					if (!groups)
						return i+1;
				}
			}
		}
		return null;
	},

	/**
	 * Find the start and end of the first function within tokens.
	 * @param tokens {Token[]}
	 * @param start {int=}
	 * @return {[start:int, end:int]} */
	findFunction(tokens, start = 0) {
		// Types of functions to account for:
		// a => a+1;
		// a => (a+1);
		// (a => a+1)
		// a => { return a+1 }
		// a => { return {a:1} }
		// function(a) { return a+1 }

		// Find the beginning of the function.
		let functionStart = this.findFunctionStart(tokens, start);
		let end = this.findFunctionEnd(tokens, functionStart);
		return [functionStart, end];
	},


	/**
	 * Replace `${`string`}` with `\${\`string\`}`, but not within function bodies.
	 * @param tokens {Token[]}
	 * @return {Token[]} */
	escape$(tokens) {

		let fstart = this.findFunctionStart(tokens);
		for (let i=0, token; token=tokens[i]; i++) {

			if (i===fstart) {
				i = this.findFunctionEnd(tokens, i);
				fstart = this.findFunctionStart(tokens, i);
			}

			if (token.type === 'template')
				tokens[i] = '`'+ token.slice(1, -1).replace(/\${/g, '\\${').replace(/`/g, '\\`') + '`';
		}
		return tokens
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
	 * @return {[string[], Token[]]|[null, null]} The loop param names and the loop body. */
	simpleMapExpression_(tokens, vars=[]) {

		let loopMatch = [
			Parse.createVarExpression_(vars),
			Parse.ws, '.', Parse.ws, 'map', Parse.ws, '('
		];
		let loopParamMatch = [
			Parse.ws,
			fregex.or([
				{type: 'identifier'}, // single argument with no parens.
				['(', Parse.ws, Parse.argList, Parse.ws, ')'] // match any number of arguments.
			]),
			Parse.ws,
			'=>',
			Parse.ws
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
		let lastToken = tokens.length-1; // Trim whitespace from end
		while (tokens[lastToken].type === 'whitespace' || tokens[lastToken].type==='ln')
			lastToken --;

		let bodyTokens = tokens.slice(mapExpr.length + paramExpr.length, lastToken+1);
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
				loopBody.push(token);
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
	objectMapExpression_(tokens, vars=[]) {},

	/**
	 * Find expressions that start with "this" or with local variables.
	 * @param tokens {Token[]}
	 * @param vars {string[]} List of local variables.
	 * @return {Token[][]} */
	varExpressions_(tokens, vars=[]) {
		let result = fregex.matchAll(Parse.createVarExpression_(vars), tokens);

		// Discard any paths that come after a ".", which means they occur within another variable expression.
		// E.g. we dont' want to return "a.b" and also the "b" from the second part of that path.
		// TODO: But what about when one expression is within another:
		// this.items[this.index]
		return result.filter(path => tokens[path.index-1] != '.');
	},

	/**
	 * ['this', '.', 'fruits', '[', '0', ']'] becomes ['this', 'fruits', '0']
	 * @param expr {string[]}
	 * @return {string[]} */
	varExpressionToPath_(expr) {
		let result = [];
		for (let piece of expr)
			if (piece == 'this' || piece.type === 'identifier' || piece.type === 'number')
				result.push(piece + '');
			else if (piece.type === 'string' || piece.type === 'template') // part of this['that']['somethingElse']
				result.push(eval(piece + '')); // Evaluate string.  Unlike JSON.parse(), eval() handles "string", 'string', and `string`

		return result;
	}
};

// Whitespace
Parse.ws = fregex.zeroOrMore(fregex.or(
	{type: 'whitespace'}, {type: 'ln'}
));

let indexType = [
	{type: 'number'},
	{type: 'hex'},
	{type: 'string'},
	{type: 'template'}
];

Parse.arg = fregex([
	{type: 'identifier'},
	Parse.ws,
	fregex.zeroOrOne([
		'=', Parse.ws, fregex.or([
			...indexType,
			{type: 'identifier'},
			{type: 'regex'},
		])
	])
]);

/**
 * @deprecated */
Parse.argList = fregex.zeroOrMore([
	Parse.arg,
	fregex.zeroOrMore([
		Parse.ws, ',', Parse.ws, Parse.arg
	])
]);


let terminator = fregex.lookAhead([
	fregex.or(
		fregex.end,
		fregex.not(Parse.ws, '(')
	)
]);
let property = fregex(
	fregex.or(
		fregex(Parse.ws,'.', Parse.ws, {type: 'identifier'}), //.item
		fregex(Parse.ws,'[', Parse.ws, fregex.or(...indexType), Parse.ws, ']') // ['item']
	),
	terminator
);



export default Parse;