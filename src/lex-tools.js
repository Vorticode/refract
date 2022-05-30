

/**
 * Go into the mode if the string starts with the given regex.
 * @param regex {RegExp|string}
 * @param mode {string}
 * @param callback {?function(string|string[])}
 * @return {function(code:string):([string, int] | undefined)} */
export var descendIf = (regex, mode, callback) => code => {
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