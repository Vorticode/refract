import delve from "./delve.js";
import Utils, {assert} from "./utils.js";
import Parse from './Parse.js';
import Watch from "./Watch.js";
import VElement from './VElement.js';
import VText from "./VText.js";
import lex from "./lex.js";
import lexHtmljs from "./lex-htmljs.js";
import {Globals} from "./Refract.js";
import Scope, {ScopeItem} from "./Scope.js";
import Html from "./Html.js";



/**
 * A parsed ${} or #{} expression embedded in an html template ``  */
export default class VExpression {

	/**
	 * @type {string[][]} Array of watched paths, parsed from the expression.
	 * Local variables here are not evaluated to their absolute paths.  See also this.watches. */
	watchPaths_ = [];

	/**
	 * @type {string|null} Only used when the expression is inside an attribute.
	 * If it's an empty string, that means it's an attribute expression.  E.g. ${'checked'}*/
	attrName_ = null;

	/** @type {string[]|null} If an expression that creates attributes, keep track of them here. */
	attributes_ = null;

	/**
	 * @type {string} simple|complex|loop
	 * simple:  ${this.field[0].value} or ${this.fields} or ${this.field[this.index].value} .  An lvalue.
	 * complex: ${JSON.stringify(this.fields)} or ${foo(this.array)).map(x => `${x}`)}
	 * loop:    ${this.fields.map(item => ...)}
	 *
	 * If type==='simple', the first watch path is the variable printed.
	 * If type==='loop', the first watchPath is the loop array. */
	type = 'simple';

	/**
	 * Is this a #{...} expression?
	 * @type {boolean} */
	isHash = false;

	/**
	 * Function that executes the whole expression at once, or if type==='loop', evaluate the portion of the expression
	 * that gives the loop for the array.
	 * E.g. if we have, this.$items.map(x => x+1), this function returns the array pointed to by this.$items.
	 * @type {?function} */
	exec_ = null;

	/**
	 * Names of the parameters accepted by the function given to array.map().
	 * E.g. ['item', 'index', 'array'] for array.map((item, index, array) => {...});
	 * @type {string[]} */
	loopParamNames_ = [];

	/**
	 * TODO: Rename to loopTemplates?
	 * @type {(VElement|VText|VExpression)[]} Used only with type='loop'. The un-evaluated elements that make up one iteration of a loop.
	 * Together with loopParamNames, this can be used to create a function that returns each loop item.*/
	loopItemEls_ = [];




	// These are specific to the copy of each VExpression made for each Refract.

	/** @type {Refract} */
	refr_ = null;

	/** @type {HTMLElement} */
	parent_ = null;

	/** @type {VElement|VExpression} */
	vParent_ = null;

	/**
	 * Virtual children created after the loopItemEls are evaluated (but not recursively).
	 * Unlike VElement.vChildren, this is an array of arrays, with each sub-array
	 * having all the vChildren created with each loop iteration.
	 *
	 * @type {(VElement|VExpression|VText|HTMLElement)[][]} */
	vChildren_ = [];



	/**
	 * @deprecated for scope3
	 * @type {Object<string, *>} */
	scope_ = {};

	/**
	 * Stores a map from local variable names, to their value and their path from the root Refract object. */
	scope3_ = new Scope();

	/** @type {int} DOM index of the first DOM child created by this VExpression within parent. */
	startIndex_ = 0;

	/** @type {int} the number of DOM children created by this VExpression within parent. */
	childCount_ = 0;

	/**
	 * Arguments passed to Watch.add() for this expression.  We track them here so we can later remove them via Watch.remove().
	 * See also this.watchPaths.
	 * @type {[root:Refract|Object, path:string[], callback:function][]} */
	watches_ = [];

	//#IFDEV
	/** @type {string} For debugging only. */
	code = '';
	//#ENDIF

	// Evaluate and loopItem functions update both this.children and the real DOM elements.

