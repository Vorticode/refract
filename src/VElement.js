import VExpression from './VExpression.js';
import VText from './VText.js';
import Refract from './Refract.js';
import lex from "./lex.js";
import htmljs from "./lex-htmljs.js";
htmljs.allowHashTemplates = true;
import delve from "./delve.js";


/**
 * A virtual representation of an Element.
 * Supports expressions (VExpression) as attributes and children that can be evaluated later. */
export default class VElement {
	tagName = '';

	/** @type {object<string, (string|VExpression)[]>} */
	attributes = {};

	/** @type {VExpression[]} Expressions that create whole attribute name/value pairs. */
	attributeExpressions = [];


	/** @type {Refract} */
	xel = null;

	/** @type {HTMLElement} */
	el = null;


	/** @type {VElement} */
	vParent = null;

	/** @type {(VElement|VExpression|VText)[]} */
	vChildren = [];

	/**
	 * TODO: We can speed things up if a VElement has no expressions within it.
	 * And no ids, no svg's, no events, no shadowdom, and no slots.
	 *
	 * We should just store the html, and create it as needed.
	 * Instead of recursing through all of the VElements attributes and children.
	 *
	 * I can add an getStaticCode() function that calculates and caches static code if it's static.
	 *
	 * Or we can apply id's, events, shadowdom, and slots manually after creating it?
	 * @type {string|null} */
	//staticCode = null;

	/** @type {object<string, string>} */
	scope = {};

	/** @type {int} DOM index of the first DOM child created by this VExpression within parent. */
	startIndex = 0;

	constructor(tagName, attributes) {
		this.tagName = tagName || '';
		this.attributes = attributes || {};
	}

