/**
 * Provide functionality for running Deno tests in a web browser.
 * Has no external dependencies.
 *
 * TODO:
 * 4.  Integrate with IntelliJ file watcher so we run cmd line tests when files change.
 * 5.  Run tests from @expect doc tags.
 * 6.  Documentation - Web tests, deno tests, intellij integration
 * 7.  Add to github.
 * 8.  Command line via node
 * 9.  Support other Deno options.
 * 11. URLs only mark which tests to include or exclude, to make url shorter
 * 12. Auto-expand to failed tests.
 */

class AssertError extends Error {
	constructor(expected, actual, op) {
		super('Assertion Failed');
		this.name = "AssertError";
		this.expected = expected;
		this.actual = actual;
		this.op = op;
	}
}

function assert(val) {
	if (!val) {
		if (Testimony.debugOnAssertFail)
			debugger;
		throw new AssertError(val, true);
	}
}

Object.assign(assert, {
	eq(expected, actual) {
		if (!isSame(expected, actual)) { // JUnit, PhpUnit, and mocha all use the order: expected, actual.
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(expected, actual, '==');
		}
	},

	eqJson(expected, actual) {
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(expected, actual);
		}
	},

	neq(val1, val2) {
		if (val1 !== val2) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(val1 + ' === ' + val2);
		}
	},

	lte(val1, val2) {
		if (val1 > val2) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(val1 + ' > ' + val2);
		}
	}
});



/**
 * https://stackoverflow.com/a/6713782/
 * @param x
 * @param y
 * @return {boolean} */
function isSame( x, y ) {
	if (x === y)
		return true; // if both x and y are null or undefined and exactly the same

	// if they are not strictly equal, they both need to be Objects
	// they must have the exact same prototype chain, the closest we can do is
	// test their constructor.
	if (!(x instanceof Object) || !(y instanceof Object) || x.constructor !== y.constructor)
		return false;

	for (var p in x) {
		if (!x.hasOwnProperty(p))
			continue; // other properties were tested using x.constructor === y.constructor

		if (!y.hasOwnProperty(p))
			return false; // allows to compare x[ p ] and y[ p ] when set to undefined

		if (x[p] === y[p])
			continue; // if they have the same strict value or identity then they are equal

		if (typeof x[p] !== "object" || !isSame(x[p], y[p])) // Numbers, Strings, Functions, Booleans must be strictly equal
			return false; // Objects and Arrays must be tested recursively
	}

	for (p in y) // allows x[ p ] to be set to undefined
		if (y.hasOwnProperty(p) && !x.hasOwnProperty(p))
			return false;

	return true;
}

let styleId = 1;

/**
 * Create a single html element, node, or comment from the html string.
 * The string will be trimmed so that an element with space before it doesn't create a text node with spaces.
 * TODO: Allow specifying an existing div as props to bind a new set of html to it.
 *     This could be used for manually adding children.
 * TODO: Get values and setValues() functions for form fields?  Can make it work with any html element.
 * TODO: Bind this to render() so I can render ${this.someField}
 * TODO: Make properties, ids, events, and scoped styles only happen if a props argument is passed in, or is not false?
 *
 * I could use name="items[].name" to specify json structure of the result?
 * OR:
 *
 * <div name="item[]">
 *     <input name="description">
 * </div>
 *
 * Will give me item[0].description
 *
 *
 * @param html {string|function} Must be a function that returns html if you want to call render() again later.
 * @param doc {Document}
 * @param props {Object|boolean} */
