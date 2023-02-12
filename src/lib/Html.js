import Utils from "../refract/utils.js";

var div = document.createElement('div');
var decodeCache_ = {};

export default {

	/**
	 * Convert html entities like &lt; to their literal values like <.
	 * @param {string} html
	 * @return {string} */
	decode(html) {
		if (!html)
			return '';

		return html // Fast solution inspired by https://stackoverflow.com/a/43282001
			.replace(/&[#A-Z0-9]+;/gi, entity => {
				let result = decodeCache_[entity];
				if (result)
					return result;

				div.innerHTML = entity; // create and cache new entity
				return decodeCache_[entity] = div.textContent;
			});

	},

	encode(text, quotes='') {
		text = Utils.toString(text) // TODO: This changes 0 to ''
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

export {div};