	/**
	 * Take an array of javascript tokens and build a VExpression from them.
	 * @param tokens {?Token[]} May or may not include surrounding ${ ... } tokens.
	 * @param vParent {VElement|VExpression}
	 * @param scopeVars {?string[]} NAmes of variables created by parent loops.  This lets us build watchPaths only of variables
	 *     that trace back to a this.property in the parent Refract, instead of from any variable or js identifier.
	 *     Note this is different than the scope property which is copied from the vParent.
	 * @param attrName {?string} If set, this VExpression is part of an attribute, otherwise it creates html child nodes.
	 * @return {VExpression} */
	constructor(tokens=null, vParent=null, scopeVars=null, attrName=null) {
		this.vParent_ = vParent;
		if (vParent) {
			this.refr_ = vParent.refr_;
			//#IFDEV
			if (parent)
				assert(this.refr_);
			//#ENDIF


			this.scope_ = {...vParent.scope_};
			this.scope3_ = vParent.scope3_.clone_();
			//console.log(this.code, this.scope)
		}

		if (tokens) {
			// remove enclosing ${ }
			let isHash = tokens[0].text == '#{';
			if ((tokens[0].text == '${' || isHash) && tokens[tokens.length - 1].text == '}') {
				this.isHash = isHash;
				tokens = tokens.slice(1, -1); // Remove ${ and }
			}

			this.code = tokens.map(t => t.text).join('').trim(); // So we can quickly see what a VExpression is in the debugger.


			// Find the watchPathTokens before we call fromTokens() on child elements.
			// That way we don't descend too deep.
			scopeVars = (scopeVars || []).slice(); // copy
			let watchPathTokens = Parse.varExpressions_(tokens, scopeVars);

			// Find loopItem props if this is a loop.
			let [loopParamNames, loopBody] = Parse.simpleMapExpression_(tokens, scopeVars);

			// Get the createFunction() from the class if it's already been instantiated.  Else use Refract's temporary createfunction().
			// This lets us use other variabls defiend in the same scope as the class that extends Refract.
			if (loopBody) {
				this.type = 'loop';

				// When type==='loop', the .exec() function returns the array used by the loop.
				this.loopParamNames_ = loopParamNames;

				for (let p of loopParamNames)
					scopeVars.push(p);

				this.exec_ = this.refr_.constructor.createFunction(...scopeVars, 'return ' + watchPathTokens[0].join(''));

				// If the loop body is a single `template` string:
				// TODO Why is this special path necessary, instead of always just using the else path?
				let loopBodyTrimmed = loopBody.filter(token => token.type !== 'whitespace' && token.type !== 'ln');
				if (loopBodyTrimmed.length === 1 && loopBodyTrimmed[0].type === 'template') {
					// Remove beginning and end string delimiters, parse items.
					this.loopItemEls_ = VElement.fromTokens_(loopBodyTrimmed[0].tokens.slice(1, -1), scopeVars, vParent, this.refr_);
				}

				// The loop body is more complex javascript code:
				else {
					// TODO: No tests hit htis path.
					this.loopItemEls_ = [new VExpression(loopBody, this, scopeVars)];
				}
			} else {

				// TODO: This duplicates code executed in Parse.varExpressions_ above?
				if (Parse.createVarExpression_(scopeVars)(tokens) !== tokens.length) {
					// This will find things like this.values[this.index].name
					if (Parse.isLValue_(tokens) === tokens.length)
						this.type = 'simple';
					else
						this.type = 'complex';
				}

				// Build function to evaluate expression.
				// Later, scope object will be matched with param names to call this function.
				// We call replacehashExpr() b/c we're valuating a whole string of code all at once, and the nested #{} aren't
				// understood by the vanilla JavaScript that executes the template string.
				tokens = Parse.replaceHashExpr_(tokens, null, this.refr_.constructor.name);

				/**
				 * We want sub-templates within the expression to be parsed to find their own variables,
				 * so we escape them, so they're not evaluated as part of the outer template.
				 * Unless we do this, their own variables will be evaluated immediately, instead of parsed and watched. */
				// console.log(tokens.join(''));

				tokens = Parse.escape$_(tokens);
				//console.log(tokens.join(''));

				// Trim required.  B/c if there's a line return after return, the function will return undefined!
				let body = Html.decode(tokens.map(t => t.text).join(''));
				if (tokens[0].text !== '{')
					body = 'return (' + body.trim() + ')';
				this.exec_ = this.refr_.constructor.createFunction(...scopeVars, body);
			}

			// Get just the identifier names between the dots.
			// ['this', '.', 'fruits', '[', '0', ']'] becomes ['this', 'fruits', '0']
			for (let watchPath of watchPathTokens)
				this.watchPaths_.push(Parse.varExpressionToPath_(watchPath));
		}
	}