function createEl(html, props=false, doc=document) {
	let template = doc.createElement('template');
	let result = doc.createElement((html+'').match(/<(\w+[\w-]*)/)[1]);
	let ids; // Track them so they can be removed later.

	// Properties
	if (typeof props === 'object')
		for (let name in props) {
			if (name in result)
				throw new Error(`Property ${name} already exists.`);
			result[name] = props[name];
		}

	// Render
	result.render = () => {
		template.innerHTML = (typeof html === 'function' ? html() : html).trim();

		// Attributes and Children
		if (props) {
			result.innerHTML = '';
			[...result.attributes].map(attr => result.removeAttribute(attr.name));
		}
		[...template.content.firstElementChild.attributes].map(attr => result.setAttribute(attr.name, attr.value));
		[...template.content.firstElementChild.childNodes].map(child => result.append(child));

		if (props) {
			// Assign ids
			(ids || []).map(id => delete result[id]);
			ids = [...result.querySelectorAll('[id],[data-id]')].map(el => {
				if (el.id in result && !(el.id in props)) // allow id's to override our custom props.
					throw new Error(`Property ${el.id} already exists.`);
				result[el.id] = el;
				return [el.id];
			});

			// Bind events
			[result, ...result.querySelectorAll('*')].map(el =>
				[...el.attributes].filter(attr => attr.name.startsWith('on')).map(attr => {
					el[attr.name] = e => // e.g. el.onclick = ...
						(new Function('event', 'el', attr.value)).bind(result)(e, el) // put "event", "el", and "this" in scope for the event code.
				})
			);

			// Scoped Styles
			let styles = result.querySelectorAll('style');
			if (styles.length) {
				result.setAttribute('data-style-scope', styleId++); // TODO: re-use style id on re-render.
				[...styles].map(style => style.textContent = style.textContent.replace(/:host(?=[^a-z\d_])/gi,
					'[data-style-scope="' + result.getAttribute('data-style-scope') + '"]'));
			}
		}
	}

	if (typeof result.init === 'function')
		result.init();
	if (!ids) // if not called by init()
		result.render();

	return result;
}

