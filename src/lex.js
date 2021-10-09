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
 *     string |
 *     {type:string, mode:string, line:int, col:int, ?tokens:Token[]}
 * }
 *
 * @param grammar {object<string, GrammarRule|GrammarRule[]>}.  An object of rules objects, where the key is the mode to use.
 * Each rule object has a key with name of the rule's type, and a value that can be either:
 * 1. A string,
 * 2. A regular expression.
 * 3. A function(codeAhead:string, codeBehind:string, previousTokens:Token[])
 *    that returns [match] for a match, [match, mode] to enter a new mode, or [match, -1] to pop the mode.
 *    Or undefined if there's no match.
 *    Where match is the string that matches.
 * 4. An array containing any mix of the above.
 *
 * @param code {string} String to parse.
 * @param mode {?string}
 * @param result {Iterable|Array} Iterable object to populate with result.  Defaults to empty array.
 * @param line {int=} Start counting from this line.
 * @param col {int=} Start counting from this column.
 * @param index {int} Used internally.
 *
 * @return Token[] */
export default function lex(grammar, code, mode=null, result=[], line=1, col=1, index=0) {
	mode = mode || Object.keys(grammar)[0]; // start in first mode.
	code = code+'';
	while (index < code.length) {
		let current = code.slice(index);

		// 1. Identify token
		let matchType = undefined, token = undefined;
		Token:
		for (var type in grammar[mode]) {
			let value = grammar[mode][type];
			value = Array.isArray(value) ? value : [value]; // Convert single items to array
			for (let pattern of value) { // iterate over array and handle every item type
				if (pattern instanceof RegExp)
					token = (current.match(pattern) || [])[0];
				else if (typeof pattern === 'function')
					[token, matchType] = pattern(current, code.slice(0, index), result) || [];
				else if (current.startsWith(pattern))
					token = pattern;
				if (token !== undefined)
					break Token; // escape double loop.
		} 	}
		//#IFDEV
		if (token === undefined) {
			let before = code.slice(Math.max(index - 10, 0), index);
			let after = current.slice(0, 20).replace(/\r/g, '\\r').replace(/\n/g, '\\n')
			let msg = before + '⚠️' + after;
			throw new Error(`Unknown token within "${mode}" at ${line}:${col}\r\n"${msg}"`);
		}
		//#ENDIF

		// 2. Ascend or descend
		let newMode = (matchType && matchType !== -1) ? matchType : mode;
		token = Object.assign(token, {type, mode: newMode, line, col});
		if (matchType === -1) // Ascend out of a sub-mode.
			return [...result, token];

		else if (matchType) { // Descend into new mode
			let tokens = [token, ...lex(grammar, code, matchType, [], line, col+token.length, index+token.length)].filter(t=>t.length);
			token = Object.assign(tokens.join(''), {type, tokens, mode, line, col});
		}

		// Sometimes a zero length token will be used to go into a new mode.
		if (token.length) {

			// 3. Process token
			index += token.length;
			result.push(token);

			// 4. Increment line/col number.
			line += (token.match(/\n/g) || []).length; // count line returns
			let lastLn = token.lastIndexOf('\n');
			col = (lastLn > -1 ? -lastLn : col) + token.length;
		}
	}

	return result;
}