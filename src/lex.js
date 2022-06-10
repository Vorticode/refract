/**
 * @param current {string}
 * @param before {string}
 * @param pattern
 * @param prevTokens {Token[]}
 * @return [token:string, matchType] */
function matchToken(current, before, pattern, prevTokens) {
	let token, matchType, originalLength;
	if (pattern instanceof RegExp)
		token = (current.match(pattern) || [])[0];
	else if (typeof pattern === 'function')
		[token, matchType, originalLength] = pattern(current, before, prevTokens) || [];

	else if (Array.isArray(pattern)) {
		for (let item of pattern)
			if (current.startsWith(item)) {
				token = item;
				break;
			}
	}
	else if (current.startsWith(pattern))
		token = pattern;

	return [token, matchType, originalLength]
}

function findFastMatch(grammar, mode, current) {
	let type;
	let pattern = grammar.fastMatch[mode];
	if (pattern) {
		let i = 0;
		do {
			let letter = current[i];
			pattern = pattern[letter];
			if (pattern && pattern.length) {
				[pattern, type] = pattern;
				pattern = pattern[type];
				break;
			}

			i++;
		} while (pattern)


	}
	return [pattern, type];
}

/**
 * Allow tokens to be compared to strings with ==.
 * @example
 * var token = {text: 'return', valueOf};
 * token == 'return' // true, b/c we use double equals.
 * @returns {string} */
function valueOf() {
	return this.text
}

function toString() {
	return this.text
}

export class Token {

	constructor(text, type, mode, line, col, originalLength) {
		this.text = text;
		this.type = type;
		this.mode = mode;
		this.line = line;
		this.col = col;
		this.originalLength = originalLength;
	}

	valueOf() {
		return this.text
	}

	toString() {
		return this.text
	}
}

// TODO:

/**
 * Parse code into tokens according to rules in a grammar.
 *
 * @typedef GrammarRule {(
 *     string |
 *     function(codeAhead:string, codeBehind:string=, previousTokens:Token[]=):array |
 *     RegExp
 * )}
 *
 * @typedef Token{
 *     {text: string, type:string, mode:string, line:int, col:int, ?tokens:Token[], ?originalLength:int}
 * }
 *
 * @param grammar {Object<string, GrammarRule|GrammarRule[]>}.  An object of rules objects, where the key is the mode to use.
 * Each rule object has a key with name of the rule's type, and a value that can be either:
 * 1. A string,
 * 2. A regular expression.
 * 3. A function(codeAhead:string, codeBehind:string, previousTokens:Token[])
 *    that returns [match] for a match, [match, mode] to enter a new mode, or [match, -1] to pop the mode.
 *    Or undefined if there's no match.
 *    Where match is the string that matches.
 * 4. An array containing a list of strings to match
 *
 * Token.originalLength stores the length of a token before escaping occurs.
 *
 * @param code {string} String to parse.
 * @param mode {?string}
 * @param line {int=} Start counting from this line.
 * @param col {int=} Start counting from this column.
 * @param index {int} Used internally.
 *
 * @return Token[] */
export default function lex(grammar, code, mode=null, line=1, col=1, index=0) {
	//let start = performance.now();

	mode = mode || Object.keys(grammar)[0]; // start in first mode.
	code = code+'';

	let result;

	// Cache small results
	let cacheLen = 256;
	if (code.length < cacheLen) {
		var key = mode + '|' + code;
		result = lexCache[key];
		if (result) {
			//callTime += performance.now() - start;
			return result.slice();
		}
	}

	result = [];
	while (index < code.length) {
		let before = code.slice(0, index);
		let current = code.slice(index);
		let token = undefined;
		let originalLength = undefined;
		let pattern, pattern2, type;

		// MatchType is a string to go into a new mode, -1 to leave a mode, or undefined to stay in the same mode.
		let matchType = undefined;


		// 1. Identify token


		// TODO: Enable fastMatch.  This makes it about 30% faster, with the potential for more.
		[pattern, type] = findFastMatch(grammar, mode, current);
		if (pattern)
			[token, matchType] = matchToken(current, before, pattern, result);

		let gmode = grammar[mode];

		// if (!token)
		// 	console.log(current.slice(0, 20));


		if (!token) {
			for (type in gmode) {
				[token, matchType, originalLength] = matchToken(current, before, gmode[type], result);
				if (token !== undefined)
					break;
			}
		}

		//#IFDEV
		if (token === undefined) {
			let before = code.slice(Math.max(index - 15, 0), index);
			let after = current.slice(0, 25).replace(/\r/g, '\\r').replace(/\n/g, '\\n')
			let msg = before + '⚠️' + after;
			throw new Error(`Unknown token within "${mode}" at ${line}:${col}\r\n"${msg}"`);
		}
		//#ENDIF

		// 2. Ascend or descend
		let newMode = (matchType && matchType !== -1) ? matchType : mode;
		let tokenObj = {text: token, type, mode: newMode, line, col, originalLength, valueOf, toString};
		let length = originalLength || token.length; // How much of the code string that was consumed.

		if (matchType === -1) // Ascend out of a sub-mode.
			return [...result, tokenObj];

		else if (matchType) { // Descend into new mode
			let tokens = [tokenObj, ...lex(grammar, code, matchType, line, col+length, index+length)].filter(t=>t.text.length);
			length = tokens.reduce((p, c) => {
				return p + (c.originalLength || c.text.length)
			}, 0); // add the lengths of the tokens

			tokenObj = {text: code.slice(index, index+length), type, tokens, mode, line, col, valueOf, toString};
			if (length !== token.length)
				tokenObj.originalLength = length;
		}


		// Sometimes a zero length token will be used to go into a new mode.
		if (length) {

			// 3. Process token
			index += length;
			result.push(tokenObj);

			// 4. Increment line/col number.
			line += (token.match(/\n/g) || []).length; // count line returns
			let lastLn = token.lastIndexOf('\n');
			col = (lastLn > -1 ? -lastLn : col) + length;
		}
	}

	//callTime += performance.now() - start;
	if (code.length < cacheLen)
		lexCache[key] = result;
	return result;
}


var lexCache = {};


// var types = {};
// setTimeout(() => console.log(types), 1800);
//setTimeout(() => console.log(callTime), 1800);