	/**
	 * Evaluate this expression and either add children to parent or set attributes on parent.
	 * @param parent {HTMLElement} If set, this is always eqeual to this.parent?
	 * @param el {HTMLElement} Unused.  Only here to match
	 * @return {int} Number of elements created. d*/
	apply_(parent=null, el=null) {
		this.parent_ = parent || this.parent_;

		// if (window.debug)
		// 	debugger;

		//#IFDEV

		// See if this ever happens?
		if (parent && parent !== this.parent_)
			debugger;


		if (this.attrName_)
			throw new Error("Cannot apply an VExpression that's for an attribute.  Use evalVAttribute() or .exec.apply() instead.");

		// Make sure we're not applying on an element that's been removed.
		if (!('virtualElement' in this.parent_) && !this.parent_.parentNode) {
			debugger;
			return 0;
		}
		//#ENDIF

		// VExpression creates one or more attributes.
		if (this.attributes_) {
			for (let attr of this.attributes_)
				parent.removeAttribute(attr);
			this.attributes_ = [];

			let text = this.evaluate_();
			if (text) {
				let tokens = lex(lexHtmljs, text, 'tag');
				let lastName = null;
				for (let token of tokens) {
					if (token.type === 'attribute') {
						if (lastName)
							parent.setAttribute(lastName, '');
						lastName = token;
						this.attributes_.push(lastName);
					} else if (token.type === 'string') {
						// tokens[1] is in between "..."
						// TODO: Later we should add code to evaluate any vexpressions within it?
						parent.setAttribute(lastName, token.tokens[1]);
						lastName = null;
					}
				}
				if (lastName)
					parent.setAttribute(lastName, '');
			}

			return 0;
		}

		// VExpression creates DOM nodes.
		else {

			// Remove old children.
			for (let group of this.vChildren_)
				if (group instanceof HTMLElement)
					group.parentNode.removeChild(group);
				else
					for (let vChild of group.slice()) // Slice because vChild.remove_() can alter group, throwing off the index.
						vChild.remove_();

			// Create new children.
			this.vChildren_ = this.evaluateToVElements_();

			// Add children to parent.
			let count = 0;
			let startIndex = this.startIndex_;
			for (let item of this.vChildren_) {
				if (item instanceof HTMLElement) {
					this.parent_.insertBefore(item, this.parent_.childNodes[startIndex])
					startIndex ++;
				}
				else
					for (let vChild of item) {
						vChild.startIndex_ = startIndex;
						let num = vChild.apply_(this.parent_, null);
						startIndex += num;
						count += num;
					}
			}

			return count;
		}
	}

	/**
	 * Typically called when a new element is instantiated, to clone a new instance of the virtual tree for that element.
	 * @param refr {Refract?}
	 * @param vParent {VElement?}
	 * @param parent {HTMLElement?}
	 * @return {VExpression} */
	clone_(refr=null, vParent=null, parent=null) {
		let result = new VExpression();
		result.watchPaths_ = this.watchPaths_;
		result.attrName_ = this.attrName_;
		result.attributes_ = this.attributes_;

		result.type = this.type;
		result.exec_ = this.exec_;
		result.loopParamNames_ = this.loopParamNames_;
		result.loopItemEls_ = this.loopItemEls_;


		// Properties specific to each instance.
		result.refr_ = refr || this.refr_;
		result.parent_ = parent || this.parent_;
		result.vParent_ = vParent || this.vParent_;

		result.startIndex_ = this.startIndex_;
		result.childCount_ = this.childCount_;

		result.scope_ = {...this.scope_};
		result.scope3_ = this.scope3_.clone_();

		result.isHash = this.isHash;

		result.code = this.code;

		return result;
	}