// Html.encode()
function h(text, quotes='"') {
	text = (text === null || text === undefined ? '' : text+'')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\a0/g, '&nbsp;')
	if (quotes.includes("'"))
		text = text.replace(/'/g, '&apos;');
	if (quotes.includes('"'))
		text = text.replace(/"/g, '&quot;');
	return text;
}

var HtmlRenderer = {

	/**
	 * @param test {Test}
	 * @return {HTMLDivElement} */
	render(test) {

		// If updating
		if (test.el) {
			test.el.render();
			for (let t2 of Object.values(test.children || {}))
				test.el.childTests.append(HtmlRenderer.render(t2));
			return test.el;
		}
		else {

			let result = createEl(() => `
				<div class="test">
					<style>
						:host input[type=checkbox] { width: 7.7px; appearance: none; margin: 0; color: inherit }						
						:host #expandCB:after { content: '+'; user-select: none; cursor: pointer }		
						:host #expandCB:checked:after { content: '-' }						
						:host #enableCB:after { content: '\xa0'; color: #55f; font-weight: bold; text-shadow: 1px 0 0 #55f }
						:host #enableCB:checked:after { content: 'x' }						
						:host #status { line-height: 1; display: inline-block; width: 7.7px }
						:host #childTests { padding-left: ${test.name.length ? '30.8' : '15.4'}px }
					</style>					
					<div>
						${test.name.length ? 
							Object.values(test.children || {}).length
								?  `<input id="expandCB" type="checkbox" name="x" ${test.expanded ? 'checked' : ''}
										value="${h(test.name) || ''}" onchange="this.expandClick()">` 
								:  `&nbsp;`
							: ''
						}
						<label>
							[<input id="enableCB" type="checkbox" name="r" value="${h(test.name) || ''}"
								${(test.getShortName()[0] === '_') ? 'data-disabled' : ''} 
							    ${test.enabled ? 'checked' : ''} 
							    onchange="this.enableClick()">]						
							<span id="status">${
								test.status === true ? `<span style="color: #0f0">✓</span>` :
								test.status === null ? `&nbsp;` :
								`<span style="color: red">✗</span>`
							}</span>
							${h(test.getShortName())}
						</label>	
						<span style="opacity: .5">${h(test.desc) || ''}</span>
						<div style="color: red; padding-left: 61.6px">${test.status instanceof Error ? Testimony.shortenError(test.status) : ''}</div>
					</div>
					<div id="childTests" ${test.expanded ? '' : 'style="display: none"'}></div>
				</div>`, {

				test,

				init() {
					test.el = this;
				},

				enableClick() {
					// Check all children if this is checked.
					[...this.childTests.querySelectorAll('[name=r]:not([data-disabled])')].map(cb => cb.checked = this.enableCB.checked);

					// Make every parent checked if all its children are checked.
					let p = this;
					while (p = p.parentNode)
						if (p.nodeType === 1 && p.matches('.test'))
							p.querySelector('[name=r]').checked = ![...p.childTests.querySelectorAll('[name=r]:not([data-disabled])')].find(cb => !cb.checked);
				},

				expandClick() {
					this.childTests.style.display = this.expandCB.checked ? '': 'none';
				}
			});

			// Recursively add child tests
			if (test.children)
				for (let test2 of Object.values(test.children))
					result.childTests.append(HtmlRenderer.render(test2));

			return result;
		}
	}
}

// Not used since Deno renders the tests.
var TextRenderer = {

	render(test) {
		let result = [];

		// If not the root node:
		if (test.name) {

			// Color codes: https://stackoverflow.com/a/41407246
			let status = ' ';
			if (test.status === null)
				status = ' ';
			else if (test.status === true)
				status = '\x1b[1;32m' + '✓' + '\x1b[0m'; // green, 1; for bold
			else
				status = '\x1b[1;31m' + '✗' + '\x1b[0m'; // red

			let result2 = '    '.repeat(test.getDepth()) + `[${status}] ${test.getShortName() || ''}`;
			if (test.desc)
				result2 += ` \x1b[90m${test.desc}\x1b[0m`; // gray
			if (test.status instanceof Error)
				result2 += ' \x1b[31m' + Testimony.shortenError(test.status, '\n    ') + '\x1b[0m';

			result.push(result2);
		}

		// Recurse through children.
		if (test.children)
			for (let test2 of Object.values(test.children))
				result.push(TextRenderer.render(test2));

		return result.join('\n');
	}
}


class Test {
	name;
	desc;
	expanded;
	enable;

	/**
	 * @type {boolean|Error|null}
	 * true:  Test passed or all child tests passed
	 * false:  One or more child tests failed.
	 * Error:  Test failed.
	 * null:  Hasn't been run yet. */
	status = null;

	/**
	 * Every test will have either a fn OR children.
	 * @type {?function} */
	fn = null;

	/**
	 * @type {?Object<name:string, Test>} */
	children = null;

	constructor(name='', desc='', fn) {
		this.name = name;
		this.desc = desc;
		this.fn = fn;

		if (window.location) {
			let url = new URL(window.location);
			this.expanded = url.searchParams.getAll('x').includes(name);

			// Enabled if this or a parent is checked
			this.enabled = false;
			let r = url.searchParams.getAll('r');
			let parent = name;
			do {
				if (r.includes(parent) && !this.getShortName().startsWith('_')) {
					this.enabled = true;
					break;
				}
				parent = parent.split('.').slice(0, -1).join('.')
			} while (parent);
		}
		else // TODO: Get enabled tests from the command line enable arguments.
			this.enabled = true;
	}

	/**
	 * Run this test or its children. */
	async run() {

		// A test to run.
		if (this.fn && this.enabled) {
			let result = true;
			if (Testimony.throwOnFail) {
				result = this.fn();
				if (result instanceof Promise)
					result = await result;
				if (result !== false)
					this.status = true;
			} else {
				try {
					result = this.fn();
					if (result instanceof Promise)
						await result;
					if (result !== false)
						this.status = true;
				} catch (e) {
					this.status = e;
				}
			}
		}

		// A node containing other tests.
		if (!this.fn) {
			// TODO: Run in parallel?
			this.status = true;
			for (let child of Object.values(this.children)) {
				await child.run();
				if (child.status === false || child.status instanceof Error)
					this.status = false;

				else if (child.status === null && this.status !== false)
					this.status = null;

			}
		}
	}

	getDepth() {
		return ((this.name || '').match(/\./g) || []).length;
	}

	getShortName() {
		return /[^.]*$/.exec(this.name)[0];
	}
}


var Testimony = {

	debugOnAssertFail: false,
	throwOnFail: false, // throw from original location on assert fail or error.
	expandLevel: 2,

	/** @type {Test} */
	rootTest: new Test(),

	async run(parent) {
		let renderer = parent ? HtmlRenderer : TextRenderer;

		if (parent) {
			// Expand
			function doExpand(test, expand) {
				if (expand) {
					test.expanded = true;
					for (let child of Object.values(test.children || {}))
						doExpand(child, expand - 1);
				}
			}

			let hasXParam = new URL(location).searchParams.getAll('x').length;
			doExpand(Testimony.rootTest, hasXParam ? 1 : this.expandLevel);

			// Render empty tests
			parent.append(renderer.render(Testimony.rootTest));
			await new Promise(r => setTimeout(r, 1)); // allow browser to render.

			// Run tests
			await Testimony.rootTest.run();


			// Update the status.
			renderer.render(Testimony.rootTest);
		}

		else {
			await Testimony.rootTest.run();
			console.log(renderer.render(Testimony.rootTest));
		}
	},

	/**
	 * Add a test.
	 *
	 * Arguments can be given in any order, except that name must occur before desc.
	 * @param name {string}
	 * @param desc {string|function()=}
	 * @param html {string|function()=}
	 * @param func {function()=} */
	test(name, desc, html=null, func) {
		let name2, desc2='', html2, func2;
		for (let arg of arguments) {
			if (typeof arg === 'function')
				func2 = arg;
			else if ((arg+'').trim().match(/^<[!a-z]/i)) // an open tag.
				html2 = arg;
			else if (!name2)
				name2 = arg;
			else
				desc2 = arg || '';
		}

		// update func to create and destroy html before and after test.
		if (html2) {
			let oldFunc = func2;

			// As an iframe.
			if (html2.startsWith('<html') || html2.startsWith('<!')) {
				func2 = async () => {
					var iframe = document.createElement('iframe');
					iframe.style.display = 'none';
					document.body.append(iframe);

					var doc = iframe.contentDocument || iframe.contentWindow.document;
					doc.open();
					doc.write(html2);
					doc.close();

					let result = await oldFunc(doc);
					iframe.parentNode.removeChild(iframe);
					return result;
				};
			}

			// As part of the regular document
			else {
				func2 = async () => {
					let el = createEl(html2);
					document.body.append(el);
					let result = await oldFunc(el);
					document.body.removeChild(el);
					return result;
				}
			}
		}

		if (globalThis.Deno) {
			Deno.test(name2, func2);
		}
		else {

			// Add to rootTest tree.
			let path = name.split(/\./g);
			let pathSoFar = [];
			let test = this.rootTest;
			for (let item of path) {
				pathSoFar.push(item);

				if (!test.children)
					test.children = {};

				// If at leaf
				if (pathSoFar.length === path.length)
					test.children[item] = new Test(name2, desc2, func2);

				// Create test if it doesn't exist.
				else {
					test.children[item] = test.children[item] || new Test(pathSoFar.join('.'));
					test = test.children[item];
				}
			}
		}
	},

	// Internal functions:

	shortenError(error, br='<br>&nbsp;&nbsp;') {
		// slice(0, -3) to remove the 3 stacktrace lines inside Testimony.js that calls runtests.
		let errorStack = error.stack.split(/\n/g).slice(0, -3).join('\r\n');

		errorStack = errorStack.replace(/\r?\n/g, br);
		return errorStack.replace(new RegExp(window.location.origin, 'g'), ''); // Remove server name to shorten error stack.
	},

	/**
	 * Used only when running from the command line.
	 * Define document object to allow us to run all modules from the command line.  */
	async enableJsDom() {
		if (!globalThis.document) {
			await (async () => {
				let { default: jsdom} = await import('https://dev.jspm.io/jsdom');
				globalThis.document = new jsdom.JSDOM(`<!DOCTYPE html>`).window.document;

				/*let module =*/ /*import('https://deno.land/std@0.73.0/testing/asserts.ts');*/

				// Sleep is required for JSDom to resolve its promises before tests begin.
				await new Promise(resolve => setTimeout(resolve, 10));
			})()
		}
	},

}
await Testimony.enableJsDom();


export default Testimony;
export {assert, Testimony, TextRenderer, HtmlRenderer};