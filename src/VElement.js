import VExpression from './VExpression.js';
import VText from './VText.js';
import Refract, {Globals} from './Refract.js';
import lex from "./lex.js";
import htmljs from "./lex-htmljs.js";
htmljs.allowHashTemplates = true;
import Html, {div} from "./Html.js";
import Utils, {assert} from "./utils.js";
import delve from "./delve.js";
import Scope from "./Scope.js";

/**
 * A virtual representation of an Element.
 * Supports expressions (VExpression) as attributes and children that can be evaluated later. */
export default class VElement {
	tagName = '';

	/** @type {Object<string, (string|VExpression)[]>} */
	attributes_ = {};

	/** @type {VExpression[]} Expressions that create whole attribute name/value pairs. */
	attributeExpressions_ = [];


	/** @type {Refract} */
	refr_ = null;

	/** @type {HTMLElement|HTMLInputElement} */
	el = null;


	/** @type {VElement} */
	vParent_ = null;

	/** @type {(VElement|VExpression|VText)[]} */
	vChildren_ = [];

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

	/**
	 * @deprecated for scope3
	 * @type {Object<string, string>} */
	scope_ = {};

	/**
	 * Stores a map from local variable names, to their value and their path from the root Refract object. */
	scope3_ = new Scope();

	/** @type {int} DOM index of the first DOM child created by this VExpression within parent. */
	startIndex_ = 0;

	/**
	 * @param tokens {?Token[]}
	 * @param parent {VElement|VExpression|Refract}
	 * @param scopeVars {string[]}*/
	constructor(tokens=null, parent=null, scopeVars=null) {

		if (parent instanceof HTMLElement)
			this.refr_ = parent
		else if (parent) {
			this.vParent_ = parent;
			this.refr_ = parent.refr_;
			this.scope_ = {...parent.scope_};
			this.scope3_ = parent.scope3_.clone_();
		}

		//#IFDEV
		if (parent)
			assert(this.refr_);
		//#ENDIF

		if (tokens) {
			let attrName='';
			let tagTokens = tokens.filter(token => token.type !== 'whitespace') // Tokens excluding whitespace.

			for (let j=0, token; (token = tagTokens[j]); j++) {
				if (j === 0)
					this.tagName = token.text.slice(1);

				else if (token.type === 'attribute') {
					attrName = token.text;
					this.attributes_[attrName] = []; // Attribute w/o value, or without value yet.
				}

				// Attribute value string or expression
				else if (attrName && tagTokens[j-1] == '=') {
					let attrValues = [];

					// Tokens within attribute value string.
					if (token.type === 'string')
						for (let exprToken of token.tokens.slice(1, -1)) { // slice to remove surrounding quotes.
							if (exprToken.type === 'expr')
								attrValues.push(new VExpression(exprToken.tokens, this, scopeVars, attrName));
							else // string:
								attrValues.push(exprToken.text);
						}
					else if (token.type === 'expr') // expr not in string.
						attrValues.push(new VExpression(token.tokens, this, scopeVars, attrName));
					//#IFDEV
					else
						throw new Error(); // Shouldn't happen.
					//#ENDIF

					this.attributes_[attrName] = attrValues;
					attrName = undefined;
				}

				// Expression that creates attribute(s)
				else if (token.type === 'expr') {
					let expr = new VExpression(token.tokens, this, scopeVars);
					expr.attributes_ = []; // Marks it as being an attribute expression.
					this.attributeExpressions_.push(expr);
				}
				else if (token.text === '>' || token.text === '/>')
					break;
			}

		}

		//this.scope3 = scope;
	}



