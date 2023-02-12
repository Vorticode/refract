
/**
 * Go into the mode if the string starts with the given regex.
 * @param regex {RegExp|string}
 * @param mode {string}
 * @param callback {?function(string|string[])}
 * @return {function(code:string):([string, int] | undefined)} */
export var descendIf = (regex, mode, callback=null) => code => {
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
}


/**
 * Ascend out of the current mode (to the previous mode) if the string starts with the given regex.
 * @param regex {RegExp|string}
 * @return {function(code:string):([string, int] | undefined)} */
export var ascendIf = regex => code => {
	if (regex instanceof RegExp) {
		let match = code.match(regex) || [];
		if (match.length)
			return [match[0], -1];
	}
	else if (code.startsWith(regex))
		return [regex, -1];
}


// Convert everything to a function.
export var functionize = grammar => {
	for (let mode in grammar)
		for (let type in grammar[mode]) {
			let pattern = grammar[mode][type];
			if (Array.isArray(pattern)) {

				// Replace arrays with functions to do lookups in maps.
				// Benchmarking shows a performance increase of about 3%.

				// 1. Build a lookup map based on first letter.
				let lookup = {};
				for (let token of pattern)
					lookup[token[0]] = [...(lookup[token[0]]||[]), token];

				// 2. Replace the array of tokens with a function that uses this lookup map.
				grammar[mode][type] = code => {
					let tokens = lookup[code[0]];
					if (tokens)
						for (let token of tokens)
							if (code.startsWith(token))
								return [token];
				}
			}
			else if (typeof pattern === 'string')
				grammar[mode][type] = code => [code.startsWith(pattern) ? pattern : undefined]
			else if (pattern instanceof RegExp) {
				grammar[mode][type] = code => [(code.match(pattern) || [])[0]]
			}
		}
}