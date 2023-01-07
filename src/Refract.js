import lex from './lex.js';
import htmljs from './lex-htmljs.js';
htmljs.allowHashTemplates = true;
import fregex from './fregex.js';
import Parse from './Parse.js';
import VElement from './VElement.js';
import VExpression from "./VExpression.js";
import createEl from './createEl.js'; // TODO: This is erroneously still included when minified b/c rollup includes the //# IFDEV blocks.
import Html from "./Html.js";
import utils from "./utils.js";
import {ParsedFunction} from "./ParsedFunction.js";


/**
 * @property createFunction {function} Created temporarily during compilation.
 * @property styleId {int} */
export default class Refract extends HTMLElement {

	/** @type {string} */
	static tagName;

	/**
	 * Keep track of which Refract elements are currently being constructed.  Indexed by tagname.
	 * This prevents us from creating another instance of an element when it's in the middle of being upgraded,
	 * which browsers don't like.
	 * @type {Object<string, boolean>} */
	static constructing = {};

	static htmlTokens = null;

	/**
	 * A parsed representation of this class's html.
	 * @type VElement */
	static virtualElement;


	static currentVElement = null;

	/**
	 * @type {string[]} Names of the constructor's arguments. */
	static constructorArgs = null;

	static initArgs = null;


	/**
	 * Whenever an element is created, it's added here to this global map, pointing back to its velement.
	 * TODO: This currently isn't used.
	 * @type {WeakMap<HTMLElement, VElement|VText>} */
	static virtualElements = new WeakMap();

	/**
	 * Change this from false to an empty array [] to keep a list of every element created by ever class that inherits
	 * from Refract.  Useful for debugging / seeing how many elements were recreated for a given operation.
	 * @type {boolean|(Node|HTMLElement)[]} */
	static elsCreated = false;

	/**
	 * Used by VElement.apply() to keep track of whether we're within an svg tag.
	 * @type {boolean} */
	static inSvg = false;

	/**
	 * @type {Event} If within an event, this is the  */
	static currentEvent;

	/**
	 * TODO: Every event attribute should call this function.
	 * This will fix some of the event unit tests where events are added from ${} in odd ways.
	 * @param event {Event}
	 * @param el {HTMLElement} I probably don't need this, since i can get it from event.currentTarget */
	static refractEvent(event, el) {

	}


	/** @type {string} */
	slotHtml = '';

	/** If true, call render() before the constructor, and every time after a property is changed */
	autoRender = true;

	/** Has render() benn called at least once to create the DOM */
	initialRender = false;


	__connected = false;
	__connectedCallbacks = [];
	__firstConnectedCallbacks = [];
	__disconnectedCallbacks = [];


	constructor(args) {
		super();

		// old path from before we used init()
		if (args === false)
			this.autoRender = false;

		else if (typeof autoRender === 'object') // Deprecated path, we can just disable autoRender instead.
			// Allow setting properties on the object before any html is created:
			for (let name in autoRender)
				this[name] = autoRender[name];

		this.constructorArgs2 = arguments;
	}

	/**
	 * Bring this element's DOM nodes up to date.
	 * 1.  If calling render() for the first time on any instance, parse the html to the virtual DOM.
	 * 2.  If calling render() for the first time on this instance, Render the virtual DOM to the real DOM.
	 * 3.  Apply any updates to the real DOM. TODO
	 * @param name {?string} Name of the class calling render.  What is this for? */
	render(name=null) {

		// Parse the html tokens to Virtual DOM
		if (!this.constructor.virtualElement) {
			if (!this.constructor.htmlTokens)
				this.constructor.htmlTokens = Parse.htmlFunctionReturn(this.html.toString());

			this.constructor.virtualElement = VElement.fromTokens(this.constructor.htmlTokens, [], null, this.constructor, 1)[0];
			this.constructor.htmlTokens = null; // We don't need them any more.
		}

		// If not already created by a super-class.  Is ` this.constructor.name===name` still needed?
		if (!this.virtualElement && (!name || this.constructor.name===name)) {
			Refract.constructing[this.tagName] = true;

			this.virtualElement = this.constructor.virtualElement.clone(this);
			this.virtualElement.apply(null, this);

			delete Refract.constructing[this.tagName];

			this.initialRender = true;
		}
	}