	/**
	 * @return {string|string[]} */
	evaluate_() {
		return this.exec_.apply(this.refr_, Object.values(this.scope_));
	}

	/**
	 * @pure
	 * Non-recursively resolve this and all child VExpressions, returning a tree of VElement and VText.
	 * Does not modify the actual DOM.
	 * @return {(VElement|VText|VExpression|HTMLElement)[][]} */
	evaluateToVElements_() {

		// Remove previous watches.
		// TODO: Only do this if the watches are changing.
		// this.watch() should return an array of watch params, so we can compare them.
		for (let watch of this.watches_)
			Watch.remove(...watch);
		this.watches_ = [];

		// Add new watches
		if (!this.receiveNotificationBindThis_)
			this.receiveNotificationBindThis_ = this.receiveNotification_.bind(this);
		this.watch_(this.receiveNotificationBindThis_);


		let result = [];
		if (this.type !== 'loop') {
			//#IFDEV
			if (!this.refr_)
				throw new Error();
			//#ENDIF

			let htmls = [this.evaluate_()]
				.flat().map(h=>h===undefined?'':h); // undefined becomes empty string

			if (this.isHash) // #{...} template
				result = [htmls.map(html => new VText(html, this.refr_))]; // We don't join all the text nodes b/c it creates index issues.
			else {
				let scopeVarNames = Object.keys(this.scope_);
				for (let html of htmls) {
					if (html instanceof HTMLElement) {
						result.push(html); // not a VElement[], but a full HTMLElement
					}
					else {
						html += ''; // can be a number.
						if (html.length) {
							let vels = VElement.fromHtml_(html, scopeVarNames, this, this.refr_).flat();
							result.push(vels);
						}
					}
				}
			}

		} else { // loop
			let array = this.evaluate_();
			if (!array)
				throw new Error(`${this.watchPaths_[0].join('.')} is not iterable in ${this.code}`);

			let i = 0;
			for (let item of array) {
				let group = [];
				let params = [array[i], i, array];

				for (let template of this.loopItemEls_) {
					let vel = template.clone_(this.refr_, this);
					this.setScope_(vel, params, i);
					group.push(vel);
				}

				result.push(group);
				i++;
			}
		}

		return result;
	}

	/**
	 * Populate the scope property of the virtual element that's a child of this VExpression.
	 * @param vel {VElement|VExpression}
	 * @param params {*[]} Values of the parameters given to this VExpression's map() function.
	 * @param index {int}
	 */
	setScope_(vel, params, index) {
		vel.scope_ = {...this.scope_}
		vel.scope3_ = this.scope3_.clone_();

		// Assign values to the parameters of the function given to .map() that's used to loop.
		// If this.type !== 'loop', then loopParamNames will be an empty array.
		for (let j in this.loopParamNames_) {  // Benchmarking shows this loop is about 2% faster than for...in.
			vel.scope_[this.loopParamNames_[j]] = params[j];

			// Path to the loop param variable:
			let path = [...this.watchPaths_[0], index + '']; // VExpression loops always have one watchPath.
			let fullPath = this.scope3_.getFullPath_(path);
			vel.scope3_.set(this.loopParamNames_[j], new ScopeItem(fullPath, [params[j]])); // scope3[name] = [path, value]
		}
	}