	/**
	 * Add or update the HTMLElement linked to this VElement.
	 * apply() always replaces all children.  If this is to aggressive, apply() should be called
	 * on only the child elements that should be updated.
	 *
	 * @param parent {HTMLElement}
	 * @param el {HTMLElement} */
	apply_(parent=null, el=null) {
		let tagName = this.tagName;

		if (tagName === 'svg')
			inSvg = true;
		var oldEl = this.el;


		// 1A. Binding to existing element.
		if (el) {
			this.el = el;

			// This will cause trouble when we call cloneNode() on an element with a slot.
			// Because then the slot will be added to the slot, recursively forever.
			// So we only allow setting content that doesn't have slot tags.
			if (!el.querySelector('slot'))
				this.refr_.slotHtml = el.innerHTML; // At this point none of the children will be upgraded to web components?
			el.innerHTML = '';
		}
		// 1B. Create Element
		else {
			var newEl;
			Globals.currentVElement_ = this;

			// Special path, because we can't use document.createElement() to create an element whose constructor
			//     adds attributes and child nodes.
			// https://stackoverflow.com/questions/43836886
			if (tagName.includes('-') && customElements.get(tagName)) {
				let Class = customElements.get(tagName);

				let args = []
				if (Class.prototype.init) {// new path with init()
					args = Refract.compiler.populateArgsFromAttribs(this, Class.getInitArgs_());
				}
				//#IFDEV
				else if (Class.constructorArgs) // old path that uses constructor()
					args = Class.constructorArgs.map(name => this.getAttrib_(name));
				//#ENDIF


				// Firefox:  "Cannot instantiate a custom element inside its own constructor during upgrades"
				// Chrome:  "TypeError: Failed to construct 'HTMLElement': This instance is already constructed"
				// Browsers won't let us nest web components inside slots when they're created all from the same html.
				// So we use this crazy hack to define a new version of the element.
				// See the Refract.nested.recursive test.
				let i = 2;
				let tagName2 = tagName;
				while (tagName2.toUpperCase() in Globals.constructing_) {
					tagName2 = tagName + '_' + i
					var Class2 = customElements.get(tagName2);
					if (Class2) {
						Class = Class2;
						break;
					}

					else {
						Class = class extends Class {};
						customElements.define(tagName2, Class);
						i++;
					}
				}

				// If this code fails in the future due to an element not finished constructing/upgrading,
				// then modify the Refract constructor injecting code to make sure that
				// delete Refract.constructing[this.tagName]]
				// goes at the very end of the constructor.

				newEl = new Class(...args);
			}
			else if (inSvg) // SVG's won't render w/o this path.
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
					if (p2 !== this.refr_ && p2.tagName && p2.tagName.includes('-') && newEl.tagName !== 'SLOT')
						p2 = p2.querySelector('slot') || p2;
					p2.insertBefore(newEl, p2.childNodes[this.startIndex_]);
				}
			}


			//Refract.virtualElements.set(newEl, this);
			this.el = newEl;


			Globals.currentVElement_ = null;