	//#IFDEV

	debugRender() {
		// .map() for objects.
		let omap = (o, cb) => { // Like .map() but for objects.
			let result = []
			for (let name in o)
				result.push(cb(name, o[name]))
			return result;
		};

		let renderPaths = watchPaths => watchPaths.map(path => "'" + path.join('.') + "'").join(', ');

		/**
		 *
		 * @param child {(VExpression|VElement|string)[]|VExpression|VElement|string}
		 * @param inlineText {string}
		 * @return {string} */
		let renderItem = (child, inlineText) => {

			if (Array.isArray(child)) {
				let result = [];
				for (let child2 of child)
					result.push(renderItem(child2, inlineText))
				return result.join('');
			}
			if (child instanceof VExpression)
				return renderVExpr(child);
			if (child instanceof VElement) {
				return renderVEl(child);

			}

			// String
			let text = child.text;
			if (!text.trim().length)
				text = text.replace(/\s/g, '&nbsp;');

			let tag = inlineText===true ? 'span' : 'div';
			return `
				
				<${tag}><span style="color: #8888" title="startIndex">[${child.startIndex}] </span><span title="Text node" style="background: #a643; color: #a66">${text}</span></${tag}>`;
		}

		/**
		 * @param ve {VElement}
		 * @return {string} */
		let renderVEl = ve =>
			`<div style="color: #f40">
				<div>
					<span>&lt;${ve.tagName}</span
					>${omap(ve.attributes, (name, val) => ` <span>${name}="${renderItem(val, true)}"</span>`).join('')}&gt;
				</div>
				<div style="padding-left: 4ex">
					${ve.vChildren.map(renderItem).join('')}
				</div>
				<div>&lt;/${ve.tagName}&gt;</div>			
			</div>`;

		/**
		 * @param vexpr {VExpression}
		 * @return {string} */
		let renderVExpr = vexpr => {
			if (vexpr.type==='loop')
				return `
					<div style="color: #08f">	
						<div style="background: #222">				
							<span style="color: #8888" title="startIndex">[${vexpr.startIndex}]</span>
							${renderPaths(vexpr.watchPaths)}.map(${vexpr.loopParamName} => 
							
							<span style="color: #8888" title="watchPaths">
								[${renderPaths(vexpr.watchPaths)}] => ${vexpr.loopParamName}
							</span>
						</div>
					
						<div style="padding-left: 4ex">
							<div title="loopItemEls" style="background: #222">${vexpr.loopItemEls.map(renderItem).join('')}</div>
							${vexpr.vChildren.map(renderItem).join('')}
						</div>
						) 
					</div>`;

			return  `
				<div style="background: #222">
					<span style="color: #8888" title="startIndex">[${vexpr.startIndex}]</span>
					<span style="color: #60f" title="VExpression">${vexpr.code}</span>
					<span style="color: #8888" title="watchPaths">
						[${renderPaths(vexpr.watchPaths)}]
					</span>
				</div>
				${vexpr.vChildren.map(renderItem).join('')}`;
		};


		return createEl(renderVEl(this.virtualElement));
	}

