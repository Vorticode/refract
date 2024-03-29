import htmljs from '../parselib/lex-htmljs.js';
import Parse from './Parse.js';
import VElement from './VElement.js';
import Html from "../util/Html.js";
import {ParsedFunction} from "./ParsedFunction.js";
import {Compiler} from "./Compiler.js";

htmljs.allowHashTemplates = true;

var Globals = {
	currentEvent_: null,
	currentVElement_: null,


	/**
	 * Keep track of which Refract elements are currently being constructed.  Indexed by tagname.
	 * This prevents us from creating another instance of an element when it's in the middle of being upgraded,
	 * which browsers don't like.
	 * @type {Object<string, boolean>} */
	constructing_: {},
}
export {Globals};


/**
 * @property createFunction {function} Created temporarily during compilation.
 * @property styleId {int} */
export default class Refract extends HTMLElement {

	static compiler = Compiler;

	/** @type {string} */
	static tagName;


	static htmlTokens = null;

	/**
	 * A parsed representation of this class's html.
	 * @type VElement */
	static virtualElement;

	/**
	 * @deprecated
	 * @type {string[]} Names of the constructor's arguments. */
	static constructorArgs = null;

	/**
	 * @type {?string[]} Cached names of the arguments to the init function. */
	static initArgs = null;

	/**
	 * Change this from false to an empty array [] to keep a list of every element created by ever class that inherits
	 * from Refract.  Useful for debugging / seeing how many elements were recreated for a given operation.
	 * @type {boolean|(Node|HTMLElement)[]} */
	static elsCreated = false;

	/**
	 * TODO: Every event attribute should call this function.
	 * This will fix some of the event unit tests where events are added from ${} in odd ways.
	 * @param event {Event}
	 * @param el {HTMLElement} I probably don't need this, since i can get it from event.currentTarget */
	// static refractEvent(event, el) {}


	/** @type {string} */
	slotHtml = '';

	/** If true, call render() before the constructor, and every time after a property is changed */
	__autoRender = true;

	/**
	 * Value can be 'apply' or 'remove'
	 * @type {Map<VElement|VExpression|VText, string>} */
	__toRender= new Map();

	/**
	 * A copy of the static VElement from the Class, with specific VExpressions that match the watched properties of this instance.
	 * Will be set once render() has been called at least once to create the DOM
	 * @type {VElement} */
	virtualElement = null;


	__connected = false;
	__connectedBefore = false;
	__connectedCallbacks = [];
	__firstConnectedCallbacks = [];
	__disconnectedCallbacks = [];


	constructor(autoRender=true) {

		// This line will give the error, "Illegal Constructor" if customElements.define() hasn't been called for this class.
		super();

		// old path from before we used init()
		if (autoRender === false)
			this.__autoRender = false;

		// Used in old path from before we used init()?
		this.constructorArgs2_ = arguments;
	}

	/**
	 * Bring this element's DOM nodes up to date.
	 * 1.  If calling render() for the first time on any instance, parse the html to the virtual DOM.
	 * 2.  If calling render() for the first time on this instance, Render the virtual DOM to the real DOM.
	 * 3.  Apply any updates to the real DOM. ? */
	render() {

		this.__autoRender = true;


		// If not already created by a super-class.  Is ` this.constructor.name===name` still needed?
		//if (!this.virtualElement && (!name || this.constructor.name===name)) {

		// Initial render
		if (!this.virtualElement) {

			// Parse the html tokens to Virtual DOM
			if (!this.constructor.virtualElement) {
				if (this.html && typeof this.html === 'function') { // new path
					this.constructor.htmlTokens = Parse.htmlFunctionReturn_(this.html.toString());
					if (!this.constructor.htmlTokens)
						throw new Error(`Class is missing an html function with a template value.`);
				}

				this.constructor.virtualElement = VElement.fromTokens_(this.constructor.htmlTokens, [], null, this, 1)[0];
				this.constructor.htmlTokens = null; // We don't need them any more.
			}

			Globals.constructing_[this.tagName] = true;

			this.virtualElement = this.constructor.virtualElement.clone_(this);
			this.virtualElement.apply_(null, this);

			delete Globals.constructing_[this.tagName];
		}

		// Render items from the queue.
		if (this.__toRender.size) {

			// Remove children of parents in this set.
			for (let vexpr of this.__toRender.keys()) {

				// If a parent vexpr is being re-applied, no need to re-apply this one too.
				let vparent = vexpr;
				while (vparent = vparent.vParent_)
					if (this.__toRender.has(vparent)) {
						this.__toRender.delete(vexpr)
						break;
					}
			}

			for (let [vexpr, args] of this.__toRender.entries())
				vexpr.receiveNotification_(...args);

			this.__toRender = new Map();
		}
	}


