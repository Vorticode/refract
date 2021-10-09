
var txt = document.createElement('textarea');

export default {

	/**
	 * Convert html entities like &lt; to their literal values like <.
	 * @param {string} html
	 * @returns {string} */
	decode(html) {
		txt.innerHTML = html;
		return txt.value;
	}
};

