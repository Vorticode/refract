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
export default function fregex(...rules) {
	rules = prepare(rules);
	let result = (tokens, capture=[], index=0) => {
		let i = 0;
		for (let rule of rules) {
			let used = rule(tokens.slice(i), capture, index + i);
			if (used === false) // 0, false, null, or undefined
				return false;

			// True becomes 1
			i += used;
		}
		return i; // returns number of tokens used.
	}
	//#IFDEV
	if (fregex.debug)
		result.debug = 'and(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;

}

fregex.capture = (...rules) => {

	let name = null;
	rules = rules.filter(rule => {
		if (rule instanceof CaptureName) {
			name = rule.name;
			return false;
		}
		return true;
	});

	rules = prepare(rules);
	let result = (tokens, capture=[], index=0) => {
		let i = 0;
		for (let rule of rules) {
			let used = rule(tokens.slice(i), capture, index+i);
			if (used === false) // 0, false, null, or undefined
				return false;

			// True becomes 1
			i += used;
		}

		let captureItem = {
			index: index,
			match: tokens.slice(0, i)
		};

		if (name)
			captureItem.name = name;

		capture.push(captureItem);

		return i; // returns number of tokens used.
	}
	//#IFDEV
	if (fregex.debug)
		result.debug = 'and(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;
}

fregex.captureName = name => {
	return new CaptureName(name);
}

/**
 * Advance the number of tokens used by the first child that matches true.
 * TODO: Automatically treat an array given to an and() as an or() ?
 * @return {function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched. */
fregex.or = (...rules) => {
	rules = prepare(rules);
	let result = (tokens, capture=[], index=0) => {
		for (let rule of rules) {
			let used = rule(tokens, capture, index);
			if (used !== false)
				return used;
		}
		return false;
	}
	//#IFDEV
	if (fregex.debug)
		result.debug = 'or(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;
}


/**
 * Equivalent of /!(a&b&c)/
 * @return {function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched. */
fregex.not = (...rules) => {
	let f = fregex(rules); // re-use
	let result = (tokens, capture=[], index=0) =>
		f(tokens, capture, index) === false ? 0 : false; // If it matches, return false, otherwise advance 0.

	//#IFDEV
	if (fregex.debug)
		result.debug = 'not(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;
};

/**
 * Advance one token if none of the children match.  A "nor"
 * Equivalent to /[^abc]/ or not(or())
 * @return {function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched.
fregex.nor = (...rules) => {
	rules = prepare(rules);
	let result = (tokens, capture=[], index=0) => {
		for (let rule of rules)
			if (rule(tokens) > 0) // rule(tokens) returns the number used.
				return false;
		return 1;
	};
	//#IFDEV
	if (fregex.debug)
		result.debug = 'nor(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;
}*/


/**
 * Consume either zero or one of the sequences given.
 * @return {function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched. */
fregex.zeroOrOne = (...rules) => {
	let f = fregex(rules);
	let result = (tokens, capture=[], index=0) => {
		let used = f(tokens, capture, index);
		if (used === false)
			return 0; // don't fail if no match.
		return used;
	}
	//#IFDEV
	if (fregex.debug)
		result.debug = 'zeroOrOne(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;
};

/**
 *
 * @param x
 * @param rules
 * @return {*[]|function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched. */
fregex.xOrMore = (x, ...rules) => {
	let f = fregex(rules); // re-use
	let result =(tokens, capture=[], index=0) => {
		let total = 0;
		for (let i=0; tokens.length; i++) {
			let used = f(tokens, capture, index + total);
			if (used === false)
				return i >= x ? total : false;
			total += used || 1;
			tokens = tokens.slice(used || 1); // TODO: Why is this logic is different than php version?
		}
		return total;
	}

	//#IFDEV
	if (fregex.debug)
		result.debug = x+'OrMore(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF

	return result;
};

/**
 *
 * @param rules
 * @return {*[]|function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched. */
fregex.zeroOrMore = (...rules) => fregex.xOrMore(0, ...rules);

/**
 *
 * @param rules
 * @return {*[]|function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched. */
fregex.oneOrMore = (...rules) => fregex.xOrMore(1, ...rules);


/**
 * Find the first squence in haystack that matches the pattern.
 * @param pattern {*[]|function(tokens:*[]):int|bool}
 * @param haystack {array}
 * @param startIndex {int}
 * @return {*[]} A slice of the items in haystack that match.
 *     with an added index property designating the index of the match within the haystack array. */