	/**
	 * Create an html element that shows how this Refract is built, for debugging.
	 * @return HTMLElement */
	static debugRender() {

		let omap = (o, cb) => { // Like .map() but for objects.
			let result = []
			for (let name in o)
				result.push(cb(name, o[name]))
			return result;
		};


		let renderPaths = watchPaths => watchPaths.map(path => "'" + path.join('.') + "'").join(', ');

		/**
		 *
		 * @param child {(VExpression|VElement|string)[]|VExpression|VElement|string}
		 * @param inlineText {string}
		 * @return {string} */
		let renderItem = (child, inlineText) => {
			if (Array.isArray(child)) {
				let result = [];
				for (let child2 of child)
					result.push(renderItem(child2, inlineText))
				return result.join('');
			}
			if (child instanceof VExpression)
				return renderVExpr(child);
			if (child instanceof VElement)
				return renderVEl(child);

			// VText or attribute.
			let text = child.text || child;
			if (!text.trim().length)
				text = text.replace(/\s/g, '&nbsp;');

			let tag = inlineText===true ? 'span' : 'div';
			let style = inlineText!==true ? 'display: table;' : '';
			return `<${tag} title="Text node" style="${style} background-color: rgba(192, 96, 64, .2); color: #a66">${text}</${tag}>`;
		}

		/**
		 * @param ve {VElement}
		 * @return {string} */
		let renderVEl = ve =>
			`<div style="color: #f40">
				<div>
					<span>&lt;${ve.tagName}</span
					>${omap(ve.attributes, (name, val) => ` <span>${name}="${renderItem(val, true)}"</span>`).join('')}&gt;
				</div>
				<div style="padding-left: 4ex">
					${ve.vChildren.map(renderItem).join('')}		
				</div>
				<div>&lt;/${ve.tagName}&gt;</div>			
			</div>`;

		/**
		 * @param vexpr {VExpression}
		 * @return {string} */
		let renderVExpr = vexpr => {
			if (vexpr.type==='loop')
				return `
					<div style="color: #08f">${renderPaths(vexpr.watchPaths)}.map(${vexpr.loopParamName} => 
						
						<span style="color: #8888" title="watchPaths">
							[${renderPaths(vexpr.watchPaths)}] => ${vexpr.loopParamName}
						</span>
					
						<div style="padding-left: 4ex">
							${vexpr.loopItemEls.map(renderItem).join('')}
						</div>
						) 
					</div>`;

			return  `<span style="color: #60f">${vexpr.code}</span>
				<span style="color: #8888" title="watchPaths">
					[${renderPaths(vexpr.watchPaths)}]
				</span>`;
		};


		return createEl(renderVEl(this.virtualElement));
	}

	//#ENDIF


	/**
	 * Get the evaluated version of an attribute.
	 * @param name {string}
	 * @param alt {*} Defaults to undefined because that's what we get if the argument isn't specified by the caller.
	 * @return {*} */
	getAttrib(name, alt=undefined) {
		let velement = Refract.currentVElement; // Refract.virtualElements.get(this);
		if (velement) {
			return velement.getAttrib(name);
		}
		else {
			let hval = this.getAttribute(name);
			if (hval === null)
				return alt;

			let val = Refract.htmlDecode(hval);

			// As JSON
			try {
				return JSON.parse(val);
			}
			catch {}

			// As an expression
			if (val.startsWith('${') && val.endsWith('}'))
				try { // Is it possible to eval() in the context of the calling function?
					return eval('(' + val.slice(2, -1) + ')');
				}
				catch {}

			// As a string
			return val;
		}
	}



	/**
	 * Get the arguments to the init function from the attributes.
	 * @param el
	 * @param argNames
	 * @returns {*[]} */
	static getArgsFromAttributes(el, argNames) {

		const populateObject = obj => {
			for (let name in obj)
				if (obj[name])
					populateObject(obj[name]);
				else
					obj[name] = el.getAttrib(name);
			return obj;
		}

		let result = [];
		for (let arg of argNames)
			if (typeof arg === 'string')
				result.push(el.getAttrib(arg));
			else
				result.push(populateObject(arg));

		return result;
	}

	static getInitArgs() {
		if (!this.initArgs && this.prototype.init) {
			let pf = new ParsedFunction(this.prototype.init, false);
			this.initArgs = [...pf.getArgNames()];
		}
		return this.initArgs || [];
	}