			if (Refract.elsCreated)
				Refract.elsCreated.push('<'+tagName + '>');
		}


		// 2. Shadow DOM
		if (!this.el.shadowRoot && 'shadow' in this.attributes_)
			this.el.attachShadow({mode: this.el.getAttribute('shadow') || 'open'});

		// 3. Slot content
		let count = 0;
		if (tagName === 'slot') {
			let slotChildren = VElement.fromHtml_(this.refr_.slotHtml, Object.keys(this.scope_), this, this.refr_);
			for (let vChild of slotChildren) {
				vChild.scope_ = {...this.scope_}
				vChild.scope3_ = this.scope3_.clone_();
				vChild.startIndex_ = count;
				count += vChild.apply_(this.el);
			}
		}

		// 4. Recurse through children
		let isText = this.el.tagName === 'TEXTAREA' || this.attributes_['contenteditable'] && (this.attributes_['contenteditable']+'') !== 'false';
		for (let vChild of this.vChildren_) {
			if (isText && (vChild instanceof VExpression))
				throw new Error("textarea and contenteditable can't have templates as children. Use value=${this.variable} instead.");

			vChild.scope_ = {...this.scope_} // copy
			vChild.scope3_ = this.scope3_.clone_();
			vChild.refr_ = this.refr_;
			vChild.startIndex_ = count;
			count += vChild.apply_(this.el);
		}

		// 5. Attributes (besides shadow)
		for (let name in this.attributes_) {
			let value = this.attributes_[name];
			for (let attrPart of value)
				if (attrPart instanceof VExpression) {
					let expr = attrPart;
					expr.parent_ = this.el;
					expr.scope_ = this.scope_; // Share scope with attributes.
					expr.scope3_ = this.scope3_.clone_();
					expr.watch_(() => {
						if (name === 'value')
							setInputValue_(this.refr_, this.el, value, this.scope_);

						else {
							let value2 = VElement.evalVAttributeAsString_(this.refr_, value, this.scope_);
							this.el.setAttribute(name, value2);
						}
					});
				}

			// TODO: This happens again for inputs in step 5 below:
			let value2 = VElement.evalVAttributeAsString_(this.refr_, value, this.scope_);
			this.el.setAttribute(name, value2);


			// Id
			if (name === 'id' || name === 'data-id') {
				let path = this.el.getAttribute(name).split('.');
				delve(this.refr_, path, this.el);
			}

			// Events
			else if (name.startsWith('on') && (name in div)) {

				// Get the createFunction() from the class if it's already been instantiated.  Else use Refract's temporary createfunction().
				// This lets us use other variabls defiend in the same scope as the class that extends Refract.
				let createFunction = ((this.refr_ && this.refr_.constructor) || window.RefractCurrentClass).createFunction;

				let code = this.el.getAttribute(name);
				this.el.removeAttribute(name); // Prevent original attribute being executed, without `this` and `el` in scope.
				this.el[name] = event => { // e.g. el.onclick = ...
					let args = ['event', 'el', ...Object.keys(this.scope_)];
					let func = createFunction(...args, code).bind(this.refr_); // Create in same scope as parent class.
					func(event, this.el, ...Object.values(this.scope_));
				}
			}
		}

		// Attribute expressions
		for (let expr of this.attributeExpressions_) {
			expr.scope_ = this.scope_;
			expr.scope3_ = this.scope3_.clone_();
			expr.apply_(this.el)
			expr.watch_(() => {
				expr.apply_(this.el);
			});
		}


		// 6. Form field two-way binding.
		// Listening for user to type in form field.
		let hasValue = (('value' in this.attributes_)&& tagName !== 'option');
		if (hasValue) {
			let valueExprs = this.attributes_.value;
			let isSimpleExpr = valueExprs.length === 1 && (valueExprs[0] instanceof VExpression) && valueExprs[0].type === 'simple';

			// Don't grab value from input if we can't reverse the expression.
			if (isSimpleExpr) {
				let createFunction = ((this.refr_ && this.refr_.constructor) || window.RefractCurrentClass).createFunction;
				let assignFunc = createFunction(...Object.keys(this.scope_), 'val', valueExprs[0].code + '=val;').bind(this.refr_);

				// Update the value when the input changes:
				Utils.watchInput_(this.el, (val, e) => {
					Globals.currentEvent_ = e;
					assignFunc(...Object.values(this.scope_), val);
					Globals.currentEvent_ = null;
				});
			}
		}

		/*
		// New as of Feb 2022.
		// If I can make a preprocessor add data-value-expr to any input fields within complex (or all) expressions,
		// then I can know I should bind to them.  Even if the origional ${} expression has already been evaluated.
		if ('data-value-expr' in this.attributes) {

			let expr = this.attributes['data-value-expr'][0];
			let createFunction = ((this.refr && this.refr.constructor) || window.RefractCurrentClass).createFunction;
			let assignFunc = createFunction(...Object.keys(this.scope), 'val', expr + '=val;').bind(this.refr);

			Utils.watchInput(this.el, (val, e) => {
				Globals.currentEvent_ = e;
				assignFunc(...Object.values(this.scope), val);
				Globals.currentEvent_ = null;
			});

		}
		*/


		// 8. Set initial value for select from value="" attribute.
		// List of input types:
		// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#input_types
		if (hasValue) // This should happen after the children are added, e.g. for select <options>
			// TODO: Do we only need to do this for select boxes b/c we're waiting for their children?  Other input types are handled above in step 2.
			setInputValue_(this.refr_, this.el, this.attributes_.value, this.scope_);


		if (tagName === 'svg')
			inSvg = false;

		return 1; // 1 element created, not counting children.
	}


	/**
	 * @param refr {Refract}
	 * @param vParent {null|VElement|VExpression}
	 * @return {VElement} */
	clone_(refr, vParent=null) {
		let result = new VElement();
		result.tagName = this.tagName;
		result.refr_ = refr || this.refr_;
		result.vParent_ = vParent;

		for (let attrName in this.attributes_) {
			result.attributes_[attrName] = [];
			for (let piece of this.attributes_[attrName]) {
				if (piece instanceof VExpression)
					result.attributes_[attrName].push(piece.clone_(result.refr_, this))
				else
					result.attributes_[attrName].push(piece);
			}
		}
		for (let expr of this.attributeExpressions_) // Expresions that create one or more attributes.
			result.attributeExpressions_.push(expr.clone_(result.refr_, this));

		for (let child of this.vChildren_)
			result.vChildren_.push(child.clone_(result.refr_, result)); // string for text node.

		return result;
	}


	/**
	 * Get the value of an attribute to use as a constructor argument.
	 * TODO: Reduce shared logic between this and evalVAttribute()
	 * @param name {string}
	 * @return {*} */
	getAttrib_(name) {
		let lname = name.toLowerCase();
		let val = name in this.attributes_ ? this.attributes_[name] : this.attributes_[lname];
		if (val === undefined || val === null)
			return val;

		// A solitary VExpression.
		if (val && val.length === 1 && val[0] instanceof VExpression)
			return val[0].exec_.apply(this.refr_, Object.values(this.scope_));

		// Attribute with no value.
		if (Array.isArray(val) && !val.length)
			return true;

		// Else evaluate as JSON, or as a string.
		let result = VElement.evalVAttributeAsString_(this.refr_, (val || []), this.scope_);
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

	remove_() {

		// 1. Remove children, so that their watches are unsubscribed.
		for (let vChild of this.vChildren_)
			vChild.remove_();

		// 2. Remove the associated element.  We call parentNode.removeChild in case remove() is overridden.
		this.el.parentNode.removeChild(this.el);

		// 3. Mark it as removed so we don't accidently use it again.
		this.vParent_ = null;
	}

	//#IFDEV
	toString() {
		let attributes = [];
		for (let name in this.attributes_)
			attributes.push(` ${name}="${this.attributes_[name]}"`);

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
	 * @param refr {Refract}
	 * @param attrParts {(VExpression|string)[]}
	 * @param scope {object}
	 * @return {*|string} */
	static evalVAttribute_(refr, attrParts, scope={}) {
		let result = attrParts.map(expr =>
			expr instanceof VExpression ? expr.exec_.apply(refr, Object.values(scope)) : expr
		);

		// If it's a single value, return that.
		if (result.length === 1)
			return result[0];

		return result.flat().map(Utils.toString).join('');
	}

	/**
	 * @param refr {Refract}
	 * @param attrParts {(VExpression|string)[]}
	 * @param scope {object}
	 * @return {string} */
	static evalVAttributeAsString_(refr, attrParts, scope={}) {
		let result = [];
		for (let attrPart of attrParts) {
			if (attrPart instanceof VExpression) {
				let val = attrPart.exec_.apply(refr, Object.values(scope));
				if (Array.isArray(val) || (val instanceof Set))
					val = Array.from(val).join(' '); // Useful for classes.
				else if (val && typeof val === 'object') { // style attribute
					if (val.constructor === Object) // If a simple object.
						val = Object.entries(val).map(([name, value]) => `${name}: ${val[name]}; `).join('');
					else
						val = ''; // val.constructor.name + '()';
				}
				result.push(val)
			}
			else
				result.push(Html.decode(attrPart)); // decode because this will be passed to setAttribute()
		}
		return result.map(Utils.toString).join('');
	}

	/**
	 * Convert html to an array of child elements.
	 * @param html {string|string[]} Tokens will be removed from the beginning of the array as they're processed.
	 * @param scopeVars {string[]}
	 * @param vParent {VElement|VExpression}
	 * @param Class
	 * @return {(VElement|VExpression|string)[]} */
	static fromHtml_(html, scopeVars=[], vParent=null, Class) {
		let tokens = lex(htmljs, [html].flat().join(''), 'template');
		return VElement.fromTokens_(tokens, scopeVars, vParent, Class);
	}

	/**
	 * Convert tokens to an array of child elements.
	 * @param tokens {Token[]}
	 * @param scopeVars {string[]}
	 * @param vParent {VElement|VExpression?}
	 * @param refr {Refract}
	 * @param limit {int|boolean=} Find no more than this many nodes in the result.
	 * @param index {int=} used internally.
	 * @return {(VElement|VExpression|string)[]}
	 *     Array with a .index property added, to keep track of what token we're on. */
	static fromTokens_(tokens, scopeVars=[], vParent=null, refr, limit=false, index=0) {
		if (!tokens.length)
			return [];

		let result = [];
		do {
			let token = tokens[index];

			// Text node
			if (token.type === 'text')
				result.push(new VText(token.text, vParent?.refr_));

			// Expression child
			else if (token.type === 'expr')
				result.push(new VExpression(token.tokens, vParent, scopeVars));

			// Collect tagName and attributes from open tag.
			else if (token.type === 'openTag') {
				let vel = new VElement(token.tokens, vParent||refr, scopeVars);

				result.push(vel);

				let isSelfClosing = token.tokens[token.tokens.length-1].text == '/>' || vel.tagName.toLowerCase() in selfClosingTags_;

				// Process children if not a self-closing tag.
				if (!isSelfClosing) {
					index++

					// New path:
					vel.vChildren_ = VElement.fromTokens_(tokens, scopeVars, vel, refr, false, index);
					index = vel.vChildren_.index; // What is this?
				}
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
	 * @return {Token[]}
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
var selfClosingTags_ = {'area':1, 'base':1, 'br':1, 'col':1, 'embed':1, 'hr':1, 'img':1, 'input':1, 'link':1, 'meta':1, 'param':1, 'source':1,
	'track':1, 'wbr':1, 'command':1, 'keygen':1, 'menuitem':1}


/**
 * Used by VElement.apply() to keep track of whether we're within an svg tag.
 * @type {boolean} */
var inSvg = false;



// TODO: Pair this with Utils.watchInput() ?
function setInputValue_(ref, el, value, scope) {

	// Don't update input elements if they triggered the event.
	if (Globals.currentEvent_ && el === Globals.currentEvent_.target)
		return;


	let isText = el.tagName === 'TEXTAREA'
		|| (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false');

	if (isText || el.tagName === 'INPUT') {

		let val = VElement.evalVAttributeAsString_(ref, value, scope);
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
		let values = VElement.evalVAttribute_(ref, value, scope);
		if (el.tagName === 'SELECT')
			for (let opt of el.children)
				opt.selected = Array.isArray(values) ? values.includes(opt.value) : values === opt.value;
		else // Some custom elements can accept object or array for the value property:
			el.value = values;
	}
}
