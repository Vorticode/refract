import Watch from "../watch/Watch.js";

//#IFDEV
var assert = expr => {
	if (!expr) {
		debugger;
		throw new Error('Assert failed');
	}
};
export {assert};
//#ENDIF


export default {

	/**
	 * Return a slice from the beginning of the string up until any item from limiters is found.
	 * @param string {string}
	 * @param limiters {string|string[]}
	 * @param offset {int=}
	 * @return {string} */
	munchUntil_(string, limiters, offset) {
		if (typeof limiters === 'string')
			limiters = [limiters];
		offset = offset || 0;
		var limitersLength = limiters.length; // probably makes no difference?
		for (let i=offset; i<string.length; i++)
			for (let j=0; j<limitersLength; j++) {
				let limiter = limiters[j];
				if (string.slice(i, i+limiter.length) === limiter) // inline startsWith()
					return string.slice(i); // Return the string up until the limiter.
			}
		return string;
	},

	removeProxy(obj) {
		return (obj && obj.$removeProxy) || obj;
	},



	/**
	 * Operates recursively to remove all proxies.
	 * TODO: This is used by watchproxy and should be moved there?
	 * @param obj {*}
	 * @param visited {WeakSet=} Used internally.
	 * @return {*} */
	removeProxies(obj, visited) {
		if (obj === null || obj === undefined)
			return obj;

		if (obj.$isProxy) {
			obj = obj.$removeProxy;

			//#IFDEV
			if (obj.$isProxy) // If still a proxy.  There should never be more than 1 level deep of proxies.
				throw new Error("Double wrapped proxy found.");
			//#ENDIF
		}

		if (typeof obj === 'object') {
			if (!visited)
				visited = new WeakSet();
			else if (visited.has(obj))
				return obj; // visited this object before in a cyclic data structure.
			visited.add(obj);

			// Recursively remove proxies from every property of obj:
			for (let name in Object.keys(obj)) { // Don't mess with inherited properties.  E.g. defining a new outerHTML.
				let t = obj[name];
				let v = this.removeProxies(t, visited);

				// If a proxy was removed from something created with Object.defineOwnProperty()
				if (v !== t) {
					if (Object.getOwnPropertyDescriptor(obj, name).writable) // we never set writable=true when we defineProperty.
						obj[name] = v;
					else {
						// It's a defined property.  Set it on the underlying object.
						let wp = Watch.objects.get(obj);
						let node = wp ? wp.fields_ : obj;
						node[name] = v
					}
				}
			}
		}
		return obj;
	},

	arrayEq_(a, b) {
		if (a.length !== b.length)
			return false;
		for (let i = 0; i < a.length; i++)
			if (a[i] !== b[i])
				return false;
		return true;
	},

	arrayStartsWith_(haystack, prefix) {
		for (let i=0; i<prefix.length; i++)
			if (haystack[i] !== prefix[i]) // will be undefined if prefix is longer than haystack, and that will still work.
				return false;
		return true;
	},


	/**
	 * Find object values by keys that start with prefix.
	 * @param obj {object}
	 * @param prefix {string}
	 * @return {boolean} */
	hasKeyStartingWith_(obj, prefix) {
		for (let key in obj)
			if (key.startsWith(prefix))
				return true;
		return false;
	},

	toString(val) {
		if (val === undefined || val === null)
			return '';
		return val+'';
	},

	unescapeTemplate_(text) {
		return text.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
	},


	/**
	 * When the input's value changes, call the callback with the new, typed value.
	 * @param el {HTMLInputElement|HTMLElement}
	 * @param callback {function(val:*, Event)}	 */
	watchInput_(el, callback) {
		let tagName = el.tagName;
		let isContentEditable = el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false';
		let isTextArea = tagName==='TEXTAREA';

		let useInputEvent = isTextArea || isContentEditable || (
			tagName === 'INPUT' &&
			!['button', 'color', 'file', 'hidden', 'image', 'radio', 'reset', 'submit'].includes(el.getAttribute('type'))
		);

		// It's better to do it on input than change, b/c input fires first.
		// Then if user code adds and event listener on input, this one will fire first and have the value already set.
		if (useInputEvent) { // TODO: Input type="number" is typable but also dispatches change event on up/down click.
			el.addEventListener('input', e=> {
				let type = el.getAttribute('type') || '';

				// Convert input type="number" to a float.
				let val = isContentEditable ? el.innerHTML : el.value;
				if (type === 'number' || type === 'range')
					val = parseFloat(val);
				else if (type === 'datetime-local' || type === 'datetime')
					val = new Date(val);
				else if (el.type === 'checkbox')
					val = el.checked;

				callback(val, e);

			}, true); // We bind to the event capture phase, so we can update values before it calls onchange and other event listeners added by the user.
		}
		else {
			el.addEventListener('change', e => {
				// TODO: Convert value to boolean for checkbox.  File input type.
				let val;
				if (tagName === 'SELECT' && el.hasAttribute('multiple'))
					val = Array.from(el.children).filter(el => el.selected).map(opt => opt.value);
				else
					val = isContentEditable ? el.innerHTML : el.value;

				callback(val, e);


			}, true);
		}
	}
}


/**
 * Return the array as a quoted csv string.
 * @param array {string[]}
 * @return {string} */
var csv = array => JSON.stringify(array).slice(1, -1); // slice() to remove starting and ending [].


/**
 * @param obj {*}
 * @return {boolean} */
var isObj = obj => obj && typeof obj === 'object'; // Make sure it's not null, since typof null === 'object'.


export { csv, isObj };