import {WatchUtil} from "../watchProxy.js";
import delve from "../delve.js";

class WatchCallback {

	/** string[] */
	path;

	/** function(action:string, path:string[], newVal, oldVal) */
	callback;

	constructor(path, callback) {
		this.path = path;
		this.callback = callback;
	}
}

/**
 * Replacement for Watch.js and watchProxy.js that isn't used yet.
 * Motivation:  The existing watch code is too complex to debug.
 * What's different this time?
 *
 * This class wraps every name=> value pair when descending along a path.
 * It combines all of the various WeakMaps that used to be all over the place.
 * When we subscribe (add), the subscription is pushed to the bottom-most Watcher's array of callbacks,
 * but with the original path that was subscribed.
 *
 * TODO:
 * Need defineProperty at the top level or else I won't get any notifications.
 * */
export default class Watcher {

	/** @type WeakMap<root:object, string[][]> */
	pathsToMe = new WeakMap();

	/** @type {Proxy} The proxy associated with the object. */
	proxy;

	/** @type {object} The underlying field values associated with the object, before being replaced with Object.defineProperty(). */
	fields;

	/** @type {object} The original object being watched. */
	original;

	/** @type {Map<string, WatchCallback[]>} Map from field name to function to call when a property on this object changes. */
	callbacks = new Map();

	constructor(obj) {
		if (Watcher.byOriginal.has(obj))
			throw new Error();
		this.original = obj;
		this.fields = {...obj}; // Is this used?
		this.proxy = new Proxy(obj, proxyHandler);
	}

	/**
	 * @param obj {Object}
	 * @param path {string[]}
	 * @param callback {function} */
	static add(obj, path, callback) {

		let wc = new WatchCallback(path, callback);

		// TODO: Object.defineProperty()

		// Delve along path to add the subscription to the Watcher for the object at the bottom.
		let watcher = Watcher.get(obj);
		if (path.length > 1) {
			let obj2 = delve(watcher.original, path.slice(0, -1));
			watcher = Watcher.get(obj2);
		}
		let field = path.slice(-1)[0];

		let callbacks = watcher.callbacks.get(field);
		if (!callbacks)
			watcher.callbacks.set(field, [wc]);
		else
			callbacks.push(wc);
	}

	/**
	 * @param obj {Proxy|Object}
	 * @returns {Watcher} */
	static get(obj) {
		if (obj instanceof Proxy)
			return Watcher.byProxy.get(obj);
		else
			return Watcher.byOriginal.get(obj) || new Watcher(obj);
	}

	static getOriginal(obj) {
		if (obj instanceof Proxy)
			return Watcher.byProxy.get(obj).original;
		if (obj instanceof Watcher)
			return obj.original;
		return obj;
	}
}

/** @type {WeakMap<Proxy, Watcher>} Map from proxies to their Watcher instances.*/
Watcher.byProxy = new WeakMap();

/** @type {WeakMap<Object, Watcher>} Map from original objects to their Watcher instances. */
Watcher.byOriginal = new WeakMap();



var proxyHandler = {

	get(obj, field) {
		let result = obj[field];

		// 1. An interator
		// Return the underlying array's iterator, to make for(...of) loops work.
		if (field === Symbol.iterator)
			return result;

		// 2. A function
		// Make sure to call functions on the unproxied version
		// TODO: Intercept array functions here?
		if (typeof result === 'function') {
			let original = Watcher.getOriginal(obj);
			let result = original[field];
			if (result.prototype) // If it's a class and not a regular function, don't bind it to the object:
				return result;
			return result.bind(original);
		}

		// 3. An object
		// We only wrap objects and arrays in proxies.
		// Primitives and functions we leave alone.
		// if (result && typeof result === 'object' && !(result instanceof Node)) {
		if (result && typeof result === 'object') { // isObj() inline to hopefully be faster.

			// Remove any proxies.
			result = Watcher.getOriginal(result);
			return Watcher.get(result).proxy;
		}

		// 4. A primitive
		return result;
	},

	set(obj, field, newVal) {

		let oldVal = obj[field];
		obj[field] = newVal;

		let watcher = Watcher.get(obj);
		for (let callback of watcher.callbacks)
			callback.callback.call('set', callback.path, newVal, oldVal);

		return true; // Proxy requires us to return true.
	},

	deleteProperty(obj, field) {
		let oldVal = obj[field];
		if (Array.isArray(obj))
			obj.splice(field, 1);
		else
			delete obj[field];

		let watcher = Watcher.get(obj);
		for (let callback of watcher.callbacks)
			callback.callback.call('set', callback.path, undefined, oldVal);

		return true; // Proxy requires us to return true.
	}
}