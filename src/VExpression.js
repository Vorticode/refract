import delve from "./delve.js";
import Utils from "./utils.js";
import Parse from './Parse.js';
import Watch from "./Watch.js";
import VElement from './VElement.js';
import VText from "./VText.js";
import Html from "./Html.js";


/**
 * A parsed ${} or #{} expression embedded in an html template ``  */
export default class VExpression {

	/** @type {string[][]} Array of watched paths, parsed from the expression. */
	watchPaths = [];

	/** @type {string|null} Only used when the expression is inside an attribute. */
	attrName = null;


	/**
	 * @type {string} simple|complex|loop
	 * simple:  ${this.field[0].value} or ${this.fields} or ${this.field[this.index].value} .  An lvalue.
	 * complex: ${JSON.stringify(this.fields)} or ${foo(this.array)).map(x => `${x}`)}
	 * loop:    ${this.fields.map(item => ...)}
	 *
	 * If type==='simple', the first watch path is the variable printed.
	 * If type==='loop', the first watchPath is the loop array. */
	type = 'simple';

	isHash = false;

	/**
	 * Function that executes the whole expression at once, or if type==='loop', evaluate the portion of the expression
	 * that gives the loop for the array.
	 * E.g. if we have, this.$items.map(x => x+1), this function returns the array pointed to by this.$items.
	 * @type {?function} */
	exec = null;

	/**
	 * @deprecated for loopParamNames
	 * @type {?string} Used only with type='loop'.  The name of the argument passed to a function to generate a single child. */

	/** @type {string[]} */
	loopParamNames = [];

	/**
	 * TODO: Rename to loopTemplates?
	 * @type {(VElement|VText|VExpression)[]} Used only with type='loop'. The un-evaluated elements that make up one iteration of a loop.
	 * Together with loopParamNames, this can be used to create a function that returns each loop item.*/
	loopItemEls = [];




	// These are specific to the copy of each VExpression made for each Refract.

	/** @type {Refract} */
	xel = null;

	/** @type {HTMLElement} */
	parent = null;

	/** @type {VElement} */
	vParent = null;

	/**
	 * Virtual children created after the loopItemEls are evaluated (but not recursively).
	 * Unlike VElement.vChildren, this is an array of arrays, with each sub-array
	 * having all the vChildren created with each loop iteration.
	 *
	 * @type {(VElement|VExpression|VText)[][]} */
	vChildren = [];



	/** @type {Object<string, *>} */
	scope = {};

	/** @type {int} DOM index of the first DOM child created by this VExpression within parent. */
	startIndex = 0;

	/** @type {int} the number of DOM children created by this VExpression within parent. */
	childCount = 0;


	/**
	 *
	 * @type {[Refract, string[], function][]}
	 */
	watches = [];

	//#IFDEV
	/** @type {string} For debugging only. */
	code = '';
	//#ENDIF

	// Evaluate and loopItem functions update both this.children and the real DOM elements.


	constructor() {

		//#IFDEV
		//this.stack = (new Error()).stack.split(/\n\s+at /g).slice(1);
		//#ENDIF
	}

	/**
	 * Evaluate this expression and either add children to parent or set attributes on parent.
	 * @param parent {HTMLElement}
	 * @param el {HTMLElement} Unused.
	 * @return {int} Number of elements created. d*/
	apply(parent=null, el=null) {
		//#IFDEV
		if (this.attrName)
			throw new Error("Cannot apply an VExpression that's for an attribute.  Use evalVAttribute() or .exec.apply() instead.");
		//#ENDIF

		this.parent = parent || this.parent;

		//#IFDEV
		// Make sure we're not applying on an element that's been removed.
		if (!('virtualElement' in this.parent) && !this.parent.parentNode)
			return 0;
		//#ENDIF

		// Remove old children.
		for (let group of this.vChildren)
			for (let vChild of group.slice()) // Slice because vChild.remove() can alter group, throwing off the index.
				vChild.remove();

		// Create new children.
		this.vChildren = this.evaluateToVElements();

		// Add children to parent.
		let count = 0;
		let startIndex = this.startIndex;
		for (let group of this.vChildren) {
			for (let vChild of group) {
				vChild.startIndex = startIndex;
				let num = vChild.apply(this.parent, null);
				startIndex += num;
				count += num;
			}
		}

		return count;
	}

