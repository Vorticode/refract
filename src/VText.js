import Refract from "./Refract.js";
import Html from "./Html.js";
import Utils from "./utils.js";

export default class VText {

	text = '';

	/** @type {Node} */
	el = null;

	/** @type {Refract} */
	refl = null;

	startIndex = 0;

	constructor(text='', refl=null) {
		this.refl = refl;
		if (text === null || text === undefined)
			text = '';
		else if (typeof text !== 'string' && !(text instanceof String))
			text = JSON.stringify(text); // instanceof detects strings with added properties.

		this.text = Html.decode(text);
	}

	/**
	 * @param parent {?HTMLElement}
	 * @param el {HTMLElement|Node?}
	 * @return {int} */
	apply_(parent=null, el=null) {
		if (el)
			this.el = el;
		else {
			let text;

			// If text inside a style tag that's not inside our own component's shadow root.
			if (parent.tagName === 'STYLE' && !this.refl.contains(parent.getRootNode()?.host)) {
				if (!this.refl.dataset.style) {
					this.refl.constructor.styleId = (this.refl.constructor.styleId || 0) + 1; // instance count.
					this.refl.dataset.style = this.refl.constructor.styleId;
				}

				let rTag = this.refl.tagName.toLowerCase();

				text = VText.styleReplace(this.text, rTag, this.refl.dataset.style);
			}
			else
				text = this.text;


			if (this.el) { // Setting textContent will handle html entity <>& encoding properly.
				this.el.textContent = text;
			} else {
				this.el = parent.ownerDocument.createTextNode(text);
				parent = parent.shadowRoot || parent;
				parent.insertBefore(this.el, parent.childNodes[this.startIndex]);
			}

			if (Refract.elsCreated)
				Refract.elsCreated.push(Utils.toString(text));
		}

		return 1;
	}

	clone() {
		let result = new VText();
		result.text = this.text;
		result.refl = this.refl;
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

	static styleReplace(text, rTag, styleId) {
		return text.replace(new RegExp(rTag+'|:host', 'g'), rTag + '[data-style="' +  styleId + '"]')
	}
}