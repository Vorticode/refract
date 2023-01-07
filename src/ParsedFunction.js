import lex from "./lex.js";
import htmljs from "./lex-htmljs.js";
import {assert} from "./utils.js";
import Parse from "./Parse.js";

export class ParsedFunction {


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

	constructor(tokens, parseBody = true, onError = null) {
		if (typeof tokens === 'function')
			tokens = tokens.toString();
		if (typeof tokens === 'string') {
			let callback;
			if (!parseBody) {
				let depth = 0;

				// Stop when we get to { or =>
				callback = token => {
					if (token.text === '(')
						depth++
					else if (token.text === ')')
						depth --;
					if (depth === 0 && token.text === '{' || token.text === '=>')
						return false;
				};
			}

			tokens = lex(htmljs, tokens, 'js', {callback}); // TODO: Stop at body end, or body beginning if parseBody=false
		}

		onError = onError || (msg => {
			throw new Error(msg)
		});


		/**
		 * @param tokens {Token[]}
		 * @param start {int} Index of the first token after an optional open parenthesis.
		 * @return {int} Index of token after the last arg token. */
		const parseArgTokens = (tokens, start = 0) => {
			assert(tokens[start].text === '(');
			let groupEndIndex = Parse.findGroupEnd(tokens, start);
			if (groupEndIndex === null)
				return -1;

			this.argTokens = tokens.slice(start + 1, groupEndIndex - 1);
			return groupEndIndex - 1;
		}

		// Function
		if (tokens[0].text === 'function') {
			this.type = 'function';
			let index = tokens.slice(1).findIndex(token => !['whitespace', 'ln', 'comment'].includes(token.type));
			if (index === -1)
				return onError('Not enough tokens to be a function.');

			// Optional function name
			if (tokens[index + 1].type === 'identifier')
				this.name = tokens[index + 1].text;

			let argStartIndex = tokens.slice(index + 1).findIndex(token => token.text === '(');
			if (argStartIndex === -1)
				return onError('Cannot find opening ( for function arguments.');
			this.argsStartIndex = index + 1 + argStartIndex + 1;
		}

		// Method
		else if (tokens[0].type === 'identifier') {
			let nextOpIndex = tokens.findIndex(token => token.type === 'operator');
			if (nextOpIndex !== -1 && tokens[nextOpIndex]?.text === '(') {
				this.type = 'method';
				this.name = tokens[0].text;
				this.argsStartIndex = nextOpIndex + 1;
			}
		}

		// Find args and body start
		if (['function', 'method'].includes(this.type)) {
			let argEndIndex = parseArgTokens(tokens, this.argsStartIndex - 1);
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
				argEndIndex = parseArgTokens(tokens, 0);
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

			// Knowing when an unbraced arrow function ends can be difficult.
			// E.g. consider this code:  https://jsfiddle.net/kjmzbvyt/
			// We look for a semicolon at depth zero or a line return not preceeded by an operator.
			let bodyEnd;
			let isBracelessArrow = ['arrowParam', 'arrowParams'].includes(this.type);
			if (isBracelessArrow) {
				const open = ['{', '(', '['];
				const close = ['}', ')', ']'];
				const terminators = [';', ',', ...close];
				let hanging = false;
				for (let i=this.bodyStartIndex, token; token=tokens[i]; i++) {
					if (['whitespace', 'comment'].includes(token.type))
						continue;
					if (open.includes(token.text))
						i = Parse.findGroupEnd(tokens, i, open, close)

					// Here we're implicitly at depth zero because of the Parse.findGroupEnd() above.
					else if (terminators.includes(token.text)) {
						bodyEnd = i;
						break;
					}
					else if (token.type === 'operator')
						hanging = true;
					else if (!hanging && token.type === 'ln') {
						let nextToken = tokens.slice(i).find(token => !['whitespace', 'ln', 'comment'].includes(token.type))
						if (terminators.includes(nextToken) || nextToken.type !== 'operator') {
							bodyEnd = i;
							break
						}
					}
					else
						hanging = false;
				}
			}
			else
				bodyEnd = Parse.findGroupEnd(tokens, this.bodyStartIndex);


			if (bodyEnd === null)
				return onError('Cannot find end of function body.');

			if (isBracelessArrow && tokens[bodyEnd]?.text === ';')
				bodyEnd++;

			this.bodyTokens = tokens.slice(this.bodyStartIndex, bodyEnd);
		}
	}


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
	 * @return {Generator<object|string>} */
	*getArgNames() {
		let tokens = this.argTokens;

		if (this.type === 'arrowParam')
			yield tokens[0].text;

		else {
			let arg = undefined; // Current argument.
			let subArg = undefined; // Current node in arg.
			let stack = []; // Help subArg find its way back to arg.
			let lastName = null; // Last argument or property name we found.
			let find = true; // If we're in the proper context to find variable names.
			let depth = 0;

			for (let token of tokens) {
				let text = token.text;

				if (token.type === 'identifier' && find) {
					lastName = text;
					if (!arg)
						arg = lastName;
					else if (subArg)
						subArg[lastName] = undefined;
				} else if (text == '(' || text == '{' || text == '[') {
					depth++;
					find = true;
					if (!arg && text == '{')
						arg = subArg = {};
					if (lastName) {
						subArg = subArg[lastName] = {};
						stack.push(subArg);
					}
				} else if (text == ')' || text == '}' || text == ']') {
					depth--;
					subArg = stack.pop();
				} else if (text === ',')
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
					debugger;
					return; // Exited function arguments.
				}

				// If a top-level comma, go to next arg
				if (text === ',' && depth === 0) {
					yield arg
					arg = subArg = undefined;
				}
			}
			if (arg)
				yield arg;
		}
	}
}