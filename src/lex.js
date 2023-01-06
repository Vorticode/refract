/**
 * Use the grammar.fastMatch table to suggest what pattern to use to check for a token.
 * This is much faster than looping through and trying all patterns.
 * @param grammar
 * @param mode
 * @param current
 * @return {(*)[]} */
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
		} while (pattern);
	}
	return [pattern, type];
}

/**
 * Allow tokens to be compared to strings with ==.
 * @example
 * var token = {text: 'return', valueOf};
 * token == 'return' // true, b/c we use double equals.
 * @return {string} */
function valueOf() {
	return this.text
}

function toString() {
	return this.text
}

export class Token {

	constructor(text, type, mode, line, col, originalLength, tokens) {
		this.text = text;
		this.type = type;
		this.mode = mode;
		this.line = line;
		this.col = col;
		this.originalLength = originalLength;
		this.tokens = tokens;
	}

	valueOf() {
		return this.text
	}

	toString() {
		return this.text
	}
}



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
 * TODO: A more flexible version of lex() would be a generator and yield one token at a time.
 * Then we could stop processing when we reach what we're looking for.
 * It would flatten all tokens from recursion, but yield lex.descend and lex.ascend when going into or out of a nested language.
 * The cache would then be moved external to this function.
 *
 * @param code {string} String to parse.
 * @param mode {?string}
 * @param line {int=} Start counting from this line.
 * @param col {int=} Start counting from this column.
 * @param options {Object}
 * @param options.failOnUknown {boolean}
 * @param options.callback
 * @param index {int} Used internally.  Start reading code at this index.
 *
 * @return Token[] */
export default function lex(grammar, code, mode=null, options={}, line=1, col=1, index=0) {
	mode = mode || Object.keys(grammar)[0]; // start in first mode.
	code = code+'';

	let result;
	let unknown ='';

	// Cache small results
	const cacheLen = 256;
	if (code.length < cacheLen) {
		var key = mode + '|' + code.slice(0, 24); // avoid long keys
		result = lexCache[key];
		if (result && result[0] === code) {
			return result[1];
		}
	}

	result = [];
	while (index < code.length) {
		let before = code.slice(0, index);
		let current = code.slice(index);
		let token = undefined;
		let originalLength = undefined;
		let pattern, type;

		// MatchType is a string to go into a new mode, -1 to leave a mode, or undefined to stay in the same mode.
		let matchType = undefined;


		// 1. Identify token

		// 1a. Fast match
		[pattern, type] = findFastMatch(grammar, mode, current); // Tells us what pattern to try.
		if (pattern)
			[token, matchType, originalLength] = pattern(current, before, result) || [];

		// 1b. Slow match, if fastmatch fails
		if (!token) {
			let gmode = grammar[mode];
			for (type in gmode) {
				let pattern = gmode[type];
				[token, matchType, originalLength] = pattern(current, before, result) || [];
				if (token !== undefined) {
					//let name = mode + ':' + type; // + ':' + token;
					//window.slowMatches[name] = (window.slowMatches[name] || 0) + 1
					break;
				}
			}
		}


		if (token === undefined) {
			//#IFDEV
			if (options.failOnUknown) {
				let before = code.slice(Math.max(index - 15, 0), index);
				let after = current.slice(0, 25).replace(/\r/g, '\\r').replace(/\n/g, '\\n')
				let msg = before + '⚠️' + after;
				throw new Error(`Unknown token within "${mode}" at ${line}:${col}\r\n"${msg}"`);
			}
			//#ENDIF
			unknown += code.slice(0, 1);
			code = code.slice(1);
			continue;
		}
		else if (unknown.length) {
			token = unknown;
			matchType = false;
			unknown = '';
		}

		// 2. Ascend or descend
		let newMode = (matchType && matchType !== -1) ? matchType : mode;
		let tokenObj = {text: token, type, mode: newMode, line, col, originalLength, valueOf, toString};
		//let tokenObj = new Token(token, type, newMode, line, col, originalLength); // Why does this version fail?
		let length = originalLength || token.length; // How much of the code string that was consumed.

		if (matchType === -1) // Ascend out of a sub-mode.
			return [...result, tokenObj];

		else if (matchType) { // Descend into new mode
			let subTokens = lex(grammar, code, matchType, options, line, col+length, index+length);
			if (subTokens === false) // callback returned false, bail.
				return false;
			let tokens = [tokenObj, ...subTokens].filter(t=>t.text.length);
			length = tokens.reduce((p, c) => {
				return p + (c.originalLength || c.text.length)
			}, 0); // add the lengths of the tokens

			tokenObj = {text: code.slice(index, index+length), type, tokens, mode, line, col, valueOf, toString};
			// tokenObj = new Token(code.slice(index, index+length), type, mode, line, col, undefined, tokens); // This works, but is no faster.
			if (length !== token.length)
				tokenObj.originalLength = length;
		}


		// Sometimes a zero length token will be used to go into a new mode.
		if (length) {

			// 3. Process token
			index += length;
			result.push(tokenObj);
			if (options.callback) {
				let status = options.callback(tokenObj);
				if (!status)
					return false;
			}

			// 4. Increment line/col number.
			// line += (token.match(/\n/g) || []).length; // count line returns
			// let lastLn = token.lastIndexOf('\n');
			let lastLn = -1;
			for (let i=0, len=token.length; i<len; i++) { // Benchmark shows this is slightly faster than the code above.
				if (token[i] == '\n') {
					line++;
					lastLn = i;
				}
			}

			col = (lastLn > -1 ? -lastLn : col) + length;
		}
	}

	// Cache
	if (code.length < cacheLen)
		lexCache[key] = [code, result];

	return result;
}


var lexCache = {};
//window.slowMatches = {};