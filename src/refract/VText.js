import Refract from "./Refract.js";
import Html from "../lib/Html.js";
import Utils from "./utils.js";

export default class VText {

	text = '';

	/** @type {Node} */
	el = null;

	/** @type {Refract} */
	refr_ = null;

	startIndex_ = 0;

	constructor(text='', refr=null) {
		this.refr_ = refr;
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
			if (parent.tagName === 'STYLE' && !this.refr_.contains(parent.getRootNode()?.host)) {
				if (!this.refr_.dataset.style) {
					this.refr_.constructor.styleId = (this.refr_.constructor.styleId || 0) + 1; // instance count.
					this.refr_.dataset.style = this.refr_.constructor.styleId;
				}

				let rTag = this.refr_.tagName.toLowerCase();

				text = VText.styleReplace_(this.text, rTag, this.refr_.dataset.style);
			}
			else
				text = this.text;


			if (this.el) { // Setting textContent will handle html entity <>& encoding properly.
				this.el.textContent = text;
			} else {
				this.el = parent.ownerDocument.createTextNode(text);
				parent = parent.shadowRoot || parent;
				parent.insertBefore(this.el, parent.childNodes[this.startIndex_]);
			}

			if (Refract.elsCreated)
				Refract.elsCreated.push(Utils.toString(text));
		}

		return 1;
	}

	clone_() {
		let result = new VText();
		result.text = this.text;
		result.refr_ = this.refr_;
		return result;
	}

	remove_() {
		this.el.parentNode.removeChild(this.el);
	}

	//#IFDEV
	toString() {
		return this.text;
	}
	//#ENDIF

	static styleReplace_(text, rTag, styleId) {
		return text.replace(new RegExp(rTag+'|:host', 'g'), rTag + '[data-style="' +  styleId + '"]')
	}
}