fregex.matchFirst = (pattern, haystack, startIndex=0, capture=[]) => {
	let result = fregex.matchAll(pattern, haystack, 1, startIndex);
	return result.length ? result[0] : null;
}

fregex.matchAll = (pattern, haystack, limit=Infinity, startIndex=0) => {
	if (Array.isArray(pattern))
		pattern = fregex(pattern);
	let result = [];

	// Iterate through each offset in haystack looking for strings of tokens that match pattern.
	for (let i = startIndex; i < haystack.length && result.length < limit; i++) {
		let capture = [];
		let count = pattern(haystack.slice(i), capture);
		if (count !== false)
			result.push(Object.assign(haystack.slice(i, i + count), {index: i, capture}));
	}
	return result;
}

/**
 * Starting with the first token, this function finds all tokens until it encounters the string specified by `isEnd`,
 * but it uses `isIncrement` and `isDecrement` to avoid finding `isEnd` within a scope.
 *
 * TODO: Does this duplicate some of ArrayUtil.find() ?
 *
 * @param {object[]} tokens
 * @param {string | array | object | function} isEnd
 * @param {string | array | object | function} [isIncrement] Accepts the string of tokens and returns the number of tokens consumed.
 * @param {string | array | object | function} [isDecrement]
 * @param {boolean} [includeEnd=false]
 * @returns {object[] | null}
 *
 * @example
 * const code = '<?php $var = (function() { return "Apple";})(); // comment';
 * const tokens = PhpFile.tokenize(code);
 * const result = Fregex.munch(tokens, {text: ';'}, {text: '{'}, {text: '}'});
 *
 * // prints  '<?php $var = (function() { return "Apple";})();'
 * result.forEach(token => console.log(Html.encode(token.text))); */
fregex.munch = (tokens, isEnd, isIncrement = null, isDecrement = null, includeEnd = false) => {
	isEnd = prepareRule(isEnd);
	if (isIncrement)
		isIncrement = prepareRule(isIncrement);
	if (isDecrement)
		isDecrement = prepareRule(isDecrement);

	let scope = 0;
	for (let i = 0; i < tokens.length; i++) {
		const next = tokens.slice(i);

		if (!scope) {
			const count = isEnd(next);
			if (count !== false)
				return tokens.slice(0, includeEnd ? i + count : i);
		}

		if (isIncrement) {
			const count = isIncrement(next);
			if (count !== false) {
				i += count - 1;
				scope++;
			}
		}
		if (isDecrement) {
			const count = isDecrement(next);
			if (count !== false) {
				i += count - 1;
				scope--;
			}
		}
	}

	return null;
}

// Experimental
fregex.lookAhead = (...rules) => {
	rules = prepare(rules);
	let result = (tokens, capture=[]) => {
		for (let rule of rules) {
			let used = rule(tokens, capture);
			if (used === false)
				return false;
		}
		return 0;
	}

	//#IFDEV
	if (fregex.debug)
		result.debug = 'lookAhead(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF

	return result;
}

/**
 * Experimental
 * Matches the end of the tokens.
 * @param tokens
 * @return {number|boolean} */
fregex.end = tokens => {
	return tokens.length ? false : 0;
};

//#IFDEV
if (fregex.debug)
	fregex.end.debug = 'end';
//#ENDIF


/**
 * Allow matching on functions, object properties, and strings.
 * @param rules
 * @return {function[]} */
var prepare = rules => {
	if (Array.isArray(rules[0]) && rules.length === 1)
		rules = rules[0];

	let result = [];
	for (let i in rules) {
		result[i] = prepareRule(rules[i]);

		//#IFDEV
		result[i].debug = rules[i].debug || JSON.stringify(rules[i]);
		//#ENDIF
	}

	return result;
}

var prepareRule = rule => {
	if (typeof rule === 'string')
		// noinspection EqualityComparisonWithCoercionJS
		return tokens => tokens[0] == rule; // TODO: is loose equals best?

	else if (Array.isArray(rule)) // must occur before typeof rule === 'object' b/c array is object.
		return fregex(rule);

	// If an object, test to see if the token has all of the object's properties.
	else if (typeof rule === 'object' && !rule.prototype)
		return tokens => {
			for (let name in rule)
				// noinspection EqualityComparisonWithCoercionJS
				if (!tokens[0] || (tokens[0][name] != rule[name])) // TODO: What if tokens is an empty array and [0] is undefined?
					return false;

			return 1; // Advance 1 token.
		}

	else
		return rule;
}

class CaptureName {
	constructor(name) {
		this.name = name;
	}
}