	static preCompile(self) {
		let result = {};
		result.self = self;

		// This code runs after the call to super() and after all the other properties are initialized.
		let preInitCode = `
			__preInit = (() => {
				if (this.autoRender)
					this.render(this.constructor.name);
				
				if (this.init) {
					let args = this.parentElement
						? Refract.getArgsFromAttributes(this, this.constructor.getInitArgs())
						: this.constructorArgs2;
					this.init(...args);
				}
			})();`;

		// New path.
		if (self.prototype.html) {
			result.tagName = Parse.htmlFunctionTagName(self.prototype.html.toString());
			result.code = self.toString().slice(0, -1) + preInitCode + '}';
		}

		// Old path.  All of this will go away eventually:
		else {

			function removeComments(tokens)	{
				let result = [];
				for (let token of tokens) {
					if (token.type !== 'comment')
						result.push(token);
					if (token.tokens)
						token.tokens = removeComments(token.tokens);
				}
				return result;
			}



			// 1. Parse into tokens
			let code = self.toString();
			//let old = htmljs.allowUnknownTagTokens;
			//htmljs.allowUnknownTagTokens = true;
			let tokens = [...lex(htmljs, code)];

			//htmljs.allowUnknownTagTokens = old;
			tokens = removeComments(tokens);
			let htmlIdx = 0, constructorIdx = 0;


			// 2. Get the constructorArgs and inject new code.
			{
				let constr = fregex.matchFirst(['constructor', Parse.ws, '('], tokens, constructorIdx);

				// Modify existing constructor
				if (constr) { // is null if no match found.
					// Find arguments
					let argTokens = tokens.slice(constr.index + constr.length, Parse.findGroupEnd(tokens, constr.index + constr.length));
					result.constructorArgs = Parse.findFunctionArgNames(argTokens);

					// Find super call in constructor body
					let sup = fregex.matchFirst(
						['super', Parse.ws, '('],
						tokens,
						constr.index + constr.length + argTokens.length);

					let supEnd = Parse.findGroupEnd(tokens, sup.index + sup.length) + 1;
					let e = fregex(Parse.ws, ';')(tokens.slice(supEnd));
					supEnd += e;

					let s = sup.index;
					sup = tokens.slice(sup.index, supEnd);
					sup.index = s;

					//#IFDEV
					if (!sup)
						throw new Error(`Class ${self.name} constructor() { ... } is missing call to super().`);
					//#ENDIF


					let injectIndex = sup.index + sup.length;
					let nextToken = tokens[injectIndex];
					let injectLines = [
						(nextToken == ',' ? ',' : ';'),
						`(()=>{`, // We wrap this in a function b/c some minifiers will strangely rewrite the super call into another expression.
						...result.constructorArgs.map(argName => [`\t${argName} = this.getAttrib('${argName}', ${argName});`]),
						`})()`
					];
					let injectCode = '\r\n\t\t' + [
							'//Begin Refract injected code.',
							...injectLines,
							'//End Refract injected code.'
						].join('\r\n\t\t')
						+ '\r\n';

					// This final line return is needed to prevent minifiers from breaking it.
					tokens.splice(injectIndex, 0, injectCode);
				}
			}


			// 3. Parse html property
			{

				// A. Find html template token
				// Make sure we're finding html = ` and the constructor at the top level, and not inside a function.
				// This search is also faster than if we use matchFirst() from the first token.
				// TODO: Use ObjectUtil.find() ?
				let braceDepth = 0;
				let i = 0;
				for (let token of tokens) {
					if (token.text === '{' || token.text === '(') // Don't find things within function argument lists, or function bodies.
						braceDepth++;
					else if (token.text === '}' || token.text === ')')
						braceDepth--;
					else if (braceDepth === 1) {
						if (!htmlIdx && token.text == 'html')
							htmlIdx = i;
						else if (!constructorIdx && token.text == 'constructor') {
							constructorIdx = i;
						}
					}

					if (htmlIdx && constructorIdx) {
						break;
					}
					i++;
				}


				let htmlMatch = fregex.matchFirst([
					'html', Parse.ws, '=', Parse.ws,
					fregex.or({type: 'template'}, {type: 'string'}),
					Parse.ws,
					fregex.zeroOrOne(';')
				], tokens, htmlIdx);

				//#IFDEV
				if (!htmlMatch && !self.prototype.html)
					throw new Error(`Class ${self.name} is missing an html property with a template value.`);
				//#ENDIF

				// Remove the html property, so that when classes are constructed it's not evaluated as a regular template string.
				let htmlAssign = tokens.splice(htmlMatch.index, htmlMatch.length);
				let template = htmlAssign.filter(t => t.tokens || t.type === 'string')[0]; // only the template token has sub-tokens.

				// B. Parse html

				// B1 Template
				if (template.tokens)
					var innerTokens = template.tokens.slice(1, -1);

				// b2 Non-template
				else { // TODO: Is there better a way to unescape "'hello \'everyone'" type strings than eval() ?
					let code = eval(template + '');
					innerTokens = lex(htmljs, code, 'template');
				}

				if (innerTokens[0].type === 'text' && !utils.unescapeTemplate(innerTokens[0].text).trim().length)
					innerTokens = innerTokens.slice(1); // Skip initial whitespace.

				result.htmlTokens = innerTokens;
				for (let token of innerTokens) {
					if (token.type === 'openTag') {
						result.tagName = token.tokens[0].text.slice(1); // Get '<open-tag' w/o first character.
						break;
					}
				}
			}

			// 4.  Insert a property at the very end of the class, to call render().
			// This allows render() to be called after super() and after the other properties are setup,
			// but before the rest of the code in the constructor().
			let lastBrace = null;
			for (let i = tokens.length - 1; true; i--)
				if (tokens[i].text === '}') {
					lastBrace = i;
					break;
				}

			tokens.splice(lastBrace, 0, preInitCode);

			result.code = tokens.join('');
		}

		return result;
	}

