import fregex from "../parselib/fregex.js";
import lex, {Token} from '../parselib/lex.js';
import Utils from "./utils.js";
import htmljs from "../parselib/lex-htmljs.js";
import lexHtmlJs from "../parselib/lex-htmljs.js";
import {ParsedFunction} from "./ParsedFunction.js";


var Parse = {

	/**
	 * Create a fregex to find expressions that start with "this" or with local variables.
	 * @param vars
	 * @return {function(*): (boolean|number)} */
	createVarExpression_(vars=[]) {
		let key = vars.join(','); // Benchmarking shows this cache does speed things up a little.
		let result = varExprCache[key];
		if (result)
			return result;

		return varExprCache[key] = fregex(
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
	findGroupEnd_(tokens, start=0, open=['(', '{'], close=[')', '}'], terminators=[], dir=1) {
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
	findFunctionArgNames_(tokens) {
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
	 * Loop through the tokens and find the start of a function.
	 * @param tokens {Token[]}
	 * @param start {int}
	 * @return {int|null} */
	findFunctionStart_(tokens, start=0) {
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
	 * Replace `${`string`}` with `\${\`string\`}`, but not within function bodies.
	 * @param tokens {Token[]}
	 * @return {Token[]} */
	escape$_(tokens) {
		let result = tokens.map(t=>({...t}));// copy each
		let fstart = this.findFunctionStart_(result);
		for (let i=0, token; token=result[i]; i++) {

			// Skip function bodies.
			if (i===fstart) {
				let pf = new ParsedFunction(result.slice(fstart));
				i = fstart + pf.bodyStartIndex_ +pf.bodyTokens_.length + 1;
				fstart = this.findFunctionStart_(result, i);
			}

			if (token.type === 'template')
				result[i].text = '`'+ token.text.slice(1, -1).replace(/\${/g, '\\${').replace(/`/g, '\\`') + '`';
		}
		return result;
	},

	/**
	 * Get the tag name from the html() function.
	 * A fast heuristic instead of an actual parsing.  But it's hard to think of
	 * a real-world case where this would fail.
	 * A better version would use lex but stop lexxing after we get to the tag name.
	 * @param code {string} The code returned by function.toString().
	 * @returns {string} */
	htmlFunctionTagName_(code) {
		code = code
			.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '')  // remove js comments - stackoverflow.com/a/15123777/
			.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*|<!--[\s\S]*?-->$/) // remove html comments.

		code = Utils.munchUntil_(code, '{');
		code = Utils.munchUntil_(code, 'return'); // Return is optional.  munchUntil() will return the same string if not found.
		code = Utils.munchUntil_(code, ['`', `"`, "'"]);
		code = Utils.munchUntil_(code, ['<']);
		let match = code.match(/<(\w+-[\w-]+)/);
		return match[1]; // 1 to get part in parenthesees.
	},

	/**
	 * Parse the return value of the html function into tokens.
	 * @param tokens {string|Token[]} The code returned by function.toString().
	 * @return {?Token[]} */
	htmlFunctionReturn_(tokens) {
		if (typeof tokens === 'string')
			tokens = lex(lexHtmlJs, tokens, 'js');

		let htmlMatch = fregex.matchFirst([
			fregex.or({type: 'template'}, {type: 'string'}),
			Parse.ws,
			fregex.zeroOrOne(';')
		], tokens);

		if (!htmlMatch)
			return null;

		let template = htmlMatch.filter(t=>t.tokens || t.type==='string')[0]; // only the template token has sub-tokens.


		// 1 Template
		let innerTokens;
		if (template.tokens)
			innerTokens = template.tokens.slice(1, -1);

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
	replaceHashExpr_(tokens, mode, className) {
		let result = [];
		let isHash = false;
		for (let token of tokens) {
			// TODO: Completely recreate the original tokens, instead of just string versions of them:
			if (token.tokens) {
				let tokens = Parse.replaceHashExpr_(token.tokens, token.mode, className);
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
		let startIndex = Parse.findFunctionStart_(funcTokens);

		// Fail if function isn't the first thing in the map expression.
		if (startIndex === null || startIndex !== 0)
			return [null, null];
		let func = new ParsedFunction(funcTokens.slice(startIndex), true, () => false);

		// Fail if we can't parse the function.
		if (!func)
			return [null, null];

		// Fail if there's more code after the end of the map expression
		let mapEnd = fregex([Parse.ws, ')', Parse.ws, fregex.zeroOrOne(';'), Parse.ws, fregex.end]);
		let funcEndIndex = mapExpr.length + func.bodyStartIndex_ + func.bodyTokens_.length;
		if (!(mapEnd(tokens.slice(funcEndIndex))))
			return [null, null];

		return [[...func.getArgNames()], func.bodyTokens_];
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



let varExprCache = {};


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
Parse.isLValue_ = fregex.oneOrMore(
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






export default Parse;