	/**
	 * Typically called when a new element is instantiated, to clone a new instance of the virtual tree for that element.
	 * @param xel {Refract?}
	 * @param vParent {VElement?}
	 * @param parent {HTMLElement?}
	 * @returns {VExpression} */
	clone(xel=null, vParent=null, parent=null) {
		let result = new VExpression();
		result.watchPaths = this.watchPaths;
		result.attrName = this.attrName;

		result.type = this.type;
		result.exec = this.exec;
		result.loopParamNames = this.loopParamNames;
		result.loopItemEls = this.loopItemEls;


		// Properties specific to each instance.
		result.xel = xel || this.xel;
		result.parent = parent || this.parent;
		result.vParent = vParent || this.vParent;

		result.startIndex = this.startIndex;
		result.childCount = this.childCount;
		result.scope = {...this.scope};

		result.isHash = this.isHash;

		//#IFDEV
		result.code = this.code;
		//#ENDIF

		return result;
	}

	/**
	 * @returns {string|string[]} */
	evaluate() {
		return this.exec.apply(this.xel, Object.values(this.scope));
	}

	/**
	 * @pure
	 * Non-recursively resolve this and all child VExpressions, returning a tree of VElement and VText.
	 * Does not modify the actual DOM.
	 * @return {(VElement|VText|VExpression)[][]} */
	evaluateToVElements() {

		// Remove previous watches.
		// TODO: Only do this if the watches are changing.
		// this.watch() should return an array of watch params, so we can compare them.
		for (let watch of this.watches)
			Watch.remove(...watch);
		this.watches = [];

		// Add new watches
		if (!this.receiveNotificationBindThis)
			this.receiveNotificationBindThis = this.receiveNotification_.bind(this);
		this.watch(this.receiveNotificationBindThis);


		let result = [];
		if (this.type!=='loop') { // simple or complex
			//#IFDEV
			if (!this.xel)
				throw new Error();
			//#ENDIF

			let htmls = [this.evaluate()]
				.flat().map(h=>h===undefined?'':h); // undefined becomes empty string

			if (this.isHash) // #{...} template
				result = [htmls.map(html => new VText(html))]; // TODO: Don't join all the text nodes.  It creates index issues.
			else
				for (let html of htmls) {
					html += ''; // can be a number.
					if (html.length) {
						let vels = VElement.fromHtml(html, Object.keys(this.scope), this).flat();
						result.push(vels);
					}
				}

		} else { // loop
			let array = this.evaluate();
			//#IFDEV
			if (!array)
				throw new Error(`${this.watchPaths[0].join('.')} is not iterable in ${this.code}`);
			//#ENDIF

			let i = 0;
			for (let item of array) {
				let group = [];
				for (let template of this.loopItemEls) {
					let vel = template.clone(this.xel, this);
					vel.scope = {...this.scope}

					let params = [array[i], i, array];
					for (let j in this.loopParamNames)
						vel.scope[this.loopParamNames[j]] = params[j];

					group.push(vel);
				}

				result.push(group);
				i++;
			}
		}

		return result;
	}

	/**
	 * Called when a watched value changes.
	 * @param action {string}
	 * @param path {string[]}
	 * @param value {string}
	 * @param oldVal {string} not used.
	 * @param root {object|array} The unproxied root object that the path originates form. */
	receiveNotification_(action, path, value, oldVal, root) {
		//window.requestAnimationFrame(() => {

		// if (window.debug) // This happens when a path on an element is watched, but the path doesn't exist?
		// debugger;

		// Path 1:  If modifying a property within an array.
		// TODO: watchPaths besides 0?
		//if (path[0] !== this.watchPaths[0][1]) // Faster short-circuit for the code below?
		//	return;

		if (this.type==='loop' && Utils.arrayStartsWith(path.slice(0, -2), this.watchPaths[0].slice(1))) {
			// Do nothing, because the watch should trigger on the child VExpression instead of this one.
			return;
		}


		this.childCount = this.getAllChildrenLength();

		//if (this.watchPaths.length > 1)
		//	debugger;

		// Path 2:  If inserting, removing, or replacing a whole item within an array that matches certain criteria.
		if (this.type !== 'complex' && path[path.length - 1].match(/^\d+$/)) {
			let arrayPath = path.slice(0, -1);

			// We can delve watchlessly because we're not modifying the values.
			let array = delve(root, arrayPath);

			// If the array is one of our watched paths:
			// TODO: watchPaths besides 0?  Or only go this way if there's only one watchPath?
			if (Array.isArray(array) && Utils.arrayEq(this.watchPaths[0].slice(1), arrayPath)) {

				let index = parseInt(path[path.length - 1]);
				if (action === 'remove') { // TODO: Combine with remove step below used for set.
					for (let vChild of this.vChildren[index])
						vChild.remove();
					this.vChildren.splice(index, 1);
				}

				else {// insert or set

					// 1. Remove old ones then insert new ones.
					if (action === 'set' && this.vChildren[index])
						for (let vChild of this.vChildren[index])
							vChild.remove();

					// 2. Create new loop item elements.
					if (action === 'insert')
						this.vChildren.splice(index, 0, []);

					if (this.type === 'simple')
						this.vChildren[index] = [new VText(array[index])] // TODO: Need to evaluate this expression instead of just using the value from the array.
					else  // loop
						this.vChildren[index] = this.loopItemEls.map(vel => vel.clone(this.xel, this));

					// 3. Add/update those new elements in the real DOM.
					let i = 0;
					let startIndex = this.arrayToChildIndex_(index); // TODO: Could it be faster to get the index from an existing vchild here?
					for (let newItem of this.vChildren[index]) {
						newItem.startIndex = startIndex + i;
						newItem.scope = {...this.scope};

						let params = [array[index], index, array];
						for (let j in this.loopParamNames)
							newItem.scope[this.loopParamNames[j]] = params[j];

						newItem.apply(this.parent, null);
						i++;
					}
				}

				this.updateSubsequentIndices_();
				return;
			}
		}

		// Path 3:  Replace all items:
		this.apply();
		this.updateSubsequentIndices_();

		// TODO: Should we have a path that generates the new children and compares them with the existing children and only change what's changed?
		//});
	}


