import {RefractError} from "./utils.js";
import {WatchUtil} from "./watchProxy.js";

/**
 * Replacement for Watch.js and watchProxy.js that isn't used yet.
 * Motivation:  The existing watch code is too complex to debug. */
export default class Watcher {

	/** @type WeakMap<root:object, string[][]> */
	pathsToMe = new WeakMap();

	/** @type {Proxy} The proxy associated with the object. */
	proxy;

	/** @type {object} The underlying field values associated with the object, before being replaced with Object.defineProperty(). */
	fields;

	/** @type {object} The original object being watched. */
	original;

	/** @type {Map<string, function[]>} Map from csv path string to function to call when a property on this object changes. */
	callbacks = new Map();

	constructor(obj) {
		if (Watcher.byOriginal.has(obj))
			throw new Error();
		this.original = obj;
		this.fields = {...obj};
		this.proxy = new Proxy(obj, proxyHandler);
	}

	/**
	 * @param path {string[]}
	 * @param callback {function} */
	add(path, callback) {
		let cpath = JSON.encode(path).slice(1, -1);

		let callbacks = this.callbacks.get(cpath);
		if (!callbacks)
			this.callbacks.set(cpath, [callback]);
		else
			callbacks.push(callback);
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

/** @type {WeakMap<Proxy, Watcher>} */
Watcher.byProxy = new WeakMap();

/** @type {WeakMap<Object, Watcher>} */
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
			let watcher = Watcher.get(obj);

			// TODO:
			// Make sure the path from the root to the object's field is tracked:
			let roots = WatchUtil.getRoots(obj);
			for (let root of roots) { // Get all paths from the roots to the parent.
				let parentPaths = WatchUtil.getPaths(root, obj);
				for (let parentPath of parentPaths) {

					// Combine each path with the field name.
					WatchUtil.addPath(root, [...parentPath, field], result); // Add to our list of tracked paths.
				}
			}
			// END TODO

			return Watcher.get(result).proxy;
		}

		// 4. A primitive
		return result;
	},

	set(obj, field, newVal) {},

	deleteProperty(obj, field) {}
}