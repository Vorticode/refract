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

/**
 * https://stackoverflow.com/a/6713782/
 * @param x
 * @param y
 * @return {boolean} */
function isSame( x, y ) {
	if ( x === y )
		return true; // if both x and y are null or undefined and exactly the same

	if (!(x instanceof Object) || !(y instanceof Object))
		return false; // if they are not strictly equal, they both need to be Objects

	// they must have the exact same prototype chain, the closest we can do is
	// test their constructor.
	if (x.constructor !== y.constructor)
		return false;

	for (var p in x) {
		if (!x.hasOwnProperty(p))
			continue; // other properties were tested using x.constructor === y.constructor

		if (!y.hasOwnProperty(p))
			return false; // allows to compare x[ p ] and y[ p ] when set to undefined

		if (x[p] === y[p])
			continue; // if they have the same strict value or identity then they are equal


		if (typeof x[p] !== "object")
			return false; // Numbers, Strings, Functions, Booleans must be strictly equal

		if (!isSame(x[p], y[p]))
			return false; // Objects and Arrays must be tested recursively
	}

	for (p in y) // allows x[ p ] to be set to undefined
		if (y.hasOwnProperty(p) && !x.hasOwnProperty(p))
			return false;

	return true;
}

const assertEquals = assert.eq = (expected, actual) => {
	// JUnit, PhpUnit, and mocha all use the order: expected, actual.
	if (!isSame(expected, actual)) {
		if (Testimony.debugOnAssertFail)
			debugger;
		throw new AssertError(expected, actual, '==');
	}
};

const assertTrue = assert.true = actual => {
	if (!actual) {
		if (Testimony.debugOnAssertFail)
			debugger;
		throw new AssertError(actual, true, '==');
	}
};


const assertFalse = assert.false = actual => {
	if (actual) {
		if (Testimony.debugOnAssertFail)
			debugger;
		throw new AssertError(actual, false, '==');
	}
};

const assertStartsWith = assert.startsWith = (haystack, needle) => {
	// JSON.stringify lets us compare content to arbitrary depth
	if (!haystack.startsWith(needle)) {
		if (Testimony.debugOnAssertFail)
			debugger;
		throw new AssertError(haystack, needle, 'startsWith');
	}
};


assert.eqJson = (expected, actual) => {
	if (JSON.stringify(actual) === JSON.stringify(expected))
		return true;

	if (Testimony.debugOnAssertFail)
		debugger;
	throw new AssertError(expected, actual);
};

assert.neq = (val1, val2) => {
	if (val1 !== val2) {
		if (Testimony.debugOnAssertFail)
			debugger;
		throw new AssertError(val1 + ' === ' + val2);
	}
}

assert.lte = (val1, val2) => {
	if (val1 > val2) {
		if (Testimony.debugOnAssertFail)
			debugger;
		throw new AssertError(val1 + ' > ' + val2);
	}
}


let template = document.createElement('template');

/**
 * Create a single html element, node, or comment from the html string.
 * The string will be trimmed so that an element with space before it doesn't create a text node with spaces.
 * @param html {string}*/
function createEl(html) {
	template.innerHTML = html.trim();
	return template.content.removeChild(template.content.firstChild);
}




/**
 * @param obj {object}
 * @param path {string[]}
 * @param createVal {*}  If set, non-existant paths will be created and the deepest value will be set to createVal.*/
function delve(obj, path, createVal='dont_create_value') {
	let create = createVal !== 'dont_create_value';

	if (!obj && !create && path.length)
		return undefined;

	let i = 0;
	for (let srcProp of path) {
		let last = i === path.length-1;

		// If the path is undefined and we're not to the end yet:
		if (obj[srcProp] === undefined) {

			// If the next index is an integer or integer string.
			if (create) {
				if (!last) {
					// If next level path is a number, create as an array
					let isArray = (path[i + 1] + '').match(/^\d+$/);
					obj[srcProp] = isArray ? [] : {};
				}
			}
			else
				return undefined; // can't traverse
		}

		// If last item in path
		if (last && create)
			obj[srcProp] = createVal;

		// Traverse deeper along destination object.
		obj = obj[srcProp];
		i++;
	}

	return obj;
}

