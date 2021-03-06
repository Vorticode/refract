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
	let result = tokens => {
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
	//#IFDEV
	result.debug = 'and(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;

}

/**
 * Advance the number of tokens used by the first child that matches true.
 * TODO: Automatically treat an array given to an and() as an or() ? */
fregex.or = (...rules) => {
	rules = prepare(rules);
	let result = tokens => {
		for (let rule of rules) {
			let used = rule(tokens);
			if (used !== false)
				return used;
		}
		return false;
	}
	//#IFDEV
	result.debug = 'or(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;
}


/**
 * Equivalent of /!(a&b&c)/ */
fregex.not = (...rules) => {
	let f = fregex(rules); // re-use
	let result = tokens =>
		f(tokens) === false ? 0 : false; // If it matches, return false, otherwise advance 0.

	//#IFDEV
	result.debug = 'not(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;
};

/**
 * Advance one token if none of the children match.  A "nor"
 * Equivalent to /[^abc]/ */
fregex.nor = (...rules) => {
	rules = prepare(rules);
	let result = tokens => {
		for (let rule of rules)
			if (rule(tokens) > 0) // rule(tokens) returns the number used.
				return false;
		return 1;
	};
	//#IFDEV
	result.debug = 'nor(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;


}


/**
 * Consume either zero or one of the sequences given. */
fregex.zeroOrOne = (...rules) => {
	let f = fregex(rules);
	let result = tokens => {
		let used = f(tokens);
		if (used === false)
			return 0; // don't fail if no match.
		return used;
	}
	//#IFDEV
	result.debug = 'zeroOrOne(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;
};

fregex.xOrMore = (x, ...rules) => {
	let f = fregex(rules); // re-use
	let result = (tokens) => {
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

	//#IFDEV
	result.debug = x+'OrMore(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF

	return result;
};

fregex.zeroOrMore = (...rules) => fregex.xOrMore(0, ...rules);

fregex.oneOrMore = (...rules) => fregex.xOrMore(1, ...rules);


/**
 *
 * @param pattern
 * @param {array} haystack
 * @param {int} startIndex
 * @return {*[]} A slice of the items in haystack that match.
 *     with an added index property designating the index of the match within the haystack array. */
fregex.matchFirst = (pattern, haystack, startIndex=0) => {
	let result = fregex.matchAll(pattern, haystack, 1, startIndex);
	return result.length ? result[0] : null;
}

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
}


// Experimental
fregex.lookAhead = (...rules) => {
	rules = prepare(rules);
	let result = tokens => {
		for (let rule of rules) {
			let used = rule(tokens);
			if (used === false)
				return false;
		}
		return 0;
	}

	//#IFDEV
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
			}

		else
			result[i] = rules[i];

		//#IFDEV
		result[i].debug = rule.debug || JSON.stringify(rule);
		//#ENDIF
	}

	return result;
}
