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
 * 4. An array containing a list of strings to match
 *
 * @param code {string} String to parse.
 * @param mode {?string}
 * @param result {Iterable|Array} Iterable object to populate with result.  Defaults to empty array.
 * @param line {int=} Start counting from this line.
 * @param col {int=} Start counting from this column.
 * @param index {int} Used internally.
 *
 * @return Token[] */
var lexCache = {};

function lex(grammar, code, mode=null, line=1, col=1, index=0) {
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
		let current = code.slice(index);

		// 1. Identify token
		let matchType = undefined, token = undefined;
		for (var [type, pattern] of Object.entries(grammar[mode])) {
			//let start = performance.now();
			if (pattern instanceof RegExp)
				token = (current.match(pattern) || [])[0];
			else if (typeof pattern === 'function')
				[token, matchType] = pattern(current, code.slice(0, index), result) || [];


			else if (Array.isArray(pattern)) {
				for (let item of pattern)
					if (current.startsWith(item)) {
						token = item;
						break;
					}
			}
			else if (current.startsWith(pattern))
				token = pattern;
			if (token !== undefined)
				break;

			// let time = performance.now() - start;
			// types[mode + '.' + type] = types[mode + '.' + type] + time || time;
		}
		//#IFDEV
		if (token === undefined) {
			let before = code.slice(Math.max(index - 10, 0), index);
			let after = current.slice(0, 20).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
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
			let tokens = [token, ...lex(grammar, code, matchType, line, col+token.length, index+token.length)].filter(t=>t.length);
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

	//callTime += performance.now() - start;
	if (code.length < cacheLen)
		lexCache[key] = result;
	return result;
}

// var types = {};
// setTimeout(() => console.log(types), 1800);
//setTimeout(() => console.log(callTime), 1800);

/**
 * Go into the mode if the string starts with the given regex.
 * @param regex {RegExp|string}
 * @param mode {string}
 * @oaram callaback {?function(string|string[])}
 * @returns {function(code:string):([string, int] | undefined)} */
var descendIf = (regex, mode, callback) => code => {
	if (regex instanceof RegExp) {
		let match = code.match(regex) || [];
		if (match.length) {
			if (callback)
				callback(match);
			return [match[0], mode];
		}
	}
	else if (code.startsWith(regex)) {// string
		if (callback) // unused here.
			callback(regex);
		return [regex, mode];
	}
};


/**
 * Ascend out of the current mode (to the previous mode) if the string starts with the given regex.
 * @param regex {RegExp|string}
 * @returns {function(code:string):([string, int] | undefined)} */
var ascendIf = regex => code => {
	if (regex instanceof RegExp) {
		let match = code.match(regex) || [];
		if (match.length)
			return [match[0], -1];
	}
	else if (code.startsWith(regex))
		return [regex, -1];
};

/**
 * Grammar for html/js code, including js templates.
 * TODO: This could potentially be made much faster if we indexed by the first char.
 * Then we wouldn't have to iterate through each rule, trying one at a time.
 * E.g.:
 * start = {
 *     '<': code => {
 *         if (isTag) ...
 *         if (isOperator) ...
 *     },
 *     whitespace, // The regular rules
 *     ln,
 *     ...
 * }
 * nextToken = start[fisrtChar](current);
 *
 * Known bugs
 * 1. Javascript regex to match regex tokens might not be perfect.  Since no regex can match all regexes?
 *    We need a function here instead.
 */
{
	let lastTag = null; // Last tag name we descended into.

	let braceDepth = 0;
	let braceStack = []; // Keep track of the brace depth in outer demplates.
	let templateDepth = 0;
	let whitespace = /^[ \t\v\f\xa0]+/;
	let ln = /^\r?\n/;
	let tagStart = /^<!?([\-_\w\xA0-\uFFFF:]+)/i;
	let closeTag = /^<\/[\-_$\w\xA0-\uFFFF:]+\s*>/i;

	let operators = (
		'&& || ! => ' +                 // Logic / misc operators
		'<<= >>= &= ^= |= &&= ||= ' +   // Assignment operators
		'& | ^ ~ >>> << >> ' +          // Bitwise operators
		'=== !=== == != >= > <= < ' +   // Comparison operators
		'= **= += -= *= /= %= ??= ' +   // Assignment operators 2
		'++ -- ** + - * / % ' +         // Arithmetic operators
		', ... . ( ) [ ] ? :'			// Other operators
	).split(/ /g);


	//let svg = /^<svg[\S\s]*?<\/svg>/;

	// Functions re-used below:
	let expr = code => {
		if (code[1] !== '{') // Fast reject
			return;

		if ((lexHtmlJs.allowHashTemplates && code.startsWith('#{')) || code.startsWith('${')) {
			if (templateDepth <= 0)
				templateDepth = 1;
			braceStack.push(braceDepth);
			braceDepth = 0;
			return [
				code.slice(0, 2),
				'js' // Go from template mode into javascript
			];
		}
	};

	let templateEnd = code => {
		if (code[0] === '`') {
			--templateDepth;
			braceDepth = braceStack.pop();
			return ['`', -1];
		}
	};

	let tag = { // html open tag
		whitespace: /^[ \r\n\t\v\f\xa0]+/,
		attribute: /^[\-_$\w\xA0-\uFFFF:]+/i,
		string: code =>
			descendIf("'", 'squote')(code) ||
			descendIf('"', 'dquote')(code)
		,
		equals: '=',
		tagEnd: code => {
			if (code[0] === '>')
				return ['>', -1]; // exit tag mode
			if (code.startsWith('/>'))
				return ['/>', -1]; // exit tag mode.
		},

		unknown: code => lexHtmlJs.allowUnknownTagTokens
			? [code.match(/^\w+|\S/) || []][0] // Don't fail on unknown stuff in html tags.
			: undefined,
	};

	// Check previous token to see if we've just entered a script tag.
	let script = (code, prev, tokens) => {
		let lastToken = tokens[tokens.length-1];
		if (lastTag === 'script' && lastToken && lastToken.tokens && lastToken.tokens[lastToken.tokens.length-1] == '>')
			return ['', 'js'];
	};

	let keyword = `null true false Infinity NaN undefined globalThis
				await break case catch class constructor const continue debugger default delete do enum else export extends
				finally for function if implements import in instanceof interface let new package private protected public
				return static super switch this throw try typeof var void while with yield`.trim().split(/\s+/g);


	// Tokens that can occur before a regex.
	// https://stackoverflow.com/a/27120110
	let regexBefore =
		`{ ( [ . ; , < > <= >= == != === !== + - * % << >> >>> & | ^ ! ~ && || ? : = += -= *= %= <<= >>= >>>= &= |= ^= /=`
			.split(/ /g);

	/**
	 * A grammar for parsing js and html within js templates, for use with lex.js. */
	var lexHtmlJs = {

		js: {
			whitespace,
			ln, // Separate from whitespace because \n can be used instead of semicolon to separate js statements.
			comment: /^\/\/.*(?=\r?\n)|^\/\*[\s\S]*?\*\//,
			end: code => code.startsWith('</script>') ? ['', -1] : undefined,

			// Can't use a regex to parse a regex, so instead we look for pairs of matching / and see if
			// the part in between can be passed to new RegExp().
			// 1. http://stackoverflow.com/questions/172303
			// 2. http://stackoverflow.com/questions/5519596
			// Matches \\ \/ [^/] [...]
			regex: (code, prev, tokens) => {
				if (code[0] !== '/')
					return;

				if (tokens.length) { // If the / is the first token, it can be a regex.
					let prevToken;
					for (let i = tokens.length - 1; i >= 0; i--)
						if (tokens[i].type !== 'ln' && tokens[i].type !== 'whitespace' && tokens[i].type !== 'comment') {
							prevToken = tokens[i] + '';
							break;
						}
					if (!regexBefore.includes(prevToken))
						return;
				}

				let nextSlash = 1;
				while(1) {
					nextSlash = code.indexOf('/', nextSlash+1);
					if (nextSlash === -1)
						return;

					try {
						let piece = code.slice(0, nextSlash+1);
						new RegExp(piece.slice(1, -1)); // without the slashes
						let suffix = code.slice(piece.length).match(/^[agimsx]*/)[0];
						return [piece + suffix]; // is a valid regex.
					} catch (e) {}
				}

			},
			hex: /^0x[0-9a-f]+/, // Must occur before number.
			number: /^\d*\.?\d+(e\d+)?/, // Must occur before . operator.
			// These are not included as keywords b/c they're also valid identifier names:  constructor, from
			identifier: code => {
				let result = (code.match(/^[_$a-z\xA0-\uFFFF][_$\w\xA0-\uFFFF]*/i) || [])[0]; // variables, labels, other things?
				if (!keyword.includes(result))
					return [result];
			},
			template: code => { // go into a template
				if (code[0] === '`') {
					++templateDepth;
					braceStack.push(braceDepth);
					braceDepth = 0;
					return ['`', 'template'];
				}
			},
			brace1: code => {
				if (code[0] === '{') {
					braceDepth++;
					return ['{']
				}
			},
			brace2: code => {
				if (code[0] === '}') {
					if (braceDepth === 0 && templateDepth) {
						braceDepth = braceStack.pop();
						return ['}', -1] // pop out of js mode, back to tempate mode.
					}
					braceDepth--;
					return ['}']; // just match
				}
			},
			semicolon: ';',
			keyword,
			operator: code => { // Must occur after comment
				for (let op2 of operators)
					if (code.startsWith(op2))
						return [op2];
			},
			string: /^"(\\\\|\\"|[^"])*"|^'(\\\\|\\'|[^'])*'/
		},
		html: { // top level html not within javascript.  No other modes go to this mode.
			script,
			comment: descendIf('<!--', 'htmlComment'),
			closeTag,
			openTag: descendIf(tagStart, 'tag', match => lastTag = match[1]),
			text: /^[\s\S]+?(?=<|$)/,
		},
		htmlComment: {
			commentEnd: ascendIf('-->'),
			commentBody: /^[\s\S]+?(?=-->|$)/,
		},

		template: { // template within javascript
			script,
			expr,
			comment: descendIf('<!--', 'templateComment'),
			closeTag,
			openTag: descendIf(tagStart, 'templateTag', match => lastTag = match[1]),
			templateEnd,

			// Continue until end of text.
			// supports both ${} and #{} template expressions.
			text: code => [code.match(
				lexHtmlJs.allowHashTemplates  // (?<!\\) is a negative lookbehind to make sure the ${ isn't preceded by an escape \
					? /^[\s\S]+?(?=<|`|(?<!\\)\${|(?<!\\)#{|(?=$))/
					: /^[\s\S]+?(?=<|`|(?<!\\)\${|(?=$))/) || []][0],
		},

		// Comment within a `template` tag.
		templateComment: { // Like htmlComment, but allows expressions.
			expr,
			commentEnd: ascendIf('-->'),
			commentBody: code => [code.match(
				lexHtmlJs.allowHashTemplates
					? /^[\s\S]+?(?=-->|[$#]{|$)/
					: /^[\s\S]+?(?=-->|\${|$)/) || []][0],
		},
		tag,

		templateTag: { // html tag within template.
			expr,
			templateEnd, // A ` quote to end the template.
			...tag,
		},

		// TODO: template end with `
		squote: { // single quote string within tag
			expr,
			quote: ascendIf("'"),
			text: code => [code.match(
				lexHtmlJs.allowHashTemplates
				? /^[\s\S]+?(?=(?<!\\)[$#]{|(?<!\\[$#]?){|<|`|')/
				: /^[\s\S]+?(?=(?<!\\)\${|(?<!\\\$?){|<|`|')/) || []][0]
		},

		dquote: { // double quote string within tag.
			expr,
			quote: ascendIf('"'),
			text: code => [code.match(
				lexHtmlJs.allowHashTemplates
				? /^[\s\S]+?(?=(?<!\\)[$#]{|(?<!\\[$#]?){|<|`|")/
				: /^[\s\S]+?(?=(?<!\\)\${|(?<!\\\$?){|<|`|")/) || []][0]
		},

		// TODO: css?


		// Options:

		// Allow for {...} templates inside js template strings, instead of just ${}
		// Setting this true can cause problems in parsing css, since {} surrounds the rules.
		// Perhaps add a css mode?
		allowHashTemplates: false,
		allowUnknownTagTokens: false
	};
}

/**
 * Functional regular expressions.
 * Use functions instead of letters to define a regex.
 *
 * A list of arguments to any of these functions is treated as an AND.
 * An array given as a single argument is identical to fregex.or().
 *
 * Each function returns the number of tokens to advance if it matches,
 * 0 if we should proceed without matching,
 * or false if it doesn't match.
 */
function fregex(...rules) {
	rules = prepare(rules);
	return tokens => {
		let i = 0;
		for (let rule of rules) {
			let used = rule(tokens.slice(i));
			if (used === false) // 0, false, null, or undefined
				return false;

			// True becomes 1
			i += used;
		}
		return i; // returns number of tokens used.
	}
}

/**
 * Advance the number of tokens used by the first child that matches true.
 * TODO: Automatically treat an array given to an and() as an or() ? */
fregex.or = (...rules) => {
	rules = prepare(rules);
	return tokens => {
		for (let rule of rules) {
			let used = rule(tokens);
			if (used !== false)
				return used;
		}
		return false;
	}
};


/**
 * Equivalent of /!(abc)/ */
fregex.not = (...rules) => {
	let f = fregex(rules); // re-use
	return tokens =>
		f(tokens) === false ? 0 : false; // If it matches, return false, otherwise advance 0.
};

/**
 * Advance one token if none of the children match.  A "nor"
 * Equivalent to /[^abc]/ */
fregex.nor = (...rules) => {
	rules = prepare(rules);
	return tokens => {
		for (let rule of rules)
			if (rule(tokens) > 0) // rule(tokens) returns the number used.
				return false;
		return 1;
	};
};


/**
 * Consume either zero or one of the sequences given. */
fregex.zeroOrOne = (...rules) => {
	let f = fregex(rules);
	return tokens => {
		let used = f(tokens);
		if (used === false)
			return 0; // don't fail if no match.
		return used;
	}
};

fregex.xOrMore = (x, ...rules) => {
	let f = fregex(rules); // re-use
	return (tokens) => {
		let total = 0;
		for (let i=0; tokens.length; i++) {
			let used = f(tokens);
			if (used === false)
				return i >= x ? total : false;
			total += used || 1;
			tokens = tokens.slice(used || 1);
		}
		return total;
	}
};

fregex.zeroOrMore = (...rules) => fregex.xOrMore(0, ...rules);

fregex.oneOrMore = (...rules) => fregex.xOrMore(1, ...rules);


/**
 *
 * @param pattern
 * @param {array} haystack
 * @param {int} startIndex
 * @returns {*[]} A slice of the items in haystack that match.
 *     with an added index property designating the index of the match within the haystack array. */
fregex.matchFirst = (pattern, haystack, startIndex=0) => {
	let result = fregex.matchAll(pattern, haystack, 1, startIndex);
	return result.length ? result[0] : null;
};

fregex.matchAll = (pattern, haystack, limit=Infinity, startIndex=0) => {
	if (Array.isArray(pattern))
		pattern = fregex(pattern);
	let result = [];

	// Iterate through each offset in haystack looking for strings of tokens that match pattern.
	for (let i = startIndex; i < haystack.length && result.length < limit; i++) {
		let count = pattern(haystack.slice(i));
		if (count !== false)
			result.push(Object.assign(haystack.slice(i, i + count), {index: i}));
	}
	return result;
};


// Experimental
fregex.lookAhead = (...rules) => {
	rules = prepare(rules);
	return tokens => {
		for (let rule of rules) {
			let used = rule(tokens);
			if (used === false)
				return false;
		}
		return 0;
	}
};

/**
 * Experimental
 * Matches the end of the tokens.
 * @param tokens
 * @returns {number|boolean} */
fregex.end = tokens => {
	return tokens.length ? false : 0;
};
var prepare = rules => {
	if (Array.isArray(rules[0]) && rules.length === 1)
		rules = rules[0];

	let result = [];
	for (let i in rules) {
		let rule = rules[i];
		if (typeof rule === 'string')
			// noinspection EqualityComparisonWithCoercionJS
			result[i] = tokens => tokens[0] == rule; // TODO: is loose equals best?

		else if (Array.isArray(rule)) // must occur before typeof rule === 'object' b/c array is object.
			result[i] = fregex(rule);

		// If an object, test to see if the token has all of the object's properties.
		else if (typeof rule === 'object' && !rule.prototype)
			result[i] = tokens => {
				for (let name in rule)
					// noinspection EqualityComparisonWithCoercionJS
					if (tokens[0][name] != rule[name]) // TODO: What if tokens is an empty array and [0] is undefined?
						return false;

				return 1; // Advance 1 token.
			};

		else
			result[i] = rules[i];
	}

	return result;
};

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
				fregex('this', Parse.ws, fregex.oneOrMore(property)),  // this.prop
				...vars.map(v => fregex(v, fregex.zeroOrMore(property)))    // item.prop
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
		let mapExpr = fregex.matchFirst(loopMatch, tokens);
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
		// noinspection JSAssignmentUsedAsCondition
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
	 * @returns {Token[][]} */
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
	 * @returns {string[]} */
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

var dontCreateValue = {};

/**
 * @param obj {object}
 * @param path {string[]}
 * @param createVal {*}  If set, non-existant paths will be created and value at path will be set to createVal.
 * @param watchless {boolean}
 * @return The value, or undefined if it can't be reached. */
function delve(obj, path, createVal=dontCreateValue, watchless=false) {
	let create = createVal !== dontCreateValue;

	if (!obj && !create && path.length)
		return undefined;

	let i = 0;
	for (let srcProp of path) {
		let last = i === path.length - 1;

		if (watchless) {
			obj = obj.$removeProxy || obj;
			if (typeof obj === 'object')
				obj.$disableWatch = true; // sometimes this causes stack overflow?  Perhaps I need to use Object.getOwnPropertyDescriptor() to see if it's a prop?
		}

		// If the path is undefined and we're not to the end yet:
		if (obj[srcProp] === undefined) {

			// If the next index is an integer or integer string.
			if (create) {
				if (!last) {
					// If next level path is a number, create as an array
					let isArray = (path[i + 1] + '').match(/^\d+$/);
					obj[srcProp] = isArray ? [] : {};
				}
			} else {
				delete obj.$disableWatch;
				return undefined; // can't traverse
			}
		}

		// If last item in path
		if (last && create) {
			obj[srcProp] = createVal;
		}

		if (watchless)
			delete obj.$disableWatch;

			// Traverse deeper along destination object.
		obj = obj[srcProp];
		if (watchless) // [below] remove proxy
			obj = (obj!==null && obj !== undefined) ? (obj.$removeProxy || obj) : null;

		i++;
	}

	return obj;
}

delve.dontCreateValue = dontCreateValue;

// Version 2021.10.28.1939
// License: MIT
// https://github.com/vorticode/Refract

//#IFDEV
class RefractError extends Error {
	constructor(msg) {
		super(msg);
	}
}
//#ENDIF



var removeProxy = obj => (obj && obj.$removeProxy) || obj;



var Utils = {

	arrayEq(a, b) {
		if (a.length !== b.length)
			return false;
		for (let i = 0; i < a.length; i++)
			if (a[i] !== b[i])
				return false;
		return true;
	},

	arrayStartsWith(haystack, prefix) {
		for (let i=0; i<prefix.length; i++)
			if (haystack[i] !== prefix[i]) // will be undefined if prefix is longer than haystack, and that will still work.
				return false;
		return true;
	},


	/**
	 * Find object values by keys that start with prefix.
	 * @param obj {object}
	 * @param prefix {string}
	 * @returns {boolean} */
	hasKeyStartingWith_(obj, prefix) {
		for (let key in obj)
			if (key.startsWith(prefix))
				return true;
		return false;
	}
};


/**
 * Return the array as a quoted csv string.
 * @param array {string[]}
 * @returns {string} */
var csv = (array) => JSON.stringify(array).slice(1, -1); // slice() to remove starting and ending [].


/**
 * @param obj {*}
 * @returns {boolean} */
var isObj = (obj) => obj && typeof obj === 'object'; // Make sure it's not null, since typof null === 'object'.


/**
 * Operates recursively to remove all proxies.
 * TODO: This is used by watchproxy and should be moved there?
 * @param obj {*}
 * @param visited {WeakSet=} Used internally.
 * @returns {*} */
var removeProxies = (obj, visited) => {
	if (obj === null || obj === undefined)
		return obj;

	if (obj.$isProxy) {
		obj = obj.$removeProxy;

		//#IFDEV
		if (obj.$isProxy) // If still a proxy.  There should never be more than 1 level deep of proxies.
			throw new RefractError("Double wrapped proxy found.");
		//#ENDIF
	}

	if (typeof obj === 'object') {
		if (!visited)
			visited = new WeakSet();
		else if (visited.has(obj))
			return obj; // visited this object before in a cyclic data structure.
		visited.add(obj);

		// Recursively remove proxies from every property of obj:
		for (let name in Object.keys(obj)) { // Don't mess with inherited properties.  E.g. defining a new outerHTML.
			let t = obj[name];
			let v = removeProxies(t, visited);

			// If a proxy was removed from something created with Object.defineOwnProperty()
			if (v !== t) {
				if (Object.getOwnPropertyDescriptor(obj, name).writable) // we never set writable=true when we defineProperty.
					obj[name] = v;
				else {
					// It's a defined property.  Set it on the underlying object.
					let wp = watch.objects.get(obj);
					let node = wp ? wp.fields_ : obj;
					node[name] = v;
				}
			}
		}
	}
	return obj;
};

/**
 * @property object.$isProxy
 * @property object.$removeProxy
 * @property object.$trigger
 * */

{

let arrayRead = ['indexOf', 'lastIndexOf', 'includes'];
let arrayWrite = ['push', 'pop', 'splice', 'shift', 'sort', 'reverse', 'unshift'];
// TODO What about array copy functions, like slice() and flat() ?  Currently they just remove the proxy.

/**
 * Handler object used when calling WatchUtil.getProxy() */
let handler = {
	/**
	 * Overridden to wrap returned values in a Proxy, so we can see when they're changed.
	 * And to keep track of the path as we traverse deeper into an object.
	 * @param obj {Array|object}
	 * @param field {string} An object key or array index.
	 * @returns {*} */
	get(obj, field) {

		// Special properties
		if (field[0] === '$') {
			if (field === '$removeProxy') // most common paths first.
				return obj;
			if (field === '$isProxy')
				return true;
			if (field === '$trigger') {
				return (path) => {
					let roots = WatchUtil.getRoots(obj);
					for (let root of roots)
						for (let callback of WatchUtil.getCallbacks(root))
							callback('set', path || [], obj);

					return roots;
				}
			}

			// Debugging functions
			//#IFDEV
			if (field === '$roots')
				return WatchUtil.getRoots(obj);
			if (field === '$subscribers') {
				return Array.from(WatchUtil.getRoots(obj))
					.map((x) => x.callbacks_)
					.reduce((a, b) => [...a, ...b])
					.map((x) => x('info'))
					.reduce((a, b) => [...a, ...b])
			}
			//#ENDIF
		}


		let result = obj[field];


		// Return the underlying array's iterator, to make for(...of) loops work.
		if (field === Symbol.iterator)
			return result;

		// Make sure to call functions on the unproxied version
		if (typeof result === 'function') {
			let obj2 = obj.$removeProxy || obj;
			let result = obj2[field];
			if (result.prototype) // If it's a class and not a regular function, don't bind it to the object:
				return result;
			return result.bind(obj2);
		}

		// We only wrap objects and arrays in proxies.
		// Primitives and functions we leave alone.
		// if (result && typeof result === 'object' && !(result instanceof Node)) {
		if (result && typeof result === 'object') { // isObj() inline to hopefully be faster.

			// Remove any proxies.
			result = result.$removeProxy || result;
			//#IFDEV
			if (result.$isProxy)
				throw new RefractError("Double wrapped proxy found.");
			//#ENDIF

			// Make sure the path from the root to the object's field is tracked:
			let roots = WatchUtil.getRoots(obj);
			for (let root of roots) { // Get all paths from the roots to the parent.
				let parentPaths = WatchUtil.getPaths(root, obj);
				for (let parentPath of parentPaths) {

					// Combine each path with the field name.
					WatchUtil.addPath(root, [...parentPath, field], result); // Add to our list of tracked paths.
				}
			}

			return WatchUtil.getProxy(result);
		}
		return result;
	},

	/**
	 * Trap called whenever anything in an array or object is set.
	 * Changing and shifting array values will also call this function.
	 * @param obj {Array|object} root or an object within root that we're setting a property on.
	 * @param field {string} An object key or array index.
	 * @param newVal {*}
	 * @returns {boolean} */
	set(obj, field, newVal) {

		// Don't allow setting proxies on underlying obj.
		// This removes them recursively in case of something like newVal=[Proxy(obj)].
		let oldVal = obj[field];

		newVal = removeProxies(newVal);

		// Set the value.
		// TODO: This can trigger notification if field was created on obj by defineOwnProperty().  But that seems to be ok?
		// Should I use .$disableWatch?
		//let setter = Object.getOwnPropertyDescriptor(obj, field).set;
		obj[field] = newVal;

		// Find all callbacks.
		let paths = handler.getWatchedPaths(obj, field);

		// Call callbacks.
		for (let rootAndPath of paths) {
			let callbacks = WatchUtil.getCallbacks(rootAndPath[0]);
			for (let callback of callbacks)
				callback('set', rootAndPath[1], newVal, oldVal, rootAndPath[0]);
		}


		return true; // Proxy requires us to return true.
	},

	/**
	 * Find all paths to the objects field from every root object.
	 * @param obj {object}
	 * @param field {string}
	 * @returns {[object, string][]} Array of root object and watched path. */
	getWatchedPaths(obj, field) {
		let roots = WatchUtil.getRoots(obj);
		let paths = [];
		for (let root of roots) { // Notify
			let parentPaths = WatchUtil.getPaths(root, obj);
			for (let parentPath of parentPaths) {
				let path = [...parentPath, field];
				paths.push([root, path]);
			}
		}
		return paths;
	},

	/**
	 * Trap called whenever anything in an array or object is deleted.
	 * @param obj {Array|object} root or an object within root that we're deleting a property on.
	 * @param field {int|string} An object key or array index.
	 * @returns {boolean} */
	deleteProperty(obj, field) {
		if (Array.isArray(obj))
			obj.splice(field, 1);
		else
			delete obj[field];

		let roots = WatchUtil.getRoots(obj);
		for (let root of roots) {
			let parentPaths = WatchUtil.getPaths(root, obj);
			for (let parentPath of parentPaths) {
				let path = [...parentPath, field];
				for (let callback of WatchUtil.getCallbacks(root))
					callback('set', path, /*, undefined*/);
			}
		}

		return true; // Proxy requires us to return true.
	}
};






var WatchUtil = {
	/** @type {WeakMap<Object, Proxy>} Map from an object to the Proxy of itself. */
	proxies: new WeakMap(),

	/** @type {WeakMap<Object, Set<Object>>} A map from an object to all of its root objects that have properties pointing to it.. */
	roots: new WeakMap(),


	/** @type {WeakMap<Object, function[]>} A map from roots to the callbacks that should be called when they're changed.. */
	callbacks: new WeakMap(),

	/**
	 * A map of all paths from a root to an object.
	 * Outer WeakMap is indexed by root, inner by object.
	 * @type {WeakMap<Object, WeakMap<Object, string[][]>>} */
	paths: new WeakMap(),


	/**
	 * Get or create proxy for an object.
	 * An object will never have more than one proxy.
	 * @returns {Proxy} */
	getProxy(obj) {
		let proxy = WatchUtil.proxies.get(obj);
		if (!proxy) {

			WatchUtil.proxies.set(obj, proxy = new Proxy(obj, handler));

			if (Array.isArray(obj)) {

				// Because this.proxy_ is a Proxy, we have to replace the functions
				// on it in this special way by using Object.defineProperty()
				// Directly assigning this.proxy_.indexOf = ... calls the setter and leads to infinite recursion.
				for (let func of arrayRead) // TODO: Support more array functions.

					Object.defineProperty(proxy, func, {
						enumerable: false,
						get: () => // Return a new version of indexOf or the other functions.
							(item) => Array.prototype[func].call(obj, removeProxy(item))
					});

				/*
				 * Intercept array modification functions so that we only send one notification instead
				 * of a notification every time an array item is moved (shift, unshift, splice) or the length changes. */
				for (let func of arrayWrite)
					Object.defineProperty(proxy, func, {
						configurable: true,
						enumerable: false,

						// Return a new version of push or the other array functions.
						get: () => (...args) => WatchUtil.arrayFunction(obj, func, args)
					});
			}
		}

		return proxy;
	},

	/**
	 * Call a function that modifies the array, and notify all watches of the changes.
	 * TODO: It'd be better to simply update the proxied array's prototype to point to a WatchedArray class
	 * that overrides each of these methods to notify.
	 * @param array {Array} Array the function is called upon.
	 * @param func {string} Name of the function to call.
	 * @param args {*[]} Arguments passed to the function.
	 * @returns {*} The return value of func.  */
	arrayFunction(array, func, args) {
		let originalLength = array.length;
		let startIndex = 0;
		if (func === 'push')
			startIndex = originalLength;
		else if (func === 'pop')
			startIndex = originalLength - 1;
		else if (func === 'splice') // Splice's first argument can be from the beginning or from the end.
			startIndex = args[0] < 0 ? originalLength - args[0] : args[0];


		// Apply array operations on the underlying watched object, so we don't notify a jillion times.
		let result = Array.prototype[func].apply(array, args);

		// Rebuild the array indices inside the proxy objects.
		// This is covered by the test Watch.arrayShift2()
		// TODO: This can be faster if we only update the affected array elements.
		if (['splice', 'shift', 'sort', 'reverse', 'unshift'].includes(func)) { // ops that modify within the array.
			WatchUtil.rebuildArray(array, startIndex, null, null);
		}

		// Trigger a notification for every array element changed, instead of one for every sub-operation.
		// Copy the set b/c otherwise it can grow continuously and never finish if we call Watch.add() and Watch.remove()
		// From loop items.
		let roots = Array.from(WatchUtil.getRoots(array));
		for (let root of roots) {
			let parentPaths = WatchUtil.getPaths(root, array);

			for (let callback of WatchUtil.getCallbacks(root))

				for (let parentPath of parentPaths) {
					if (func === 'pop') // Remove from end
						callback('remove', [...parentPath, startIndex+''], result, null, root);
					else if (func === 'shift') // Remove from beginning
						callback('remove', [...parentPath, '0'], result, null, root);
					else if (func === 'unshift') // Add to beginning
						callback('insert', [...parentPath, '0'], array[0], null, root);
					else if (func === 'splice') {
						let remove = args[1];
						let insert = args.length - 2;
						let set = Math.min(insert, remove);

						// First set the overlapping ones, then insert or remove.
						for (i = 0; i<set; i++)
							callback('set', [...parentPath, (startIndex + i) + ''], array[startIndex + i], null, root);


						if (insert > remove)
							for (i = set; i<insert; i++) // insert new ones
								callback('insert', [...parentPath, (startIndex+i) + ''], array[startIndex+i], null, root);

						else if (insert < remove)
							for (i=remove-1; i>=set; i--) // remove old ones, in reverse for better performance.
								callback('remove', [...parentPath, (startIndex+i)+''], result[i-set+1], null, root);
					}
					else { // push, sort, reverse
						for (var i = startIndex; i < array.length; i++) {
							// if (window.debug)
							// 	debugger;
							callback('set', [...parentPath, i + ''], array[i], null, root);
						}
						for (i; i<originalLength; i++)
							callback('delete', [...parentPath, i + ''], null, root);
					}
				}
		}

		return result;
	},

	/**
	 * For item, find all proxyRoots and update their paths such that they end with path.
	 * Then we recurse and do the same for the children, appending to path as we go.
	 * Ths effectively lets us update the path of all of item's subscribers.
	 * This is necessary for example when an array is spliced and the paths after the splice need to be updated.
	 * @param obj {Object|*[]}
	 * @param startIndex {int?} If set, only rebuild array elements at and after this index.
	 * @param path {string[]=}
	 * @param visited {WeakSet=} */
	rebuildArray(obj, startIndex, path, visited) {
		path = path || [];
		visited = visited || new WeakSet();
		if (startIndex === undefined)
			startIndex = 0;

		if (visited.has(obj))
			return;
		visited.add(obj);

		if (path.length) {

			let roots = WatchUtil.roots.get(obj);
			if (!roots) // because nothing is watching this array element.
				return;

			for (let root of roots) {
				let parentPaths = WatchUtil.getPaths(root, obj);
				for (let i in parentPaths) {
					let oldPath = parentPaths[i];

					// Swap end of oldPath with the new path if the new path  points from root to obj.
					let start = oldPath.length - path.length;
					if (start >= 0) {

						// Create the newPath.
						let newPath = oldPath.slice();
						for (let j = start; j < oldPath.length; j++)
							newPath[j] = path[j - start];


						// See if newPath is a valid path from root to obj.
						let item = root;
						for (let field of newPath) {
							item = item[field];
							if (!item)
								break;
						}

						// Update the path.
						if (item === obj)
							parentPaths[i] = newPath;
					}
				}
			}
		}


		// Recurse through children to update their paths too.
		// This is tested by the arrayShiftRecurse() test.
		if (Array.isArray(obj))
			for (let i=startIndex; i<obj.length; i++) {
				if (Array.isArray(obj[i]) || isObj(obj[i]))
					WatchUtil.rebuildArray(obj[i], 0, [...path, i+''], visited);
			}
		else if (isObj(obj))
			for (let i in obj)
				if (Array.isArray(obj[i]) || isObj(obj[i]))
					WatchUtil.rebuildArray(obj[i], 0, [...path, i+''], visited);
	},

	/**
	 * Get all roots that have paths to obj.
	 * @param obj
	 * @returns {Set.<Object>|Array} An iterable list. */
	getRoots(obj)	{
		obj = obj.$removeProxy || obj;
		return WatchUtil.roots.get(obj) || [];
	},

	/**
	 * Register a path from root to obj. */
	addPath(root, newPath, obj) {
		obj = obj.$removeProxy || obj;
		root = root.$removeProxy || root;

		//#IFDEV
		// if (newPath.length && !(newPath[0] in root))
		// 	throw new Error("Path doesn't exist");
		// if (root !== obj && !Object.keys(root).length)
		// 	throw new Error("Root has no paths");
		//#ENDIF

		// Add root from obj to path.
		let a = WatchUtil.roots.get(obj);
		if (!a)
			WatchUtil.roots.set(obj, a = new Set()); // Wet and not WeakSet because it must be iterable.
		a.add(root);

		// Get the map from object to paths.
		let objMap = WatchUtil.paths.get(root);
		if (!objMap)
			WatchUtil.paths.set(root, objMap=new WeakMap());

		// Get the paths
		let paths = objMap.get(obj);
		if (!paths)
			objMap.set(obj, [newPath]);

		// Add the path if it isn't already registered.
		// TODO: This could possibly be faster if the javascript Set could index by arrays.
		else {
			for (let existingPath of paths) {

				let l = existingPath.length;
				if (newPath.length < l)
					continue;

				// If the new path begins with existingPath, don't add it.
				// Because now we're just expanding more paths from circular references.
				// Inline version of arrayEq() because it's faster.
				let diff = false;
				for (let i=0; i<l; i++)
					if ((diff = existingPath[i] !== newPath[i]))
						break;
				if (!diff)
					return;
			}
			paths.push(newPath);
		}
	},

	/**
	 * Get all paths from root to obj. */
	getPaths(root, obj) {

		//#IFDEV
		if (root.$isProxy)
			throw new Error("Can't be proxy.");
		//#ENDIF

		// Get the map from object to paths.
		let objMap = WatchUtil.paths.get(root);
		if (!objMap)
			return [];

		// Get the paths
		return objMap.get(obj.$removeProxy || obj) || [];
	},


	/**
	 * @param root {object}
	 * @param callback {function} */
	addCallback(root, callback) {
		root = root.$removeProxy || root;

		let callbacks = WatchUtil.callbacks.get(root);
		if (!callbacks)
			WatchUtil.callbacks.set(root, callbacks=[]);
		callbacks.push(callback);
	},

	getCallbacks(root) {
		root = root.$removeProxy || root;
		return WatchUtil.callbacks.get(root) || [];
	},

	//#IFDEV
	cleanup() {
		WatchUtil.proxies = new WeakMap();
		WatchUtil.roots = new WeakMap();
		WatchUtil.callbacks = new WeakMap();
		WatchUtil.paths = new WeakMap();
	}
	//#ENDIF
};



/**
 * Create a copy of root, where callback() is called whenever anything within object is added, removed, or modified.
 * Monitors all deeply nested properties including array operations.
 * Watches will not extend into HTML elements and nodes.
 * Inspired by: stackoverflow.com/q/41299642
 * @param root {Object}
 * @param callback {function(action:string, path:string[], value:string?)} Action is 'set' or 'delete'.
 *     'insert' and 'remove' operations are for adding or removing elements within arrays.
 * @returns {Proxy} */
var watchProxy = (root, callback) => {
	//#IFDEV
	if (!isObj(root))
		throw new Error('Can only watch objects');
	//#ENDIF

	// Add a path from root to itself, so that when we call WatchUtil.getRoots() on a root, we get an empty path.
	WatchUtil.addPath(root, [], root);

	WatchUtil.addCallback(root, callback);
	return WatchUtil.getProxy(root);
};
}

/**
 * Allow subscribing only to specific properties of an object.
 * Internally, the property is replaced with a call to Object.defineProperty() that forwards to
 * a proxy created by watchObh() above. */
class WatchProperties {

	constructor(obj) {
		this.obj_ = obj;   // Original object being watched.
		this.fields_ = {}; // Unproxied underlying fields that store the data.
		                   // This is necessary to store the values of obj_ after defineProperty() is called.
		this.proxy_ = watchProxy(this.fields_, this.notify_.bind(this));

		/** @type {object<string, function>} A map from a path to the callback subscribed to that path. */
		this.subs_ = {};
	}

	/**
	 * When a property or sub-property changes, notify its subscribers.
	 * This is an expanded version of watchproxy.notify.  It also notifies every callback subscribed to a parent of path,
	 * and all children of path if their own value changed.
	 * @param action {string}
	 * @param path {string[]}
	 * @param value {*=}
	 * @param oldVal {*=} */
	notify_(action, path, value, oldVal) {


		let allCallbacks = [];
		if (action === 'info')
			return this.subs_;

		let cpath = csv(path);

		// Traverse up the path looking for anything subscribed.
		let parentPath = path.slice(0, -1);
		while (parentPath.length) {
			let parentCPath = csv(parentPath); // TODO: This seems like a lot of work for any time a property is changed.

			if (parentCPath in this.subs_)
				/** @type function */
				for (let callback of this.subs_[parentCPath])
					// "this.obj_" so it has the context of the original object.
					// We set indirect to true, which data-loop's rebuildChildren() uses to know it doesn't need to do anything.
					//callback.apply(this.obj_, arguments)
					allCallbacks.push([callback, [action, path, value, oldVal, this.obj_]]);
			parentPath.pop();
		}

		// Notify at the current level:
		if (cpath in this.subs_)
			for (let callback of this.subs_[cpath])
				//callback.apply(this.obj_, arguments);
				allCallbacks.push([callback, [action, path, value, oldVal, this.obj_]]);

		// Traverse to our current level and downward looking for anything subscribed
		let newVal = delve(this.obj_, path, delve.dontCreateValue, true);
		for (let name in this.subs_)
			if (name.startsWith(cpath) && name.length > cpath.length) {
				let subPath = name.slice(cpath.length > 0 ? cpath.length + 1 : cpath.length); // +1 for ','
				let oldSubPath = JSON.parse('[' + subPath + ']');

				let oldSubVal = removeProxy(delve(oldVal, oldSubPath, delve.dontCreateValue, true));
				let newSubVal = removeProxy(delve(newVal, oldSubPath, delve.dontCreateValue, true));

				if (oldSubVal !== newSubVal) {
					let callbacks = this.subs_[name];
					if (callbacks.length) {
						let fullSubPath = JSON.parse('[' + name + ']');
						for (let callback of callbacks)  // [below] "this.obj_" so it has the context of the original object.
							//callback.apply(this.obj_, [action, fullSubPath, newSubVal, oldSubVal, this.obj_]);
							allCallbacks.push([callback, [action, fullSubPath, newSubVal, oldSubVal, this.obj_]]);
					}
				}
			}

		// Debugging is easier if I added all callbacks to an array, then called them.
		// It's also necessary to accumulate and call the callbacks this way, because other callbacks can modify the subscribers
		// and cause some subscriptions to be skipped.
		for (let callback of allCallbacks)
			callback[0].apply(this.obj_, callback[1]);
	}

	/**
	 *
	 * @param path {string|string[]}
	 * @param callback {function(action:string, path:string[], value:string?)} */
	subscribe_(path, callback) {
		if (path.startsWith) // is string
			path = [path];

		// Create property at top level path, even if we're only watching something much deeper.
		// This way we don't have to worry about overriding properties created at deeper levels.
		let self = this;
		let field = path[0];

		if (!(field in self.fields_)) {

			self.fields_[field] = self.obj_[field];

			// If we're subscribing to something within the top-level field for the first time,
			// then define it as a property that forward's to the proxy.
			delete self.obj_[field];
			Object.defineProperty(self.obj_, field, {
				enumerable: 1,
				configurable: 1,
				get: () => {
					if (self.obj_.$disableWatch)
						return self.fields_[field]
					else
						return self.proxy_[field]
				},
				//set: (val) => self.obj_.$disableWatch ? self.proxy_.$removeProxy[field] = val : self.proxy_[field] = val
				set(val) {
					if (self.obj_.$disableWatch) // used by traversePath to watchlessly set.
						self.proxy_.$removeProxy[field] = val;
					else
						self.proxy_[field] = val;
				}
			});
		}


		// Create the full path if it doesn't exist.
		// TODO: Can this part be removed?
		delve(this.fields_, path, undefined);


		// Add to subscriptions
		let cpath = csv(path);
		if (!(cpath in self.subs_))
			self.subs_[cpath] = [];
		self.subs_[cpath].push(callback);
	}

	/**
	 *
	 * @param path{string[]|string}
	 * @param {function?} callback Unsubscribe this callback.  If not specified, all callbacks willb e unsubscribed. */
	unsubscribe_(path, callback) {

		// Make sure path is an array.
		if (path.startsWith) // is string
			path = [path];

		// Remove the callback from this path and all parent paths.
		let cpath = csv(path);
		if (cpath in this.subs_) {

			// Remove the callback from the subscriptions
			if (callback) {
				let callbackIndex = this.subs_[cpath].indexOf(callback);
				//#IFDEV
				if (callbackIndex === -1)
					throw new Error('Bad index');
				//#ENDIF
				this.subs_[cpath].splice(callbackIndex, 1); // splice() modifies array in-place
			}

			// If removing all callbacks, or if all callbacks have been removed:
			if (!callback || !this.subs_[cpath].length) {

				// Remove the whole subscription array if there's no more callbacks
				delete this.subs_[cpath];

				// Undo the Object.defineProperty() call when there are no more subscriptions to it.
				// If there are no subscriptions that start with propCPath
				// TODO This can be VERY SLOW when an object has many subscribers.  Such as an x-loop with hundreds of children.
				// If the loop tries to remove every child at once the complexity is O(n^2) because each child must search every key in this.subs_.
				// We need to find a faster way.
				let propCpath = csv([path[0]]);
				if (!Utils.hasKeyStartingWith_(this.subs_, propCpath)) {

					delete this.obj_[path[0]]; // Remove the defined property.
					this.obj_[path[0]] = this.fields_[path[0]]; // reset original unproxied value to object.

					// Get all roots that point to the field
					// Not sure why this makes some unit tests fail.
					let roots = WatchUtil.roots.get(this.fields_[path[0]]);
					if (roots) {
						roots.delete(this.fields_);
						if (!roots.size) // Delete Set() if last item removed.
							WatchUtil.roots.delete(this.fields_[path[0]]);
					}

					delete this.fields_[path[0]];


					// TODO: I'm still uneasy about this code.
					// WatchUtil.addPath() adds to WatchUtil.roots Set for the added object.
					// But there's no code to remove items from that Set, ever.
					// It only disapears when the object goes out of scope, and the whole Set is removed at once.

					// If we delete the last field of an object, remove it from roots.
					if (!Object.keys(this.fields_).length) {

						//#IFDEV
						// if (!WatchUtil.paths.has(this.fields_))
						// 	throw new Error('');
						// if (!WatchUtil.roots.has(this.fields_))
						// 	throw new Error('');
						// if (!WatchUtil.roots.has(this.obj_[path[0]]))
						// 	throw new Error('');
						//#ENDIF

						//let root = WatchUtil.roots.get(this.fields_);
						WatchUtil.paths.delete(this.fields_);
						WatchUtil.roots.delete(this.fields_);
						WatchUtil.roots.delete(this.obj_[path[0]]);
					}

					if (!Object.keys(this.obj_).length) {
						//#IFDEV
						if (!WatchUtil.paths.has(this.obj_))
							throw new Error('');
						if (!WatchUtil.roots.has(this.obj_))
							throw new Error('');
						//#ENDIF

						WatchUtil.paths.delete(this.obj_);
						WatchUtil.roots.delete(this.obj_);
					}


				}
			}
		}
	}
}


var Watch = {

	/**
	 * Keeps track of which objects we're watching.
	 * That way Watch.add() and Watch.remove() can work without adding any new fields to the objects they watch.
	 * @type {WeakMap<object, WatchProperties>} */
	objects: new WeakMap(),

	/**
	 *
	 * @param obj {object}
	 * @param path {string|string[]}
	 * @param callback {function(action:string, path:string[], value:string?)} */
	add(obj, path, callback) {
		obj = removeProxy(obj);

		// Keep only one WatchProperties per watched object.
		var wp = Watch.objects.get(obj);
		if (!wp)
			Watch.objects.set(obj, wp = new WatchProperties(obj));

		wp.subscribe_(path, callback);
	},

	/**
	 *
	 * @param obj {object}
	 * @param path {string|string[]}
	 * @param callback {function=} If not specified, all callbacks will be unsubscribed. */
	remove(obj, path, callback) {
		obj = removeProxy(obj);
		var wp = Watch.objects.get(obj);

		if (wp) {
			if (path) // unsubscribe only from path.
				wp.unsubscribe_(path, callback);
			else // unsubscribe rom all paths.
				for (let sub in wp.subs_)
					wp.unsubscribe_(sub);

			// Remove from watched objects if we're no longer watching
			if (!Object.keys(wp.subs_).length)
				Watch.objects.delete(obj);
		}
	},

	cleanup() {
		Watch.objects = new WeakMap();
	}

};

var txt = document.createElement('div');
var decodeCache = {};

var Html = {

	/**
	 * Convert html entities like &lt; to their literal values like <.
	 * @param {string} html
	 * @returns {string} */
	decode(html) {
		if (!html)
			return '';

		return html // Fast solution inspired by https://stackoverflow.com/a/43282001
			.replace(/&[#A-Z0-9]+;/gi, entity => {
				let result = decodeCache[entity];
				if (result)
					return result;

				txt.innerHTML = entity; // create and cache new entity
				return decodeCache[entity] = txt.textContent;
			});

	},

	encode(text, quotes='') {
		text = ((text || '') + '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\a0/g, '&nbsp;');
		if (quotes.includes("'"))
			text = text.replace(/'/g, '&apos;');
		if (quotes.includes('"'))
			text = text.replace(/"/g, '&quot;');
		return text;
	}
};

class VText {

	text = '';

	/** @type {Node} */
	el = null;

	startIndex = 0;

	constructor(text='') {
		if (text === null || text === undefined)
			text = '';
		else if (typeof text !== 'string' && !(text instanceof String))
			text = JSON.stringify(text); // instanceof detects strings with added properties.

		this.text = Html.decode(text);
	}

	apply(parent=null, el=null) {
		if (el)
			this.el = el;
		else {
			if (this.el) { // Setting textContent will handle html entity <>& encoding properly.
				this.el.textContent = this.text;
			} else {
				this.el = document.createTextNode(this.text);
				parent.insertBefore(this.el, parent.childNodes[this.startIndex]);
			}

			if (Refract.elsCreated)
				Refract.elsCreated.push(this.text + '');
		}

		return 1;
	}

	clone() {
		let result = new VText();
		result.text = this.text;
		return result;
	}

	remove() {
		this.el.parentNode.removeChild(this.el);
	}

	//#IFDEV
	toString() {
		return this.text;
	}
	//#ENDIF
}

/**
 * A parsed ${} or #{} expression embedded in an html template ``  */
class VExpression {

	/** @type {string[][]} Array of watched paths, parsed from the expression. */
	watchPaths = [];

	/** @type {string|null} Only used when the expression is inside an attribute. */
	attrName = null;


	/**
	 * @type {string} simple|complex|loop
	 * simple:  ${this.field[0].value} or ${this.fields}
	 * complex: ${JSON.stringify(this.fields)} or ${foo(this.array)).map(x => `${x}`)}
	 * loop:    ${this.fields.map(item => ...)}
	 *
	 * If type==='simple', the first watch path is the variable printed.
	 * If type==='loop', the first watchPath is the loop array. */
	type = 'simple';

	isHash = false;

	/**
	 * Function that executes the whole expression at once, or if type==='loop', evaluate the portion of the expression
	 * that gives the loop for the array.
	 * E.g. if we have, this.$items.map(x => x+1), this function returns the array pointed to by this.$items.
	 * @type {?function} */
	exec = null;

	/**
	 * @deprecated for loopParamNames
	 * @type {?string} Used only with type='loop'.  The name of the argument passed to a function to generate a single child. */

	/** @type {string[]} */
	loopParamNames = [];

	/**
	 * TODO: Rename to loopTemplates?
	 * @type {(VElement|VText|VExpression)[]} Used only with type='loop'. The un-evaluated elements that make up one iteration of a loop.
	 * Together with loopParamNames, this can be used to create a function that returns each loop item.*/
	loopItemEls = [];




	// These are specific to the copy of each VExpression made for each Refract.

	/** @type {Refract} */
	xel = null;

	/** @type {HTMLElement} */
	parent = null;

	/** @type {VElement} */
	vParent = null;

	/**
	 * Virtual children created after the loopItemEls are evaluated (but not recursively).
	 * Unlike VElement.vChildren, this is an array of arrays, with each sub-array
	 * having all the vChildren created with each loop iteration.
	 *
	 * @type {(VElement|VExpression|VText)[][]} */
	vChildren = [];



	/** @type {object<string, *>} */
	scope = {};

	/** @type {int} DOM index of the first DOM child created by this VExpression within parent. */
	startIndex = 0;

	/** @type {int} the number of DOM children created by this VExpression within parent. */
	childCount = 0;


	/**
	 *
	 * @type {[Refract, string[], function][]}
	 */
	watches = [];

	//#IFDEV
	/** @type {string} For debugging only. */
	code = '';
	//#ENDIF

	// Evaluate and loopItem functions update both this.children and the real DOM elements.


	constructor() {

		//#IFDEV
		//this.stack = (new Error()).stack.split(/\n\s+at /g).slice(1);
		//#ENDIF
	}

	/**
	 * Evaluate this expression and either add children to parent or set attributes on parent.
	 * @param parent {HTMLElement}
	 * @param el {HTMLElement} Unused.
	 * @return {int} Number of elements created. d*/
	apply(parent=null, el=null) {
		//#IFDEV
		if (this.attrName)
			throw new Error("Cannot apply an VExpression that's for an attribute.  Use evalVAttribute() or .exec.apply() instead.");
		//#ENDIF

		this.parent = parent || this.parent;

		//#IFDEV
		// Make sure we're not applying on an element that's been removed.
		if (!('virtualElement' in this.parent) && !this.parent.parentNode)
			return 0;
		//#ENDIF

		// Remove old children.
		for (let group of this.vChildren)
			for (let vChild of group)
				vChild.remove();

		// Create new children.
		this.vChildren = this.evaluate();

		// Add children to parent.
		let count = 0;
		let startIndex = this.startIndex;
		for (let group of this.vChildren) {
			for (let vChild of group) {
				vChild.startIndex = startIndex;
				let num = vChild.apply(this.parent, null);
				startIndex += num;
				count += num;
			}
		}

		return count;
	}

	/**
	 * Typically called when a new element is instantiated, to clone a new instance of the virtual tree for that element.
	 * @param xel {Refract?}
	 * @param vParent {VElement?}
	 * @param parent {HTMLElement?}
	 * @returns {VExpression} */
	clone(xel=null, vParent=null, parent=null) {
		let result = new VExpression();
		result.watchPaths = this.watchPaths;
		result.attrName = this.attrName;

		result.type = this.type;
		result.exec = this.exec;
		result.loopParamNames = this.loopParamNames;
		result.loopItemEls = this.loopItemEls;


		// Properties specific to each instance.
		result.xel = xel || this.xel;
		result.parent = parent || this.parent;
		result.vParent = vParent || this.vParent;

		result.startIndex = this.startIndex;
		result.childCount = this.childCount;
		result.scope = {...this.scope};

		result.isHash = this.isHash;

		//#IFDEV
		result.code = this.code;


		//#IFDEV
		//result.cloned = (new Error()).stack.split(/\n\s+at /g).slice(1);
		//#ENDIF
		//#ENDIF

		return result;
	}

	/**
	 * @pure
	 * Non-recursively resolve this and all child VExpressions, returning a tree of VElement and VText.
	 * Does not modify DOM.
	 * @return {(VElement|VText|VExpression)[][]} */
	evaluate() {

		// Remove previous watches.
		// TODO: Only do this if the watches are changing.
		// this.watch() should return an array of watch params, so we can compare them.
		for (let watch of this.watches)
			Watch.remove(...watch);
		this.watches = [];

		// Add new watches
		if (!this.receiveNotificationBindThis)
			this.receiveNotificationBindThis = this.receiveNotification_.bind(this);
		this.watch(this.receiveNotificationBindThis);


		let result = [];
		if (this.type!=='loop') { // simple or complex
			//#IFDEV
			if (!this.xel)
				throw new Error();
			//#ENDIF

			let htmls = [this.exec.apply(this.xel, Object.values(this.scope))]
				.flat().map(h=>h===undefined?'':h); // undefined becomes empty string

			if (this.isHash) // #{...} template
				result = [htmls.map(html => new VText(html))]; // TODO: Don't join all the text nodes.  It creates index issues.
			else
				for (let html of htmls) {
					html += ''; // can be a number.
					if (html.length) {
						let vels = VElement.fromHtml(html, Object.keys(this.scope), this).flat();
						result.push(vels);
					}
				}

		} else { // loop


			let array = this.exec.apply(this.xel, Object.values(this.scope));
			//#IFDEV
			if (!array)
				throw new Error(`${this.watchPaths[0].join('.')} is not iterable in ${this.code}`);
			//#ENDIF

			let i = 0;
			for (let item of array) {
				let group = [];
				for (let template of this.loopItemEls) {
					let vel = template.clone(this.xel, this);
					vel.scope = {...this.scope};

					let params = [array[i], i, array];
					for (let j in this.loopParamNames)
						vel.scope[this.loopParamNames[j]] = params[j];

					group.push(vel);
				}

				result.push(group);
				i++;
			}
		}

		return result;
	}

	/**
	 * Called when a watched value changes.
	 * @param action {string}
	 * @param path {string[]}
	 * @param value {string}
	 * @param oldVal {string} not used.
	 * @param root {object|array} The unproxied root object that the path originates form. */
	receiveNotification_(action, path, value, oldVal, root) {
		//window.requestAnimationFrame(() => {

		// if (window.debug) // This happens when a path on an element is watched, but the path doesn't exist?
		// debugger;

		// Path 1:  If modifying a property within an array.
		// TODO: watchPaths besides 0?
		//if (path[0] !== this.watchPaths[0][1]) // Faster short-circuit for the code below?
		//	return;

		if (this.type==='loop' && Utils.arrayStartsWith(path.slice(0, -2), this.watchPaths[0].slice(1))) {
			// Do nothing, because the watch should trigger on the child VExpression instead of this one.
			return;
		}


		this.childCount = this.getAllChildrenLength();

		//if (this.watchPaths.length > 1)
		//	debugger;

		// Path 2:  If inserting, removing, or replacing a whole item within an array that matches certain criteria.
		if (this.type !== 'complex' && path[path.length - 1].match(/^\d+$/)) {
			let arrayPath = path.slice(0, -1);

			// We can delve watchlessly because we're not modifying the values.
			let array = delve(root, arrayPath);

			// If the array is one of our watched paths:
			// TODO: watchPaths besides 0?  Or only go this way if there's only one watchPath?
			if (Array.isArray(array) && Utils.arrayEq(this.watchPaths[0].slice(1), arrayPath)) {

				let index = parseInt(path[path.length - 1]);
				if (action === 'remove') { // TODO: Combine with remove step below used for set.
					for (let vChild of this.vChildren[index])
						vChild.remove();
					this.vChildren.splice(index, 1);
				}

				else {// insert or set

					// 1. Remove old ones then insert new ones.
					if (action === 'set' && this.vChildren[index])
						for (let vChild of this.vChildren[index])
							vChild.remove();

					// 2. Create new loop item elements.
					if (action === 'insert')
						this.vChildren.splice(index, 0, []);

					if (this.type === 'simple')
						this.vChildren[index] = [new VText(array[index])]; // TODO: Need to evaluate this expression instead of just using the value from the array.
					else  // loop
						this.vChildren[index] = this.loopItemEls.map(vel => vel.clone(this.xel, this));

					// 3. Add/update those new elements in the real DOM.
					let i = 0;
					let startIndex = this.arrayToChildIndex_(index); // TODO: Could it be faster to get the index from an existing vchild here?
					for (let newItem of this.vChildren[index]) {
						newItem.startIndex = startIndex + i;
						newItem.scope = {...this.scope};

						let params = [array[index], index, array];
						for (let j in this.loopParamNames)
							newItem.scope[this.loopParamNames[j]] = params[j];

						newItem.apply(this.parent, null);
						i++;
					}
				}

				this.updateSubsequentIndices_();
				return;
			}
		}

		// Path 3:  Replace all items:
		this.apply();
		this.updateSubsequentIndices_();

		// TODO: Should we have a path that generates the new children and compares them with the existing children and only change what's changed?
		//});
	}


	/**
	 * Remove this VExpression and its children from the virtual DOM. */
	remove() {

		// 1 Remove watches
		for (let watch of this.watches)
			Watch.remove(...watch);
		this.watches = []; // Probably not necessary.

		// 2. Remove children, so that their watches are unsubscribed.
		for (let group of this.vChildren)
			for (let vChild of group)
				vChild.remove();

		// 3. Remove from parent.
		if (this.vParent instanceof VElement) {

			// TODO: Keep an index somewhere so this can be done in constant, not linear time.
			let index = this.vParent.vChildren.indexOf(this);
			//#IFDEV
			if (index < 0)
				throw new Error();
			//#ENDIF
			this.vParent.vChildren.splice(index, 1);

		}
		else // Parent is VEXpression
			for (let group of this.vParent.vChildren) {
				let index = group.indexOf(this);
				if (index >= 0) {
					group.splice(index, 1);
					return;
				}
			}
	}

	/**
	 * Recurse through vChildren to find all DOM children created by this VExpression.
	 * @return {(Node|HTMLElement)[]} */
	// getAllChildren() {
	// 	let result = [];
	// 	for (let group of this.vChildren) {
	// 		for (let vChild of group) {
	// 			if (vChild instanceof VExpression)
	// 				for (let vChild2 of vChild.getAllChildren())
	// 					result.push(vChild2.el);
	// 			else
	// 				result.push(vChild.el);
	// 		}
	// 	}
	// 	return result;
	// }

	getAllChildrenLength() {
		let result = 0;
		for (let group of this.vChildren) {
			for (let vChild of group) {
				if (vChild.receiveNotification_) // Faster than vChild instanceof VExpression
					result += vChild.getAllChildrenLength();
				else
					result++;
			}
		}

		//window.count++;

		return result;
	}

	/**
	 * Convert an index in this expression's loop array into the DOM child index.
	 * Since one loop item might create multiple children.
	 * @param index {int} */
	arrayToChildIndex_(index) {

		let result = this.startIndex;

		// Get this VExpression's children before index.
		for (let group of this.vChildren.slice(0, index)) {
			for (let vel of group) {
				if (vel instanceof VExpression)
					result += vel.getAllChildrenLength();
				else
					result++;
			}
		}

		//#IFDEV
		if (result < 0)
			throw new Error();
		//#ENDIF

		return result;
	}

	/**
	 * Get the next VExpression that shares the same DOM element as a parent.
	 * @return {VExpression|null} */
	getNextVExpression_() {

		let vSiblings = this.vParent.vChildren.flat();

		// Check siblings for another VExpression.
		let index = vSiblings.indexOf(this);
		for (let vSibling of vSiblings.slice(index + 1))
			if (vSibling instanceof VExpression)
				return vSibling;

		// If not, go up a level, if that level has the same parent.
		if (this.vParent.parent === this.parent && (this.vParent instanceof VExpression))
			return this.vParent.getNextVExpression_();

		return null;
	}

	updateSubsequentIndices_() {
		let newLength = this.getAllChildrenLength();
		let diff = newLength - this.childCount;

		// Stop if going into a different parent
		let next = this;
		while (next = next.getNextVExpression_()) {
			next.startIndex += diff;
		}
	}

	/**
	 * All calls to Watch.add() (i.e. all watches) used by Refract come through this function.
	 * @param callback {function} */
	watch(callback) {

		for (let path of this.watchPaths) {
			let root = this.xel;

			// slice() to remove the "this" element from the watch path.
			if (path[0] === 'this')
				path = path.slice(1);

			// Allow paths into the current scope to be watched.
			else if (path[0] in this.scope) {

				// Resolve root to the path of the scope.
				root = this.scope[path[0]];
				path = path.slice(1);
			}

			// Make sure it's not a primitive b/c we can't subscribe to primitives.
			// In such cases we should already be subscribed to the parent object/array for changes.
			if (typeof root === 'object' || Array.isArray(root)) {
				this.watches.push([root, path, callback]);  // Keep track of the subscription so we can remove it when this VExpr is removed.
				Watch.add(root, path, callback);
			}
		}
	}

	/**
	 * Take an array of javascript tokens and build a VExpression from them.
	 * @param tokens {Token[]} May or may not include surrounding ${ ... } tokens.
	 * @param scope {string[]} Variables created by parent loops.  This lets us build watchPaths only of variables
	 *     that trace back to a this.property in the parent Refract, instead of from any variable or js identifier.
	 * @param vParent {VElement|VExpression}
	 * @param attrName {string?} If set, this VExpression is part of an attribute, otherwise it creates html child nodes.
	 * @returns {VExpression} */
	static fromTokens(tokens, scope, vParent, attrName) {
		let result = new VExpression();
		result.vParent = vParent;
		if (vParent) {
			result.xel = vParent.xel;
			result.scope = {...vParent.scope};
		}

		result.attrName = attrName;
		scope = (scope || []).slice(); // copy


		//#IFDEV
		result.code = tokens.join(''); // So we can quickly see what a VExpression is in the debugger.
		//#ENDIF

		// remove enclosing ${ }
		let isHash = tokens[0] == '#{';
		if ((tokens[0] == '${' || isHash) && tokens[tokens.length-1] == '}') {
			result.isHash = isHash;
			tokens = tokens.slice(1, -1); // Remove ${ and }
		}

		// Find the watchPathTokens before we call fromTokens() on child elements.
		// That way we don't descend too deep.
		let watchPathTokens = Parse.varExpressions_(tokens, scope);
		console.log(watchPathTokens);

		// Find loopItem props if this is a loop.
		let [loopParamNames, loopBody] = Parse.simpleMapExpression_(tokens, scope);

		// Get the createFunction() from the class if it's already been instantiated.  Else use Refract's temporary createfunction().
		// This lets us use other variabls defiend in the same scope as the class that extends Refract.
		let Class = ((vParent && vParent.xel && vParent.xel.constructor) || window.RefractCurrentClass);

		if (loopBody) {
			result.type = 'loop';

			// When type==='loop', the .exec() function returns the array used by the loop.
			result.loopParamNames = loopParamNames;

			for (let p of loopParamNames)
				scope.push(p);
			result.exec = Class.createFunction(...scope, 'return ' + watchPathTokens[0].join(''));


			let loopBodyTrimmed = loopBody.filter(token => token.type !== 'whitespace' && token.type !== 'ln');

			if (loopBodyTrimmed.length === 1 && loopBodyTrimmed[0].type === 'template')
				result.loopItemEls = VElement.fromTokens(loopBodyTrimmed[0].tokens.slice(1, -1), scope); // Remove beginning and end string, parse items.
			else // javascript code
				result.loopItemEls = [VExpression.fromTokens(loopBody, scope, vParent)];
		}

		else {

			// TODO: This duplicates code executed in Parse.varExpressions_ above?
			if (Parse.createVarExpression_(scope)(tokens) !== tokens.length)
				result.type = 'complex';

			// Build function to evaluate expression.
			// Later, scope object will be matched with param names to call this function.
			// We call replacehashExpr() b/c we're valuating a whole string of code all at once, and the nested #{} aren't
			// understood by the vanilla JavaScript that executes the template string.
			tokens = Parse.replaceHashExpr(tokens, null, Class.name);

			// Trim required.  B/c if there's a line return after return, the function will return undefined!
			let body = tokens.join('');
			if (tokens[0] != '{')
				body = 'return (' + body.trim() + ')';
			result.exec = Class.createFunction(...scope, body);
		}

		// Get just the identifier names between the dots.
		// ['this', '.', 'fruits', '[', '0', ']'] becomes ['this', 'fruits', '0']
		for (let watchPath of watchPathTokens)
			result.watchPaths.push(Parse.varExpressionToPath_(watchPath));

		//console.log(result.watchPathTokens);


		return result;
	}
}

lexHtmlJs.allowHashTemplates = true;


/**
 * A virtual representation of an Element.
 * Supports expressions (VExpression) as attributes and children that can be evaluated later. */
class VElement {
	tagName = '';

	/** @type {object<string, (string|VExpression)[]>} */
	attributes = {};

	/** @type {VExpression[]} Expressions that create whole attribute name/value pairs. */
	attributeExpressions = [];


	/** @type {Refract} */
	xel = null;

	/** @type {HTMLElement} */
	el = null;


	/** @type {VElement} */
	vParent = null;

	/** @type {(VElement|VExpression|VText)[]} */
	vChildren = [];

	/**
	 * TODO: We can speed things up if a VElement has no expressions within it.
	 * And no ids, no svg's, no events, no shadowdom, and no slots.
	 *
	 * We should just store the html, and create it as needed.
	 * Instead of recursing through all of the VElements attributes and children.
	 *
	 * I can add an getStaticCode() function that calculates and caches static code if it's static.
	 *
	 * Or we can apply id's, events, shadowdom, and slots manually after creating it?
	 * @type {string|null} */
	//staticCode = null;

	/** @type {object<string, string>} */
	scope = {};

	/** @type {int} DOM index of the first DOM child created by this VExpression within parent. */
	startIndex = 0;

	constructor(tagName, attributes) {
		this.tagName = tagName || '';
		this.attributes = attributes || {};
	}

	/**
	 * Add or update the HTMLElement linked to this VElement.
	 * apply() always replaces all children.  If this is to aggressive, apply() should be called
	 * on only the child elements that should be updated.
	 *
	 * @param parent {HTMLElement}
	 * @param el {HTMLElement} */
	apply(parent=null, el=null) {
		let tagName = this.tagName;

		if (tagName === 'svg')
			Refract.inSvg = true;

		// 1A. Binding to existing element.
		if (el) {
			this.el = el;

			// This will cause trouble when we call cloneNode() on an element with a slot.
			// Because then the slot will be added to the slot, recursively forever.
			// So we only allow setting content that doesn't have slot tags.
			if (!el.querySelector('slot'))
				this.xel.slotHtml = el.innerHTML;
			el.innerHTML = '';
		}
		// 1B. Create Element
		else {
			let newEl;

			// Special path, because we can't use document.createElement() to create an element whose constructor
			//     adds attributes and child nodes.
			// https://stackoverflow.com/questions/43836886
			if (tagName.includes('-') && customElements.get(tagName)) {
				let Class = customElements.get(tagName);

				let args = [];
				if (Class.constructorArgs)
					args = Class.constructorArgs.map(name => {
						if (name in this.attributes) {
							let val = this.attributes[name];

							// A solitary VExpression.
							if (val && val.length === 1 && val[0] instanceof VExpression)
								return val[0].exec.apply(this.xel, Object.values(this.scope));

							// Attribute with no value.
							if (Array.isArray(val) && !val.length)
								return true;

							// Else evaluate as JSON, or as a string.
							let result = VElement.evalVAttributeAsString(this, (val || []), this.scope);
							try {
								result = JSON.parse(result);
							} catch (e) {}
							return result;
						}
					});

				newEl = new Class(...args);
			}
			else if (Refract.inSvg) // SVG's won't render w/o this path.
				newEl = document.createElementNS('http://www.w3.org/2000/svg', tagName);
			else
				newEl = document.createElement(tagName);

			if (this.el) {  // Replacing existing element
				this.el.parentNode.insertBefore(newEl, this.el);
				this.el.remove();
			} else {// if (parent)
				let p2 = parent.shadowRoot || parent;
				if (p2 !== this.xel && p2.tagName && p2.tagName.includes('-') && newEl.tagName !== 'SLOT') // Insert into slot if it has one.  TODO: How to handle named slots here?
					p2 = p2.querySelector('slot') || p2;

				p2.insertBefore(newEl, p2.childNodes[this.startIndex]);
			}
			this.el = newEl;

			if (Refract.elsCreated)
				Refract.elsCreated.push('<'+tagName + '>');
		}


		// 2. Set Attributes
		let hasValue = ('value' in this.attributes && tagName !== 'option');
		for (let name in this.attributes) {
			let value = this.attributes[name];
			for (let attrPart of value)
				if (attrPart instanceof VExpression) {
					let expr = attrPart;
					expr.parent = this.el;
					expr.scope = this.scope; // Share scope with attributes.
					expr.watch(() => {
						if (name === 'value')
							setInputValue(this.xel, this.el, value, this.scope, isTextArea || isContentEditable);

						else {
							let value2 = VElement.evalVAttributeAsString(this.xel, value, this.scope);
							this.el.setAttribute(name, value2);
						}
					});
				}

			// TODO: This happens again for inputs in step 5 below:
			VElement.setVAttribute(this.xel, this.el, name, value, this.scope);


			// Id
			if (name === 'id' || name === 'data-id')
				this.xel[this.el.getAttribute(name)] = this.el;

			// Events
			else if (name.startsWith('on')) {

				// Get the createFunction() from the class if it's already been instantiated.  Else use Refract's temporary createfunction().
				// This lets us use other variabls defiend in the same scope as the class that extends Refract.
				let createFunction = ((this.xel && this.xel.constructor) || window.RefractCurrentClass).createFunction;

				this.el[name] = event => { // e.g. el.onclick = ...
					let args = ['event', 'el', ...Object.keys(this.scope)];
					let code = this.el.getAttribute(name);
					let func = createFunction(...args, code).bind(this.xel); // Create in same scope as parent class.
					func(event, this.el, ...Object.values(this.scope));
				};
			}

			// Shadow DOM
			else if (name==='shadow' && !this.el.shadowRoot)
				this.el.attachShadow({mode: this.el.getAttribute('shadow') || 'open'});
		}

		// List of input types:
		// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#input_types
		//let hasTextEvents = Object.keys(this.attributes).some(attr =>
		//	['onchange','oninput',  'onkeydown', 'onkeyup', 'onkeypress', 'oncut', 'onpaste'].includes(attr));
		let isContentEditable =this.el.hasAttribute('contenteditable') && this.el.getAttribute('contenteditable') !== 'false';
		let isTextArea = tagName==='textarea';

		// 2B. Form field two way binding.
		// Listening for user to type in form field.
		if (hasValue) {
			let value = this.attributes.value;
			let isSimpleExpr = value.length === 1 && value[0] && value[0].type === 'simple';

			// Don't grab value from input if we can't reverse the expression.
			if (isSimpleExpr) {

				let isTypableInput = tagName === 'input' &&
					!['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'reset', 'submit'].includes(this.el.getAttribute('type'));
				let isTypable = isTextArea || isContentEditable || isTypableInput;

				let scope = {'this': this.xel, ...this.scope};
				if (isTypable) { // TODO: Input type="number" is typable but also dispatches change event on up/down click.
					this.el.addEventListener('input', ()=> {

						let type = this.el.getAttribute('type') || '';

						// Convert input type="number" to a float.
						let val = isContentEditable ? this.el.innerHTML : this.el.value;
						if (type === 'number' || type === 'range')
							val = parseFloat(val);
						if (type === 'datetime-local' || type === 'datetime')
							val = new Date(val);

						if (delve(scope, value[0].watchPaths[0]) !== val) {
							delve(scope, value[0].watchPaths[0], val); // TODO: Watchless if updating the original value.
						}
					}, true); // We bind to the event capture phase so we can update values before it calls onchange and other event listeners added by the user.
				}
				else /*if (tagName === 'select' || tagName==='input')*/ {
					this.el.addEventListener('change', () => {
						// TODO: Convert value to boolean for checkbox.  File input type.
						let val;
						if (tagName === 'select' && this.el.hasAttribute('multiple')) {
							let val = Array.from(this.el.children).filter(el => el.selected).map(opt => opt.value);
							// if (!Array.isArray(delve(scope, value[0].watchPaths[0])))
							// 	val = val[0];
							delve(scope, value[0].watchPaths[0], val);
						}
						else
							val = isContentEditable ? this.el.innerHTML : this.el.value;

						delve(scope, value[0].watchPaths[0], val);
					}, true);
				}
			}
		}

		// 3. Slot content
		let count = 0;
		if (tagName === 'slot') {
			let slotChildren = VElement.fromHtml(this.xel.slotHtml, Object.keys(this.scope), this);
			for (let vChild of slotChildren) {
				vChild.scope = {...this.scope};
				vChild.startIndex = count;
				window.inSlot = true;
				count += vChild.apply(this.el);
				window.inSlot = false;
			}
		}

		// 4. Recurse through children
		for (let vChild of this.vChildren) {
			vChild.scope = {...this.scope}; // copy
			vChild.startIndex = count;
			count += vChild.apply(this.el);
		}

		// 5. Set initial value for select from value="" attribute.    
	    if (hasValue) // This should happen after the children are added, e.g. for select <options>
	    	// TODO: Do we only need to do this for select boxes b/c we're waiting for their children?  Other input types are handled above in step 2.
		    setInputValue(this.xel, this.el, this.attributes.value, this.scope, isTextArea || isContentEditable);


		if (tagName === 'svg')
			Refract.inSvg = false;

		return 1; // 1 element created, not counting children.
	}


	/**
	 * @param xel {Refract}
	 * @param vParent {VElement|VExpression}
	 * @returns {VElement} */
	clone(xel, vParent) {
		let result = new VElement(this.tagName);
		result.xel = xel || this.xel;

		for (let attrName in this.attributes) {
			result.attributes[attrName] = [];
			for (let piece of this.attributes[attrName]) {
				if (piece instanceof VExpression)
					result.attributes[attrName].push(piece.clone(result.xel, this));
				else
					result.attributes[attrName].push(piece);
			}
		}
		for (let expr of this.attributeExpressions)
			result.attributeExpressions.push(expr.clone(result.xel, this));

		for (let child of this.vChildren)
			result.vChildren.push(child.clone(result.xel, result)); // string for text node.

		return result;
	}

	remove() {
		// 1. Remove children, so that their watches are unsubscribed.
		for (let vChild of this.vChildren)
			vChild.remove();

		// 2. Remove the associated element.  We call parentNode.removeChild in case remove() is overridden.
		this.el.parentNode.removeChild(this.el);
	}

	//#IFDEV
	toString() {
		let attributes = [];
		for (let name in this.attributes)
			attributes.push(` ${name}="${this.attributes[name]}"`);

		return `<${this.tagName}${attributes.join('')}>`;
	}
	//#ENDIF


	/**
	 * TODO: Reduce shared logic between this and evalVAttribute
	 * If a solitary VExpression, return whatevr object it evaluates to.
	 * Otherwise merge all pieces into a string and return that.
	 * value="${'one'}" becomes 'one'
	 * value="${['one', 'two']}" becomes ['one', 'two']
	 * value="${['one', 'two']}three" becomes ['onetwothree']
	 * @param ref {Refract}
	 * @param attrParts {(VExpression|string)[]}
	 * @param scope {object}
	 * @returns {*|string} */
	static evalVAttribute(ref, attrParts, scope={}) {
		let result = attrParts.map(expr =>
			expr instanceof VExpression ? expr.exec.apply(ref, Object.values(scope)) : expr
		);

		// If it's a single value, return that.
		if (result.length === 1)
			return result[0];

		return result.flat().join('');
	}

	/**
	 * @param ref {Refract}
	 * @param attrParts {(VExpression|string)[]}
	 * @param scope {object}
	 * @return {string} */
	static evalVAttributeAsString(ref, attrParts, scope={}) {
		let result = [];
		for (let attrPart of attrParts) {
			if (attrPart instanceof VExpression) {
				let val = attrPart.exec.apply(ref, Object.values(scope));
				if (Array.isArray(val) || (val instanceof Set))
					val = Array.from(val).join(' '); // Useful for classes.
				else if (val && typeof val === 'object') // style attribute
					val = Object.entries(val).map(([name, value]) => `${name}: ${val[name]}; `).join('');
				result.push(val);
			}
			else
				result.push(Refract.htmlDecode(attrPart)); // decode because this will be passed to setAttribute()
		}
		return result.join('');
	}

	/**
	 * @deprecated.  Just call setAttribute with evalVAttributeAsString()
	 * @param xel {Refract}
	 * @param el {HTMLElement}
	 * @param attrName {string}
	 * @param scope {object}
	 * @param attrParts {(VExpression|string)[]} */
	static setVAttribute(xel, el, attrName, attrParts, scope={}) {
		let value = VElement.evalVAttributeAsString(xel, attrParts, scope);
		el.setAttribute(attrName, value);
	}

	/**
	 * Convert html to an array of child elements.
	 * @param html {string|string[]} Tokens will be removed from the beginning of the array as they're processed.
	 * @param scopeVars {string[]}
	 * @param vParent {VElement|VExpression}
	 * @returns {(VElement|VExpression|string)[]} */
	static fromHtml(html, scopeVars=[], vParent=null) {
		let tokens = lex(lexHtmlJs, [html].flat().join(''), 'template');
		return VElement.fromTokens(tokens, scopeVars, vParent);
	}

	/**
	 * Convert tokens to an array of child elements.
	 * @param tokens {Token[]}
	 * @param scopeVars {string[]}
	 * @param vParent {VElement|VExpression?}
	 * @param limit {int|boolean=} Find no more than this many items.
	 * @param index {int=} used internally.
	 * @returns {(VElement|VExpression|string)[]}
	 *     Array with a .index property added, to keep track of what token we're on. */
	static fromTokens(tokens, scopeVars=[], vParent=null, limit=false, index=0) {
		if (!tokens.length)
			return [];

		let result = [];
		do {
			let token = tokens[index];

			// Text node
			if (token.type === 'text')
				result.push(new VText(token));

			// Expression child
			else if (token.type === 'expr')
				result.push(VExpression.fromTokens(token.tokens, scopeVars, vParent));

			// Collect tagName and attributes from open tag.
			else if (token.type === 'openTag') {
				let vel = new VElement();
				vel.vParent = vParent;
				vel.xel = vParent?.xel;
				if (vParent)
					vel.scope = {...vParent.scope};
				let attrName='';
				let tagTokens = token.tokens.filter(token => token.type !== 'whitespace'); // Tokens excluding whitespace.

				for (let j=0, tagToken; (tagToken = tagTokens[j]); j++) {
					if (j === 0)
						vel.tagName = tagToken.slice(1);

					else if (tagToken.type === 'attribute') {
						attrName = tagToken;
						vel.attributes[attrName] = []; // Attribute w/o value, or without value yet.
					}

					// Attribute value string or expression
					else if (attrName && tagTokens[j-1] == '=') {
						let attrValues = [];

						// Tokens within attribute value string.
						if (tagToken.type === 'string')
							for (let exprToken of tagToken.tokens.slice(1, -1)) { // slice to remove surrounding quotes.
								if (exprToken.type === 'expr')
									attrValues.push(VExpression.fromTokens(exprToken.tokens, scopeVars, vParent, attrName));
								else // string:
									attrValues.push(exprToken +'');
							}
						else if (tagToken.type === 'expr') // expr not in string.
							attrValues.push(VExpression.fromTokens(tagToken.tokens, scopeVars, vParent, attrName));
						//#IFDEV
						else
							throw new Error(); // Shouldn't happen.
						//#ENDIF

						vel.attributes[attrName] = attrValues;
						attrName = undefined;
					}

					// Expression that creates attribute(s)
					else if (tagToken.type === 'expr')
						vel.attributeExpressions.push(VExpression.fromTokens(tagToken.tokens, scopeVars, vParent));
				}

				let isSelfClosing = tagTokens[tagTokens.length-1] == '/>' ||
					['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source',
						'track', 'wbr', 'command', 'keygen', 'menuitem'].includes(vel.tagName);
					// TODO: What svg elements are self-closing?

				// Process children if not a self-closing tag.
				if (!isSelfClosing) {
					index++;

					// New path:
					vel.vChildren = VElement.fromTokens(tokens, scopeVars, vel, false, index);
					index = vel.vChildren.index; // What is this?
				}

				result.push(vel);
			}

			// Collect close tag.
			else if (token.type === 'closeTag')
				break;

			if (result.length === limit)
				break;

			index++;
		} while (index < tokens.length);

		result.index = index;
		return result;
	}
}


function setInputValue(ref, el, value, scope, isText) {
	if (isText || el.tagName === 'INPUT') {
		let val = VElement.evalVAttributeAsString(ref, value, scope);
		if (isText)
			el.innerHTML = val;
		else
			el.value = val;
	}
	else {
		let values = VElement.evalVAttribute(ref, value, scope);
		if (el.tagName === 'SELECT')
			for (let opt of el.children)
				opt.selected = Array.isArray(values) ? values.includes(opt.value) : values === opt.value;
		else // Some custom elements can accept object or array for the value property:
			el.value = values;
	}
}

let cache = {}; // TODO: Cache should exist per-document?
let divCache = new WeakMap();
let templateCache = new WeakMap();

// let div = document.createElement('div');
// let template = document.createElement('template');

/**
 * Create a single html element, node, or comment from the html string.
 * The string will be trimmed so that an element with space before it doesn't create a text node with spaces.
 * @param html {string}
 * @param trim {boolean=}
 * @param doc {HTMLDocument}
 * @return {HTMLElement|Node} */
function createEl(html, trim=true, doc=document) {

	// Get from cache
	if (trim)
		html = html.trim();

	// If creating a web component, don't use a tempalte because it prevents the constructor from being called.
	// And don't use an item from the cache with cloneNode() because that will call the constructor more than once!
	if (html.match(/^<\S+-\S+/)) {

		let div = divCache.get(doc);
		if (!div)
			divCache.set(doc, div = doc.createElement('div'));
		div.innerHTML = html;
		return div.removeChild(div.firstChild)
	}

	let existing = cache[html];
	if (existing)
		return existing.cloneNode(true);


	let template = templateCache.get(doc);
	if (!template)
		templateCache.set(doc, template = doc.createElement('template'));

	// Create
	template.innerHTML = html;

	// Cache
	// We only cache the html if there are no slots.
	// Because if we use cloneNode with a custom element that has slots, it will take all of the regular, non-slot
	// children of the element and insert them into the slot.
	if (!template.content.querySelector('slot'))
		cache[html] = template.content.firstChild.cloneNode(true);

	return template.content.removeChild(template.content.firstChild);
}

lexHtmlJs.allowHashTemplates = true;

/**
 * @property createFunction {function} Created temporarily during compilation. */
class Refract extends HTMLElement {

	/**
	 * A parsed representation of this class's html.
	 * @type VElement */
	static virtualElement;

	/**
	 * @type {string[]} Names of the constructor's arguments. */
	static constructorArgs = [];

	/**
	 * Change this from false to an empty array [] to keep a list of every element created by ever class that inherits
	 * from Refract.  Useful for debugging / seeing how many elements were recreated for a given operation.
	 * @type {boolean|(Node|HTMLElement)[]} */
	static elsCreated = false;

	/**
	 * Used by VElement.apply() to keep track of whether we're within an svg tag.
	 * @type {boolean} */
	static inSvg = false;

	/** @type {string} */
	slotHtml = '';

	//#IFDEV

	debugRender() {
		// .map() for objects.
		let omap = (o, cb) => { // Like .map() but for objects.
			let result = [];
			for (let name in o)
				result.push(cb(name, o[name]));
			return result;
		};

		let renderPaths = watchPaths => watchPaths.map(path => "'" + path.join('.') + "'").join(', ');

		/**
		 *
		 * @param child {(VExpression|VElement|string)[]|VExpression|VElement|string}
		 * @param inlineText {string}
		 * @returns {string} */
		let renderItem = (child, inlineText) => {

			if (Array.isArray(child)) {
				let result = [];
				for (let child2 of child)
					result.push(renderItem(child2, inlineText));
				return result.join('');
			}
			if (child instanceof VExpression)
				return renderVExpr(child);
			if (child instanceof VElement) {
				return renderVEl(child);

			}

			// String
			let text = child.text;
			if (!text.trim().length)
				text = text.replace(/\s/g, '&nbsp;');

			let tag = inlineText===true ? 'span' : 'div';
			return `
				
				<${tag}><span style="color: #8888" title="startIndex">[${child.startIndex}] </span><span title="Text node" style="background: #a643; color: #a66">${text}</span></${tag}>`;
		};

		/**
		 * @param ve {VElement}
		 * @returns {string} */
		let renderVEl = ve =>
			`<div style="color: #f40">
				<div>
					<span>&lt;${ve.tagName}</span
					>${omap(ve.attributes, (name, val) => ` <span>${name}="${renderItem(val, true)}"</span>`).join('')}&gt;
				</div>
				<div style="padding-left: 4ex">
					${ve.vChildren.map(renderItem).join('')}
				</div>
				<div>&lt;/${ve.tagName}&gt;</div>			
			</div>`;

		/**
		 * @param vexpr {VExpression}
		 * @returns {string} */
		let renderVExpr = vexpr => {
			if (vexpr.type==='loop')
				return `
					<div style="color: #08f">	
						<div style="background: #222">				
							<span style="color: #8888" title="startIndex">[${vexpr.startIndex}]</span>
							${renderPaths(vexpr.watchPaths)}.map(${vexpr.loopParamName} => 
							
							<span style="color: #8888" title="watchPaths">
								[${renderPaths(vexpr.watchPaths)}] => ${vexpr.loopParamName}
							</span>
						</div>
					
						<div style="padding-left: 4ex">
							<div title="loopItemEls" style="background: #222">${vexpr.loopItemEls.map(renderItem).join('')}</div>
							${vexpr.vChildren.map(renderItem).join('')}
						</div>
						) 
					</div>`;

			return  `
				<div style="background: #222">
					<span style="color: #8888" title="startIndex">[${vexpr.startIndex}]</span>
					<span style="color: #60f" title="VExpression">${vexpr.code}</span>
					<span style="color: #8888" title="watchPaths">
						[${renderPaths(vexpr.watchPaths)}]
					</span>
				</div>
				${vexpr.vChildren.map(renderItem).join('')}`;
		};


		return createEl(renderVEl(this.virtualElement));
	}

	/**
	 * Create an html element that shows how this Refract is built, for debugging.
	 * @return HTMLElement */
	static debugRender() {

		let omap = (o, cb) => { // Like .map() but for objects.
			let result = [];
			for (let name in o)
				result.push(cb(name, o[name]));
			return result;
		};


		let renderPaths = watchPaths => watchPaths.map(path => "'" + path.join('.') + "'").join(', ');

		/**
		 *
		 * @param child {(VExpression|VElement|string)[]|VExpression|VElement|string}
		 * @param inlineText {string}
		 * @returns {string} */
		let renderItem = (child, inlineText) => {
			if (Array.isArray(child)) {
				let result = [];
				for (let child2 of child)
					result.push(renderItem(child2, inlineText));
				return result.join('');
			}
			if (child instanceof VExpression)
				return renderVExpr(child);
			if (child instanceof VElement)
				return renderVEl(child);

			// VText or attribute.
			let text = child.text || child;
			if (!text.trim().length)
				text = text.replace(/\s/g, '&nbsp;');

			let tag = inlineText===true ? 'span' : 'div';
			let style = inlineText!==true ? 'display: table;' : '';
			return `<${tag} title="Text node" style="${style} background-color: rgba(192, 96, 64, .2); color: #a66">${text}</${tag}>`;
		};

		/**
		 * @param ve {VElement}
		 * @returns {string} */
		let renderVEl = ve =>
			`<div style="color: #f40">
				<div>
					<span>&lt;${ve.tagName}</span
					>${omap(ve.attributes, (name, val) => ` <span>${name}="${renderItem(val, true)}"</span>`).join('')}&gt;
				</div>
				<div style="padding-left: 4ex">
					${ve.vChildren.map(renderItem).join('')}		
				</div>
				<div>&lt;/${ve.tagName}&gt;</div>			
			</div>`;

		/**
		 * @param vexpr {VExpression}
		 * @returns {string} */
		let renderVExpr = vexpr => {
			if (vexpr.type==='loop')
				return `
					<div style="color: #08f">${renderPaths(vexpr.watchPaths)}.map(${vexpr.loopParamName} => 
						
						<span style="color: #8888" title="watchPaths">
							[${renderPaths(vexpr.watchPaths)}] => ${vexpr.loopParamName}
						</span>
					
						<div style="padding-left: 4ex">
							${vexpr.loopItemEls.map(renderItem).join('')}
						</div>
						) 
					</div>`;

			return  `<span style="color: #60f">${vexpr.code}</span>
				<span style="color: #8888" title="watchPaths">
					[${renderPaths(vexpr.watchPaths)}]
				</span>`;
		};


		return createEl(renderVEl(this.virtualElement));
	}

	//#ENDIF

	static preCompile(self) {
		let result = {};
		result.self = self;
		result.constructorArgs = [];

		function removeComments(tokens)	{
			let result = [];
			for (let token of tokens) {
				if (token.type !== 'comment')
					result.push(token);
				if (token.tokens)
					token.tokens = removeComments(token.tokens);
			}
			return result;
		}

		// 1. Parse into tokens
		let code = self.toString();
		let tokens = lex(lexHtmlJs, code);
		tokens = removeComments(tokens);
		let htmlIdx = 0, constructorIdx=0;

		// 2. Build the virtual element tree.
		{
			// A. Find html template token
			// Make sure we're finding html = ` and the constructor at the top level, and not inside a function.
			// This search is also faster than if we use matchFirst() from the first token.
			let braceDepth = 0;
			for (let i = 0, token; token = tokens[i]; i++) {
				if (token == '{')
					braceDepth++;
				else if (token == '}')
					braceDepth--;
				else if (braceDepth === 1) {
					if (!htmlIdx && token == 'html')
						htmlIdx = i;
					else if (!constructorIdx && token == 'constructor')
						constructorIdx = i;
				}
				if (htmlIdx && constructorIdx)
					break;
			}

			let htmlMatch = fregex.matchFirst(['html', Parse.ws, '=', Parse.ws, {type: 'template'}, Parse.ws, fregex.zeroOrOne(';')], tokens, htmlIdx);
			//#IFDEV
			if (!htmlMatch)
				throw new Error(`Class ${self.name} is missing an html property with a template value.`);
			//#ENDIF

			// Remove the html property, so that when classes are constructed it's not evaluated as a regular template string.
			let htmlAssign = tokens.splice(htmlMatch.index, htmlMatch.length);
			let template = htmlAssign.filter(t=>t.tokens)[0]; // only the template token has sub-tokens.

			// B. Parse html
			let innerTokens = template.tokens.slice(1, -1); // skip open and close quotes.
			if (innerTokens[0].type === 'text' && !innerTokens[0].trim().length)
				innerTokens = innerTokens.slice(1); // Skip initial whitespace.
			result.virtualElement = VElement.fromTokens(innerTokens, [], null, 1)[0];
		}


		// 3. Get the constructorArgs and inject new code.
		{

			let constr = fregex.matchFirst(['constructor', Parse.ws, '('], tokens, constructorIdx);
			let injectIndex, injectCode;

			// Modify existing constructor
			if (constr) { // is null if no match found.

				// Find arguments
				let argTokens = fregex.matchFirst(Parse.argList, tokens, constr.index+constr.length);
				result.constructorArgs = Parse.filterArgNames(argTokens);

				// Find super call in constructor  body
				let sup = fregex.matchFirst(
					// TODO: Below I need to account for super calls that contain ; in an inline anonymous founction.
					// Instead count the ( and ) and end on the last )
					['super', Parse.ws, '(', fregex.zeroOrMore(fregex.not(';')), ';'],
					tokens,
					argTokens.index+argTokens.length);
				//#IFDEV
				if (!sup)
					throw new Error(`Class ${self.name} constructor() { ... } is missing call to super().`);
				//#ENDIF

				injectIndex = sup.index + sup.length;
				injectCode = [
					'//Begin Refract injected code.',
					...result.constructorArgs.map(argName=>
						[`if (this.hasAttribute('${argName}')) {`,
						`   ${argName} = this.getAttribute('${argName}');`,
						`   try { ${argName} = JSON.parse(${argName}) } catch(e) {};`,
						'}'] // [above] Parse attrib as json if it's valid json.
					).flat(),
					`if (!this.virtualElement) {`, // If not already created by a super-class
					`\tthis.virtualElement = this.constructor.virtualElement.clone(this);`,
					`\tthis.virtualElement.apply(this, this);`,
					`}`,
					'//End Refract injected code.'
				].join('\r\n\t\t\t');

			}

			// Create new constructor
			else {
				injectIndex = fregex.matchFirst(['{'], tokens).index+1;
				injectCode = [
					'//Begin Refract injected code.',
					`constructor() {`,
					`\tsuper();`,
					`\tif (!this.virtualElement) {`, // If not already created by a super-class
					`\t\tthis.virtualElement = this.constructor.virtualElement.clone(this);`,
					`\t\tthis.virtualElement.apply(this, this);`,
					'\t}',
					'}',
					'//End Refract injected code.'
				].join('\r\n\t\t');
			}

			tokens.splice(injectIndex, 0, '\r\n\t\t\t' + injectCode);
			result.code = tokens.join('');
		}

		return result;
	}

	static decorate(NewClass, compiled) {
		// 1. Set Properties
		NewClass.constructorArgs = compiled.constructorArgs;
		NewClass.virtualElement  = compiled.virtualElement;

		// 2. Copy methods and fields from old class to new class, so that debugging within them will still work.
		for (let name of Object.getOwnPropertyNames(compiled.self.prototype))
			if (name !== 'constructor')
				NewClass.prototype[name] = compiled.self.prototype[name];

		// 3. Copy static methods and fields, so that debugging within them will still work.
		for (let staticField of Object.getOwnPropertyNames(compiled.self))
			if (!(staticField in Refract)) // If not inherited
				NewClass[staticField] = compiled.self[staticField];

		// 4. Register the class as an html element.
		customElements.define(NewClass.virtualElement.tagName.toLowerCase(), NewClass);
	}



	/**
	 * Create string code that creates a new class with with a modified constructor and the html property removed.
	 * 1.  We inject code to give the constructor's arguments values from attributes, if they're not specified.
	 * 2.  We inject a call to this.create() after the constructor's super() call, so
	 *     we can access class properties created outside the constructor.  E.g. to bind id's to them.
	 * 3.  Set the static virtualElement property from the parsed html.
	 *
	 * TODO: Would there be a reason to have this to create standalone code that can be used without the original class?
	 * Then a build step could give only the post-compiled code to the browser.
	 * @return {string} */
	static compile() {

		// createFunction() is used for evaluating code within the same scope where the class is defined.
		// Otherwise, expressions in html can't read any identifiers that have been imported.
		// We use eval() to create the function, b/c new Function() can't access the external scope.

		// When NewClass is created, we give it the createFunction so that when other html is generated from expressions,
		// it can still use this function in the same scope.
		// We remove it from Refract because Refract will be used again in may other scopes.
		return `
			(() => {
				window.RefractCurrentClass = ${this.name};
				${this.name}.createFunction = (...args) => eval(\`(function(\${args.slice(0, -1).join(',')}) {\${args[args.length-1]}})\`);
				let compiled = ${this.name}.preCompile(${this.name});
				${this.name} = eval('('+compiled.code+')');		
				${this.name}.decorate(${this.name}, compiled);
				delete window.RefractCurrentClass;
				return ${this.name};	
			})();
		
		`;
	}
}

Refract.htmlDecode = Html.decode;
Refract.htmlEncode = Html.encode;

export default Refract;
