import Refract from "./Refract.js";
import Html from "./Html.js";
import Utils from "./utils.js";

export default class VText {

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
				this.el = parent.ownerDocument.createTextNode(this.text);
				parent = parent.shadowRoot || parent;
				parent.insertBefore(this.el, parent.childNodes[this.startIndex]);
			}

			if (Refract.elsCreated)
				Refract.elsCreated.push(Utils.toString(this.text));
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