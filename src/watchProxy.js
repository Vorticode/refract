import {removeProxies, isObj, removeProxy, RefractError} from './utils.js';

/**
 * @property object.$isProxy
 * @property object.$removeProxy
 * @property object.$trigger
 * */

{

let arrayRead = ['indexOf', 'lastIndexOf', 'includes'];
let arrayWrite = ['push', 'pop', 'splice', 'shift', 'sort', 'reverse', 'unshift'];
// TODO What about array copy functions, like slice() and flat() ?  Currently they just remove the proxy.

/**
 * Handler object used when calling WatchUtil.getProxy() */
let handler = {
	/**
	 * Overridden to wrap returned values in a Proxy, so we can see when they're changed.
	 * And to keep track of the path as we traverse deeper into an object.
	 * @param obj {Array|object}
	 * @param field {string} An object key or array index.
	 * @returns {*} */
	get(obj, field) {

		// Special properties
		if (field[0] === '$') {
			if (field === '$removeProxy') // most common paths first.
				return obj;
			if (field === '$isProxy')
				return true;
			if (field === '$trigger') {
				return (path) => {
					let roots = WatchUtil.getRoots(obj);
					for (let root of roots)
						for (let callback of WatchUtil.getCallbacks(root))
							callback('set', path || [], obj);

					return roots;
				}
			}

			// Debugging functions
			//#IFDEV
			if (field === '$roots')
				return WatchUtil.getRoots(obj);
			if (field === '$subscribers') {
				return Array.from(WatchUtil.getRoots(obj))
					.map((x) => x.callbacks_)
					.reduce((a, b) => [...a, ...b])
					.map((x) => x('info'))
					.reduce((a, b) => [...a, ...b])
			}
			//#ENDIF
		}


		let result = obj[field];


		// Return the underlying array's iterator, to make for(...of) loops work.
		if (field === Symbol.iterator)
			return result;

		// Make sure to call functions on the unproxied version
		if (typeof result === 'function') {
			let obj2 = obj.$removeProxy || obj;
			let result = obj2[field];
			if (result.prototype) // If it's a class and not a regular function, don't bind it to the object:
				return result;
			return result.bind(obj2);
		}

		// We only wrap objects and arrays in proxies.
		// Primitives and functions we leave alone.
		// if (result && typeof result === 'object' && !(result instanceof Node)) {
		if (result && typeof result === 'object') { // isObj() inline to hopefully be faster.

			// Remove any proxies.
			result = result.$removeProxy || result;
			//#IFDEV
			if (result.$isProxy)
				throw new RefractError("Double wrapped proxy found.");
			//#ENDIF

			// Make sure the path from the root to the object's field is tracked:
			let roots = WatchUtil.getRoots(obj);
			for (let root of roots) { // Get all paths from the roots to the parent.
				let parentPaths = WatchUtil.getPaths(root, obj);
				for (let parentPath of parentPaths) {

					// Combine each path with the field name.
					WatchUtil.addPath(root, [...parentPath, field], result); // Add to our list of tracked paths.
				}
			}

			return WatchUtil.getProxy(result);
		}
		return result;
	},

	/**
	 * Trap called whenever anything in an array or object is set.
	 * Changing and shifting array values will also call this function.
	 * @param obj {Array|object} root or an object within root that we're setting a property on.
	 * @param field {string} An object key or array index.
	 * @param newVal {*}
	 * @returns {boolean} */
	set(obj, field, newVal) {

		// Don't allow setting proxies on underlying obj.
		// This removes them recursively in case of something like newVal=[Proxy(obj)].
		let oldVal = obj[field];

		newVal = removeProxies(newVal);

		// Set the value.
		// TODO: This can trigger notification if field was created on obj by defineOwnProperty().  But that seems to be ok?
		// Should I use .$disableWatch?
		//let setter = Object.getOwnPropertyDescriptor(obj, field).set;
		obj[field] = newVal;

		// Find all callbacks.
		let paths = handler.getWatchedPaths(obj, field);

		// Call callbacks.
		for (let rootAndPath of paths) {
			let callbacks = WatchUtil.getCallbacks(rootAndPath[0]);
			for (let callback of callbacks)
				callback('set', rootAndPath[1], newVal, oldVal, rootAndPath[0]);
		}


		return true; // Proxy requires us to return true.
	},

	/**
	 * Find all paths to the objects field from every root object.
	 * @param obj {object}
	 * @param field {string}
	 * @returns {[object, string][]} Array of root object and watched path. */
	getWatchedPaths(obj, field) {
		let roots = WatchUtil.getRoots(obj);
		let paths = [];
		for (let root of roots) { // Notify
			let parentPaths = WatchUtil.getPaths(root, obj);
			for (let parentPath of parentPaths) {
				let path = [...parentPath, field];
				paths.push([root, path]);
			}
		}
		return paths;
	},

	/**
	 * Trap called whenever anything in an array or object is deleted.
	 * @param obj {Array|object} root or an object within root that we're deleting a property on.
	 * @param field {int|string} An object key or array index.
	 * @returns {boolean} */
	deleteProperty(obj, field) {
		if (Array.isArray(obj))
			obj.splice(field, 1);
		else
			delete obj[field];

		let roots = WatchUtil.getRoots(obj);
		for (let root of roots) {
			let parentPaths = WatchUtil.getPaths(root, obj);
			for (let parentPath of parentPaths) {
				let path = [...parentPath, field];
				for (let callback of WatchUtil.getCallbacks(root))
					callback('set', path, /*, undefined*/);
			}
		}

		return true; // Proxy requires us to return true.
	}
};






var WatchUtil = {
	/** @type {WeakMap<Object, Proxy>} Map from an object to the Proxy of itself. */
	proxies: new WeakMap(),

	/** @type {WeakMap<Object, Set<Object>>} A map from an object to all of its root objects that have properties pointing to it.. */
	roots: new WeakMap(),


	/** @type {WeakMap<Object, function[]>} A map from roots to the callbacks that should be called when they're changed.. */
	callbacks: new WeakMap(),

	/**
	 * A map of all paths from a root to an object.
	 * Outer WeakMap is indexed by root, inner by object.
	 * @type {WeakMap<Object, WeakMap<Object, string[][]>>} */
	paths: new WeakMap(),


	/**
	 * Get or create proxy for an object.
	 * An object will never have more than one proxy.
	 * @returns {Proxy} */
	getProxy(obj) {
		let proxy = WatchUtil.proxies.get(obj);
		if (!proxy) {

			WatchUtil.proxies.set(obj, proxy = new Proxy(obj, handler));

			if (Array.isArray(obj)) {

				// Because this.proxy_ is a Proxy, we have to replace the functions
				// on it in this special way by using Object.defineProperty()
				// Directly assigning this.proxy_.indexOf = ... calls the setter and leads to infinite recursion.
				for (let func of arrayRead) // TODO: Support more array functions.

					Object.defineProperty(proxy, func, {
						enumerable: false,
						get: () => // Return a new version of indexOf or the other functions.
							(item) => Array.prototype[func].call(obj, removeProxy(item))
					});

				/*
				 * Intercept array modification functions so that we only send one notification instead
				 * of a notification every time an array item is moved (shift, unshift, splice) or the length changes. */
				for (let func of arrayWrite)
					Object.defineProperty(proxy, func, {
						configurable: true,
						enumerable: false,

						// Return a new version of push or the other array functions.
						get: () => (...args) => WatchUtil.arrayFunction(obj, func, args)
					});
			}
		}

		return proxy;
	},

	/**
	 * Call a function that modifies the array, and notify all watches of the changes.
	 * TODO: It'd be better to simply update the proxied array's prototype to point to a WatchedArray class
	 * that overrides each of these methods to notify.
	 * @param array {Array} Array the function is called upon.
	 * @param func {string} Name of the function to call.
	 * @param args {*[]} Arguments passed to the function.
	 * @returns {*} The return value of func.  */
	arrayFunction(array, func, args) {
		let originalLength = array.length;
		let startIndex = 0;
		if (func === 'push')
			startIndex = originalLength;
		else if (func === 'pop')
			startIndex = originalLength - 1;
		else if (func === 'splice') // Splice's first argument can be from the beginning or from the end.
			startIndex = args[0] < 0 ? originalLength - args[0] : args[0];


		// Apply array operations on the underlying watched object, so we don't notify a jillion times.
		let result = Array.prototype[func].apply(array, args);

		// Rebuild the array indices inside the proxy objects.
		// This is covered by the test Watch.arrayShift2()
		// TODO: This can be faster if we only update the affected array elements.
		if (['splice', 'shift', 'sort', 'reverse', 'unshift'].includes(func)) { // ops that modify within the array.
			WatchUtil.rebuildArray(array, startIndex, null, null);
		}

		// Trigger a notification for every array element changed, instead of one for every sub-operation.
		// Copy the set b/c otherwise it can grow continuously and never finish if we call Watch.add() and Watch.remove()
		// From loop items.
		let roots = Array.from(WatchUtil.getRoots(array));
		for (let root of roots) {
			let parentPaths = WatchUtil.getPaths(root, array);

			for (let callback of WatchUtil.getCallbacks(root))

				for (let parentPath of parentPaths) {
					if (func === 'pop') // Remove from end
						callback('remove', [...parentPath, startIndex+''], result, null, root);
					else if (func === 'shift') // Remove from beginning
						callback('remove', [...parentPath, '0'], result, null, root);
					else if (func === 'unshift') // Add to beginning
						callback('insert', [...parentPath, '0'], array[0], null, root);
					else if (func === 'splice') {
						let remove = args[1];
						let insert = args.length - 2;
						let set = Math.min(insert, remove);

						// First set the overlapping ones, then insert or remove.
						for (i = 0; i<set; i++)
							callback('set', [...parentPath, (startIndex + i) + ''], array[startIndex + i], null, root);


						if (insert > remove)
							for (i = set; i<insert; i++) // insert new ones
								callback('insert', [...parentPath, (startIndex+i) + ''], array[startIndex+i], null, root);

						else if (insert < remove)
							for (i=remove-1; i>=set; i--) // remove old ones, in reverse for better performance.
								callback('remove', [...parentPath, (startIndex+i)+''], result[i-set+1], null, root);
					}
					else { // push, sort, reverse
						for (var i = startIndex; i < array.length; i++) {
							// if (window.debug)
							// 	debugger;
							callback('set', [...parentPath, i + ''], array[i], null, root);
						}
						for (i; i<originalLength; i++)
							callback('delete', [...parentPath, i + ''], null, root);
					}
				}
		}

		return result;
	},

	/**
	 * For item, find all proxyRoots and update their paths such that they end with path.
	 * Then we recurse and do the same for the children, appending to path as we go.
	 * Ths effectively lets us update the path of all of item's subscribers.
	 * This is necessary for example when an array is spliced and the paths after the splice need to be updated.
	 * @param obj {Object|*[]}
	 * @param startIndex {int?} If set, only rebuild array elements at and after this index.
	 * @param path {string[]=}
	 * @param visited {WeakSet=} */
	rebuildArray(obj, startIndex, path, visited) {
		path = path || [];
		visited = visited || new WeakSet();
		if (startIndex === undefined)
			startIndex = 0;

		if (visited.has(obj))
			return;
		visited.add(obj);

		if (path.length) {

			let roots = WatchUtil.roots.get(obj);
			if (!roots) // because nothing is watching this array element.
				return;

			for (let root of roots) {
				let parentPaths = WatchUtil.getPaths(root, obj);
				for (let i in parentPaths) {
					let oldPath = parentPaths[i];

					// Swap end of oldPath with the new path if the new path  points from root to obj.
					let start = oldPath.length - path.length;
					if (start >= 0) {

						// Create the newPath.
						let newPath = oldPath.slice();
						for (let j = start; j < oldPath.length; j++)
							newPath[j] = path[j - start];


						// See if newPath is a valid path from root to obj.
						let item = root;
						for (let field of newPath) {
							item = item[field];
							if (!item)
								break;
						}

						// Update the path.
						if (item === obj)
							parentPaths[i] = newPath;
					}
				}
			}
		}


		// Recurse through children to update their paths too.
		// This is tested by the arrayShiftRecurse() test.
		if (Array.isArray(obj))
			for (let i=startIndex; i<obj.length; i++) {
				if (Array.isArray(obj[i]) || isObj(obj[i]))
					WatchUtil.rebuildArray(obj[i], 0, [...path, i+''], visited);
			}
		else if (isObj(obj))
			for (let i in obj)
				if (Array.isArray(obj[i]) || isObj(obj[i]))
					WatchUtil.rebuildArray(obj[i], 0, [...path, i+''], visited);
	},

	/**
	 * Get all roots that have paths to obj.
	 * @param obj
	 * @returns {Set.<Object>|Array} An iterable list. */
	getRoots(obj)	{
		obj = obj.$removeProxy || obj;
		return WatchUtil.roots.get(obj) || [];
	},

	/**
	 * Register a path from root to obj. */
	addPath(root, newPath, obj) {
		obj = obj.$removeProxy || obj;
		root = root.$removeProxy || root;

		//#IFDEV
		// if (newPath.length && !(newPath[0] in root))
		// 	throw new Error("Path doesn't exist");
		// if (root !== obj && !Object.keys(root).length)
		// 	throw new Error("Root has no paths");
		//#ENDIF

		// Add root from obj to path.
		let a = WatchUtil.roots.get(obj);
		if (!a)
			WatchUtil.roots.set(obj, a = new Set()); // Wet and not WeakSet because it must be iterable.
		a.add(root);

		// Get the map from object to paths.
		let objMap = WatchUtil.paths.get(root);
		if (!objMap)
			WatchUtil.paths.set(root, objMap=new WeakMap());

		// Get the paths
		let paths = objMap.get(obj);
		if (!paths)
			objMap.set(obj, [newPath]);

		// Add the path if it isn't already registered.
		// TODO: This could possibly be faster if the javascript Set could index by arrays.
		else {
			for (let existingPath of paths) {

				let l = existingPath.length;
				if (newPath.length < l)
					continue;

				// If the new path begins with existingPath, don't add it.
				// Because now we're just expanding more paths from circular references.
				// Inline version of arrayEq() because it's faster.
				let diff = false;
				for (let i=0; i<l; i++)
					if ((diff = existingPath[i] !== newPath[i]))
						break;
				if (!diff)
					return;
			}
			paths.push(newPath);
		}
	},

	/**
	 * Get all paths from root to obj. */
	getPaths(root, obj) {

		//#IFDEV
		if (root.$isProxy)
			throw new Error("Can't be proxy.");
		//#ENDIF

		// Get the map from object to paths.
		let objMap = WatchUtil.paths.get(root);
		if (!objMap)
			return [];

		// Get the paths
		return objMap.get(obj.$removeProxy || obj) || [];
	},


	/**
	 * @param root {object}
	 * @param callback {function} */
	addCallback(root, callback) {
		root = root.$removeProxy || root;

		let callbacks = WatchUtil.callbacks.get(root);
		if (!callbacks)
			WatchUtil.callbacks.set(root, callbacks=[]);
		callbacks.push(callback);
	},

	getCallbacks(root) {
		root = root.$removeProxy || root;
		return WatchUtil.callbacks.get(root) || [];
	},

	//#IFDEV
	cleanup() {
		WatchUtil.proxies = new WeakMap();
		WatchUtil.roots = new WeakMap();
		WatchUtil.callbacks = new WeakMap();
		WatchUtil.paths = new WeakMap();
	}
	//#ENDIF
};



/**
 * Create a copy of root, where callback() is called whenever anything within object is added, removed, or modified.
 * Monitors all deeply nested properties including array operations.
 * Watches will not extend into HTML elements and nodes.
 * Inspired by: stackoverflow.com/q/41299642
 * @param root {Object}
 * @param callback {function(action:string, path:string[], value:string?)} Action is 'set' or 'delete'.
 *     'insert' and 'remove' operations are for adding or removing elements within arrays.
 * @returns {Proxy} */
var watchProxy = (root, callback) => {
	//#IFDEV
	if (!isObj(root))
		throw new Error('Can only watch objects');
	//#ENDIF

	// Add a path from root to itself, so that when we call WatchUtil.getRoots() on a root, we get an empty path.
	WatchUtil.addPath(root, [], root);

	WatchUtil.addCallback(root, callback);
	return WatchUtil.getProxy(root);
};
}
export default watchProxy;
export { WatchUtil };