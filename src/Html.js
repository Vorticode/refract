
var txt = document.createElement('div');
var decodeCache = {};

export default {

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
			.replace(/\a0/g, '&nbsp;')
		if (quotes.includes("'"))
			text = text.replace(/'/g, '&apos;');
		if (quotes.includes('"'))
			text = text.replace(/"/g, '&quot;');
		return text;
	}
};

