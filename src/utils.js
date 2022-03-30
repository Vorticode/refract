
//#IFDEV
class RefractError extends Error {
	constructor(msg) {
		super(msg);
	}
}
//#ENDIF


/** @deprecated */
var removeProxy = obj => (obj && obj.$removeProxy) || obj;



export default {

	removeProxy(obj) {
		return (obj && obj.$removeProxy) || obj;
	},

	arrayEq(a, b) {
		if (a.length !== b.length)
			return false;
		for (let i = 0; i < a.length; i++)
			if (a[i] !== b[i])
				return false;
		return true;
	},

	arrayStartsWith(haystack, prefix) {
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

	unescapeTemplate(text) {
		return text.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
	},


	/**
	 * When the input's value changes, call the callback with the new, typed value.
	 * @param el {HTMLInputElement|HTMLElement}
	 * @param callback {function(val:*, event)}	 */
	watchInput(el, callback) {
		let tagName = el.tagName;
		let isContentEditable =el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false';
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


/**
 * Operates recursively to remove all proxies.
 * TODO: This is used by watchproxy and should be moved there?
 * @param obj {*}
 * @param visited {WeakSet=} Used internally.
 * @return {*} */
var removeProxies = (obj, visited) => {
	if (obj === null || obj === undefined)
		return obj;

	if (obj.$isProxy) {
		obj = obj.$removeProxy;

		//#IFDEV
		if (obj.$isProxy) // If still a proxy.  There should never be more than 1 level deep of proxies.
			throw new RefractError("Double wrapped proxy found.");
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
			let v = removeProxies(t, visited);

			// If a proxy was removed from something created with Object.defineOwnProperty()
			if (v !== t) {
				if (Object.getOwnPropertyDescriptor(obj, name).writable) // we never set writable=true when we defineProperty.
					obj[name] = v;
				else {
					// It's a defined property.  Set it on the underlying object.
					let wp = watch.objects.get(obj);
					let node = wp ? wp.fields_ : obj;
					node[name] = v
				}
			}
		}
	}
	return obj;
};

export { csv, isObj };
//#IFDEV
export { RefractError }
//#ENDIF

export { removeProxy, removeProxies };