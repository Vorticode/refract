import VExpression from './VExpression.js';
import VText from './VText.js';
import Refract from './Refract.js';
import lex from "./lex.js";
import htmljs from "./lex-htmljs.js";
htmljs.allowHashTemplates = true;
import {div} from "./Html.js";
import Utils from "./utils.js";

/**
 * A virtual representation of an Element.
 * Supports expressions (VExpression) as attributes and children that can be evaluated later. */
export default class VElement {
	tagName = '';

	/** @type {Object<string, (string|VExpression)[]>} */
	attributes = {};

	/** @type {VExpression[]} Expressions that create whole attribute name/value pairs. */
	attributeExpressions = [];


	/** @type {Refract} */
	xel = null;

	/** @type {HTMLElement|HTMLInputElement} */
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

	/** @type {Object<string, string>} */
	scope = {};

	/** @type {int} DOM index of the first DOM child created by this VExpression within parent. */
	startIndex = 0;

	/**
	 * @param tagName {?string}
	 * @param attributes {?Object<string, string[]>} */
	constructor(tagName=null, attributes=null) {
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
		var oldEl = this.el;

		// 1A. Binding to existing element.
		if (el) {
			this.el = el;

			// This will cause trouble when we call cloneNode() on an element with a slot.
			// Because then the slot will be added to the slot, recursively forever.
			// So we only allow setting content that doesn't have slot tags.
			if (!el.querySelector('slot'))
				this.xel.slotHtml = el.innerHTML; // At this point none of the children will be upgraded to web components?
			el.innerHTML = '';
		}
		// 1B. Create Element
		else {
			var newEl;

			// Special path, because we can't use document.createElement() to create an element whose constructor
			//     adds attributes and child nodes.
			// https://stackoverflow.com/questions/43836886
			if (tagName.includes('-') && customElements.get(tagName)) {
				let Class = customElements.get(tagName);

				let args = []
				if (Class.constructorArgs)
					args = Class.constructorArgs.map(name => {
						let lname = name.toLowerCase();

						// TODO: this logic is duplicated in Refract.preCompile()
						if (name in this.attributes || lname in this.attributes) {
							let val = name in this.attributes ? this.attributes[name] : this.attributes[lname];

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
							} catch (e) {

								// A code expression
								if (result.startsWith('${') && result.endsWith('}')) // Try evaluating as code if it's surrounded with ${}
									try {
										result = eval(result.slice(2, -1))
									} catch(e) {}
							}
							return result;
						}
					});

				// Firefox:  "Cannot instantiate a custom element inside its own constructor during upgrades"
				// Chrome:  "TypeError: Failed to construct 'HTMLElement': This instance is already constructed"
				// Browsers won't let us nest web components inside slots when they're created all from the same html.
				// So we use this crazy hack to define a new version of the element.
				// See the Refract.nested.recursive test.
				let i = 1;
				let tagName2 = tagName;
				while (tagName2.toUpperCase() in Refract.constructing) {
					tagName2 = tagName + '_' + i
					var Class2 = customElements.get(tagName2);
					if (Class2)
						Class = Class2;

					else {
						customElements.define(tagName2, class extends Class {});
						Class = customElements.get(tagName2);
						i++;
					}
				}

				// If this code fails in the future due to an element not finished constructing/upgrading,
				// then modify the Refract constructor injecting code to make sure that
				// delete Refract.constructing[this.tagName]]
				// goes at the very end of the constructor.
				newEl = new Class(...args);


			}
			else if (Refract.inSvg) // SVG's won't render w/o this path.
				newEl = document.createElementNS('http://www.w3.org/2000/svg', tagName);
			else
				newEl = document.createElement(tagName);

			//newEl.style.display = 'none';
			if (oldEl) {  // Replacing existing element
				oldEl.parentNode.insertBefore(newEl, oldEl);
				oldEl.remove();
			} else {// if (parent)

				if (!oldEl) {
					let p2 = parent.shadowRoot || parent;

					// Insert into slot if it has one.  TODO: How to handle named slots here?
					if (p2 !== this.xel && p2.tagName && p2.tagName.includes('-') && newEl.tagName !== 'SLOT')
						p2 = p2.querySelector('slot') || p2;
					p2.insertBefore(newEl, p2.childNodes[this.startIndex]);
				}
			}
			this.el = newEl;

			if (Refract.elsCreated)
				Refract.elsCreated.push('<'+tagName + '>');
		}


		// 2. Shadow DOM
		for (let name in this.attributes)
			if (name === 'shadow' && !this.el.shadowRoot)
				this.el.attachShadow({mode: this.el.getAttribute('shadow') || 'open'});

