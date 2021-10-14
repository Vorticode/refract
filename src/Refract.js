import lex from './lex.js';
import htmljs from './lex-htmljs.js';
htmljs.allowHashTemplates = true;
import fregex from './fregex.js';
import Parse from './Parse.js';
import VElement from './VElement.js';
import VExpression from "./VExpression.js";
import createEl from './createEl.js'; // TODO: This is erroneously still included when minified b/c rollup includes the //#IFDEV blocks.
import Html from "./Html.js";

/**
 * @property createFunction {function} Created temporarily during compilation. */
export default class Refract extends HTMLElement {

	/**
	 * A parsed representation of this class's html.
	 * @type VElement */
	static virtualElement;

	/**
	 * @type {string[]} Names of the constructor's arguments. */
	static constructorArgs = [];

	/**
	 * Change this from false to an empty array [] to keep a list of every element created by ever class that inherits
	 * from Refract.  Useful for debugging / seeing how many elements were recreated for a given operation.
	 * @type {boolean|(Node|HTMLElement)[]} */
	static elsCreated = false;

	/**
	 * Used by VElement.apply() to keep track of whether we're within an svg tag.
	 * @type {boolean} */
	static inSvg = false;



	/** @type {string} */
	slotHtml = '';

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
		 * @returns {string} */
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
		 * @returns {string} */
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
		 * @returns {string} */
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
		 * @returns {string} */
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
		 * @returns {string} */
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
		 * @returns {string} */
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

	static preCompile(self) {
		let result = {};
		result.self = self;
		result.constructorArgs = [];

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
		let tokens = lex(htmljs, code);
		tokens = removeComments(tokens);
		let htmlIdx = 0, constructorIdx=0;

		// 2. Build the virtual element tree.
		{
			// A. Find html template token
			// Make sure we're finding html = ` and the constructor at the top level, and not inside a function.
			// This search is also faster than if we use matchFirst() from the first token.
			let braceDepth = 0;
			for (let i = 0, token; token = tokens[i]; i++) {
				if (token == '{')
					braceDepth++;
				else if (token == '}')
					braceDepth--;
				else if (braceDepth === 1) {
					if (!htmlIdx && token == 'html')
						htmlIdx = i;
					else if (!constructorIdx && token == 'constructor')
						constructorIdx = i;
				}
				if (htmlIdx && constructorIdx)
					break;
			}

			let htmlMatch = fregex.matchFirst(['html', Parse.ws, '=', Parse.ws, {type: 'template'}, Parse.ws, fregex.zeroOrOne(';')], tokens, htmlIdx);
			//#IFDEV
			if (!htmlMatch)
				throw new Error(`Class ${self.name} is missing an html property with a template value.`);
			//#ENDIF

			// Remove the html property, so that when classes are constructed it's not evaluated as a regular template string.
			let htmlAssign = tokens.splice(htmlMatch.index, htmlMatch.length);
			let template = htmlAssign.filter(t=>t.tokens)[0]; // only the template token has sub-tokens.

			// B. Parse html
			let innerTokens = template.tokens.slice(1, -1); // skip open and close quotes.
			if (innerTokens[0].type === 'text' && !innerTokens[0].trim().length)
				innerTokens = innerTokens.slice(1); // Skip initial whitespace.
			result.virtualElement = VElement.fromTokens(innerTokens, [], null, 1)[0];
		}


		// 3. Get the constructorArgs and inject new code.
		{

			let constr = fregex.matchFirst(['constructor', Parse.ws, '('], tokens, constructorIdx);
			let injectIndex, injectCode;

			// Modify existing constructor
			if (constr) { // is null if no match found.

				// Find arguments
				let argTokens = fregex.matchFirst(Parse.argList, tokens, constr.index+constr.length);
				result.constructorArgs = Parse.filterArgNames(argTokens);

				// Find super call in constructor  body
				let sup = fregex.matchFirst(
					// TODO: Below I need to account for super calls that contain ; in an inline anonymous founction.
					// Instead count the ( and ) and end on the last )
					['super', Parse.ws, '(', fregex.zeroOrMore(fregex.not(';')), ';'],
					tokens,
					argTokens.index+argTokens.length);
				//#IFDEV
				if (!sup)
					throw new Error(`Class ${self.name} constructor() { ... } is missing call to super().`);
				//#ENDIF

				injectIndex = sup.index + sup.length;
				injectCode = [
					'//Begin Refract injected code.',
					...result.constructorArgs.map(argName=>
						[`if (${argName}===undefined && this.hasAttribute('${argName}')) {`,
						`   ${argName} = this.getAttribute('${argName}');`,
						`   try { ${argName} = JSON.parse(${argName}) } catch(e) {};`,
						'}'] // [above] Parse attrib as json if it's valid json.
					).flat(),
					`if (!this.virtualElement) {`, // If not already created by a super-class
					`\tthis.virtualElement = this.constructor.virtualElement.clone(this);`,
					`\tthis.virtualElement.apply(this, this);`,
					`}`,
					'//End Refract injected code.'
				].join('\r\n\t\t\t');

			}

			// Create new constructor
			else {
				injectIndex = fregex.matchFirst(['{'], tokens).index+1;
				injectCode = [
					'//Begin Refract injected code.',
					`constructor() {`,
					`\tsuper();`,
					`\tif (!this.virtualElement) {`, // If not already created by a super-class
					`\t\tthis.virtualElement = this.constructor.virtualElement.clone(this);`,
					`\t\tthis.virtualElement.apply(this, this);`,
					'\t}',
					'}',
					'//End Refract injected code.'
				].join('\r\n\t\t');
			}

			tokens.splice(injectIndex, 0, '\r\n\t\t\t' + injectCode);
			result.code = tokens.join('');
		}

		return result;
	}

	static decorate(NewClass, compiled) {
		// 1. Set Properties
		NewClass.constructorArgs = compiled.constructorArgs;
		NewClass.virtualElement  = compiled.virtualElement;

		// 2. Copy methods and fields from old class to new class, so that debugging within them will still work.
		for (let name of Object.getOwnPropertyNames(compiled.self.prototype))
			if (name !== 'constructor')
				NewClass.prototype[name] = compiled.self.prototype[name];

		// 3. Copy static methods and fields, so that debugging within them will still work.
		for (let staticField of Object.getOwnPropertyNames(compiled.self))
			if (!(staticField in Refract)) // If not inherited
				NewClass[staticField] = compiled.self[staticField];

		// 4. Register the class as an html element.
		customElements.define(NewClass.virtualElement.tagName.toLowerCase(), NewClass);
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
				window.RefractCurrentClass = ${this.name};
				${this.name}.createFunction = (...args) => eval(\`(function(\${args.slice(0, -1).join(',')}) {\${args[args.length-1]}})\`);
				let compiled = ${this.name}.preCompile(${this.name});
				${this.name} = eval('('+compiled.code+')');		
				${this.name}.decorate(${this.name}, compiled);
				delete window.RefractCurrentClass;
				return ${this.name};	
			})();
		
		`;
	}
}

Refract.htmlDecode = Html.decode;
Refract.htmlEncode = Html.encode;
