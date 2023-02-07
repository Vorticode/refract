import VExpression from "./VExpression.js";
import VElement from "./VElement.js";
import Parse from "./Parse.js";
import lex from "./lex.js";
import htmljs from "./lex-htmljs.js";
import fregex from "./fregex.js";
import utils from "./utils.js";
import Refract from "./Refract.js";



/**
 * Utility functions used internally by Refract for setting up a Refract class. */
export class Compiler {


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

			let tag = inlineText === true ? 'span' : 'div';
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
					>${omap(ve.attributes_, (name, val) => ` <span>${name}="${renderItem(val, true)}"</span>`).join('')}&gt;
				</div>
				<div style="padding-left: 4ex">
					${ve.vChildren_.map(renderItem).join('')}
				</div>
				<div>&lt;/${ve.tagName}&gt;</div>			
			</div>`;

		/**
		 * @param vexpr {VExpression}
		 * @return {string} */
		let renderVExpr = vexpr => {
			if (vexpr.type === 'loop')
				return `
					<div style="color: #08f">	
						<div style="background: #222">				
							<span style="color: #8888" title="startIndex">[${vexpr.startIndex_}]</span>
							${renderPaths(vexpr.watchPaths_)}.map(${vexpr.loopParamName} => 
							
							<span style="color: #8888" title="watchPaths">
								[${renderPaths(vexpr.watchPaths_)}] => ${vexpr.loopParamName}
							</span>
						</div>
					
						<div style="padding-left: 4ex">
							<div title="loopItemEls" style="background: #222">${vexpr.loopItemEls_.map(renderItem).join('')}</div>
							${vexpr.vChildren_.map(renderItem).join('')}
						</div>
						) 
					</div>`;

			return `
				<div style="background: #222">
					<span style="color: #8888" title="startIndex">[${vexpr.startIndex_}]</span>
					<span style="color: #60f" title="VExpression">${vexpr.code}</span>
					<span style="color: #8888" title="watchPaths">
						[${renderPaths(vexpr.watchPaths_)}]
					</span>
				</div>
				${vexpr.vChildren_.map(renderItem).join('')}`;
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

			let tag = inlineText === true ? 'span' : 'div';
			let style = inlineText !== true ? 'display: table;' : '';
			return `<${tag} title="Text node" style="${style} background-color: rgba(192, 96, 64, .2); color: #a66">${text}</${tag}>`;
		}

		/**
		 * @param ve {VElement}
		 * @return {string} */
		let renderVEl = ve =>
			`<div style="color: #f40">
				<div>
					<span>&lt;${ve.tagName}</span
					>${omap(ve.attributes_, (name, val) => ` <span>${name}="${renderItem(val, true)}"</span>`).join('')}&gt;
				</div>
				<div style="padding-left: 4ex">
					${ve.vChildren_.map(renderItem).join('')}		
				</div>
				<div>&lt;/${ve.tagName}&gt;</div>			
			</div>`;

		/**
		 * @param vexpr {VExpression}
		 * @return {string} */
		let renderVExpr = vexpr => {
			if (vexpr.type === 'loop')
				return `
					<div style="color: #08f">${renderPaths(vexpr.watchPaths_)}.map(${vexpr.loopParamName} => 
						
						<span style="color: #8888" title="watchPaths">
							[${renderPaths(vexpr.watchPaths_)}] => ${vexpr.loopParamName}
						</span>
					
						<div style="padding-left: 4ex">
							${vexpr.loopItemEls_.map(renderItem).join('')}
						</div>
						) 
					</div>`;

			return `<span style="color: #60f">${vexpr.code}</span>
				<span style="color: #8888" title="watchPaths">
					[${renderPaths(vexpr.watchPaths_)}]
				</span>`;
		};


		return createEl(renderVEl(this.virtualElement));
	}

	//#ENDIF


	/**
	 * Create a version of the class
	 * @param self
	 * @returns {{}}
	 */
	static createModifiedClass(self) {
		let result = {};
		result.originalClass_ = self;

		// This code runs after the call to super() and after all the other properties are initialized.

		// Turn autoRender into a property if it's not a property already.
		// It might be a property if we inherit from another Refract class.
		let preInitVal = (() => {

			if ('autoRender' in this)
				this.__autoRender = this.autoRender;
			else if (!('__autoRender' in this))
				this.__autoRender = true;

			if (Object.getOwnPropertyDescriptor(this, 'autoRender')?.configurable !== false)
				Object.defineProperty(this, 'autoRender', {
					get() {
						return this.__autoRender
					},
					set(val) {
						this.__autoRender = val;
						if (val)
							this.render();
					}
				});

			if (this.__autoRender)
				this.render();

			if (this.init) {
				let args = this.parentElement
					? this.constructor.compiler.populateArgsFromAttribs(this, this.constructor.getInitArgs_())
					: this.constructorArgs2_;
				this.init(...args);
			}
		}).toString();
		let preInitCode = `
			__preInit = (${preInitVal})()`;

		// New path.
		if (self.prototype.html) {
			result.tagName = Parse.htmlFunctionTagName_(self.prototype.html.toString());
			result.code = self.toString().slice(0, -1) + preInitCode + '}';
		}

		// Old path.  All of this will go away eventually:
		//#IFDEV
		else {

			function removeComments(tokens) {
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
					let argTokens = tokens.slice(constr.index + constr.length, Parse.findGroupEnd_(tokens, constr.index + constr.length));
					result.constructorArgs = Parse.findFunctionArgNames_(argTokens);

					// Find super call in constructor body
					let sup = fregex.matchFirst(
						['super', Parse.ws, '('],
						tokens,
						constr.index + constr.length + argTokens.length);

					let supEnd = Parse.findGroupEnd_(tokens, sup.index + sup.length) + 1;
					let e = fregex(Parse.ws, ';')(tokens.slice(supEnd));
					supEnd += e;

					let s = sup.index;
					sup = tokens.slice(sup.index, supEnd);
					sup.index = s;

					if (!sup)
						throw new Error(`Class ${self.name} constructor() { ... } is missing call to super().`);


					let injectIndex = sup.index + sup.length;
					let nextToken = tokens[injectIndex];
					let injectLines = [
						(nextToken == ',' ? ',' : ';'),
						`(()=>{`, // We wrap this in a function b/c some minifiers will strangely rewrite the super call into another expression.
						...result.constructorArgs.map(argName => [`\t${argName} = this.getAttrib_('${argName}', ${argName});`]),
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
						else if (!constructorIdx && token.text == 'constructor')
							constructorIdx = i;
					}

					if (htmlIdx && constructorIdx)
						break;
					i++;
				}


				let htmlMatch = fregex.matchFirst([
					'html', Parse.ws, '=', Parse.ws,
					fregex.or({type: 'template'}, {type: 'string'}),
					Parse.ws,
					fregex.zeroOrOne(';')
				], tokens, htmlIdx);

				if (!htmlMatch && !self.prototype.html)
					throw new Error(`Class ${self.name} is missing an html property with a template value.`);

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

				if (innerTokens[0].type === 'text' && !utils.unescapeTemplate_(innerTokens[0].text).trim().length)
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
		//#ENDIF

		return result;
	}

	static decorateAndRegister(NewClass, compiled) {

		// 1. Set Properties
		NewClass.tagName = compiled.tagName;


		NewClass.constructorArgs = compiled.constructorArgs;
		NewClass.htmlTokens = compiled.htmlTokens;

		// 2. Copy methods and fields from old class to new class, so that debugging within them will still work.
		for (let name of Object.getOwnPropertyNames(compiled.originalClass_.prototype))
			if (name !== 'constructor')
				NewClass.prototype[name] = compiled.originalClass_.prototype[name];

		// 3. Copy static methods and fields, so that debugging within them will still work.
		for (let staticField of Object.getOwnPropertyNames(compiled.originalClass_))
			if (!(staticField in Refract)) // If not inherited
				NewClass[staticField] = compiled.originalClass_[staticField];


		// Re-evaluate static functions so that any references to its own class points to the new instance and not the old one.
		// TODO: This doesn't get the arguments of the function.
		// TODO: Does this need to be done for non-static methos also?
		// TODO: Can this be combined with step 3 above?
		/*
		for (let name of Refract.ownKeys(NewClass))
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
	 * Get the arguments to the init function from the attributes.
	 * @param el {Refract|VElement} Call getAttrib() on this object.
	 * @param argNames {(string|Object)[]} An array returned from ParsedFunction.getArgNames().
	 * @returns {*[]} */
	static populateArgsFromAttribs(el, argNames) {

		const populateObject = obj => {
			for (let name in obj)
				if (obj[name])
					populateObject(obj[name]);
				else
					obj[name] = el.getAttrib_(name);
			return obj;
		}

		let result = [];
		for (let arg of argNames)
			if (typeof arg === 'string')
				result.push(el.getAttrib_(arg));
			else
				result.push(populateObject(arg));

		return result;
	}

}