function getUrlVar(name, url) { // From stackoverflow.com/a/8764051
	url = url || window.location.href;
	let regex = new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)');
	return decodeURIComponent((regex.exec(url)||[,""])[1].replace(/\+/g, '%20')) || null;
}

var Html = {

	/**
	 * @param input {?string}
	 * @param escapeQuotes {boolean=false}
	 * @returns {?string}*/
	escape(input, escapeQuotes) { // From: stackoverflow.com/a/4835406
		if (input === null || input === undefined)
			input = '';
		else
			input = input + ''; // Make string

		var result = input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		if (escapeQuotes)
			result = result.replace(/"/g, "&quot;").replace(/'/g, "&#039;");
		return result;
	}
}


/**
 * Render the tests and results in a table.
 * TODO: These could be simpler if we used something like a Lite version of Refract, since we're attaching functions? */
var TableRenderer = {

	/**
	 * Create a tr group for a test as well as a second tr that contains a table for sub-tests.
	 * @param name {string}
	 * @param level {int}
	 * @returns {[HTMLTableRowElement, HTMLTableRowElement]} */
	createGroup(name, level) {

		// 1.  Create two tr rows.
		let trs =  [

			// Label for group and status of whole group.
			createEl(`
				<tr data-name="${name}" class="group">
					<td>
						<label class="expand" style="user-select: none; cursor: pointer; ${level===0 ? 'display: none': ''}">
							+
							<input type="checkbox" name="${name}_exp" value="1" style="display: none">
						</label> 
						<label class="enable">
						
							<!-- Checkbox --> 
							[<span style="color: #55f; font-weight: bold; text-shadow: 1px 0 0 #55f">x</span><input 
							type="checkbox" style="display: none">] 
							
							<!-- Status -->
							<span class="status" style="line-height: 1; display: inline-block; width: 7.7px">&nbsp;</span> 

							${name}</label>&nbsp;&nbsp;</td>
					<td class="status"></td>
				</tr>`),

			// Container for children
			createEl(`
				<tr class="testGroup">
					<td colspan="2">
						<table style="margin-left: ${level ? 7.7*4 : 7.7*2}px"></table>
					</td>
				</tr>`)
		];

		// 2a. Checkbox initial state
		let checkbox = trs[0].querySelector('.enable > input');
		setTimeout(() => { // wait till children are populated.
			let descendantTests = Array.from(trs[1].querySelectorAll('tr.test')); // only the tests, not all trs
			let checked = descendantTests.reduce(
				(a, b) =>
					(a===true || a && a.isChecked()) && (b===true || b && b.isChecked())
				, true);
			TableRenderer.setEnabledChecked(trs[0], checked);
		}, 0);


		// 2b. Checkbox change event
		checkbox.addEventListener('change', () => {
			TableRenderer.setEnabledChecked(trs[0], checkbox.checked);

			// Set children checked:
			trs[1].querySelectorAll('tr.group, tr.test').forEach((tr) => {
				// Only check it if no part of the path starts with an underscore.
				// But always uncheck it.
				let hasUnderscore = tr.getAttribute('data-name').split(/\./g).filter(x=>x.startsWith('_')).length;
				if (!hasUnderscore || !checkbox.checked)
					TableRenderer.setEnabledChecked(tr, checkbox.checked);
			});
		});

		// 2a. Expand initial state
		let expand = trs[0].querySelector('.expand > input');
		expand.checked = level === 0 || !!getUrlVar(name + '_exp'); // always expand level 0.
		expand.previousSibling.textContent = expand.checked ? '-' : '+';
		trs[1].style.display = expand.checked ? '' : 'none';

		// 3b. Expand button change event
		expand.addEventListener('change', () => {
			expand.previousSibling.textContent = expand.checked ? '-' : '+';
			trs[1].style.display = expand.checked ? '' : 'none';

			// Minimizing also minimizes children.  Doesn't work right.
			// if (!expand.checked) // Untested
			// 	for (let tr of trs[1].querySelectorAll('tr.group')) {
			// 		let expand2 = tr.querySelector('label.expand');
			// 		expand2.checked = false;
			// 		expand2.previousSibling.textContent = '-';
			// 		tr.style.display = 'none';
			// 	}
		});

		return trs;
	},

	/**
	 * Create a table row with the name of a test, its checkbox, and a place to later print its status.
	 * @param test {Test}
	 * @returns {[HTMLTableRowElement, HTMLTableRowElement]} */
	createTest(test) {
		let baseName = test.name.slice(test.name.lastIndexOf('.')+1); // todo get name after last .
		let tr = createEl(`
			<tr data-name="${test.name}" class="test">
				<td><label class="enable">&nbsp;
				
					<!-- Checkbox --> 
					[<span style="color: #55f; font-weight: bold; text-shadow: 1px 0 0 #55f">x</span><input 
						type="checkbox" name="${test.name}" value="1" style="display: none">]
						
					<!-- Status -->
					<span class="status" style="line-height: 1; display: inline-block; width: 7.7px">&nbsp;</span> 

					${baseName}</label>&nbsp;&nbsp;</td>
				<td class="message"><span style="opacity: .5">${test.desc}</span></td>
			</tr>`);

		// Activate checkbox
		let checkbox = tr.querySelector('input');
		let updateXBox = () => checkbox.previousElementSibling.style.opacity = checkbox.checked ? '1' : '0';
		tr.isChecked = () => checkbox.checked;

		tr.setChecked = (status) => {
			checkbox.checked = status;
			updateXBox();
		}
		checkbox.addEventListener('change', updateXBox);
		tr.setChecked(!!getUrlVar(test.name));

		return tr;
	},

	/**
	 * Print the result of starting a test.
	 * @param el {HTMLElement} The element where the test status should be printed.
	 * @param result {boolean|AssertError|Error}*/
	insertTestResult(el, result) {
		if (result === true)
			return;

		if (result instanceof AssertError) {

			let line = result.stack.split(/\n/g)[2].match(/\((.*?)\)/)[1].slice(window.location.origin.length+1);

			let expected = Html.escape(JSON.stringify(result.expected));
			let actual = Html.escape(JSON.stringify(result.actual));
			el.innerHTML = `
				<span style="color: #666">${line} (${result.op})</span><br>
				<span style="color: #666; white-space: pre-wrap"><b style="color: #999">Actual:</b> &nbsp; ${actual}<br><b style="color: #999">Expected:</b> ${expected}</span>`;
		}
		else if (result instanceof Error) {
			let errorStack = Testimony.shortenError(result);
			el.innerHTML = `				
				<div style="color: #666">${errorStack}</div>`;
		}
		else
			el.innerHTML = JSON.stringify(result);
	},

	setEnabledChecked(tr, checked) {
		let checkbox = tr.querySelector('.enable > input');
		checkbox.checked = checked;
		checkbox.previousElementSibling.style.opacity = checked ? '1' : '0';
	}

};

class Test {
	constructor(name, desc, fn) {
		this.name = name;
		this.desc = desc;
		this.fn = fn;
	}
}


var Testimony = {

	debugOnAssertFail: false,
	throwOnFail: false, // throw from original location on assert fail or error.
	expandLevel: 2,

	/**
	 * A flat object of full test name -> test object.
	 * @type Object<string, Object<string, *> */
	tests: {},

	render: TableRenderer,

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

		// Create elements for html
		if (html2) {
			let oldFunc = func2;
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

		Testimony.tests[name2] = new Test(name2, desc2, func2);
	},

	/**
	 * @returns {Object<string, object|Test>} */
	getTestTree() {
		let result = {};
		for (let name in Testimony.tests)
			delve(result, name.split(/\./g), Testimony.tests[name]);
		return {AllTests: result};
	},

	async runTests(parentEl, tree=undefined, level=0) {

		if (!tree)
			tree = Testimony.getTestTree();

		for (let name in tree) {
			let trs = []
			let test = tree[name];

			// A test
			if (test instanceof Test) {

				trs = [Testimony.render.createTest(test)];

				if (!!getUrlVar(test.name)) {
					let statusEl = trs[0].querySelector('.status');
					let messageEl = trs[0].querySelector('.message');

					// Timeout, so we can print test table before throwing errors.
					setTimeout(async () => {

						statusEl.innerHTML = '<span style="color: red">✗</span>';

						let result = true;
						if (Testimony.throwOnFail) {
							result = result = test.fn();
							if (result instanceof Promise)
								result = await result;
							if (result === undefined)
								result = true;
						} else {
							try {
								result = test.fn();
								if (result instanceof Promise)
									await result;
								if (result === undefined)
									result = true;
							} catch (e) {
								result = e;
							}
						}

						statusEl.innerHTML = result===true
							? '<span style="color: #0f0">✓</span>'
							: '<span style="color: red">✗</span>';
						Testimony.render.insertTestResult(messageEl, result);
					}, 0);
				}

			// Group header for a test
			} else {
				trs = Testimony.render.createGroup(name, level)
				let table = trs[1].querySelector('table');
				await Testimony.runTests(table, test, level+1); // recurse
			}

			parentEl.append(...trs);
		}
	},


	/**
	 * @deprecated for makeDoc()
	 * Use an iframe to create a document.
	 * @param html {string}
	 * @param callback {function(Document)} */
	async mockDoc(html, callback) {
		if (!html.includes('<head'))
			html = `<html lang="en"><head><meta charset="uft8"><title></title></head><body>${html}</body></html>`;

		var iframe = document.createElement('iframe');
		iframe.style.display = 'none';
		document.body.append(iframe);

		var doc = iframe.contentDocument || iframe.contentWindow.document;
		doc.open();
		doc.write(html);
		doc.close();

		await callback(doc);
		iframe.parentNode.removeChild(iframe);
	},

	/** @deprecated for passing html to the regular test() function. */
	mockElement(html, callback) {
		let el = createEl('<div>' + html + '</div>').firstChild;
		document.body.append(el);
		callback(el, el.ownerDocument);
		document.body.removeChild(el);
	},




	// Internal functions:

	shortenError(error) {
		// slice(0, -3) to remove the 3 stacktrace lines inside Testimony.js that calls runtests.
		let errorStack = error.stack.split(/\n/g).slice(0, -3).join('\r\n');

		errorStack = errorStack.replace(/\r?\n/g, '<br>&nbsp;&nbsp;');
		return errorStack.replace(new RegExp(window.location.origin, 'g'), ''); // Remove server name to shorten error stack.
	},

	/**
	 * Used only when running from the command line.
	 * Define document object to allow us to run all modules from the command line.  */
	enableJsDom() {
		if (!globalThis.document) {
			(async () => {
				let { default: jsdom} = await import('https://dev.jspm.io/jsdom');
				globalThis.document = new jsdom.JSDOM(`<!DOCTYPE html>`).window.document;
				/*let module =*/ import('https://deno.land/std@0.73.0/testing/asserts.ts');

				// Sleep is required for JSDom to resolve its promises before tests begin.
				await new Promise(resolve => setTimeout(resolve, 10));
			})()
		}
	},

}

function makeDoc(html) {
	return `<html lang="en"><head><meta charset="uft8"><title></title></head><body>${html}</body></html>`
}


// Emulate the Deno.test() function
if (!globalThis.Deno)
	globalThis.Deno = {test: Testimony.test};
export default Testimony;
export {assert, assertEquals, assertStartsWith, assertTrue, assertFalse, makeDoc, Testimony};