	/**
	 * Get the evaluated version of an attribute.
	 * See also VElement.getAttrib_()
	 * @param name {string}
	 * @param alt {*} Defaults to undefined because that's what we get if the argument isn't specified by the caller.
	 * @return {*} */
	getAttrib_(name, alt=undefined) {
		let velement = Refract.currentVElement_;
		if (velement) {
			return velement.getAttrib(name);
		}
		else {
			let hval = this.getAttribute(name);
			if (hval === null) // attribute doesn't exist.
				return alt;

			let val = Html.decode(hval);

			// As JSON or an expression.
			return Compiler.evalStringAttrib(val);
		}
	}

	static getInitArgs_() {

		// Parse init function on first time.
		if (!this.initArgs && this.prototype.init) {
			let pf = new ParsedFunction(this.prototype.init, false);
			this.initArgs = [...pf.getArgNames()];
		}

		return this.initArgs ? structuredClone(this.initArgs) : [];
	}

	//#IFDEV
	/**
	 * @deprecated for onConnect()
	 * Call a function when a node is added to the DOM.
	 * @param node {HTMLElement|Node}
	 * @param callback {function()} */
	static onMount(node, callback) {
		let observer = new MutationObserver(mutations => {
			if (mutations[0].addedNodes[0] === node || document.body.contains(node)) {
				//observer.disconnect();
				callback();
			}
		});
		observer.observe(document.body, {childList: true, subtree: true});
	}

	/**
	 * @deprecated for onFirstConnect()
	 * Call a function when a node is first added to the DOM.
	 * Or call it immediately if it's already mounted.
	 * @param node {HTMLElement|Node}
	 * @param callback {function()}
	 * @param doc */
	static onFirstMount(node, callback, doc=document) {

		function contains2(parent, node) { // same as Node.contains() but also traverses shadow dom.
			while (node = node.parentNode || node.host)
				if (node === parent)
					return true;
			return false;
		}

		if (contains2(doc, node))
			callback();
		else {
			let observer = new MutationObserver(mutations => {
				if (mutations[0].addedNodes[0] === node || contains2(doc, node)) {
					observer.disconnect();
					callback();
				}
			});
			observer.observe(doc, {childList: true, subtree: true});
		}
	}
	//#ENDIF


	onConnect(callback) {
		if (this.__connected)
			callback();
		this.__connectedCallbacks.push(callback);
	}

	onFirstConnect(callback) {
		if (this.__connected)
			callback();
		else
			this.__firstConnectedCallbacks.push(callback);
	}

	onDisconnect(callback) {
		if (!this.__connected && this.__connectedBefore)
			callback();
		this.__disconnectedCallbacks.push(callback);
	}

	/**
	 * This function is called automatically by the browser.
	 * If you override it, onConnect() and onFirstConnect() won't work. */
	connectedCallback() {
		this.__connected = this.__connectedBefore = true;
		for (let cb of this.__connectedCallbacks)
			cb();
		for (let cb of this.__firstConnectedCallbacks)
			cb();
		this.__firstConnectedCallbacks = [];
	}

	/**
	 * This function is called automatically by the browser.
	 * If you override it, onDisConnect() won't work. */
	disconnectedCallback() {
		this.__connected = false;
		for (let cb of this.__disconnectedCallbacks)
			cb();
	}

	/**
	 * Create string code that creates a new class with with a modified constructor and the html property removed.
	 * 1.  We inject code to give the constructor's arguments values from attributes, if they're not specified.
	 * 2.  We inject a call to this.create() after the constructor's super() call, so
	 *     we can access class properties created outside the constructor.  E.g. to bind id's to them.
	 * 3.  Set the static virtualElement property from the parsed html.
	 *
	 * TODO: Would there be a reason to have this to create standalone code that can be used without the original class?
	 * Then a build step could give only the post-compiled code to the browser.
	 * @return {string} */
	static compile() {

		// createFunction() is used for evaluating code within the same scope where the class is defined.
		// Otherwise, expressions in html can't read any identifiers that have been imported.
		// We use eval() to create the function, b/c new Function() can't access the external scope.

		// When NewClass is created, we give it the createFunction so that when other html is generated from expressions,
		// it can still use this function in the same scope.
		// We remove it from Refract because Refract will be used again in may other scopes.
		return `
			(() => {
				${this.name}.createFunction = (...args) => {
					let params = args.slice(0, -1).join(',');
					let code = args[args.length-1];
					return eval(\`(function(\${params}) {\${code}})\`);
				};
				let modified = ${this.name}.compiler.createModifiedClass(${this.name});
				${this.name} = eval('('+modified.code+')');		
				${this.name}.compiler.decorateAndRegister(${this.name}, modified);
				return ${this.name};	
			})();		
		`;
	}
}

Refract.htmlDecode = Html.decode;
Refract.htmlEncode = Html.encode;
window.refractHtmlEncode = Html.encode; // Used by #{} expressions.

var h = (text, quotes=`"'`) => Html.encode(text, quotes);
export {h};

// Expose useful internals to users of Refract:
export {default as Watch} from './Watch.js';
export {default as lex} from '../parselib/lex.js';
export {default as lexHtmlJs} from '../parselib/lex-htmljs.js';
export {default as fregex} from '../parselib/fregex.js';
export {default as Utils} from './utils.js';