	/**
	 * Add or update the HTMLElement linked to this VElement.
	 * apply() always replaces all children.  If this is to aggressive, apply() should be called
	 * on only the child elements that should be updated.
	 *
	 * @param parent {HTMLElement}
	 * @param el {HTMLElement} */
	apply(parent=null, el=null) {
		let tagName = this.tagName;

		if (tagName === 'svg')
			Refract.inSvg = true;

		// 1A. Binding to existing element.
		if (el) {
			this.el = el;

			// This will cause trouble when we call cloneNode() on an element with a slot.
			// Because then the slot will be added to the slot, recursively forever.
			// So we only allow setting content that doesn't have slot tags.
			if (!el.querySelector('slot'))
				this.xel.slotHtml = el.innerHTML;
			el.innerHTML = '';
		}
		// 1B. Create Element
		else {
			let newEl;

			// Special path, because we can't use document.createElement() to create an element whose constructor
			//     adds attributes and child nodes.
			// https://stackoverflow.com/questions/43836886
			if (tagName.includes('-') && customElements.get(tagName)) {
				let Class = customElements.get(tagName);

				let args = []
				if (Class.constructorArgs)
					args = Class.constructorArgs.map(name => {
						if (name in this.attributes) {
							let val = this.attributes[name];

							// A solitary VExpression.
							if (val && val.length === 1 && val[0] instanceof VExpression)
								return val[0].exec.apply(this.xel, Object.values(this.scope));

							// Attribute with no value.
							if (Array.isArray(val) && !val.length)
								return true;

							// Else evaluate as JSON, or as a string.
							let result = VElement.evalVAttributeAsString(this, (val || []), this.scope);
							try {
								result = JSON.parse(result);
							} catch (e) {}
							return result;
						}
					});

				newEl = new Class(...args);
			}
			else if (Refract.inSvg) // SVG's won't render w/o this path.
				newEl = document.createElementNS('http://www.w3.org/2000/svg', tagName);
			else
				newEl = document.createElement(tagName);

			if (this.el) {  // Replacing existing element
				this.el.parentNode.insertBefore(newEl, this.el);
				this.el.remove();
			} else {// if (parent)
				let p2 = parent.shadowRoot || parent;
				if (p2 !== this.xel && p2.tagName && p2.tagName.includes('-') && newEl.tagName !== 'SLOT') // Insert into slot if it has one.  TODO: How to handle named slots here?
					p2 = p2.querySelector('slot') || p2;

				p2.insertBefore(newEl, p2.childNodes[this.startIndex]);
			}
			this.el = newEl;

			if (Refract.elsCreated)
				Refract.elsCreated.push('<'+tagName + '>');
		}


		// 2. Set Attributes
		let hasValue = ('value' in this.attributes && tagName !== 'option');
		for (let name in this.attributes) {
			let value = this.attributes[name];
			for (let attrPart of value)
				if (attrPart instanceof VExpression) {
					let expr = attrPart;
					expr.parent = this.el;
					expr.watch(() => {
						if (name === 'value')
							setInputValue(this.xel, this.el, value, this.scope, isTextArea || isContentEditable);

						else {
							let value2 = VElement.evalVAttributeAsString(this.xel, value, this.scope);
							this.el.setAttribute(name, value2);
						}
					});
				}

			// TODO: This happens again for inputs in step 5 below:
			VElement.setVAttribute(this.xel, this.el, name, value, this.scope);


			// Id
			if (name === 'id' || name === 'data-id')
				this.xel[this.el.getAttribute(name)] = this.el;

			// Events
			else if (name.startsWith('on')) {

				// Get the createFunction() from the class if it's already been instantiated.  Else use Refract's temporary createfunction().
				// This lets us use other variabls defiend in the same scope as the class that extends Refract.
				let createFunction = ((this.xel && this.xel.constructor) || window.RefractCurrentClass).createFunction;

				this.el[name] = event => { // e.g. el.onclick = ...
					let args = ['event', 'el', ...Object.keys(this.scope)];
					let code = this.el.getAttribute(name);
					let func = createFunction(...args, code).bind(this.xel); // Create in same scope as parent class.
					func(event, this.el, ...Object.values(this.scope));
				}
			}

			// Shadow DOM
			else if (name==='shadow' && !this.el.shadowRoot)
				this.el.attachShadow({mode: this.el.getAttribute('shadow') || 'open'});
		}

		// List of input types:
		// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#input_types
		//let hasTextEvents = Object.keys(this.attributes).some(attr =>
		//	['onchange','oninput',  'onkeydown', 'onkeyup', 'onkeypress', 'oncut', 'onpaste'].includes(attr));
		let isContentEditable =this.el.hasAttribute('contenteditable') && this.el.getAttribute('contenteditable') !== 'false';
		let isTextArea = tagName==='textarea';

		// 2B. Form field two way binding.
		// Listening for user to type in form field.
		if (hasValue) {
			let value = this.attributes.value;
			let isSimpleExpr = value.length === 1 && value[0] && value[0].type === 'simple';

			// Don't grab value from input if we can't reverse the expression.
			if (isSimpleExpr) {

				let isTypableInput = tagName === 'input' &&
					!['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'reset', 'submit'].includes(this.el.getAttribute('type'));
				let isTypable = isTextArea || isContentEditable || isTypableInput;

				let scope = {'this': this.xel, ...this.scope};
				if (isTypable) { // TODO: Input type="number" is typable but also dispatches change event on up/down click.
					this.el.addEventListener('input', ()=> {

						let type = this.el.getAttribute('type') || '';

						// Convert input type="number" to a float.
						let val = isContentEditable ? this.el.innerHTML : this.el.value;
						if (type === 'number' || type === 'range')
							val = parseFloat(val);
						if (type === 'datetime-local' || type === 'datetime')
							val = new Date(val);

						if (delve(scope, value[0].watchPaths[0]) !== val) {
							delve(scope, value[0].watchPaths[0], val); // TODO: Watchless if updating the original value.
						}
					}, true); // We bind to the event capture phase so we can update values before it calls onchange and other event listeners added by the user.
				}
				else /*if (tagName === 'select' || tagName==='input')*/ {
					this.el.addEventListener('change', () => {
						// TODO: Convert value to boolean for checkbox.  File input type.
						let val;
						if (tagName === 'select' && this.el.hasAttribute('multiple')) {
							let val = Array.from(this.el.children).filter(el => el.selected).map(opt => opt.value);
							// if (!Array.isArray(delve(scope, value[0].watchPaths[0])))
							// 	val = val[0];
							delve(scope, value[0].watchPaths[0], val);
						}
						else
							val = isContentEditable ? this.el.innerHTML : this.el.value;

						delve(scope, value[0].watchPaths[0], val);
					}, true);
				}

			}
		}

		// 3. Slot content
		let count = 0;
		if (tagName === 'slot') {
			let slotChildren = VElement.fromHtml(this.xel.slotHtml, Object.keys(this.scope), this);
			for (let vChild of slotChildren) {
				vChild.scope = {...this.scope}
				vChild.startIndex = count;
				window.inSlot = true;
				count += vChild.apply(this.el);
				window.inSlot = false;
			}
		}

		// 4. Recurse through children
		for (let vChild of this.vChildren) {
			vChild.scope = {...this.scope} // copy
			vChild.startIndex = count;
			count += vChild.apply(this.el);
		}

		// 5. Set initial value for select from value="" attribute.    
	    if (hasValue) // This should happen after the children are added, e.g. for select <options>
	    	// TODO: Do we only need to do this for select boxes b/c we're waiting for their children?  Other input types are handled above in step 2.
		    setInputValue(this.xel, this.el, this.attributes.value, this.scope, isTextArea || isContentEditable);


		if (tagName === 'svg')
			Refract.inSvg = false;

		return 1; // 1 element created, not counting children.
	}


	/**
	 * @param xel {Refract}
	 * @param vParent {VElement|VExpression}
	 * @returns {VElement} */
	clone(xel, vParent) {
		let result = new VElement(this.tagName);
		result.xel = xel || this.xel;

		for (let attrName in this.attributes) {
			result.attributes[attrName] = [];
			for (let piece of this.attributes[attrName]) {
				if (piece instanceof VExpression)
					result.attributes[attrName].push(piece.clone(result.xel, this))
				else
					result.attributes[attrName].push(piece);
			}
		}
		for (let expr of this.attributeExpressions)
			result.attributeExpressions.push(expr.clone(result.xel, this));

		for (let child of this.vChildren)
			result.vChildren.push(child.clone(result.xel, result)); // string for text node.

		return result;
	}

	remove() {
		// 1. Remove children, so that their watches are unsubscribed.
		for (let vChild of this.vChildren)
			vChild.remove();

		// 2. Remove the associated element.  We call parentNode.removeChild in case remove() is overridden.
		this.el.parentNode.removeChild(this.el);
	}

	//#IFDEV
	toString() {
		let attributes = [];
		for (let name in this.attributes)
			attributes.push(` ${name}="${this.attributes[name]}"`);

		return `<${this.tagName}${attributes.join('')}>`;
	}
	//#ENDIF


	/**
	 * TODO: Reduce shared logic between this and evalVAttribute
	 * If a solitary VExpression, return whatevr object it evaluates to.
	 * Otherwise merge all pieces into a string and return that.
	 * value="${'one'}" becomes 'one'
	 * value="${['one', 'two']}" becomes ['one', 'two']
	 * value="${['one', 'two']}three" becomes ['onetwothree']
	 * @param ref {Refract}
	 * @param attrParts {(VExpression|string)[]}
	 * @param scope {object}
	 * @returns {*|string} */
	static evalVAttribute(ref, attrParts, scope={}) {
		let result = attrParts.map(expr =>
			expr instanceof VExpression ? expr.exec.apply(ref, Object.values(scope)) : expr
		);

		// If it's a single value, return that.
		if (result.length === 1)
			return result[0];

		return result.flat().join('');
	}

	/**
	 * @param ref {Refract}
	 * @param attrParts {(VExpression|string)[]}
	 * @param scope {object}
	 * @return {string} */
	static evalVAttributeAsString(ref, attrParts, scope={}) {
		let result = [];
		for (let attrPart of attrParts) {
			if (attrPart instanceof VExpression) {
				let val = attrPart.exec.apply(ref, Object.values(scope));
				if (Array.isArray(val) || (val instanceof Set))
					val = Array.from(val).join(' '); // Useful for classes.
				else if (val && typeof val === 'object') // style attribute
					val = Object.entries(val).map(([name, value]) => `${name}: ${val[name]}; `).join('');
				result.push(val)
			}
			else
				result.push(Refract.htmlDecode(attrPart)); // decode because this will be passed to setAttribute()
		}
		return result.join('');
	}

	/**
	 * @deprecated.  Just call setAttribute with evalVAttributeAsString()
	 * @param xel {Refract}
	 * @param el {HTMLElement}
	 * @param attrName {string}
	 * @param scope {object}
	 * @param attrParts {(VExpression|string)[]} */
	static setVAttribute(xel, el, attrName, attrParts, scope={}) {
		let value = VElement.evalVAttributeAsString(xel, attrParts, scope);
		el.setAttribute(attrName, value);
	}

	/**
	 * Convert html to an array of child elements.
	 * @param html {string|string[]} Tokens will be removed from the beginning of the array as they're processed.
	 * @param scopeVars {string[]}
	 * @param vParent {VElement|VExpression}
	 * @returns {(VElement|VExpression|string)[]} */
	static fromHtml(html, scopeVars=[], vParent=null) {
		let tokens = lex(htmljs, [html].flat().join(''), 'template');
		return VElement.fromTokens(tokens, scopeVars, vParent);
	}

	/**
	 * Convert tokens to an array of child elements.
	 * @param tokens {Token[]}
	 * @param scopeVars {string[]}
	 * @param vParent {VElement|VExpression?}
	 * @param limit {int|boolean=} Find no more than this many items.
	 * @param index {int=} used internally.
	 * @returns {(VElement|VExpression|string)[]}
	 *     Array with a .index property added, to keep track of what token we're on. */
	static fromTokens(tokens, scopeVars=[], vParent=null, limit=false, index=0) {
		let result = [];

		//#IFDEV
		if (!Array.isArray(tokens))
			throw new Error('array required.');
		//#ENDIF

		if (!tokens.length)
			return [];

		do {
			let token = tokens[index];
			//#IFDEV
			if (!token)
				debugger;
			//#ENDIF

			// Text node
			if (token.type === 'text') {
				let vtext = new VText(token);
				result.push(vtext);
			}

			// Expression child
			else if (token.type === 'expr') {
				result.push(VExpression.fromTokens(token.tokens, scopeVars, vParent));
			}

			// Collect tagName and attributes from open tag.
			else if (token.type === 'openTag') {
				let vel = new VElement();
				vel.vParent = vParent;
				vel.xel = vParent?.xel;
				if (vParent)
					vel.scope = {...vParent.scope};


				let attrName='';
				let tagTokens = token.tokens.filter(token => token.type !== 'whitespace') // Tokens excluding whitespace.

				for (let j=0, tagToken; (tagToken = tagTokens[j]); j++) {
					if (j === 0)
						vel.tagName = tagToken.slice(1);


					else if (tagToken.type === 'attribute') {
						attrName = tagToken;
						vel.attributes[attrName] = []; // Attribute w/o value, or without value yet.
					}

					// Attribute value string or expression
					else if (attrName && tagTokens[j-1] == '=') {
						let attrValues = [];

						// Tokens within attribute value string.
						if (tagToken.type === 'string')
							for (let exprToken of tagToken.tokens.slice(1, -1)) { // slice to remove surrounding quotes.

								if (exprToken.type === 'expr')
									attrValues.push(VExpression.fromTokens(exprToken.tokens, scopeVars, vParent, attrName));
								else // string:
									attrValues.push(exprToken +'');
							}
						else if (tagToken.type === 'expr') // expr not in string.
							attrValues.push(VExpression.fromTokens(tagToken.tokens, scopeVars, vParent, attrName));
						//#IFDEV
						else
							throw new Error(); // Shouldn't happen.
						//#ENDIF


						vel.attributes[attrName] = attrValues;
						attrName = undefined;
					}

					// Expression that creates attribute(s)
					else if (tagToken.type === 'expr')
						vel.attributeExpressions.push(VExpression.fromTokens(tagToken.tokens, scopeVars, vParent));

				}


				let isSelfClosing = tagTokens[tagTokens.length-1] == '/>' ||
					['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source',
						'track', 'wbr', 'command', 'keygen', 'menuitem'].includes(vel.tagName);
					// TODO: What svg elements are self-closing?

				// Process children if not a self-closing tag.
				if (!isSelfClosing) {
					index++

					// New path:
					vel.vChildren = VElement.fromTokens(tokens, scopeVars, vel, false, index);
					index = vel.vChildren.index; // What is this?
				}

				result.push(vel);
			}

			// Collect close tag.
			else if (token.type === 'closeTag')
				break;

			if (result.length === limit)
				break;

			index++;
		} while (index < tokens.length);

		result.index = index;

		return result;
	}
}


function setInputValue(ref, el, value, scope, isText) {
	if (isText || el.tagName === 'INPUT') {
		let val = VElement.evalVAttributeAsString(ref, value, scope);
		if (isText)
			el.innerHTML = val;
		else
			el.value = val;
	}
	else {
		let values = VElement.evalVAttribute(ref, value, scope);
		if (el.tagName === 'SELECT')
			for (let opt of el.children)
				opt.selected = Array.isArray(values) ? values.includes(opt.value) : values === opt.value;
		else // Some custom elements can accept object or array for the value property:
			el.value = values;
	}
}