	/**
	 * Called when a watched value changes.
	 * TODO: Write addLoopItem and removeLoopItem functions?
	 * Just call apply() when updating existing loop items?
	 * @param action {string} Can be 'remove', 'insert', or 'set'.
	 * @param path {string[]}
	 * @param value {string} not used.
	 * @param oldVal {string} not used.
	 * @param root {object|array} The unproxied root object that the path originates form. */
	receiveNotification_(action, path, value, oldVal, root) {

		// VExpression.remove() sets vParent = null.
		// This check makes sure that this VExpression wasn't already removed by another operation triggered by the same watch.
		if (!this.vParent_)
			return;


		// Path 1:  If modifying a property on a single array item.
		// -2 because we're modifying not a loop item child, but a property of it.
		// Path 1:  If modifying a property on a single array item.
		if (this.type==='loop' && path.length > 2 && Utils.arrayStartsWith_(path.slice(0, -2), this.watchPaths_[0].slice(1))) {
			// Do nothing, because the watch should trigger on the child VExpression instead of this one.
			return;
		}

		// If we've had the initial render but autoRender is currently disabled
		if (!this.refr_.__autoRender && this.refr_.virtualElement) {
			this.refr_.__toRender.set(this, arguments);
			return;
		}

		Globals.currentVElement_ = this;
		this.childCount_ = this.getAllChildrenLength_();

		// Path 2:  If inserting, removing, or replacing a whole item within an array that matches certain criteria.
		if (this.type !== 'complex' && path[path.length - 1].match(/^\d+$/)) {
			let arrayPath = path.slice(0, -1);

			// We can delve watchlessly because we're not modifying the values.
			let array = delve(root, arrayPath);

			// If the array is one of our watched paths:
			// TODO: watchPaths besides 0?  Or only go this way if there's only one watchPath?
			if (Array.isArray(array) && Utils.arrayEq_(this.watchPaths_[0].slice(1), arrayPath)) {

				let index = parseInt(path[path.length - 1]);
				if (action === 'remove') { // TODO: Combine with remove step below used for set.
					for (let vChild of this.vChildren_[index])
						vChild.remove_();
					this.vChildren_.splice(index, 1);
				}

				else { // insert or set

					// 1. Remove old ones from the DOM
					if (action === 'set' && this.vChildren_[index])
						for (let vChild of this.vChildren_[index])
							vChild.remove_();

					// 2. Create new loop item elements.
					if (action === 'insert')
						this.vChildren_.splice(index, 0, []);

					if (this.type === 'simple') // A simple expression ${this.var} always just prints the value.
						this.vChildren_[index] = [new VText(array[index], this.refr_)] // TODO: What about html-escape?
					else { // loop
						this.vChildren_[index] = this.loopItemEls_.map(vel => vel.clone_(this.refr_, this));

					}

					// 3. Add/update those new elements in the real DOM.
					let i = 0;
					let startIndex = this.arrayToChildIndex_(index); // TODO: Could it be faster to get the index from an existing vchild here?
					let params = [array[index], index, array];
					for (let newItem of this.vChildren_[index]) {
						newItem.startIndex_ = startIndex + i;
						newItem.parent_ = this.parent_; // Everything works even when this is commented out.

						this.setScope_(newItem, params, i+index);
						newItem.apply_(this.parent_, null);
						i++;
					}
				}

				this.updateSubsequentIndices_();
				Globals.currentVElement_ = null;
				return;
			}
		}

		// Path 3:  Replace all items:
		this.apply_();
		this.updateSubsequentIndices_();

		Globals.currentVElement_ = null;


		// TODO: Should we have a path that generates the new children and compares them with the existing children and only change what's changed?
	}


	/**
	 * Remove this VExpression and its children from the virtual DOM. */
	remove_() {

		// 1 Remove watches
		for (let watch of this.watches_)
			Watch.remove(...watch);
		this.watches_ = [];

		// 2. Remove children, so that their watches are unsubscribed.
		for (let group of this.vChildren_)
			if (group instanceof HTMLElement)
				group.parentNode.removeChild(group);
			else
				for (let vChild of group) // TODO: Should group be .slice() like it is in apply() above?
					vChild.remove_();

		// This is necessary because notification callbacks may try to remove a vexpression more than once.
		// E.g. one will remove its parent vexpression and another will remove this one ourselves.
		// If we don't reset the vChildren array after the first remove, we'll try to remove elements more than once.
		// This is covered by the test: Refract.loop.ExprNested
		this.vChildren_ = [];

		// 3. Remove from parent.
		if (this.vParent_ instanceof VElement) {

			// TODO: Keep an index somewhere so this can be done in constant, not linear time.
			let index = this.vParent_.vChildren_.indexOf(this);
			//#IFDEV
			if (index < 0)
				throw new Error();
			//#ENDIF
			this.vParent_.vChildren_.splice(index, 1);

		}
		else // Parent is VEXpression
			for (let group of this.vParent_.vChildren_) {
				let index = group.indexOf(this);
				if (index >= 0) {
					group.splice(index, 1);
					break;
				}
			}

		// This is an easy way to test of a vexpression has been removed.
		this.vParent_ = null;
	}

