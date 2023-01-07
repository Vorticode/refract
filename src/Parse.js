import fregex from "./fregex.js";
import lex, {Token} from './lex.js';
import Utils, {assert} from "./utils.js";
import htmljs from "./lex-htmljs.js";
import lexHtmlJs from "./lex-htmljs.js";

let varExpressionCache = {};

export class ParseFunction {


	name;

	/**
	 * @type {string} Can be 'function', 'method', 'arrowParam', 'arrowParams', 'arrowParamBrace', 'arrowParamsBrace' */
	type;

	/**
	 * @type {int} index of first token that's an identifier among the function arguments.
	 * If no arguments will point to the index of ')' */
	argsStartIndex;

	/** @type {Token[]} Does not include open and close parentheses. */
	argTokens;

	/**
	 * @type {int} Opening brace or first real token after the => in an arrow function. */
	bodyStartIndex;

	/** @type {Token[]} Includes start and end brace if present. */
	bodyTokens;

	constructor(tokens, parseBody=true, onError=null) {
		if (typeof tokens === 'function')
			tokens = tokens.toString();
		if (typeof tokens === 'string')
			tokens = lex(htmljs, tokens, 'js'); // TODO: Stop at function end.

		onError = onError || (msg=> { throw new Error(msg)});


		/**
		 * @param tokens {Token[]}
		 * @param start {int} Index of the first token after an optional open parenthesis.
		 * @return {int} Index of token after the last arg token. */
		const parseArgTokens = (tokens, start=0) => {
			assert(tokens[start].type === 'identifier' || tokens[0].text === ')');
			let groupEndIndex = Parse.findGroupEnd(tokens, start);
			if (groupEndIndex === null)
				return -1;

			this.argTokens = tokens.slice(start, groupEndIndex);
			return groupEndIndex;
		}

		// Function
		if (tokens[0].text === 'function') {
			this.type = 'function';
			let index = tokens.slice(1).findIndex(token => !['whitespace', 'ln', 'comment'].includes(token.type));
			if (index === -1)
				return onError('Not enough tokens to be a function.');

			// Optional function name
			if (tokens[index+1].type === 'identifier')
				this.name = tokens[index+1].text;

			let argStartIndex = tokens.slice(index+1).findIndex(token => token.text === '(');
			if (argStartIndex === -1)
				return onError('Cannot find opening ( for function arguments.');
			this.argsStartIndex = index + 1 + argStartIndex + 1;
		}

		// Method
		else if (tokens[0].type === 'identifier') {
			let nextOpIndex = tokens.findIndex(token => token.type==='operator');
			if (nextOpIndex !== -1 && tokens[nextOpIndex]?.text === '(') {
				this.type = 'method';
				this.name = tokens[0].text;
				this.argsStartIndex = nextOpIndex+1;
			}
		}

		// Find args and body start
		if (['function', 'method'].includes(this.type)) {
			let argEndIndex = parseArgTokens(tokens, this.argsStartIndex);
			if (argEndIndex === -1)
				return onError('Cannot find closing ) and end of arguments list.');

			let bodyStartIndex = tokens.slice(argEndIndex).findIndex(token => token.text === '{')
			if (this.bodyStartIndex === -1)
				return onError('Cannot find start of function body.');

			this.bodyStartIndex = argEndIndex + bodyStartIndex;
		}


		// Arrow function
		if (!this.type) {

			// Arrow function with multiple params
			let type, argEndIndex;
			if (tokens[0].text === '(') {
				this.argsStartIndex = 1;
				argEndIndex = parseArgTokens(tokens, 1);
				if (argEndIndex === -1)
					return onError('Cannot find ) and end of arguments list.');
				type = 'Params';
			}

			// Arrow function with single param
			else {
				argEndIndex = 1;
				type = 'Param';
				this.argTokens = [tokens[0]];
			}



			// Find arrow
			let arrowIndex = tokens.slice(argEndIndex).findIndex(token => token.text === '=>');
			if (arrowIndex === -1)
				return onError('Cannot find arrow before function body.');

			// Find first real token after arrow
			let bodyStartIndex = tokens.slice(argEndIndex + arrowIndex + 1).findIndex(token => !['whitespace', 'ln', 'comment'].includes(token.type))
			if (bodyStartIndex === -1)
				return onError('Cannot find function body.');
			this.bodyStartIndex = argEndIndex + arrowIndex + 1 + bodyStartIndex;
			if (tokens[this.bodyStartIndex]?.text === '{')
				this.type = `arrow${type}Brace`;
			else
				this.type = `arrow${type}`;
		}

		// Find body.
		if (parseBody) {
			let terminator = this.type.startsWith('arrow') ? [';', '\r\n', '\n'] : [];

			let bodyEnd = Parse.findGroupEnd(tokens, this.bodyStartIndex, ['{', '('], ['}', ')'], terminator);
			if (bodyEnd === null)
				return onError('Cannot find end of function body.');

			if (terminator.length && tokens[bodyEnd].text === ';')
				bodyEnd ++;

			this.bodyTokens = tokens.slice(this.bodyStartIndex, bodyEnd);
		}
	}

}

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
	 * TODO: test search direction.
	 * TODO: Move a more general version of this function to arrayUtil
	 * @param tokens {Token[]}
	 * @param start {int} Index directly after start token.
	 * @param open {string[]}
	 * @param close {string[]}
	 * @param terminators {(Token|string)[]}
	 * @param dir {int} Direction.  Must be 1 or -1;  A value of 0 will cause an infinite loop.
	 * @return {?int} The index of the end token, or terminator if supplied.  Null if no match.*/
	findGroupEnd(tokens, start=0, open=['(', '{'], close=[')', '}'], terminators=[], dir=1) {
		let depth = 0;
		let startOnOpen = open.includes(tokens[start].text);

		for (let i=start, token; token = tokens[i]; i+= dir) {
			let text = token.text || token+'';
			if (open.includes(text))
				depth += dir;
			else if (close.includes(text)) {
				depth -= dir;
				if (startOnOpen) {
					if (depth === 0)
						return i + 1;
				}
				else if (depth < 0)
					return i;
			}
			else if (!depth && terminators.includes(text))
				return i;
		}
		return null;
	},


	/**
	 * @deprecated for findFunctionArgNames2
	 * Given the tokens of a function(...) definition from findFunctionArgToken(), find the argument names.
	 * @param tokens {Token[]}
	 * @return {string[]} */
	findFunctionArgNames(tokens) {
		let result = [];
		let find = 1, depth=0; // Don't find identifiers after an =.
		for (let token of tokens) {
			if (find === 1 && token.type === 'identifier' && !depth)
				result.push(token + '');
			else if (token == '(' || token == '{' || token == '[')
				depth++;
			else if (token == ')' || token == '}' || token == ']')
				depth --;

			if (!depth)
				find = {',': 1, '=': -1}[token] || find;
		}
		return result;
	},



	/**
	 * Get all the function argument names from the function tokens.
	 * This will stop parsing when it reaches the end of the function.
	 * It also supports function argument destructuring.
	 *
	 * @example
	 * let code = (function({a, b}={}, c) { return a+1 }).toString();
	 * let tokens = lex(htmljs, code, 'js');
	 * let args = [...Parse.findFunctionArgNames3(tokens)];
	 *
	 *
	 * TODO: Perhaps this should call findGroupEnd() to skip ahead to
	 * the next non-nested comma when it encounters an '=' ?
	 *
	 * @param tokens {Token[]|function|string} A function, the .toString() value of a function,
	 *     or the parsed tokens of that string.  If tokens, the first token must be the start of the function.
	 * @param start {int}
	 * @return {Generator<object|string>} */
	*findFunctionArgNames2(tokens, start=0) {
		if (typeof tokens === 'function')
			tokens = tokens.toString();
		if (typeof tokens === 'string')
			tokens = lex(htmljs, tokens, 'js');

		const isSingleParamArrow = tokens[start].text != '(' && tokens[start].text !== 'function'
			&& tokens.find(token => token.text.trim().length).text === '=>';
		if (isSingleParamArrow)
			yield tokens[start].text;

		else {
			// Find start
			while (tokens[start].text !== '(' && start < tokens.length)
				start++;
			start++;

			let arg = undefined; // Current argument.
			let subArg = undefined; // Current node in arg.
			let stack = []; // Help subArg find its way back to arg.
			let lastName = null; // Last argument or property name we found.
			let find = true; // If we're in the proper context to find variable names.
			let depth = 0;

			for (let token of tokens.slice(start)) {
				let text = token.text;

				if (token.type === 'identifier' && find) {
					lastName = text;
					if (!arg)
						arg = lastName;
					else if (subArg)
						subArg[lastName] = undefined;
				}
				else if (text == '(' || text == '{' || text == '[') {
					depth++;
					find = true;
					if (!arg && text == '{')
						arg = subArg = {};
					if (lastName) {
						subArg = subArg[lastName] = {};
						stack.push(subArg);
					}
				}
				else if (text == ')' || text == '}' || text == ']') {
					depth--;
					subArg = stack.pop();
				}
				else if (text === ',')
					find = true;
				else if (text === ':')
					find = false;
				else if (text === ':' || text === '=') {
					find = false;
					lastName = null;
				}

				if (depth < 0) {
					if (arg)
						yield arg;
					return; // Exited function arguments.
				}

				// If a top-level comma, go to next arg
				if (text === ',' && depth === 0) {
					yield arg
					arg = subArg = undefined;
				}
			}
		}
	},


	/**
	 * Find all tokens that are function arguments, not counting any open or close parens.
	 * @param tokens {Token[]} Should start at the beginning of a function.
	 * @param start {int} Index of the first token of the function.
	 * E.g., below the first token is the start of the function.
	 *   function(a,b) {...}
	 *   function foo(a,b) {...}
	 *   a => a+1
	 *   (a) => a+1*/
	findFunctionArgRange(tokens, start=0) {
		const isArrow = tokens[start] != 'function';
		if (isArrow && tokens[start] != '(')
			return [start, start+1]; // single argument 'item => item+1'
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
	 * Loop through the tokens and find the start of a function.
	 * @param tokens {Token[]}
	 * @param start {int}
	 * @return {int|null} */
	findFunctionStart(tokens, start=0) {
		for (let i=start, token; token=tokens[i]; i++) {
			if (token == 'function')
				return i;
			else if (token == '=>') {
				// TODO: Use findGroupEnd
				let depth = 0;
				for (let j=-1, token; token=tokens[i+j]; j--) {
					if (token.type === 'whitespace' || token.type === 'ln' || token.type === 'comment')
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
	 * Finds the last token of a function, not including a trailing semicolon.
	 * @param tokens {Token[]}
	 * @param start {int} Must be the index of the first token of the function.
	 * @return {int|null} */
	findFunctionEnd(tokens, start) {
		let isArrow = tokens[start].text !== 'function';
		let depth = 0, groups = (isArrow && tokens[start] != '(') ? 1 : 2;
		for (let i=start, token; token = tokens[i]; i++) {

			if (!depth && isArrow && (token == ';' || token == ')'))
				return i;

			// TODO: Use findGroupEnd?

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
	 * Replace `${`string`}` with `\${\`string\`}`, but not within function bodies.
	 * @param tokens {Token[]}
	 * @return {Token[]} */
	escape$(tokens) {
		let result = tokens.map(t=>({...t}));// copy each
		let fstart = this.findFunctionStart(result);
		for (let i=0, token; token=result[i]; i++) {

			// Skip function bodies.
			if (i===fstart) {
				i = this.findFunctionEnd(result, i);
				fstart = this.findFunctionStart(result, i);
			}

			if (token.type === 'template')
				result[i].text = '`'+ token.text.slice(1, -1).replace(/\${/g, '\\${').replace(/`/g, '\\`') + '`';
		}
		return result;
	},

	/**
	 * Find the start and end of the first function within tokens.
	 * @param tokens {Token[]}
	 * @param start {int=}
	 * @return {[start:int, end:int]|null} */
	findFunction(tokens, start = 0) {
		// Types of functions to account for:
		// a => a+1;
		// a => (a+1);
		// (a => a+1)
		// a => { return a+1 }
		// (a) => { return {a:1} }
		// function(a) { return a+1 }

		// Find the beginning of the function.
		let functionStart = this.findFunctionStart(tokens, start);
		if (functionStart === null)
			return null;
		let end = this.findFunctionEnd(tokens, functionStart);
		return [functionStart, end];
	},

	/**
	 * Get the tag name from the html() function.
	 * A fast heuristic instead of an actual parsing.  But it's hard to think of
	 * a real-world case where this would fail.
	 * A better version would use lex but stop lexxing after we get to the tag name.
	 * @param code {string} The code returned by function.toString().
	 * @returns {string} */
	htmlFunctionTagName(code) {
		code = code
			.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '')  // remove js comments - stackoverflow.com/a/15123777/
			.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*|<!--[\s\S]*?-->$/) // remove html comments.

		code = Utils.munchUntil(code, '{');
		code = Utils.munchUntil(code, 'return');
		code = Utils.munchUntil(code, ['`', `"`, "'"]);
		code = Utils.munchUntil(code, ['<']);
		let match = code.match(/<(\w+-[\w-]+)/);
		return match[1]; // 1 to get part in parenthesees.
	},

	/**
	 * Parse the return value of the html function into tokens.
	 * @param tokens {string|Token[]} The code returned by function.toString().
	 * @return {Token[]} */
	htmlFunctionReturn(tokens) {
		if (typeof tokens === 'string')
			tokens = lex(lexHtmlJs, tokens, 'js');

		let htmlMatch = fregex.matchFirst([
			fregex.or({type: 'template'}, {type: 'string'}),
			Parse.ws,
			fregex.zeroOrOne(';')
		], tokens);

		//#IFDEV
		if (!htmlMatch && !self.prototype.html)
			throw new Error(`Class ${self.name} is missing an html function with a template value.`);
		//#ENDIF

		let template = htmlMatch.filter(t=>t.tokens || t.type==='string')[0]; // only the template token has sub-tokens.


		// 1 Template
		if (template.tokens)
			var innerTokens = template.tokens.slice(1, -1);

		// 2 Non-template
		else { // TODO: Is there better a way to unescape "'hello \'everyone'" type strings than eval() ?
			let code = eval(template+'');
			innerTokens = lex(htmljs, code, 'template');
		}

		// Skip initial whitespace and comments inside template string.
		while (innerTokens[0].type !== 'openTag')
			innerTokens = innerTokens.slice(1);

		return innerTokens;
	},

	/**
	 * Recursively replace #{...} with ${ClassName.htmlEncode(...)}
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
				result.push({text: tokens.map(t=>t.text).join(''), type: token.type, tokens, mode: token.mode});
			}
			else if (token.text == '#{' && token.type == 'expr') {
				result.push(new Token('${'), new Token(className), new Token('.'), new Token('htmlEncode'), new Token('('));
				isHash = true;
			}
			else
				result.push(token);
		}

		if (isHash) { // Add the closing paren around htmlEncode
			let extra = [];
			if (mode === 'squote') // Escape quotes if we're inside an attribute
				extra = [new Token(','), new Token(`"'"`)];
			else if (mode === 'dquote')
				extra = [new Token(','), new Token(`'"'`)];

			result.splice(result.length - 1, 0, ...extra, new Token(')'));
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
	 * TODO: This function needs to be rewritten adn cleaned up.
	 * TODO:  this.items.map(function(x) { return x})
	 *
	 * @param tokens {Token[]}
	 * @param vars {string[]} Name of variables in scope.  So we can have more than just `this.varname`
	 * @return {[string[], Token[]]|[null, null]} The loop param names and the loop body. */
	simpleMapExpression_(tokens, vars=[]) {

		let loopMatch = [
			Parse.createVarExpression_(vars),
			Parse.ws, '.', Parse.ws, 'map', Parse.ws, '(', Parse.ws
		];
		// this.array.map(
		let mapExpr = fregex.matchFirst(loopMatch, tokens)
		if (!mapExpr)
			return [null, null];

		let funcTokens = tokens.slice(mapExpr.length);
		let functionIndices = Parse.findFunction(funcTokens);

		// New path that's not working yet.
		// let functionStart = Parse.findFunctionStart(tokens, mapExpr.length);
		// let mapEnd = Parse.findGroupEnd(tokens, mapExpr.length); // closing ) of the map()
		//
		// // Has extra tokens at the end.  Therefore this isn't a simple map expr.
		// // e.g. this.array.map(x=>x+1).reduce(...)
		// if (mapEnd + 1 < tokens.length) {
		// 	funcTokens = funcTokens.slice(...functionIndices);
		// 	debugger;
		// 	return [null, null];
		// }




		if (!functionIndices || functionIndices[0] !== 0)
			return [null, null];
		funcTokens = funcTokens.slice(...functionIndices);

		let argIndices = Parse.findFunctionArgRange(funcTokens);
		let argTokens = funcTokens.slice(...argIndices);
		let loopParamNames = Parse.findFunctionArgNames(argTokens);



		// Old path:
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


		// (item, i, array) =>
		let paramExpr =  fregex.matchFirst(loopParamMatch, tokens.slice(mapExpr.length));
		//let loopParamNames = Parse.filterArgNames(tokens.slice(mapExpr.length, mapExpr.length + paramExpr.length));

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
		return result.filter(path => tokens[path.index-1] != '.' && tokens[path.index-1] != '?.');
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
	{type: 'template'},
];

// TODO: actually parse instead of just finding the right type of tokens.
Parse.isLValue = fregex.oneOrMore(
	fregex.or(
		'this', '.', '[', ']', {type: 'identifier'}, {type: 'number'}, {type: 'hex'}, {type: 'string'}, {type: 'template'}, {type: 'whitespace'}, {type: 'ln'}
	)
);

let terminator = fregex.lookAhead([
	fregex.or(
		fregex.end, // no more tokens
		fregex.not(Parse.ws, '(')
	)
]);
let property = fregex(
	fregex.or(
		fregex(Parse.ws, fregex.or('.', '?.') , Parse.ws, {type: 'identifier'}), //.item
		fregex(Parse.ws, fregex.zeroOrOne('?.'), '[',  Parse.ws, fregex.or(...indexType), Parse.ws, ']') // ['item']
	),
	terminator // TODO: Why is the terminator here?
);


/** @deprecated */
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

/** @deprecated */
Parse.argList = fregex.zeroOrMore([
	Parse.arg,
	fregex.zeroOrMore([
		Parse.ws, ',', Parse.ws, Parse.arg
	])
]);


export default Parse;