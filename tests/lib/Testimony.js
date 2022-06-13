/**
 * Provide functionality for running Deno tests in a web browser.
 * TODO:
 * 4.  Integrate with IntelliJ file watcher so we run cmd line tests when files change.
 * 5.  Run tests from @expect doc tags.
 * 6.  Documentation - Web tests, deno tests, intellij integration
 * 7.  Add to github.
 * 8.  Command line via node
 * 9.  Support other Deno options.
 * 10. Php version
 * 11. URLs only mark which tests to include or exclude, to make url shorter
 */

class AssertError extends Error {
	constructor(actual, expected, op) {
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

const assertEquals = assert.eq = (actual, expected) => {
	// JSON.stringify lets us compare content to arbitrary depth
	if (actual !== expected && JSON.stringify(actual) !== JSON.stringify(expected)) {
		if (Testimony.debugOnAssertFail)
			debugger;
		throw new AssertError(actual, expected, '==');
	}
};

const assertStartsWith = assert.startsWith = (actual, expected) => {
	// JSON.stringify lets us compare content to arbitrary depth
	if (!actual.startsWith(expected)) {
		if (Testimony.debugOnAssertFail)
			debugger;
		throw new AssertError(actual, expected, 'startsWith');
	}
};


assert.eqDeep = (actual, expected) => {
	if (actual === expected)
		return true;
	if (JSON.stringify(actual) === JSON.stringify(expected))
		return true;

	if (Testimony.debugOnAssertFail)
		debugger;
	throw new AssertError(actual, expected);
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
							<span class="status" style="line-height: 1">&nbsp;</span> 

							${name}</label>&nbsp;&nbsp;</td>
					<td class="status"></td>
				</tr>`),

			// Container for children
			createEl(`
				<tr class="testGroup">
					<td colspan="2">
						<table style="margin-left: 31px"></table>
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

			// Minimizing also minimizes children:
			if (!expand.checked) // Untested
				for (let tr of trs[1].querySelectorAll('tr.group')) {
					let expand2 = tr.querySelector('label.expand');
					expand2.checked = false;
					expand2.previousSibling.textContent = '-';
					tr.style.display = 'none';
				}
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
					<span class="status" style="line-height: 1">&nbsp;</span> 

					${baseName}</label>&nbsp;&nbsp;</td>
				<td class="message"></td>
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
	constructor(name, fn) {
		this.name = name;
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

	shortenError(error) {
		// slice(0, -3) to remove the 3 stacktrace lines inside Testimony.js that calls runtests.
		let errorStack = error.stack.split(/\n/g).slice(0, -3).join('\r\n');

		errorStack = errorStack.replace(/\r?\n/g, '<br>&nbsp;&nbsp;');
		return errorStack.replace(new RegExp(window.location.origin, 'g'), ''); // Remove server name to shorten error stack.
	},



	/**
	 * Add a test.
	 * @param name {string}
	 * @param func {function|Object} */
	test(name, func) {

		if (typeof func === 'function')
			Testimony.tests[name] = new Test(name, func);
		else
			Testimony.tests[name] = new Test(func.name, func.fn);
	},

	/**
	 * @returns {Object<string, object|Test>} */
	getTestTree() {
		let result = {};
		for (let name in Testimony.tests)
			delve(result, name.split(/\./g), Testimony.tests[name]);
		return {'AllTests': result};
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

	mockElement(html, callback) {
		let el = createEl('<div>' + html + '</div>').firstChild;
		document.body.appendChild(el);
		callback(el, el.ownerDocument);
		document.body.removeChild(el);
	}

}


// Emulate the Deno.test() function
if (!globalThis.Deno)
	globalThis.Deno = {test: Testimony.test};
export default Testimony;
export {assert, assertEquals, assertStartsWith, Testimony};