	/**
	 * Recurse through vChildren to find all DOM children created by this VExpression.
	 * @return {(Node|HTMLElement)[]} */
	// getAllChildren() {
	// 	let result = [];
	// 	for (let group of this.vChildren) {
	// 		for (let vChild of group) {
	// 			if (vChild instanceof VExpression)
	// 				for (let vChild2 of vChild.getAllChildren())
	// 					result.push(vChild2.el);
	// 			else
	// 				result.push(vChild.el);
	// 		}
	// 	}
	// 	return result;
	// }

	/**
	 * @return {int} */
	getAllChildrenLength_() {
		let result = 0;
		for (let group of this.vChildren_) {
			if (group instanceof HTMLElement)
				result ++;
			else
				for (let vChild of group) {
					if (vChild.receiveNotification_) // Faster than (vChild instanceof VExpression)
						result += vChild.getAllChildrenLength_();
					else
						result++;
				}
		}

		return result;
	}

	/**
	 * Convert an index in this expression's loop array into the DOM child index.
	 * Since one loop item might create multiple children.
	 * @param index {int} */
	arrayToChildIndex_(index) {

		let result = this.startIndex_;

		// Get this VExpression's children before index.
		for (let group of this.vChildren_.slice(0, index)) {
			for (let vel of group) {
				if (vel instanceof VExpression)
					result += vel.getAllChildrenLength_();
				else
					result++;
			}
		}

		//#IFDEV
		if (result < 0)
			throw new Error();
		//#ENDIF

		return result;
	}

	/**
	 * Get the next VExpression that shares the same DOM element as a parent.
	 * @return {VExpression|null} */
	getNextVExpression_() {

		let vSiblings = this.vParent_.vChildren_.flat();

		// Check siblings for another VExpression.
		let index = vSiblings.indexOf(this);
		for (let vSibling of vSiblings.slice(index + 1))
			if (vSibling instanceof VExpression)
				return vSibling;

		// If not, go up a level, if that level has the same parent.
		if (this.vParent_.parent_ === this.parent_ && (this.vParent_ instanceof VExpression))
			return this.vParent_.getNextVExpression_();

		return null;
	}

	updateSubsequentIndices_() {
		let newLength = this.getAllChildrenLength_();
		let diff = newLength - this.childCount_;

		// Stop if going into a different parent
		let next = this;
		while (next = next.getNextVExpression_()) {
			next.startIndex_ += diff;
		}
	}

	/**
	 * All calls to Watch.add() (i.e. all watches) used by Refract come through this function.
	 * @param callback {function} */
	watch_(callback) {

		for (let path of this.watchPaths_) {
			let root = this.refr_;
			let scope;

			// slice() to remove the "this" element from the watch path.
			if (path[0] === 'this')
				path = path.slice(1);

			// Allow paths into the current scope to be watched.
			else if (path[0] in this.scope_ && path.length > 1) {

				// Resolve root to the path of the scope.
				root = this.scope_[path[0]];
				path = path.slice(1);
			}

			// If a path of length 1, subscribe to the parent array or object instead.
			// The 100k options benchmark is about 30% faster if I replace this brance with a continue statement.
			else if (scope = this.scope3_.get(path[0])) {

				// Only watch this path if it's an array or object, not a primitive.
				let obj = delve(root, scope.path.slice(1), delve.dontCreate, true);
				if (typeof obj !== 'object' && !Array.isArray(obj))
					continue;

				root = delve(this.refr_, scope.path.slice(1, -1), delve.dontCreate, true);
				path = scope.path.slice(-1);
			}



			// Make sure it's not a primitive b/c we can't subscribe to primitives.
			// In such cases we should already be subscribed to the parent object/array for changes.
			if (path.length && (typeof root === 'object' || Array.isArray(root))) {
				// An expression that's just ${this} won't have a length.  E.g. we might have <child-el parent="${this}"></child-el>

				this.watches_.push([root, path, callback]);  // Keep track of the subscription so we can remove it when this VExpr is removed.
				Watch.add(root, path, callback);

			}
		}
	}
}