	static decorate(NewClass, compiled) {

		// 1. Set Properties
		NewClass.tagName = compiled.tagName;

		// Old path only:
		NewClass.constructorArgs = compiled.constructorArgs;
		NewClass.virtualElement = compiled.virtualElement;
		NewClass.htmlTokens = compiled.htmlTokens;

		// 2. Copy methods and fields from old class to new class, so that debugging within them will still work.
		for (let name of Object.getOwnPropertyNames(compiled.self.prototype))
			if (name !== 'constructor')
				NewClass.prototype[name] = compiled.self.prototype[name];

		// 3. Copy static methods and fields, so that debugging within them will still work.
		for (let staticField of Object.getOwnPropertyNames(compiled.self))
			if (!(staticField in Refract)) // If not inherited
				NewClass[staticField] = compiled.self[staticField];


		// Re-evaluate static functions so that any references to its own class points to the new instance and not the old one.
		// TODO: This doesn't get the arguments of the function.
		// TODO: Does this need to be done for non-static methos also?
		// TODO: Can this be combined with step 3 above?
		/*
		for (let name of Reflect.ownKeys(NewClass))
			if ((typeof NewClass[name] === 'function') && name !== 'createFunction') {
				let code = NewClass[name].toString();
				code = code.slice(code.indexOf('{')+1, code.lastIndexOf('}'));
				NewClass[name] = NewClass.createFunction(code);
			}
		*/

		// 4. Register the class as an html element.
		customElements.define(compiled.tagName, NewClass);
	}


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
		if (this.__connected)
			callback();
		this.__disconnectedCallbacks.push(callback);
	}

	/**
	 * This function is called by the browser.
	 * If you override it, onConnect() and onFirstConnect() won't work. */
	connectedCallback() {
		this.__connected = true;
		for (let cb of this.__connectedCallbacks)
			cb();
		for (let cb of this.__firstConnectedCallbacks)
			cb();
		this.__firstConnectedCallbacks = [];
	}

	/**
	 * This function is called by the browser.
	 * If you override it, onConnect() and onFirstConnect() won't work. */
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
				let compiled = ${this.name}.preCompile(${this.name});
				${this.name} = eval('('+compiled.code+')');		
				${this.name}.decorate(${this.name}, compiled);
				return ${this.name};	
			})();		
		`;
	}
}

Refract.constructing = {};

Refract.htmlDecode = Html.decode;
Refract.htmlEncode = Html.encode;

/**
 * TODO: Make a version of this that escapes the proper way depending on the context, automatically.
 * backslashes when in js strings
 * escape single or double quotes or tempalte tags if inside those strings. */
var h = Html.encode;
export {h};

// Expose useful internals to users of Refract:
export {default as Watch} from './Watch.js';
export {default as lex} from './lex.js';
export {default as lexHtmlJs} from './lex-htmljs.js';
export {default as delve} from './delve.js';
export {default as fregex} from './fregex.js';
export {default as Utils} from './utils.js';