		// 3. Slot content
		let count = 0;
		if (tagName === 'slot') {
			let slotChildren = VElement.fromHtml(this.xel.slotHtml, Object.keys(this.scope), this);
			for (let vChild of slotChildren) {
				vChild.scope = {...this.scope}
				vChild.startIndex = count;
				count += vChild.apply(this.el);
			}
		}

		// 4. Recurse through children
		let isText = this.el.tagName === 'TEXTAREA' || this.attributes['contenteditable'] && (this.attributes['contenteditable']+'') !== 'false';
		for (let vChild of this.vChildren) {
			if (isText && (vChild instanceof VExpression))
				throw new Error('textarea and contenteditable cannot have expressions as children.  Use value=${this.variable} instead.');

			vChild.scope = {...this.scope} // copy
			vChild.xel = this.xel;
			vChild.startIndex = count;
			count += vChild.apply(this.el);
		}

		// 5. Attributes (besides shadow)
		for (let name in this.attributes) {
			let value = this.attributes[name];
			for (let attrPart of value)
				if (attrPart instanceof VExpression) {
					let expr = attrPart;
					expr.parent = this.el;
					expr.scope = this.scope; // Share scope with attributes.
					expr.watch(() => {
						if (name === 'value')
							setInputValue(this.xel, this.el, value, this.scope);

						else {
							let value2 = VElement.evalVAttributeAsString(this.xel, value, this.scope);
							this.el.setAttribute(name, value2);
						}
					});
				}

			// TODO: This happens again for inputs in step 5 below:
			let value2 = VElement.evalVAttributeAsString(this.xel, value, this.scope);
			this.el.setAttribute(name, value2);


			// Id
			if (name === 'id' || name === 'data-id')
				this.xel[this.el.getAttribute(name)] = this.el;

			// Events
			else if (name.startsWith('on') && (name in div)) {

				// Get the createFunction() from the class if it's already been instantiated.  Else use Refract's temporary createfunction().
				// This lets us use other variabls defiend in the same scope as the class that extends Refract.
				let createFunction = ((this.xel && this.xel.constructor) || window.RefractCurrentClass).createFunction;

				let code = this.el.getAttribute(name);
				this.el.removeAttribute(name); // Prevent original attribute being executed, without `this` and `el` in scope.
				this.el[name] = event => { // e.g. el.onclick = ...
					let args = ['event', 'el', ...Object.keys(this.scope)];
					let func = createFunction(...args, code).bind(this.xel); // Create in same scope as parent class.
					func(event, this.el, ...Object.values(this.scope));
				}
			}
		}

		// Attribute expressions
		for (let expr of this.attributeExpressions) {
			expr.scope = this.scope;
			expr.apply(this.el)
			expr.watch(() => {
				expr.apply(this.el);
			});
		}


		// 6. Form field two-way binding.
		// Listening for user to type in form field.
		let hasValue = (('value' in this.attributes)&& tagName !== 'option');
		if (hasValue) {
			let valueExprs = this.attributes.value;
			let isSimpleExpr = valueExprs.length === 1 && (valueExprs[0] instanceof VExpression) && valueExprs[0].type === 'simple';

			// Don't grab value from input if we can't reverse the expression.
			if (isSimpleExpr) {
				let createFunction = ((this.xel && this.xel.constructor) || window.RefractCurrentClass).createFunction;
				let assignFunc = createFunction(...Object.keys(this.scope), 'val', valueExprs[0].code + '=val;').bind(this.xel);

				// Update the value when the input changes:
				Utils.watchInput(this.el, (val, e) => {
					Refract.currentEvent = e;
					assignFunc(...Object.values(this.scope), val);
					Refract.currentEvent = null;
				});
			}
		}

		/*
		// New as of Feb 2022.
		// If I can make a preprocessor add data-value-expr to any input fields within complex (or all) expressions,
		// then I can know I should bind to them.  Even if the origional ${} expression has already been evaluated.
		if ('data-value-expr' in this.attributes) {

			let expr = this.attributes['data-value-expr'][0];
			let createFunction = ((this.xel && this.xel.constructor) || window.RefractCurrentClass).createFunction;
			let assignFunc = createFunction(...Object.keys(this.scope), 'val', expr + '=val;').bind(this.xel);

			Utils.watchInput(this.el, (val, e) => {
				Refract.currentEvent = e;
				assignFunc(...Object.values(this.scope), val);
				Refract.currentEvent = null;
			});

		}
		*/