	/**
	 * Remove this VExpression and its children from the virtual DOM. */
	remove() {

		// 1 Remove watches
		for (let watch of this.watches)
			Watch.remove(...watch);
		this.watches = []; // Probably not necessary.

		// 2. Remove children, so that their watches are unsubscribed.
		for (let group of this.vChildren)
			for (let vChild of group) // TODO: Should group be .slice() like it is in apply() above?
				vChild.remove();

		// 3. Remove from parent.
		if (this.vParent instanceof VElement) {

			// TODO: Keep an index somewhere so this can be done in constant, not linear time.
			let index = this.vParent.vChildren.indexOf(this);
			//#IFDEV
			if (index < 0)
				throw new Error();
			//#ENDIF
			this.vParent.vChildren.splice(index, 1);

		}
		else // Parent is VEXpression
			for (let group of this.vParent.vChildren) {
				let index = group.indexOf(this);
				if (index >= 0) {
					group.splice(index, 1);
					return;
				}
			}
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

	getAllChildrenLength() {
		let result = 0;
		for (let group of this.vChildren) {
			for (let vChild of group) {
				if (vChild.receiveNotification_) // Faster than vChild instanceof VExpression
					result += vChild.getAllChildrenLength();
				else
					result++;
			}
		}

		//window.count++;

		return result;
	}

	/**
	 * Convert an index in this expression's loop array into the DOM child index.
	 * Since one loop item might create multiple children.
	 * @param index {int} */
	arrayToChildIndex_(index) {

		let result = this.startIndex;

		// Get this VExpression's children before index.
		for (let group of this.vChildren.slice(0, index)) {
			for (let vel of group) {
				if (vel instanceof VExpression)
					result += vel.getAllChildrenLength();
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

		let vSiblings = this.vParent.vChildren.flat();

		// Check siblings for another VExpression.
		let index = vSiblings.indexOf(this);
		for (let vSibling of vSiblings.slice(index + 1))
			if (vSibling instanceof VExpression)
				return vSibling;

		// If not, go up a level, if that level has the same parent.
		if (this.vParent.parent === this.parent && (this.vParent instanceof VExpression))
			return this.vParent.getNextVExpression_();

		return null;
	}

	updateSubsequentIndices_() {
		let newLength = this.getAllChildrenLength();
		let diff = newLength - this.childCount;

		// Stop if going into a different parent
		let next = this;
		while (next = next.getNextVExpression_()) {
			next.startIndex += diff;
		}
	}

	/**
	 * All calls to Watch.add() (i.e. all watches) used by Refract come through this function.
	 * @param callback {function} */
	watch(callback) {

		for (let path of this.watchPaths) {
			let root = this.xel;

			// slice() to remove the "this" element from the watch path.
			if (path[0] === 'this')
				path = path.slice(1);

			// Allow paths into the current scope to be watched.
			else if (path[0] in this.scope) {

				// Resolve root to the path of the scope.
				root = this.scope[path[0]];
				path = path.slice(1);
			}

			// Make sure it's not a primitive b/c we can't subscribe to primitives.
			// In such cases we should already be subscribed to the parent object/array for changes.
			if (typeof root === 'object' || Array.isArray(root)) {
				this.watches.push([root, path, callback]);  // Keep track of the subscription so we can remove it when this VExpr is removed.
				Watch.add(root, path, callback);
			}
		}
	}

	/**
	 * Take an array of javascript tokens and build a VExpression from them.
	 * @param tokens {Token[]} May or may not include surrounding ${ ... } tokens.
	 * @param scope {string[]} Variables created by parent loops.  This lets us build watchPaths only of variables
	 *     that trace back to a this.property in the parent Refract, instead of from any variable or js identifier.
	 * @param vParent {VElement|VExpression}
	 * @param attrName {string?} If set, this VExpression is part of an attribute, otherwise it creates html child nodes.
	 * @returns {VExpression} */
	static fromTokens(tokens, scope, vParent, attrName) {
		let result = new VExpression();
		result.vParent = vParent;
		if (vParent) {
			result.xel = vParent.xel;
			result.scope = {...vParent.scope};
		}

		result.attrName = attrName;
		scope = (scope || []).slice(); // copy


		//#IFDEV
		result.code = tokens.slice(1, -1).join(''); // So we can quickly see what a VExpression is in the debugger.
		//#ENDIF

		// remove enclosing ${ }
		let isHash = tokens[0] == '#{';
		if ((tokens[0] == '${' || isHash) && tokens[tokens.length-1] == '}') {
			result.isHash = isHash;
			tokens = tokens.slice(1, -1); // Remove ${ and }
		}

		// Find the watchPathTokens before we call fromTokens() on child elements.
		// That way we don't descend too deep.
		let watchPathTokens = Parse.varExpressions_(tokens, scope);

		// Find loopItem props if this is a loop.
		let [loopParamNames, loopBody] = Parse.simpleMapExpression_(tokens, scope);

		// Get the createFunction() from the class if it's already been instantiated.  Else use Refract's temporary createfunction().
		// This lets us use other variabls defiend in the same scope as the class that extends Refract.
		let Class = ((vParent && vParent.xel && vParent.xel.constructor) || window.RefractCurrentClass);

		if (loopBody) {
			result.type = 'loop';

			// When type==='loop', the .exec() function returns the array used by the loop.
			result.loopParamNames = loopParamNames;

			for (let p of loopParamNames)
				scope.push(p);
			result.exec = Class.createFunction(...scope, 'return ' + watchPathTokens[0].join(''));

			// If the loop body is a single `template` string:
			// TODO Why is this special path necessary, instead of always just using the else path?
			let loopBodyTrimmed = loopBody.filter(token => token.type !== 'whitespace' && token.type !== 'ln');
			if (loopBodyTrimmed.length === 1 && loopBodyTrimmed[0].type === 'template') {
				// Remove beginning and end string delimiters, parse items.
				result.loopItemEls = VElement.fromTokens(loopBodyTrimmed[0].tokens.slice(1, -1), scope, vParent);
			}

			// The loop body is more complex javascript code:
			else
				result.loopItemEls = [VExpression.fromTokens(loopBody, scope, vParent)];
		}

		else {

			// TODO: This duplicates code executed in Parse.varExpressions_ above?
			if (Parse.createVarExpression_(scope)(tokens) !== tokens.length) {
				// This will find things like this.values[this.index].name
				if (Parse.isLValue(tokens) === tokens.length)
					result.type = 'simple';
				else
					result.type = 'complex';
			}

			// Build function to evaluate expression.
			// Later, scope object will be matched with param names to call this function.
			// We call replacehashExpr() b/c we're valuating a whole string of code all at once, and the nested #{} aren't
			// understood by the vanilla JavaScript that executes the template string.
			tokens = Parse.replaceHashExpr(tokens, null, Class.name);

			/**
			 * We want sub-templates within the expression to be parsed to find their own variables,
			 * so we escape them, so they're not evaluated as part of the outer template.
			 * Unless we do this, their own variables will be evaluated immediately, instead of parsed and watched. */
			// console.log(tokens.join(''));
			tokens = Parse.escape$(tokens);
			//console.log(tokens.join(''));

			// Trim required.  B/c if there's a line return after return, the function will return undefined!
			let body = tokens.join('');
			if (tokens[0] != '{')
				body = 'return (' + body.trim() + ')';
			result.exec = Class.createFunction(...scope, body);
		}

		// Get just the identifier names between the dots.
		// ['this', '.', 'fruits', '[', '0', ']'] becomes ['this', 'fruits', '0']
		for (let watchPath of watchPathTokens)
			result.watchPaths.push(Parse.varExpressionToPath_(watchPath));

		//console.log(result.watchPathTokens);


		return result;
	}
}