		// 8. Set initial value for select from value="" attribute.
		// List of input types:
		// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#input_types
		if (hasValue) // This should happen after the children are added, e.g. for select <options>
			// TODO: Do we only need to do this for select boxes b/c we're waiting for their children?  Other input types are handled above in step 2.
			setInputValue(this.xel, this.el, this.attributes.value, this.scope);


		if (tagName === 'svg')
			Refract.inSvg = false;

		return 1; // 1 element created, not counting children.
	}


	/**
	 * @param xel {Refract}
	 * @param vParent {VElement|VExpression}
	 * @return {VElement} */
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
		for (let expr of this.attributeExpressions) // Expresions that create one or more attributes.
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
	 * If a solitary VExpression, return whatever object it evaluates to.
	 * Otherwise merge all pieces into a string and return that.
	 * value="${'one'}" becomes 'one'
	 * value="${['one', 'two']}" becomes ['one', 'two']
	 * value="${['one', 'two']}three" becomes ['onetwothree']
	 * @param ref {Refract}
	 * @param attrParts {(VExpression|string)[]}
	 * @param scope {object}
	 * @return {*|string} */
	static evalVAttribute(ref, attrParts, scope={}) {
		let result = attrParts.map(expr =>
			expr instanceof VExpression ? expr.exec.apply(ref, Object.values(scope)) : expr
		);

		// If it's a single value, return that.
		if (result.length === 1)
			return result[0];

		return result.flat().map(Utils.toString).join('');
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
		return result.map(Utils.toString).join('');
	}

	/**
	 * Convert html to an array of child elements.
	 * @param html {string|string[]} Tokens will be removed from the beginning of the array as they're processed.
	 * @param scopeVars {string[]}
	 * @param vParent {VElement|VExpression}
	 * @return {(VElement|VExpression|string)[]} */
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
	 * @return {(VElement|VExpression|string)[]}
	 *     Array with a .index property added, to keep track of what token we're on. */
	static fromTokens(tokens, scopeVars=[], vParent=null, limit=false, index=0) {
		if (!tokens.length)
			return [];

		let result = [];
		do {
			let token = tokens[index];

			// Text node
			if (token.type === 'text')
				result.push(new VText(token.text, vParent?.xel));

			// Expression child
			else if (token.type === 'expr')
				result.push(VExpression.fromTokens(token.tokens, scopeVars, vParent));

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
						vel.tagName = tagToken.text.slice(1);

					else if (tagToken.type === 'attribute') {
						attrName = tagToken.text;
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
									attrValues.push(exprToken.text);
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
					else if (tagToken.type === 'expr') {
						let expr = VExpression.fromTokens(tagToken.tokens, scopeVars, vParent);
						expr.attributes = []; // Marks it as being an attribute expression.
						vel.attributeExpressions.push(expr);
					}
				}

				let isSelfClosing = tagTokens[tagTokens.length-1].text == '/>' || vel.tagName.toLowerCase() in selfClosingTags;


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

	/**
	 * TODO: This should:
	 * Find every instance of value="${this.val"} and instert an adjacent attribute:  data-value-expr="this.val"
	 * value="${this.values[name]}" becomes data-value-expr="this.values['${name}']"
	 *
	 * These expressions are then read again later in VElement.apply()
	 *
	 * @param tokens {Token[]}
	 * @returns {Token[]}
	static markValueAttributes(tokens) {

		// let valueAttrs = fregex.matchAll(['value', '='], tokens);
		//
		//
		// for (let token of tokens) {
		// 	if (token.tokens)
		// 		this.markValueAttributes(token.tokens);
		// }


		return tokens;
	} */
}

// TODO: What svg elements are self-closing?
var selfClosingTags = {'area':1, 'base':1, 'br':1, 'col':1, 'embed':1, 'hr':1, 'img':1, 'input':1, 'link':1, 'meta':1, 'param':1, 'source':1,
	'track':1, 'wbr':1, 'command':1, 'keygen':1, 'menuitem':1}
Object.freeze(selfClosingTags);

// TODO: Pair this with Utils.watchInput() ?
function setInputValue(ref, el, value, scope) {

	// Don't update input elements if they triggered the event.
	if (Refract.currentEvent && el === Refract.currentEvent.target)
		return;


	let isText = el.tagName === 'TEXTAREA'
		|| (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false');

	if (isText || el.tagName === 'INPUT') {

		let val = VElement.evalVAttributeAsString(ref, value, scope);
		if (isText) {
			//if (el.innerHTML !== val) // Is this needed? Replacing a value can reset the cursor position.
				el.innerHTML = val;
		}
		else if (el.type === 'checkbox')
			el.checked = ['1', 'true'].includes((val+'').toLowerCase());
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
