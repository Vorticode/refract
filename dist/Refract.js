/**
 * Go into the mode if the string starts with the given regex.
 * @param regex {RegExp|string}
 * @param mode {string}
 * @param callback {?function(string|string[])}
 * @return {function(code:string):([string, int] | undefined)} */
var descendIf = (regex, mode, callback=null) => code => {
	if (regex instanceof RegExp) {
		let match = code.match(regex) || [];
		if (match.length) {
			if (callback)
				callback(match);
			return [match[0], mode];
		}
	}
	else if (code.startsWith(regex)) {// string
		if (callback) // unused here.
			callback(regex);
		return [regex, mode];
	}
};


/**
 * Ascend out of the current mode (to the previous mode) if the string starts with the given regex.
 * @param regex {RegExp|string}
 * @return {function(code:string):([string, int] | undefined)} */
var ascendIf = regex => code => {
	if (regex instanceof RegExp) {
		let match = code.match(regex) || [];
		if (match.length)
			return [match[0], -1];
	}
	else if (code.startsWith(regex))
		return [regex, -1];
};

/**
 * @property object.$isProxy
 * @property object.$removeProxy
 * @property object.$trigger
 * */

{
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
		 * @return {*} */
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
					throw new Error("Double wrapped proxy found.");
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
		 * @return {boolean} */
		set(obj, field, newVal) {

			// Don't allow setting proxies on underlying obj.
			// This removes them recursively in case of something like newVal=[Proxy(obj)].
			let oldVal = obj[field];

			newVal = utils.removeProxies(newVal);

			// New:
			if (oldVal === newVal)
				return true;

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
		 * Find all paths to the object's field from every root object.
		 * @param obj {object}
		 * @param field {string}
		 * @return {[object, string][]} Array of root object and watched path. */
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
		 * @return {boolean} */
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
		/** @type {WeakMap<Object, Proxy>} A map from an object to the Proxy of itself. */
		proxies: new WeakMap(),

		//proxiesReverse: new WeakMap(),

		/** @type {WeakMap<Object, Set<Object>>} A map from an object to all of its root objects that have properties pointing to it. */
		roots: new WeakMap(),


		/** @type {WeakMap<Object, function[]>} A map from roots to the callbacks that should be called when they're changed. */
		callbacks: new WeakMap(),

		/**
		 * A map of all paths from a root to an object.
		 * Outer WeakMap is indexed by root, inner by object.
		 * @type {WeakMap<Object, WeakMap<Object, string[][]>>} */
		paths: new WeakMap(),


		/**
		 * Get or create proxy for an object.
		 * An object will never have more than one proxy.
		 * @return {Proxy} */
		getProxy(obj) {
			let proxy = WatchUtil.proxies.get(obj);
			if (!proxy) {

				WatchUtil.proxies.set(obj, proxy = new Proxy(obj, handler));
				//WatchUtil.proxiesReverse.set(proxy, obj);

				if (Array.isArray(obj)) {
					//debugger;
					//Object.setPrototypeOf(proxy, new ProxyArray()); // This seems to work.

					// Because this.proxy_ is a Proxy, we have to replace the functions
					// on it in this special way by using Object.defineProperty()
					// Directly assigning this.proxy_.indexOf = ... calls the setter and leads to infinite recursion.
					// TODO: Support more array functions.
					Object.defineProperty(proxy, 'indexOf', {
						enumerable: false,
						get: () => // Regular indexOf won't work if some of the items are proxied.
							item => obj.findIndex(a => utils.removeProxy(a) === utils.removeProxy(item))
					});
					Object.defineProperty(proxy, 'lastIndexOf', {
						enumerable: false,
						get: () => // Regular lastIndexOf won't work if some of the items are proxied.
							item => obj.findLastIndex(a => utils.removeProxy(a) === utils.removeProxy(item))
					});
					Object.defineProperty(proxy, 'includes', {
						enumerable: false,
						get: () => // Regular includes won't work if some of the items are proxied.
							item => obj.findIndex(a => utils.removeProxy(a) === utils.removeProxy(item)) !== -1
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
		 * @return {*} The return value of func.  */
		arrayFunction(array, func, args) {
			let originalLength = array.length;
			let startIndex = 0;
			if (func === 'push')
				startIndex = originalLength;
			else if (func === 'pop')
				startIndex = originalLength - 1;
			else if (func === 'splice') { // Splice's first argument can be from the beginning or from the end.
				startIndex = args[0] < 0 ? originalLength - args[0] : args[0];

				if (startIndex < 0 || startIndex + args[1] > array.length)
					throw new Error(`Invalid index ${startIndex}`);
			}


			// Apply array operations on the underlying watched object, so we don't notify a jillion times.
			let result = Array.prototype[func].apply(array, args);

			// Rebuild the array indices inside the proxy objects.
			// This is covered by the test Watch.arrayShift2()
			// TODO: This can be faster if we only update the affected array elements.
			if (['splice', 'shift', 'sort', 'reverse', 'unshift'].includes(func)) { // ops that modify within the array.
				WatchUtil.rebuildArray_(array, startIndex, null, null);
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
		rebuildArray_(obj, startIndex, path, visited) {
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
						WatchUtil.rebuildArray_(obj[i], 0, [...path, i+''], visited);
				}
			else if (isObj(obj))
				for (let i in obj)
					if (Array.isArray(obj[i]) || isObj(obj[i]))
						WatchUtil.rebuildArray_(obj[i], 0, [...path, i+''], visited);
		},

		/**
		 * Get all roots that have paths to obj.
		 * @param obj
		 * @return {Set.<Object>|Array} An iterable list. */
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
			let pointingToObj = WatchUtil.roots.get(obj);
			if (!pointingToObj)
				WatchUtil.roots.set(obj, pointingToObj = new Set()); // Wet and not WeakSet because it must be iterable.
			pointingToObj.add(root);

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
	}; // end WatchUtil



	/**
	 * Create a copy of root, where callback() is called whenever anything within object is added, removed, or modified.
	 * Monitors all deeply nested properties including array operations.
	 * Watches will not extend into HTML elements and nodes.
	 * Inspired by: stackoverflow.com/q/41299642
	 * @param root {Object}
	 * @param callback {function(action:string, path:string[], value:string?)} Action is 'set' or 'delete'.
	 *     'insert' and 'remove' operations are for adding or removing elements within arrays.
	 * @return {Proxy} */
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

/**
 * Follow a path into a object.
 * @param obj {object}
 * @param path {string[]}
 * @param createVal {*}  If set, non-existant paths will be created and value at path will be set to createVal.
 * @param watchless {boolean}
 * @return The value, or undefined if it can't be reached. */
function delve(obj, path, createVal=delve.dontCreate, watchless=false) {
	let create = createVal !== delve.dontCreate;

	if (!obj && !create && path.length)
		return undefined;

	let i = 0;
	for (let srcProp of path) {
		let last = i === path.length - 1;

		if (watchless) {
			obj = obj.$removeProxy || obj;
			if (typeof obj === 'object')
				obj.$disableWatch = true; // sometimes this causes stack overflow?  Perhaps I need to use Object.getOwnPropertyDescriptor() to see if it's a prop?
		}

		// If the path is undefined and we're not to the end yet:
		if (obj[srcProp] === undefined) {

			// If the next index is an integer or integer string.
			if (create) {
				if (!last) {
					// If next level path is a number, create as an array
					let isArray = (path[i + 1] + '').match(/^\d+$/);
					obj[srcProp] = isArray ? [] : {};
				}
			} else {
				delete obj.$disableWatch;
				return undefined; // can't traverse
			}
		}

		// If last item in path
		if (last && create) {
			obj[srcProp] = createVal;
		}

		if (watchless)
			delete obj.$disableWatch;

			// Traverse deeper along destination object.
		obj = obj[srcProp];
		if (watchless) // [below] remove proxy
			obj = (obj!==null && obj !== undefined) ? (obj.$removeProxy || obj) : null;

		i++;
	}

	return obj;
}

delve.dontCreate = {};

/**
 * Allow subscribing only to specific properties of an object.
 * Internally, the property is replaced with a call to Object.defineProperty() that forwards to
 * a proxy created by watchProxy(). */
class WatchProperties {

	constructor(obj) {
		this.obj_ = obj;   // Original object being watched.
		this.fields_ = {}; // Unproxied underlying fields that store the data.
		                   // This is necessary to store the values of obj_ after defineProperty() is called.

		this.proxy_ = watchProxy(this.fields_, this.notify_.bind(this));

		/** @type {Object<string, function>} A map from a path to the callback subscribed to that path. */
		this.subs_ = {};
	}

	/**
	 * When a property or sub-property changes, notify its subscribers.
	 * This is an expanded version of watchproxy.notify.  It also notifies every callback subscribed to a parent of path,
	 * and all children of path if their own value changed.
	 * @param action {string}
	 * @param path {string[]}
	 * @param value {*=}
	 * @param oldVal {*=} */
	notify_(action, path, value, oldVal) {
		if (action === 'info') // Used with the $subscribers meta-property?
			return this.subs_;

		let allCallbacks = this.getAllCallbacks(path, action, value, oldVal);

		// Debugging is easier if I added all callbacks to an array, then called them.
		// It's also necessary to accumulate and call the callbacks this way, because other callbacks can modify the subscribers
		// and cause some subscriptions to be skipped.
		for (let [func, args] of allCallbacks)
			func.apply(this.obj_, args);
	}

	/**
	 * Get all functions that should be called when `action` is performed on `path`.
	 * @param action {string}
	 * @param path {string[]}
	 * @param value {*=}
	 * @param oldVal {*=}
	 * @return {[function(), *[]]} Function and array of arguments to pass to function. */
	getAllCallbacks(path, action, value, oldVal) {
		let result = [];
		let cpath = csv(path);

		// Traverse up the path looking for anything subscribed.
		let parentPath = path.slice(0, -1);
		while (parentPath.length) {
			let parentCPath = csv(parentPath); // TODO: This seems like a lot of work for any time a property is changed.

			if (parentCPath in this.subs_)
				/** @type function */
				for (let callback of this.subs_[parentCPath])
					// "this.obj_" so it has the context of the original object.
					// We set indirect to true, which data-loop's rebuildChildren() uses to know it doesn't need to do anything.
					result.push([callback, [action, path, value, oldVal, this.obj_]]);
			parentPath.pop();
		}

		// Notify at the current level:
		if (cpath in this.subs_)
			for (let callback of this.subs_[cpath])
				result.push([callback, [action, path, value, oldVal, this.obj_]]);

		// Traverse to our current level and downward looking for anything subscribed
		let newVal = delve(this.obj_, path, delve.dontCreate, true);
		for (let name in this.subs_)
			if (name.startsWith(cpath) && name.length > cpath.length) {
				let subPath = name.slice(cpath.length > 0 ? cpath.length + 1 : cpath.length); // +1 for ','
				let oldSubPath = JSON.parse('[' + subPath + ']');

				let oldSubVal = utils.removeProxy(delve(oldVal, oldSubPath, delve.dontCreate, true));
				let newSubVal = utils.removeProxy(delve(newVal, oldSubPath, delve.dontCreate, true));

				if (oldSubVal !== newSubVal) {
					let callbacks = this.subs_[name];
					if (callbacks.length) {
						let fullSubPath = JSON.parse('[' + name + ']'); // Parse as csv
						for (let callback of callbacks)  // [below] "this.obj_" so it has the context of the original object.
							result.push([callback, [action, fullSubPath, newSubVal, oldSubVal, this.obj_]]);
					}
				}
			}
		return result;
	}

	/**
	 *
	 * @param path {string|string[]}
	 * @param callback {function(action:string, path:string[], value:string?)} */
	subscribe_(path, callback) {
		if (path.startsWith) // is string
			path = [path];

		// Create property at top level path, even if we're only watching something much deeper.
		// This way we don't have to worry about overriding properties created at deeper levels.
		let self = this;
		let field = path[0];

		if (!(field in self.fields_)) {

			self.fields_[field] = self.obj_[field];

			// If we're subscribing to something within the top-level field for the first time,
			// then define it as a property that forward's to the proxy.
			delete self.obj_[field];
			Object.defineProperty(self.obj_, field, {
				enumerable: 1,
				configurable: 1,
				get: () => {
					if (self.obj_.$disableWatch)
						return self.fields_[field]
					else
						return self.proxy_[field]
				},
				//set: (val) => self.obj_.$disableWatch ? self.proxy_.$removeProxy[field] = val : self.proxy_[field] = val
				set(val) {
					if (self.obj_.$disableWatch) // used by traversePath to watchlessly set.
						self.proxy_.$removeProxy[field] = val;
					else
						self.proxy_[field] = val;
				}
			});
		}


		// Create the full path if it doesn't exist.
		// TODO: Can this part be removed?
		//delve(this.fields_, path, undefined);


		// Add to subscriptions
		let cpath = csv(path);
		if (!(cpath in self.subs_))
			self.subs_[cpath] = [];
		self.subs_[cpath].push(callback);
	}

	/**
	 *
	 * @param path{string[]|string}
	 * @param {function?} callback Unsubscribe this callback.  If not specified, all callbacks willb e unsubscribed. */
	unsubscribe_(path, callback) {

		// Make sure path is an array.
		if (path.startsWith) // is string
			path = [path];

		// Remove the callback from this path and all parent paths.
		let cpath = csv(path);
		if (cpath in this.subs_) {

			// Remove the callback from the subscriptions
			if (callback) {
				let callbackIndex = this.subs_[cpath].indexOf(callback);
				//#IFDEV
				if (callbackIndex === -1)
					throw new Error('Bad index');
				//#ENDIF
				this.subs_[cpath].splice(callbackIndex, 1); // splice() modifies array in-place
			}

			// If removing all callbacks, or if all callbacks have been removed:
			if (!callback || !this.subs_[cpath].length) {

				// Remove the whole subscription array if there's no more callbacks
				delete this.subs_[cpath];

				// Undo the Object.defineProperty() call when there are no more subscriptions to it.
				// If there are no subscriptions that start with propCPath
				// TODO This can be VERY SLOW when an object has many subscribers.  Such as a loop with hundreds of children.
				// If the loop tries to remove every child at once the complexity is O(n^2) because each child must search every key in this.subs_.
				// We need to find a faster way.
				let propCpath = csv([path[0]]);
				if (!utils.hasKeyStartingWith_(this.subs_, propCpath)) {

					// If it wasn't deleted already.  But how would that happen?
					if (path[0] in this.obj_) {
						delete this.obj_[path[0]]; // Remove the defined property.
						this.obj_[path[0]] = this.fields_[path[0]]; // reset original unproxied value to object.
					}
					// Get all roots that point to the field
					// Not sure why this makes some unit tests fail.
					let roots = WatchUtil.roots.get(this.fields_[path[0]]);
					if (roots) {
						roots.delete(this.fields_);
						if (!roots.size) // Delete Set() if last item removed.
							WatchUtil.roots.delete(this.fields_[path[0]]);
					}

					delete this.fields_[path[0]];


					// TODO: I'm still uneasy about this code.
					// WatchUtil.addPath() adds to WatchUtil.roots Set for the added object.
					// But there's no code to remove items from that Set, ever.
					// It only disapears when the object goes out of scope, and the whole Set is removed at once.

					// If we delete the last field of an object, remove it from roots.
					if (!Object.keys(this.fields_).length) {

						//#IFDEV
						// if (!WatchUtil.paths.has(this.fields_))
						// 	throw new Error('');
						// if (!WatchUtil.roots.has(this.fields_))
						// 	throw new Error('');
						// if (!WatchUtil.roots.has(this.obj_[path[0]]))
						// 	throw new Error('');
						//#ENDIF

						//let root = WatchUtil.roots.get(this.fields_);
						WatchUtil.paths.delete(this.fields_);
						WatchUtil.roots.delete(this.fields_);
						WatchUtil.roots.delete(this.obj_[path[0]]);
					}

					if (!Object.keys(this.obj_).length) {
						//#IFDEV
						// if (!WatchUtil.paths.has(this.obj_))
						// 	throw new Error('');
						// if (!WatchUtil.roots.has(this.obj_))
						// 	throw new Error('');
						//#ENDIF

						WatchUtil.paths.delete(this.obj_);
						WatchUtil.roots.delete(this.obj_);
					}


				}
			}
		}
	}
}


var Watch = {

	/**
	 * Keeps track of which objects we're watching.
	 * That way Watch.add() and Watch.remove() can work without adding any new fields to the objects they watch.
	 * @type {WeakMap<object, WatchProperties>} */
	objects: new WeakMap(),

	/**
	 *
	 * @param obj {object}
	 * @param path {string|string[]}
	 * @param callback {function(action:string, path:string[], value:string?)} */
	add(obj, path, callback) {
		//#IFDEV
		assert(path.length);
		//#ENDIF
		obj = utils.removeProxy(obj);

		// Keep only one WatchProperties per watched object.
		var wp = Watch.objects.get(obj);
		if (!wp)
			Watch.objects.set(obj, wp = new WatchProperties(obj));

		wp.subscribe_(path, callback);
	},

	/**
	 *
	 * @param obj {object}
	 * @param path {string|string[]}
	 * @param callback {function=} If not specified, all callbacks will be unsubscribed. */
	remove(obj, path, callback) {
		obj = utils.removeProxy(obj);
		var wp = Watch.objects.get(obj);

		if (wp) {
			if (path) // unsubscribe only from path.
				wp.unsubscribe_(path, callback);
			else // unsubscribe rom all paths.
				for (let sub in wp.subs_)
					wp.unsubscribe_(sub);

			// Remove from watched objects if we're no longer watching
			if (!Object.keys(wp.subs_).length)
				Watch.objects.delete(obj);
		}
	},

	//#IFDEV
	cleanup() {
		Watch.objects = new WeakMap();
	}
	//#ENDIF

};

//#IFDEV
var assert = expr => {
	if (!expr) {
		debugger;
		throw new Error('Assert failed');
	}
};
//#ENDIF


var utils = {

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
						node[name] = v;
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
};


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
 * Grammar for html/js code, including js templates.
 *
 * Known bugs
 * 1. Javascript regex to match regex tokens might not be perfect.  Since no regex can match all regexes?
 *    We need a function here instead.
 * 2. Lex parses out html elements inside comments inside css and javascript.  When it should just be one big block of text.
 */
{
	let lastTag = null; // Last tag name we descended into.

	let braceDepth = 0;
	let braceStack = []; // Keep track of the brace depth in outer demplates.
	let templateDepth = 0;
	let whitespace = /^[ \t\v\f\xa0]+/;
	let ln = /^\r?\n/;
	let tagStart = /^<!?([\w\xA0-\uFFFF:-]+)/i; // \w includes underscore
	let closeTag = /^<\/[\w\xA0-\uFFFF:-]+\s*>/i;

	let operator = (
		'&& || ! => ' +                 // Logic / misc operators
		'<<= >>= &= ^= |= &&= ||= ' +   // Assignment operators
		'& | ^ ~ >>> << >> ' +          // Bitwise operators
		'=== !=== == != >= > <= < ' +   // Comparison operators
		'= **= += -= *= /= %= ??= ' +   // Assignment operators 2
		'++ -- ** + - * / % ' +         // Arithmetic operators
		', ... . ( ) [ ] ?. ? :'		// Other operators
	).split(/ /g);

	let operatorMap = {};
	for (let op of operator) // Used to speed up operator search.
		operatorMap[op[0]] = [...(operatorMap[op[0]]||[]), op];


	//let svg = /^<svg[\S\s]*?<\/svg>/;

	// Functions re-used below:
	let expr = code => {
		if (code[1] !== '{') // Fast reject
			return;

		if ((lexHtmlJs.allowHashTemplates && code.startsWith('#{')) || code.startsWith('${')) {
			if (templateDepth <= 0)
				templateDepth = 1;
			braceStack.push(braceDepth);
			braceDepth = 0;
			return [
				code.slice(0, 2),
				'js' // Go from template mode into javascript
			];
		}
	};

	let templateEnd = code => {
		if (code[0] === '`') {
			--templateDepth;
			braceDepth = braceStack.pop();
			return ['`', -1];
		}
	};

	let tagCommon = { // html open tag
		attribute: /^[\-_$\w\xA0-\uFFFF:]+/i,
		string: code =>
			descendIf("'", 'squote')(code) ||
			descendIf('"', 'dquote')(code)
		,
		equals: '=',
		tagEnd: code => {
			if (code[0] === '>')
				return ['>', -1]; // exit tag mode
			if (code.startsWith('/>'))
				return ['/>', -1]; // exit tag mode.
		},
	};

	// Check previous token to see if we've just entered a script tag.
	let script = (code, prev, tokens) => {
		let lastToken = tokens[tokens.length-1];
		if (lastTag === 'script' && lastToken && lastToken.tokens && lastToken.tokens[lastToken.tokens.length-1] == '>')
			return ['', 'js'];
	};

	// null true false Infinity NaN undefined globalThis // <-- These will be parsed as identifiers, which is fine.
	let keyword = `await break case catch class constructor const continue debugger default delete do enum else export extends
				finally for function if implements import in instanceof interface let new package private protected public
				return static super switch this throw try typeof var void while with yield`.trim().split(/\s+/g);

	// let keywordMap = {};
	// for (let kw of keyword) // Used to speed up keyword search.
	// 	keywordMap[kw[0]] = [...(keywordMap[kw[0]]||[]), kw];


	// Tokens that can occur before a regex.
	// https://stackoverflow.com/a/27120110
	let regexBefore =
		`{ ( [ . ; , < > <= >= == != === !== + - * % << >> >>> & | ^ ! ~ && || ? : = += -= *= %= <<= >>= >>>= &= |= ^= /=`
			.split(/ /g);

	/**
	 * A grammar for parsing js and html within js templates, for use with lex.js. */
	var lexHtmlJs = {

		js: {
			whitespace,
			ln, // Separate from whitespace because \n can be used instead of semicolon to separate js statements.
			comment: /^\/\/.*(?=\r?\n)|^\/\*[\s\S]*?\*\//,
			end: code => code.startsWith('</script>') ? ['', -1] : undefined,

			// Can't use a regex to parse a regex, so instead we look for pairs of matching / and see if
			// the part in between can be passed to new RegExp().
			// 1. http://stackoverflow.com/questions/172303
			// 2. http://stackoverflow.com/questions/5519596
			// Matches \\ \/ [^/] [...]
			regex: (code, prev, tokens) => {
				if (code[0] !== '/')
					return;

				if (tokens.length) { // If the / is the first token, it can be a regex.
					let prevToken;
					for (let i = tokens.length - 1; i >= 0; i--)
						if (tokens[i].type !== 'ln' && tokens[i].type !== 'whitespace' && tokens[i].type !== 'comment') {
							prevToken = tokens[i] + '';
							break;
						}
					if (!regexBefore.includes(prevToken))
						return;
				}

				let nextSlash = 1;
				while(1) {
					nextSlash = code.indexOf('/', nextSlash+1);
					if (nextSlash === -1)
						return;

					try {
						let piece = code.slice(0, nextSlash+1);
						new RegExp(piece.slice(1, -1)); // without the slashes
						let suffix = code.slice(piece.length).match(/^[agimsx]*/)[0];
						return [piece + suffix]; // is a valid regex.
					} catch (e) {}
				}

			},
			hex: /^0x[0-9a-f]+/, // Must occur before number.
			number: /^\d*\.?\d+(e\d+)?/, // Must occur before . operator.
			// These are not included as keywords b/c they're also valid identifier names:  constructor, from
			identifier: code => {
				let result = (code.match(/^[_$a-z\xA0-\uFFFF][_$\w\xA0-\uFFFF]*/i) || [])[0]; // variables, labels, other things?
				if (!keyword.includes(result))
					return [result];
			},
			template: code => { // go into a template
				if (code[0] === '`') {
					++templateDepth;
					braceStack.push(braceDepth);
					braceDepth = 0;
					return ['`', 'template'];
				}
			},
			brace1: code => {
				if (code[0] === '{') {
					braceDepth++;
					return ['{']
				}
			},
			brace2: code => {
				if (code[0] === '}') {
					if (braceDepth === 0 && templateDepth) {
						braceDepth = braceStack.pop();
						return ['}', -1] // pop out of js mode, back to tempate mode.
					}
					braceDepth--;
					return ['}']; // just match
				}
			},
			semicolon: ';',
			keyword,
			operator,
			string: /^"(\\\\|\\"|[^"])*"|^'(\\\\|\\'|[^'])*'/
		},
		html: { // top level html not within javascript.  No other modes go to this mode.
			script,
			comment: descendIf('<!--', 'htmlComment'),
			closeTag,
			openTag: descendIf(tagStart, 'tag', match => lastTag = match[1]),
			text: /^[\s\S]+?(?=<|$)/,
		},
		htmlComment: {
			commentEnd: ascendIf('-->'),
			commentBody: /^[\s\S]+?(?=-->|$)/,
		},
		template: { // template within javascript
			script,
			expr,
			comment: descendIf('<!--', 'templateComment'),
			closeTag,
			openTag: descendIf(tagStart, 'templateTag', match => lastTag = match[1]),
			templateEnd,

			// Continue until end of text.
			// supports both ${} and #{} template expressions.
			text: code => {
				let regex = lexHtmlJs.allowHashTemplates // https://stackoverflow.com/a/977294
						? /^(?:\\#{|\\\${|\s|(?!(#{|\${|`|<[\w\xA0-\uFFFF!:/-]|$)).)+/
						: /^(?:\\\${|\s|(?!(\${|`|<[\w\xA0-\uFFFF!:/-]|$)).)+/;

				let matches = code.match(regex);
				if (matches) {
					let result = matches[0];
					result = utils.unescapeTemplate_(result);
					//result = Object.assign(result, {originalLength: matches[0].length});
					// if (result.length !== matches[0].length)
					// 	debugger;
					return [result, undefined, matches[0].length];
				}
			}
		},
		// Comment within a `template` tag.
		templateComment: { // Like htmlComment, but allows expressions.
			expr,
			commentEnd: ascendIf('-->'),
			commentBody: code => [code.match(
				lexHtmlJs.allowHashTemplates
					? /^[\s\S]+?(?=-->|[$#]{|$)/
					: /^[\s\S]+?(?=-->|\${|$)/) || []][0],
		},
		tag: {
			whitespace: /^[ \r\n\t\v\f\xa0]+/,
			...tagCommon
		},
		templateTag: { // html tag within template.
			whitespace: code => { // TODO: Why do we have the double-escaped versions?
				let matches = code.match(/^( |\r|\n|\t|\v|\f|\xa0|\\r|\\n|\\t|\\v|\\f|\\xa0)+/);
				if (matches) {
					let result = matches[0];
					result = utils.unescapeTemplate_(result);
					//result = Object.assign(result, {originalLength: matches[0].length});
					return [result, undefined, matches[0].length];
				}
			},
			expr,
			templateEnd, // A ` quote to end the template.
			...tagCommon,
		},
		// TODO: template end with `
		squote: { // single quote string within tag.  Used for both js strings and html attributes.
			expr,
			quote: ascendIf("'"),
			text: code => [code.match(
				lexHtmlJs.allowHashTemplates
				? /^(?:\\'|(?!'|#{|\${)[\S\s])+/
				: /^(?:\\'|(?!'|\${)[\S\s])+/) || []][0]
		},

		dquote: { // double quote string within tag.
			expr,
			quote: ascendIf('"'),
			text: code => [code.match(
				lexHtmlJs.allowHashTemplates
				? /^(?:\\"|(?!"|#{|\${)[\S\s])+/
				: /^(?:\\"|(?!"|\${)[\S\s])+/) || []][0]
		},

		// TODO: css?


		// Options:

		// Allow for {...} templates inside js template strings, instead of just ${}
		// Setting this true can cause problems in parsing css, since {} surrounds the rules.
		// Perhaps add a css mode?
		allowHashTemplates: false,
	};

	// Convert everything to a function.
	for (let mode in lexHtmlJs)
		for (let type in lexHtmlJs[mode]) {
			let pattern = lexHtmlJs[mode][type];
			if (Array.isArray(pattern)) {

				// Replace arrays with functions to do lookups in maps.
				// Benchmarking shows a performance increase of about 3%.

				// 1. Build a lookup map based on first letter.
				let lookup = {};
				for (let token of pattern)
					lookup[token[0]] = [...(lookup[token[0]]||[]), token];

				// 2. Replace the array of tokens with a function that uses this lookup map.
				lexHtmlJs[mode][type] = code => {
					let tokens = lookup[code[0]];
					if (tokens)
						for (let token of tokens)
							if (code.startsWith(token))
								return [token];
				};
			}
			else if (typeof pattern === 'string')
				lexHtmlJs[mode][type] = code => [code.startsWith(pattern) ? pattern : undefined];
			else if (pattern instanceof RegExp) {
				lexHtmlJs[mode][type] = code => [(code.match(pattern) || [])[0]];
			}
		}

	// A fast lookup table based on starting characters.
	// Be careful not to suggest a pattern that must come after another pattern.
	// E.g. all js.identifier would also match js.keyword
	// This isn't finished.
	lexHtmlJs.fastMatch = {
		html: {
			'<': {
				'/': [lexHtmlJs.html, 'closeTag'],
				'a-z0-9': [lexHtmlJs.html, 'openTag'],
				'!': [lexHtmlJs.html, 'comment'],
			},
			'a-z0-9 \t\r\n': [lexHtmlJs.html, 'text']
		},

		tag: {
			'a-z0-9': [lexHtmlJs.tag, 'attribute'],
			' \t\r\n': [lexHtmlJs.tag, 'whitespace'],
			'"': [lexHtmlJs.tag, 'string'],
			"'": [lexHtmlJs.tag, 'string'],
			">": [lexHtmlJs.tag, 'tagEnd'],
			"/": {
				'>': [lexHtmlJs.tag, 'tagEnd']
			},
			'=': [lexHtmlJs.tag, 'equals'],
		},
		dquote: {
			'"': [lexHtmlJs.dquote, 'quote'],
			'a-z0-9 \t.()[]/': [lexHtmlJs.dquote, 'text'],
			'$#': [lexHtmlJs.dquote, 'expr'],
		},
		js: {
			' \t\v\f\xa0': [lexHtmlJs.js, 'whitespace'],
			'=&|^!+-*%,.()[]?!>:': [lexHtmlJs.js, 'operator'], // omits "/" b/c it can also be regex.  Omits < b/c it can also be close tag.
			'\r\n' : [lexHtmlJs.js, 'ln'],
			';': [lexHtmlJs.js, 'semicolon'],
			'/' : {
				'/*':  [lexHtmlJs.js, 'comment'],
			},
			'{': [lexHtmlJs.js, 'brace1'],
			'}': [lexHtmlJs.js, 'brace2'],
			'a-z$_': [lexHtmlJs.js, 'identifier'],
			'0-9': [lexHtmlJs.js, 'number'],
			'\'"': [lexHtmlJs.js, 'string'],
			'`': [lexHtmlJs.js, 'template'],
		},
		template: {
			//'a-z0-9 ': [lexHtmlJs.template, 'text'], // Can't work because the slow version does a look-behind to see if we're in a script tag.
			'`': [lexHtmlJs.template, 'templateEnd'],
			'$#': [lexHtmlJs.template, 'expr'],
			'<': {
				'a-z': [lexHtmlJs.template, 'openTag'],
				'/': [lexHtmlJs.template, 'closeTag'],
				'!': [lexHtmlJs.template, 'comment']
			}
		},
		templateTag: {
			'$': [lexHtmlJs.templateTag, 'expr']
		},
		templateComment: {
			'-': [lexHtmlJs.templateComment, 'commentEnd'],
			'a-z0-9\t\r\n ': [lexHtmlJs.templateComment, 'commentBody']
		}
	}; // end fastMatch object.

	lexHtmlJs.fastMatch.templateTag = lexHtmlJs.fastMatch.tag;

	/**
	 * Expand the lookup rules such as a-z and 0-9, in place. */
	function expandFastMatch_(obj) {
		for (let name in obj) {
			if (!obj[name].length) // not an array, recurse:
				expandFastMatch_(obj[name]);

			if (name.length > 1) {
				let originalName = name;

				if (name.includes('a-z')) {
					for (let letter of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
						obj[letter] = obj[originalName];
					name = name.replace('a-z', '');
				}
				if (name.includes('0-9')) {
					for (let letter of '0123456789')
						obj[letter] = obj[originalName];
					name = name.replace('0-9', '');
				}

				if (name.length > 1)
					for (let letter of name)
						obj[letter] = obj[originalName];

				delete obj[originalName];
			}
		}
		Object.freeze(obj); // Theoretically makes it faster, but benchmarking doesn't show this.

	}
	for (let name in lexHtmlJs.fastMatch)
		expandFastMatch_(lexHtmlJs.fastMatch[name]);

	Object.freeze(lexHtmlJs.fastMatch);



} // end scope

/**
 * Functional regular expressions.
 * Use functions instead of letters to define a regex.
 *
 * A list of arguments to any of these functions is treated as an AND.
 * An array given as a single argument is identical to fregex.or().
 *
 * Each function returns the number of tokens to advance if it matches,
 * 0 if we should proceed without matching,
 * or false if it doesn't match.
 */
function fregex(...rules) {
	rules = prepare(rules);
	let result = tokens => {
		let i = 0;
		for (let rule of rules) {
			let used = rule(tokens.slice(i));
			if (used === false) // 0, false, null, or undefined
				return false;

			// True becomes 1
			i += used;
		}
		return i; // returns number of tokens used.
	};
	//#IFDEV
	if (fregex.debug)
		result.debug = 'and(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;

}

/**
 * Advance the number of tokens used by the first child that matches true.
 * TODO: Automatically treat an array given to an and() as an or() ?
 * @return {function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched. */
fregex.or = (...rules) => {
	rules = prepare(rules);
	let result = tokens => {
		for (let rule of rules) {
			let used = rule(tokens);
			if (used !== false)
				return used;
		}
		return false;
	};
	//#IFDEV
	if (fregex.debug)
		result.debug = 'or(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;
};


/**
 * Equivalent of /!(a&b&c)/
 * @return {function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched. */
fregex.not = (...rules) => {
	let f = fregex(rules); // re-use
	let result = tokens =>
		f(tokens) === false ? 0 : false; // If it matches, return false, otherwise advance 0.

	//#IFDEV
	if (fregex.debug)
		result.debug = 'not(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;
};

/**
 * Advance one token if none of the children match.  A "nor"
 * Equivalent to /[^abc]/ or not(or())
 * @return {function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched.
fregex.nor = (...rules) => {
	rules = prepare(rules);
	let result = tokens => {
		for (let rule of rules)
			if (rule(tokens) > 0) // rule(tokens) returns the number used.
				return false;
		return 1;
	};
	//#IFDEV
	if (fregex.debug)
		result.debug = 'nor(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;
}*/


/**
 * Consume either zero or one of the sequences given.
 * @return {function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched. */
fregex.zeroOrOne = (...rules) => {
	let f = fregex(rules);
	let result = tokens => {
		let used = f(tokens);
		if (used === false)
			return 0; // don't fail if no match.
		return used;
	};
	//#IFDEV
	if (fregex.debug)
		result.debug = 'zeroOrOne(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF
	return result;
};

/**
 *
 * @param x
 * @param rules
 * @return {*[]|function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched. */
fregex.xOrMore = (x, ...rules) => {
	let f = fregex(rules); // re-use
	let result = (tokens) => {
		let total = 0;
		for (let i=0; tokens.length; i++) {
			let used = f(tokens);
			if (used === false)
				return i >= x ? total : false;
			total += used || 1;
			tokens = tokens.slice(used || 1);
		}
		return total;
	};

	//#IFDEV
	if (fregex.debug)
		result.debug = x+'OrMore(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF

	return result;
};

/**
 *
 * @param rules
 * @return {*[]|function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched. */
fregex.zeroOrMore = (...rules) => fregex.xOrMore(0, ...rules);

/**
 *
 * @param rules
 * @return {*[]|function(tokens:*[]):int|bool}
 *     A function that returns the number of elements matched, or false if none were matched. */
fregex.oneOrMore = (...rules) => fregex.xOrMore(1, ...rules);


/**
 * Find the first squence in haystack that matches the pattern.
 * @param pattern {*[]|function(tokens:*[]):int|bool}
 * @param haystack {array}
 * @param startIndex {int}
 * @return {*[]} A slice of the items in haystack that match.
 *     with an added index property designating the index of the match within the haystack array. */
fregex.matchFirst = (pattern, haystack, startIndex=0) => {
	let result = fregex.matchAll(pattern, haystack, 1, startIndex);
	return result.length ? result[0] : null;
};

fregex.matchAll = (pattern, haystack, limit=Infinity, startIndex=0) => {
	if (Array.isArray(pattern))
		pattern = fregex(pattern);
	let result = [];

	// Iterate through each offset in haystack looking for strings of tokens that match pattern.
	for (let i = startIndex; i < haystack.length && result.length < limit; i++) {
		let count = pattern(haystack.slice(i));
		if (count !== false)
			result.push(Object.assign(haystack.slice(i, i + count), {index: i}));
	}
	return result;
};


// Experimental
fregex.lookAhead = (...rules) => {
	rules = prepare(rules);
	let result = tokens => {
		for (let rule of rules) {
			let used = rule(tokens);
			if (used === false)
				return false;
		}
		return 0;
	};

	//#IFDEV
	if (fregex.debug)
		result.debug = 'lookAhead(' + rules.map(r => r.debug || r).join(', ') + ')';
	//#ENDIF

	return result;
};

/**
 * Experimental
 * Matches the end of the tokens.
 * @param tokens
 * @return {number|boolean} */
fregex.end = tokens => {
	return tokens.length ? false : 0;
};

//#IFDEV
if (fregex.debug)
	fregex.end.debug = 'end';
//#ENDIF


/**
 * Allow matching on functions, object properties, and strings.
 * @param rules
 * @return {function[]} */
var prepare = rules => {
	if (Array.isArray(rules[0]) && rules.length === 1)
		rules = rules[0];

	let result = [];
	for (let i in rules) {
		let rule = rules[i];
		if (typeof rule === 'string')
			// noinspection EqualityComparisonWithCoercionJS
			result[i] = tokens => tokens[0] == rule; // TODO: is loose equals best?

		else if (Array.isArray(rule)) // must occur before typeof rule === 'object' b/c array is object.
			result[i] = fregex(rule);

		// If an object, test to see if the token has all of the object's properties.
		else if (typeof rule === 'object' && !rule.prototype)
			result[i] = tokens => {
				for (let name in rule)
					// noinspection EqualityComparisonWithCoercionJS
					if (tokens[0][name] != rule[name]) // TODO: What if tokens is an empty array and [0] is undefined?
						return false;

				return 1; // Advance 1 token.
			};

		else
			result[i] = rules[i];

		//#IFDEV
		result[i].debug = rule.debug || JSON.stringify(rule);
		//#ENDIF
	}

	return result;
};

/**
 * Use the grammar.fastMatch table to suggest what pattern to use to check for a token.
 * This is much faster than looping through and trying all patterns.
 * @param grammar
 * @param mode
 * @param current
 * @return {(*)[]} */
function fastLex(grammar, mode, current) {
	let type;
	let pattern = grammar.fastMatch[mode];
	if (pattern) {
		let i = 0;
		do {
			let letter = current[i];
			pattern = pattern[letter];
			if (pattern && pattern.length) {
				[pattern, type] = pattern;
				pattern = pattern[type];
				break;
			}

			i++;
		} while (pattern);
	}
	return [pattern, type];
}

/**
 * Allow tokens to be compared to strings with ==.
 * @example
 * var token = {text: 'return', valueOf};
 * token == 'return' // true, b/c we use double equals.
 * @return {string} */
function valueOf() {
	return this.text
}

function toString() {
	return this.text
}

class Token {

	constructor(text, type, mode, line, col, originalLength, tokens) {
		this.text = text;
		this.type = type;
		this.mode = mode;
		this.line = line;
		this.col = col;
		this.originalLength = originalLength;
		this.tokens = tokens;
	}

	valueOf() {
		return this.text
	}

	toString() {
		return this.text
	}
}


/**
 * Parse code into tokens according to rules in a grammar.
 *
 * @typedef GrammarRule {(
 *     string |
 *     function(codeAhead:string, codeBehind:string=, previousTokens:Token[]=):array |
 *     RegExp
 * )}
 *
 * @typedef Token{
 *     {text: string, type:string, mode:string, line:int, col:int, ?tokens:Token[], ?originalLength:int}
 * }
 *
 * @param grammar {Object<string, GrammarRule|GrammarRule[]>}.  An object of rules objects, where the key is the mode to use.
 * Each rule object has a key with name of the rule's type, and a value that can be either:
 * 1. A string,
 * 2. A regular expression.
 * 3. A function(codeAhead:string, codeBehind:string, previousTokens:Token[])
 *    that returns [match] for a match, [match, mode] to enter a new mode, or [match, -1] to pop the mode.
 *    Or undefined if there's no match.
 *    Where match is the string that matches.
 * 4. An array containing a list of strings to match
 *
 * Token.originalLength stores the length of a token before escaping occurs.
 *
 * TODO: A more flexible version of lex() would be a generator and yield one token at a time.
 * Then we could stop processing when we reach what we're looking for.
 * It would flatten all tokens from recursion, but yield lex.descend and lex.ascend when going into or out of a nested language.
 * The cache would then be moved external to this function.
 *
 * @param code {string} String to parse.
 * @param mode {?string}
 * @param line {int=} Start counting from this line.
 * @param col {int=} Start counting from this column.
 * @param options {Object}
 * @param options.failOnUnknown {boolean}
 * @param options.callback
 * @param index {int} Used internally.  Start reading code at this index.
 *
 * @return Token[] */
function lex(grammar, code, mode=null, options={}, line=1, col=1, index=0) {
	mode = mode || Object.keys(grammar)[0]; // start in first mode.
	code = code+'';

	let result;
	let unknown ='';

	// Cache small results
	const cacheLen = 256;
	if (code.length < cacheLen) {
		var key = mode + '|' + code.slice(0, 24); // avoid long keys
		result = cache[key];
		if (result && result[0] === code) {
			return result[1];
		}
	}

	result = [];
	while (index < code.length) {
		let before = code.slice(0, index);
		let current = code.slice(index);
		let token = undefined;
		let originalLength = undefined;
		let pattern, type;

		// MatchType is a string to go into a new mode, -1 to leave a mode, or undefined to stay in the same mode.
		let matchType = undefined;


		// 1. Identify token

		// 1a. Fast match
		[pattern, type] = fastLex(grammar, mode, current); // Tells us what pattern to try.
		if (pattern)
			[token, matchType, originalLength] = pattern(current, before, result) || [];

		// 1b. Slow match, if fastmatch fails
		if (!token) {
			let gmode = grammar[mode];
			for (type in gmode) {
				let pattern = gmode[type];
				[token, matchType, originalLength] = pattern(current, before, result) || [];
				if (token !== undefined) {
					//let name = mode + ':' + type; // + ':' + token;
					//window.slowMatches[name] = (window.slowMatches[name] || 0) + 1
					break;
				}
			}
		}


		if (token === undefined) {
			if (options.failOnUnknown) {
				let before = code.slice(Math.max(index - 15, 0), index);
				let after = current.slice(0, 25).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
				let msg = before + '⚠️' + after;
				throw new Error(`Unknown token within "${mode}" at ${line}:${col}\r\n"${msg}"`);
			}
			unknown += code.slice(0, 1);
			code = code.slice(1);
			continue;
		}
		else if (unknown.length) {
			token = unknown;
			matchType = false;
			unknown = '';
		}

		// 2. Ascend or descend
		let newMode = (matchType && matchType !== -1) ? matchType : mode;
		let tokenObj = {text: token, type, mode: newMode, line, col, originalLength, valueOf, toString};
		//let tokenObj = new Token(token, type, newMode, line, col, originalLength); // Why does this version fail?
		let length = originalLength || token.length; // How much of the code string that was consumed.

		if (matchType === -1) // Ascend out of a sub-mode.
			return [...result, tokenObj];

		else if (matchType) { // Descend into new mode
			let subTokens = lex(grammar, code, matchType, options, line, col+length, index+length);
			if (subTokens === false) // callback returned false, bail.
				return result;
			let tokens = [tokenObj, ...subTokens].filter(t=>t.text.length);
			length = tokens.reduce((p, c) => {
				return p + (c.originalLength || c.text.length)
			}, 0); // add the lengths of the tokens

			tokenObj = {text: code.slice(index, index+length), type, tokens, mode, line, col, valueOf, toString};
			// tokenObj = new Token(code.slice(index, index+length), type, mode, line, col, undefined, tokens); // This works, but is no faster.
			if (length !== token.length)
				tokenObj.originalLength = length;
		}


		// Sometimes a zero length token will be used to go into a new mode.
		if (length) {

			// 3. Process token
			index += length;
			if (options.callback && options.callback(tokenObj) === false)
				return result;

			result.push(tokenObj);

			// 4. Increment line/col number.
			// line += (token.match(/\n/g) || []).length; // count line returns
			// let lastLn = token.lastIndexOf('\n');
			let lastLn = -1;
			for (let i=0, len=token.length; i<len; i++) { // Benchmark shows this is slightly faster than the code above.
				if (token[i] == '\n') {
					line++;
					lastLn = i;
				}
			}

			col = (lastLn > -1 ? -lastLn : col) + length;
		}
	}

	// Cache
	if (code.length < cacheLen)
		cache[key] = [code, result];

	return result;
}


var cache = {};
//window.slowMatches = {};

class ParsedFunction {

	name;

	/**
	 * @type {string} Can be 'function', 'method', 'arrowParam', 'arrowParams', 'arrowParamBrace', 'arrowParamsBrace' */
	type;

	/**
	 * @type {int} index of first token that's an identifier among the function arguments.
	 * If no arguments will point to the index of ')' */
	argsStartIndex_;

	/** @type {Token[]} Does not include open and close parentheses. */
	argTokens_;

	/**
	 * @type {int} Opening brace or first real token after the => in an arrow function. */
	bodyStartIndex_;

	/** @type {Token[]} Includes start and end brace if present. */
	bodyTokens_;

	constructor(tokens, parseBody = true, onError = null) {
		if (typeof tokens === 'function')
			tokens = tokens.toString();
		if (typeof tokens === 'string') {
			let callback;
			if (!parseBody) {
				let depth = 0;

				// Stop when we get to { or =>
				callback = token => {
					if (token.text === '(')
						depth++;
					else if (token.text === ')')
						depth --;
					if (depth === 0 && (token.text === '{' || token.text === '=>'))
						return false;
				};
			}

			tokens = lex(lexHtmlJs, tokens, 'js', {callback}); // TODO: Stop at body end, or body beginning if parseBody=false
		}

		onError = onError || (msg => {
			throw new Error(msg)
		});


		/**
		 * @param tokens {Token[]}
		 * @param start {int} Index of the first token after an optional open parenthesis.
		 * @return {int} Index of token after the last arg token. */
		const parseArgTokens = (tokens, start = 0) => {
			//#IFDEV
			assert(tokens[start].text === '(');
			//#ENDIF
			let groupEndIndex = Parse.findGroupEnd_(tokens, start);
			if (groupEndIndex === null)
				return -1;

			this.argTokens_ = tokens.slice(start + 1, groupEndIndex - 1);
			return groupEndIndex - 1;
		};

		// Function
		if (tokens[0].text === 'function') {
			this.type = 'function';
			let index = tokens.slice(1).findIndex(token => !['whitespace', 'ln', 'comment'].includes(token.type));
			if (index === -1)
				return onError('Not enough tokens to be a function.');

			// Optional function name
			if (tokens[index + 1].type === 'identifier')
				this.name = tokens[index + 1].text;

			let argStartIndex = tokens.slice(index + 1).findIndex(token => token.text === '(');
			if (argStartIndex === -1)
				return onError('Cannot find opening ( for function arguments.');
			this.argsStartIndex_ = index + 1 + argStartIndex + 1;
		}

		// Method
		else if (tokens[0].type === 'identifier') {
			let nextOpIndex = tokens.findIndex(token => token.type === 'operator');
			if (nextOpIndex !== -1 && tokens[nextOpIndex]?.text === '(') {
				this.type = 'method';
				this.name = tokens[0].text;
				this.argsStartIndex_ = nextOpIndex + 1;
			}
		}

		// Find args and body start
		if (['function', 'method'].includes(this.type)) {
			let argEndIndex = parseArgTokens(tokens, this.argsStartIndex_ - 1);
			if (argEndIndex === -1)
				return onError('Cannot find closing ) and end of arguments list.');

			if (parseBody) {
				let bodyStartIndex = tokens.slice(argEndIndex).findIndex(token => token.text === '{');
				if (this.bodyStartIndex_ === -1)
					return onError('Cannot find start of function body.');

				this.bodyStartIndex_ = argEndIndex + bodyStartIndex;
			}
		}


		// Arrow function
		if (!this.type) {

			// Arrow function with multiple params
			let type, argEndIndex;
			if (tokens[0].text === '(') {
				this.argsStartIndex_ = 1;
				argEndIndex = parseArgTokens(tokens, 0);
				if (argEndIndex === -1)
					return onError('Cannot find ) and end of arguments list.');
				type = 'Params';
			}

			// Arrow function with single param
			else {
				argEndIndex = 1;
				type = 'Param';
				this.argTokens_ = [tokens[0]];
			}

			if (parseBody) {

				// Find arrow
				let arrowIndex = tokens.slice(argEndIndex).findIndex(token => token.text === '=>');
				if (arrowIndex === -1)
					return onError('Cannot find arrow before function body.');

				// Find first real token after arrow
				let bodyStartIndex = tokens.slice(argEndIndex + arrowIndex + 1).findIndex(token => !['whitespace', 'ln', 'comment'].includes(token.type));
				if (bodyStartIndex === -1)
					return onError('Cannot find function body.');
				this.bodyStartIndex_ = argEndIndex + arrowIndex + 1 + bodyStartIndex;
				if (tokens[this.bodyStartIndex_]?.text === '{')
					this.type = `arrow${type}Brace`;
				else
					this.type = `arrow${type}`;
			}
		}

		// Find body.
		if (parseBody) {

			// Knowing when an unbraced arrow function ends can be difficult.
			// E.g. consider this code:  https://jsfiddle.net/kjmzbvyt/
			// We look for a semicolon at depth zero or a line return not preceeded by an operator.
			let bodyEnd;
			let isBracelessArrow = ['arrowParam', 'arrowParams'].includes(this.type);
			if (isBracelessArrow) {
				const open = ['{', '(', '['];
				const close = ['}', ')', ']'];
				const terminators = [';', ',', ...close];
				let hanging = false;
				for (let i=this.bodyStartIndex_, token; token=tokens[i]; i++) {
					if (['whitespace', 'comment'].includes(token.type))
						continue;


					if (open.includes(token.text))
						i = Parse.findGroupEnd_(tokens, i, open, close);

					// Here we're implicitly at depth zero because of the Parse.findGroupEnd() above.
					else if (terminators.includes(token.text)) {
						bodyEnd = i;
						break;
					}
					else if (token.type === 'operator')
						hanging = true;
					else if (!hanging && token.type === 'ln') {
						let nextToken = tokens.slice(i).find(token => !['whitespace', 'ln', 'comment'].includes(token.type));
						if (!nextToken)
							bodyEnd = i - 1;
						else if (terminators.includes(nextToken) || nextToken.type !== 'operator') {
							bodyEnd = i;
							break
						}
					}
					else
						hanging = false;
				}
			}
			else
				bodyEnd = Parse.findGroupEnd_(tokens, this.bodyStartIndex_);


			if (bodyEnd === null)
				return onError('Cannot find end of function body.');

			if (isBracelessArrow && tokens[bodyEnd]?.text === ';')
				bodyEnd++;

			this.bodyTokens_ = tokens.slice(this.bodyStartIndex_, bodyEnd);
		}
	}


	/**
	 * Get all the function argument names from the function tokens.
	 * This will stop parsing when it reaches the end of the function.
	 * It also supports function argument destructuring.
	 *
	 * @example
	 * let code = (function({a, b}={}, c) { return a+1 }).toString();
	 * let tokens = lex(htmljs, code, 'js');
	 * let args = [...Parse.findFunctionArgNames3(tokens)];
	 *
	 *
	 * TODO: Perhaps this should call findGroupEnd() to skip ahead to
	 * the next non-nested comma when it encounters an '=' ?
	 *
	 * @return {Generator<object|string>} */
	*getArgNames() {
		let tokens = this.argTokens_;

		if (this.type === 'arrowParam')
			yield tokens[0].text;

		else {
			let arg = undefined; // Current argument.
			let subArg = undefined; // Current node in arg.
			let stack = []; // Help subArg find its way back to arg.
			let lastName = null; // Last argument or property name we found.
			let find = true; // If we're in the proper context to find variable names.
			let depth = 0;

			for (let token of tokens) {
				let text = token.text;

				if (token.type === 'identifier' && find) {
					lastName = text;
					if (!arg)
						arg = lastName;
					else if (subArg)
						subArg[lastName] = undefined;
				} else if (text == '(' || text == '{' || text == '[') {
					depth++;
					find = true;
					if (!arg && text == '{')
						arg = subArg = {};
					if (lastName) {
						subArg = subArg[lastName] = {};
						stack.push(subArg);
					}
				} else if (text == ')' || text == '}' || text == ']') {
					depth--;
					subArg = stack.pop();
				} else if (text === ',')
					find = true;
				else if (text === ':')
					find = false;
				else if (text === ':' || text === '=') {
					find = false;
					lastName = null;
				}

				if (depth < 0) {
					if (arg)
						yield arg;
					debugger;
					return; // Exited function arguments.
				}

				// If a top-level comma, go to next arg
				if (text === ',' && depth === 0) {
					yield arg;
					arg = subArg = undefined;
				}
			}
			if (arg)
				yield arg;
		}
	}
}

var Parse = {

	/**
	 * Create a fregex to find expressions that start with "this" or with local variables.
	 * @param vars
	 * @return {function(*): (boolean|number)} */
	createVarExpression_(vars=[]) {
		let key = vars.join(','); // Benchmarking shows this cache does speed things up a little.
		let result = varExprCache[key];
		if (result)
			return result;

		return varExprCache[key] = fregex(
			fregex.or(
				fregex('this', Parse.ws, fregex.oneOrMore(property)),  // this.prop
				...vars.map(v => fregex(v, fregex.zeroOrMore(property)))    // item.prop
			),
			terminator
		);
	},

	/**
	 * TODO: test search direction.
	 * TODO: Move a more general version of this function to arrayUtil
	 * @param tokens {Token[]}
	 * @param start {int} Index directly after start token.
	 * @param open {string[]}
	 * @param close {string[]}
	 * @param terminators {(Token|string)[]}
	 * @param dir {int} Direction.  Must be 1 or -1;  A value of 0 will cause an infinite loop.
	 * @return {?int} The index of the end token, or terminator if supplied.  Null if no match.*/
	findGroupEnd_(tokens, start=0, open=['(', '{'], close=[')', '}'], terminators=[], dir=1) {
		let depth = 0;
		let startOnOpen = open.includes(tokens[start].text);

		for (let i=start, token; token = tokens[i]; i+= dir) {
			let text = token.text || token+'';
			if (open.includes(text))
				depth += dir;
			else if (close.includes(text)) {
				depth -= dir;
				if (startOnOpen) {
					if (depth === 0)
						return i + 1;
				}
				else if (depth < 0)
					return i;
			}
			else if (!depth && terminators.includes(text))
				return i;
		}
		return null;
	},


	/**
	 * @deprecated for findFunctionArgNames2
	 * Given the tokens of a function(...) definition from findFunctionArgToken(), find the argument names.
	 * @param tokens {Token[]}
	 * @return {string[]} */
	findFunctionArgNames_(tokens) {
		let result = [];
		let find = 1, depth=0; // Don't find identifiers after an =.
		for (let token of tokens) {
			if (find === 1 && token.type === 'identifier' && !depth)
				result.push(token + '');
			else if (token == '(' || token == '{' || token == '[')
				depth++;
			else if (token == ')' || token == '}' || token == ']')
				depth --;

			if (!depth)
				find = {',': 1, '=': -1}[token] || find;
		}
		return result;
	},
	/**
	 * Loop through the tokens and find the start of a function.
	 * @param tokens {Token[]}
	 * @param start {int}
	 * @return {int|null} */
	findFunctionStart_(tokens, start=0) {
		for (let i=start, token; token=tokens[i]; i++) {
			if (token == 'function')
				return i;
			else if (token == '=>') {
				// TODO: Use findGroupEnd
				let depth = 0;
				for (let j=-1, token; token=tokens[i+j]; j--) {
					if (token.type === 'whitespace' || token.type === 'ln' || token.type === 'comment')
						continue;
					if (token == ')')
						depth++;
					else if (token == '(')
						depth--;
					if (depth === 0)
						return i+j;
				}
			}
		}
		return null;
	},

	/**
	 * Replace `${`string`}` with `\${\`string\`}`, but not within function bodies.
	 * @param tokens {Token[]}
	 * @return {Token[]} */
	escape$_(tokens) {
		let result = tokens.map(t=>({...t}));// copy each
		let fstart = this.findFunctionStart_(result);
		for (let i=0, token; token=result[i]; i++) {

			// Skip function bodies.
			if (i===fstart) {
				let pf = new ParsedFunction(result.slice(fstart));
				i = fstart + pf.bodyStartIndex_ +pf.bodyTokens_.length + 1;
				fstart = this.findFunctionStart_(result, i);
			}

			if (token.type === 'template')
				result[i].text = '`'+ token.text.slice(1, -1).replace(/\${/g, '\\${').replace(/`/g, '\\`') + '`';
		}
		return result;
	},

	/**
	 * Get the tag name from the html() function.
	 * A fast heuristic instead of an actual parsing.  But it's hard to think of
	 * a real-world case where this would fail.
	 * A better version would use lex but stop lexxing after we get to the tag name.
	 * @param code {string} The code returned by function.toString().
	 * @returns {string} */
	htmlFunctionTagName_(code) {
		code = code
			.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '')  // remove js comments - stackoverflow.com/a/15123777/
			.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*|<!--[\s\S]*?-->$/); // remove html comments.

		code = utils.munchUntil_(code, '{');
		code = utils.munchUntil_(code, 'return'); // Return is optional.  munchUntil() will return the same string if not found.
		code = utils.munchUntil_(code, ['`', `"`, "'"]);
		code = utils.munchUntil_(code, ['<']);
		let match = code.match(/<(\w+-[\w-]+)/);
		return match[1]; // 1 to get part in parenthesees.
	},

	/**
	 * Parse the return value of the html function into tokens.
	 * @param tokens {string|Token[]} The code returned by function.toString().
	 * @return {?Token[]} */
	htmlFunctionReturn_(tokens) {
		if (typeof tokens === 'string')
			tokens = lex(lexHtmlJs, tokens, 'js');

		let htmlMatch = fregex.matchFirst([
			fregex.or({type: 'template'}, {type: 'string'}),
			Parse.ws,
			fregex.zeroOrOne(';')
		], tokens);

		if (!htmlMatch)
			return null;

		let template = htmlMatch.filter(t=>t.tokens || t.type==='string')[0]; // only the template token has sub-tokens.


		// 1 Template
		let innerTokens;
		if (template.tokens)
			innerTokens = template.tokens.slice(1, -1);

		// 2 Non-template
		else { // TODO: Is there better a way to unescape "'hello \'everyone'" type strings than eval() ?
			let code = eval(template+'');
			innerTokens = lex(lexHtmlJs, code, 'template');
		}

		// Skip initial whitespace and comments inside template string.
		while (innerTokens[0].type !== 'openTag')
			innerTokens = innerTokens.slice(1);

		return innerTokens;
	},

	/**
	 * Recursively replace #{...} with ${ClassName.htmlEncode(...)}
	 * @param tokens {Token[]}
	 * @param mode
	 * @param className
	 * @return {Token[]} */
	replaceHashExpr_(tokens, mode, className) {
		let result = [];
		let isHash = false;
		for (let token of tokens) {
			// TODO: Completely recreate the original tokens, instead of just string versions of them:
			if (token.tokens) {
				let tokens = Parse.replaceHashExpr_(token.tokens, token.mode, className);
				result.push({text: tokens.map(t=>t.text).join(''), type: token.type, tokens, mode: token.mode});
			}
			else if (token.text == '#{' && token.type == 'expr') {
				result.push(new Token('${'), new Token(className), new Token('.'), new Token('htmlEncode'), new Token('('));
				isHash = true;
			}
			else
				result.push(token);
		}

		if (isHash) { // Add the closing paren around htmlEncode
			let extra = [];
			if (mode === 'squote') // Escape quotes if we're inside an attribute
				extra = [new Token(','), new Token(`"'"`)];
			else if (mode === 'dquote')
				extra = [new Token(','), new Token(`'"'`)];

			result.splice(result.length - 1, 0, ...extra, new Token(')'));
		}

		return result;
	},

	/**
	 * Return the tokens if they're a single map() expression and nothing more.  E.g:
	 * this.items.map(x => x)
	 * or
	 * this.items.map(x => `<p>${... any other expressions ...}</p>`)
	 * or
	 * this.items.map((x, index, array) => `<p>${... any other expressions ...}</p>`)
	 *
	 * TODO: This function needs to be rewritten adn cleaned up.
	 * TODO:  this.items.map(function(x) { return x})
	 *
	 * @param tokens {Token[]}
	 * @param vars {string[]} Name of variables in scope.  So we can have more than just `this.varname`
	 * @return {[string[], Token[]]|[null, null]} The loop param names and the loop body. */
	simpleMapExpression_(tokens, vars=[]) {

		let loopMatch = [
			Parse.createVarExpression_(vars),
			Parse.ws, '.', Parse.ws, 'map', Parse.ws, '(', Parse.ws
		];
		// this.array.map(
		let mapExpr = fregex.matchFirst(loopMatch, tokens);
		if (!mapExpr)
			return [null, null];

		let funcTokens = tokens.slice(mapExpr.length);
		let startIndex = Parse.findFunctionStart_(funcTokens);

		// Fail if function isn't the first thing in the map expression.
		if (startIndex === null || startIndex !== 0)
			return [null, null];
		let func = new ParsedFunction(funcTokens.slice(startIndex), true, () => false);

		// Fail if we can't parse the function.
		if (!func)
			return [null, null];

		// Fail if there's more code after the end of the map expression
		let mapEnd = fregex([Parse.ws, ')', Parse.ws, fregex.zeroOrOne(';'), Parse.ws, fregex.end]);
		let funcEndIndex = mapExpr.length + func.bodyStartIndex_ + func.bodyTokens_.length;
		if (!(mapEnd(tokens.slice(funcEndIndex))))
			return [null, null];

		return [[...func.getArgNames()], func.bodyTokens_];
	},

	/**
	 *
	 * It should match:
	 * Object.keys(this.obj).map(x => `...`);
	 * Object.values(this.obj).map(x => `...`);
	 * Object.entries(this.obj).map(([key, value]) => ``
	 *
	 *
	 * @param tokens
	 * @param vars
	 * @private
	 */
	objectMapExpression_(tokens, vars=[]) {},

	/**
	 * Find expressions that start with "this" or with local variables.
	 * @param tokens {Token[]}
	 * @param vars {string[]} List of local variables.
	 * @return {Token[][]} */
	varExpressions_(tokens, vars=[]) {
		let result = fregex.matchAll(Parse.createVarExpression_(vars), tokens);

		// Discard any paths that come after a ".", which means they occur within another variable expression.
		// E.g. we dont' want to return "a.b" and also the "b" from the second part of that path.
		// TODO: But what about when one expression is within another:
		// this.items[this.index]
		return result.filter(path => tokens[path.index-1] != '.' && tokens[path.index-1] != '?.');
	},

	/**
	 * ['this', '.', 'fruits', '[', '0', ']'] becomes ['this', 'fruits', '0']
	 * @param expr {string[]}
	 * @return {string[]} */
	varExpressionToPath_(expr) {
		let result = [];
		for (let piece of expr)
			if (piece == 'this' || piece.type === 'identifier' || piece.type === 'number')
				result.push(piece + '');
			else if (piece.type === 'string' || piece.type === 'template') // part of this['that']['somethingElse']
				result.push(eval(piece + '')); // Evaluate string.  Unlike JSON.parse(), eval() handles "string", 'string', and `string`

		return result;
	}
};



let varExprCache = {};


// Whitespace
Parse.ws = fregex.zeroOrMore(fregex.or(
	{type: 'whitespace'}, {type: 'ln'}
));

let indexType = [
	{type: 'number'},
	{type: 'hex'},
	{type: 'string'},
	{type: 'template'},
];

// TODO: actually parse instead of just finding the right type of tokens.
Parse.isLValue_ = fregex.oneOrMore(
	fregex.or(
		'this', '.', '[', ']', {type: 'identifier'}, {type: 'number'}, {type: 'hex'}, {type: 'string'}, {type: 'template'}, {type: 'whitespace'}, {type: 'ln'}
	)
);

let terminator = fregex.lookAhead([
	fregex.or(
		fregex.end, // no more tokens
		fregex.not(Parse.ws, '(')
	)
]);
let property = fregex(
	fregex.or(
		fregex(Parse.ws, fregex.or('.', '?.') , Parse.ws, {type: 'identifier'}), //.item
		fregex(Parse.ws, fregex.zeroOrOne('?.'), '[',  Parse.ws, fregex.or(...indexType), Parse.ws, ']') // ['item']
	),
	terminator // TODO: Why is the terminator here?
);

var div = document.createElement('div');
var decodeCache_ = {};

var Html = {

	/**
	 * Convert html entities like &lt; to their literal values like <.
	 * @param {string} html
	 * @return {string} */
	decode(html) {
		if (!html)
			return '';

		return html // Fast solution inspired by https://stackoverflow.com/a/43282001
			.replace(/&[#A-Z0-9]+;/gi, entity => {
				let result = decodeCache_[entity];
				if (result)
					return result;

				div.innerHTML = entity; // create and cache new entity
				return decodeCache_[entity] = div.textContent;
			});

	},

	encode(text, quotes='') {
		text = utils.toString(text) // TODO: This changes 0 to ''
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\a0/g, '&nbsp;');
		if (quotes.includes("'"))
			text = text.replace(/'/g, '&apos;');
		if (quotes.includes('"'))
			text = text.replace(/"/g, '&quot;');
		return text;
	}
};

class VText {

	text = '';

	/** @type {Node} */
	el = null;

	/** @type {Refract} */
	refr_ = null;

	startIndex_ = 0;

	constructor(text='', refr=null) {
		this.refr_ = refr;
		if (text === null || text === undefined)
			text = '';
		else if (typeof text !== 'string' && !(text instanceof String))
			text = JSON.stringify(text); // instanceof detects strings with added properties.

		this.text = Html.decode(text);
	}

	/**
	 * @param parent {?HTMLElement}
	 * @param el {HTMLElement|Node?}
	 * @return {int} */
	apply_(parent=null, el=null) {
		if (el)
			this.el = el;
		else {
			let text;

			// If text inside a style tag that's not inside our own component's shadow root.
			if (parent.tagName === 'STYLE' && !this.refr_.contains(parent.getRootNode()?.host)) {
				if (!this.refr_.dataset.style) {
					this.refr_.constructor.styleId = (this.refr_.constructor.styleId || 0) + 1; // instance count.
					this.refr_.dataset.style = this.refr_.constructor.styleId;
				}

				let rTag = this.refr_.tagName.toLowerCase();

				text = VText.styleReplace_(this.text, rTag, this.refr_.dataset.style);
			}
			else
				text = this.text;


			if (this.el) { // Setting textContent will handle html entity <>& encoding properly.
				this.el.textContent = text;
			} else {
				this.el = parent.ownerDocument.createTextNode(text);
				parent = parent.shadowRoot || parent;
				parent.insertBefore(this.el, parent.childNodes[this.startIndex_]);
			}

			if (Refract.elsCreated)
				Refract.elsCreated.push(utils.toString(text));
		}

		return 1;
	}

	clone_() {
		let result = new VText();
		result.text = this.text;
		result.refr_ = this.refr_;
		return result;
	}

	remove_() {
		this.el.parentNode.removeChild(this.el);
	}

	//#IFDEV
	toString() {
		return this.text;
	}
	//#ENDIF

	static styleReplace_(text, rTag, styleId) {
		return text.replace(new RegExp(rTag+'|:host', 'g'), rTag + '[data-style="' +  styleId + '"]')
	}
}

class ScopeItem {
	/** @type {string[]} */
	path;

	value;

	/**
	 * @param path {string[]}
	 * @param value {*} */
	constructor(path, value=undefined) {
		this.path = path;
		this.value = value;
	}

	clone_() {
		return new ScopeItem(this.path.slice(), this.value);
	}
}


/**
 * @extends {Map<string, ScopeItem>} */
class Scope extends Map {

	/**
	 * @return {Scope} */
	clone_() {
		let result = new Scope();
		for (let [name, scopeItem] of this)
			result.set(name, scopeItem.clone_());
		return result;
	}

	/**
	 * Convert a local variable path to a path from the root Refract element.
	 * @param path {string[]}
	 * @return {string[]} */
	getFullPath_(path) {
		if (path[0] === 'this')
			return path;

		let parentScope;
		while (parentScope = this.get(path[0]))
			path = [...parentScope.path, ...path.slice(1)];
		return path;
	}
}

/**
 * A parsed ${} or #{} expression embedded in an html template ``  */
class VExpression {

	/**
	 * @type {string[][]} Array of watched paths, parsed from the expression.
	 * Local variables here are not evaluated to their absolute paths.  See also this.watches. */
	watchPaths_ = [];

	/**
	 * @type {string|null} Only used when the expression is inside an attribute.
	 * If it's an empty string, that means it's an attribute expression.  E.g. ${'checked'}*/
	attrName_ = null;

	/** @type {string[]|null} If an expression that creates attributes, keep track of them here. */
	attributes_ = null;

	/**
	 * @type {string} simple|complex|loop
	 * simple:  ${this.field[0].value} or ${this.fields} or ${this.field[this.index].value} .  An lvalue.
	 * complex: ${JSON.stringify(this.fields)} or ${foo(this.array)).map(x => `${x}`)}
	 * loop:    ${this.fields.map(item => ...)}
	 *
	 * If type==='simple', the first watch path is the variable printed.
	 * If type==='loop', the first watchPath is the loop array. */
	type = 'simple';

	/**
	 * Is this a #{...} expression?
	 * @type {boolean} */
	isHash = false;

	/**
	 * Function that executes the whole expression at once, or if type==='loop', evaluate the portion of the expression
	 * that gives the loop for the array.
	 * E.g. if we have, this.$items.map(x => x+1), this function returns the array pointed to by this.$items.
	 * @type {?function} */
	exec_ = null;

	/**
	 * Names of the parameters accepted by the function given to array.map().
	 * E.g. ['item', 'index', 'array'] for array.map((item, index, array) => {...});
	 * @type {string[]} */
	loopParamNames_ = [];

	/**
	 * TODO: Rename to loopTemplates?
	 * @type {(VElement|VText|VExpression)[]} Used only with type='loop'. The un-evaluated elements that make up one iteration of a loop.
	 * Together with loopParamNames, this can be used to create a function that returns each loop item.*/
	loopItemEls_ = [];




	// These are specific to the copy of each VExpression made for each Refract.

	/** @type {Refract} */
	refr_ = null;

	/** @type {HTMLElement} */
	parent_ = null;

	/** @type {VElement|VExpression} */
	vParent_ = null;

	/**
	 * Virtual children created after the loopItemEls are evaluated (but not recursively).
	 * Unlike VElement.vChildren, this is an array of arrays, with each sub-array
	 * having all the vChildren created with each loop iteration.
	 *
	 * @type {(VElement|VExpression|VText|HTMLElement)[][]} */
	vChildren_ = [];



	/**
	 * @deprecated for scope3
	 * @type {Object<string, *>} */
	scope_ = {};

	/**
	 * Stores a map from local variable names, to their value and their path from the root Refract object. */
	scope3_ = new Scope();

	/** @type {int} DOM index of the first DOM child created by this VExpression within parent. */
	startIndex_ = 0;

	/** @type {int} the number of DOM children created by this VExpression within parent. */
	childCount_ = 0;

	/**
	 * Arguments passed to Watch.add() for this expression.  We track them here so we can later remove them via Watch.remove().
	 * See also this.watchPaths.
	 * @type {[root:Refract|Object, path:string[], callback:function][]} */
	watches_ = [];

	//#IFDEV
	/** @type {string} For debugging only. */
	code = '';
	//#ENDIF

	// Evaluate and loopItem functions update both this.children and the real DOM elements.

	/**
	 * Take an array of javascript tokens and build a VExpression from them.
	 * @param tokens {?Token[]} May or may not include surrounding ${ ... } tokens.
	 * @param vParent {VElement|VExpression}
	 * @param scopeVars {?string[]} NAmes of variables created by parent loops.  This lets us build watchPaths only of variables
	 *     that trace back to a this.property in the parent Refract, instead of from any variable or js identifier.
	 *     Note this is different than the scope property which is copied from the vParent.
	 * @param attrName {?string} If set, this VExpression is part of an attribute, otherwise it creates html child nodes.
	 * @return {VExpression} */
	constructor(tokens=null, vParent=null, scopeVars=null, attrName=null) {
		this.vParent_ = vParent;
		if (vParent) {
			this.refr_ = vParent.refr_;
			//#IFDEV
			if (parent)
				assert(this.refr_);
			//#ENDIF


			this.scope_ = {...vParent.scope_};
			this.scope3_ = vParent.scope3_.clone_();
			//console.log(this.code, this.scope)
		}

		if (tokens) {
			// remove enclosing ${ }
			let isHash = tokens[0].text == '#{';
			if ((tokens[0].text == '${' || isHash) && tokens[tokens.length - 1].text == '}') {
				this.isHash = isHash;
				tokens = tokens.slice(1, -1); // Remove ${ and }
			}

			this.code = tokens.map(t => t.text).join('').trim(); // So we can quickly see what a VExpression is in the debugger.


			// Find the watchPathTokens before we call fromTokens() on child elements.
			// That way we don't descend too deep.
			scopeVars = (scopeVars || []).slice(); // copy
			let watchPathTokens = Parse.varExpressions_(tokens, scopeVars);

			// Find loopItem props if this is a loop.
			let [loopParamNames, loopBody] = Parse.simpleMapExpression_(tokens, scopeVars);

			// Get the createFunction() from the class if it's already been instantiated.  Else use Refract's temporary createfunction().
			// This lets us use other variabls defiend in the same scope as the class that extends Refract.
			if (loopBody) {
				this.type = 'loop';

				// When type==='loop', the .exec() function returns the array used by the loop.
				this.loopParamNames_ = loopParamNames;

				for (let p of loopParamNames)
					scopeVars.push(p);

				this.exec_ = this.refr_.constructor.createFunction(...scopeVars, 'return ' + watchPathTokens[0].join(''));

				// If the loop body is a single `template` string:
				// TODO Why is this special path necessary, instead of always just using the else path?
				let loopBodyTrimmed = loopBody.filter(token => token.type !== 'whitespace' && token.type !== 'ln');
				if (loopBodyTrimmed.length === 1 && loopBodyTrimmed[0].type === 'template') {
					// Remove beginning and end string delimiters, parse items.
					this.loopItemEls_ = VElement.fromTokens_(loopBodyTrimmed[0].tokens.slice(1, -1), scopeVars, vParent, this.refr_);
				}

				// The loop body is more complex javascript code:
				else {
					// TODO: No tests hit htis path.
					this.loopItemEls_ = [new VExpression(loopBody, this, scopeVars)];
				}
			} else {

				// TODO: This duplicates code executed in Parse.varExpressions_ above?
				if (Parse.createVarExpression_(scopeVars)(tokens) !== tokens.length) {
					// This will find things like this.values[this.index].name
					if (Parse.isLValue_(tokens) === tokens.length)
						this.type = 'simple';
					else
						this.type = 'complex';
				}

				// Build function to evaluate expression.
				// Later, scope object will be matched with param names to call this function.
				// We call replacehashExpr() b/c we're valuating a whole string of code all at once, and the nested #{} aren't
				// understood by the vanilla JavaScript that executes the template string.
				tokens = Parse.replaceHashExpr_(tokens, null, this.refr_.constructor.name);

				/**
				 * We want sub-templates within the expression to be parsed to find their own variables,
				 * so we escape them, so they're not evaluated as part of the outer template.
				 * Unless we do this, their own variables will be evaluated immediately, instead of parsed and watched. */
				// console.log(tokens.join(''));

				tokens = Parse.escape$_(tokens);
				//console.log(tokens.join(''));

				// Trim required.  B/c if there's a line return after return, the function will return undefined!
				let body = Html.decode(tokens.map(t => t.text).join(''));
				if (tokens[0].text !== '{')
					body = 'return (' + body.trim() + ')';
				this.exec_ = this.refr_.constructor.createFunction(...scopeVars, body);
			}

			// Get just the identifier names between the dots.
			// ['this', '.', 'fruits', '[', '0', ']'] becomes ['this', 'fruits', '0']
			for (let watchPath of watchPathTokens)
				this.watchPaths_.push(Parse.varExpressionToPath_(watchPath));
		}
	}

	/**
	 * Evaluate this expression and either add children to parent or set attributes on parent.
	 * @param parent {HTMLElement} If set, this is always eqeual to this.parent?
	 * @param el {HTMLElement} Unused.  Only here to match
	 * @return {int} Number of elements created. d*/
	apply_(parent=null, el=null) {
		this.parent_ = parent || this.parent_;

		// if (window.debug)
		// 	debugger;

		//#IFDEV

		// See if this ever happens?
		if (parent && parent !== this.parent_)
			debugger;


		if (this.attrName_)
			throw new Error("Cannot apply an VExpression that's for an attribute.  Use evalVAttribute() or .exec.apply() instead.");

		// Make sure we're not applying on an element that's been removed.
		if (!('virtualElement' in this.parent_) && !this.parent_.parentNode) {
			debugger;
			return 0;
		}
		//#ENDIF

		// VExpression creates one or more attributes.
		if (this.attributes_) {
			for (let attr of this.attributes_)
				parent.removeAttribute(attr);
			this.attributes_ = [];

			let text = this.evaluate_();
			if (text) {
				let tokens = lex(lexHtmlJs, text, 'tag');
				let lastName = null;
				for (let token of tokens) {
					if (token.type === 'attribute') {
						if (lastName)
							parent.setAttribute(lastName, '');
						lastName = token;
						this.attributes_.push(lastName);
					} else if (token.type === 'string') {
						// tokens[1] is in between "..."
						// TODO: Later we should add code to evaluate any vexpressions within it?
						parent.setAttribute(lastName, token.tokens[1]);
						lastName = null;
					}
				}
				if (lastName)
					parent.setAttribute(lastName, '');
			}

			return 0;
		}

		// VExpression creates DOM nodes.
		else {

			// Remove old children.
			for (let group of this.vChildren_)
				if (group instanceof HTMLElement)
					group.parentNode.removeChild(group);
				else
					for (let vChild of group.slice()) // Slice because vChild.remove_() can alter group, throwing off the index.
						vChild.remove_();

			// Create new children.
			this.vChildren_ = this.evaluateToVElements_();

			// Add children to parent.
			let count = 0;
			let startIndex = this.startIndex_;
			for (let item of this.vChildren_) {
				if (item instanceof HTMLElement) {
					this.parent_.insertBefore(item, this.parent_.childNodes[startIndex]);
					startIndex ++;
				}
				else
					for (let vChild of item) {
						vChild.startIndex_ = startIndex;
						let num = vChild.apply_(this.parent_, null);
						startIndex += num;
						count += num;
					}
			}

			return count;
		}
	}

	/**
	 * Typically called when a new element is instantiated, to clone a new instance of the virtual tree for that element.
	 * @param refr {Refract?}
	 * @param vParent {VElement?}
	 * @param parent {HTMLElement?}
	 * @return {VExpression} */
	clone_(refr=null, vParent=null, parent=null) {
		let result = new VExpression();
		result.watchPaths_ = this.watchPaths_;
		result.attrName_ = this.attrName_;
		result.attributes_ = this.attributes_;

		result.type = this.type;
		result.exec_ = this.exec_;
		result.loopParamNames_ = this.loopParamNames_;
		result.loopItemEls_ = this.loopItemEls_;


		// Properties specific to each instance.
		result.refr_ = refr || this.refr_;
		result.parent_ = parent || this.parent_;
		result.vParent_ = vParent || this.vParent_;

		result.startIndex_ = this.startIndex_;
		result.childCount_ = this.childCount_;

		result.scope_ = {...this.scope_};
		result.scope3_ = this.scope3_.clone_();

		result.isHash = this.isHash;

		result.code = this.code;

		return result;
	}

	/**
	 * @return {string|string[]} */
	evaluate_() {
		return this.exec_.apply(this.refr_, Object.values(this.scope_));
	}

	/**
	 * @pure
	 * Non-recursively resolve this and all child VExpressions, returning a tree of VElement and VText.
	 * Does not modify the actual DOM.
	 * @return {(VElement|VText|VExpression|HTMLElement)[][]} */
	evaluateToVElements_() {

		// Remove previous watches.
		// TODO: Only do this if the watches are changing.
		// this.watch() should return an array of watch params, so we can compare them.
		for (let watch of this.watches_)
			Watch.remove(...watch);
		this.watches_ = [];

		// Add new watches
		if (!this.receiveNotificationBindThis_)
			this.receiveNotificationBindThis_ = this.receiveNotification_.bind(this);
		this.watch_(this.receiveNotificationBindThis_);


		let result = [];
		if (this.type !== 'loop') {
			//#IFDEV
			if (!this.refr_)
				throw new Error();
			//#ENDIF

			let htmls = [this.evaluate_()]
				.flat().map(h=>h===undefined?'':h); // undefined becomes empty string

			if (this.isHash) // #{...} template
				result = [htmls.map(html => new VText(html, this.refr_))]; // We don't join all the text nodes b/c it creates index issues.
			else {
				let scopeVarNames = Object.keys(this.scope_);
				for (let html of htmls) {
					if (html instanceof HTMLElement) {
						result.push(html); // not a VElement[], but a full HTMLElement
					}
					else {
						html += ''; // can be a number.
						if (html.length) {
							let vels = VElement.fromHtml_(html, scopeVarNames, this, this.refr_).flat();
							result.push(vels);
						}
					}
				}
			}

		} else { // loop
			let array = this.evaluate_();
			if (!array)
				throw new Error(`${this.watchPaths_[0].join('.')} is not iterable in ${this.code}`);

			let i = 0;
			for (let item of array) {
				let group = [];
				let params = [array[i], i, array];

				for (let template of this.loopItemEls_) {
					let vel = template.clone_(this.refr_, this);
					this.setScope_(vel, params, i);
					group.push(vel);
				}

				result.push(group);
				i++;
			}
		}

		return result;
	}

	/**
	 * Populate the scope property of the virtual element that's a child of this VExpression.
	 * @param vel {VElement|VExpression}
	 * @param params {*[]} Values of the parameters given to this VExpression's map() function.
	 * @param index {int}
	 */
	setScope_(vel, params, index) {
		vel.scope_ = {...this.scope_};
		vel.scope3_ = this.scope3_.clone_();

		// Assign values to the parameters of the function given to .map() that's used to loop.
		// If this.type !== 'loop', then loopParamNames will be an empty array.
		for (let j in this.loopParamNames_) {  // Benchmarking shows this loop is about 2% faster than for...in.
			vel.scope_[this.loopParamNames_[j]] = params[j];

			// Path to the loop param variable:
			let path = [...this.watchPaths_[0], index + '']; // VExpression loops always have one watchPath.
			let fullPath = this.scope3_.getFullPath_(path);
			vel.scope3_.set(this.loopParamNames_[j], new ScopeItem(fullPath, [params[j]])); // scope3[name] = [path, value]
		}
	}

	/**
	 * Called when a watched value changes.
	 * TODO: Write addLoopItem and removeLoopItem functions?
	 * Just call apply() when updating existing loop items?
	 * @param action {string} Can be 'remove', 'insert', or 'set'.
	 * @param path {string[]}
	 * @param value {string} not used.
	 * @param oldVal {string} not used.
	 * @param root {object|array} The unproxied root object that the path originates form. */
	receiveNotification_(action, path, value, oldVal, root) {

		// VExpression.remove() sets vParent = null.
		// This check makes sure that this VExpression wasn't already removed by another operation triggered by the same watch.
		if (!this.vParent_)
			return;


		// Path 1:  If modifying a property on a single array item.
		// -2 because we're modifying not a loop item child, but a property of it.
		// Path 1:  If modifying a property on a single array item.
		if (this.type==='loop' && path.length > 2 && utils.arrayStartsWith_(path.slice(0, -2), this.watchPaths_[0].slice(1))) {
			// Do nothing, because the watch should trigger on the child VExpression instead of this one.
			return;
		}

		// If we've had the initial render but autoRender is currently disabled
		if (!this.refr_.__autoRender && this.refr_.virtualElement) {
			this.refr_.__toRender.set(this, arguments);
			return;
		}

		Globals.currentVElement_ = this;
		this.childCount_ = this.getAllChildrenLength_();

		// Path 2:  If inserting, removing, or replacing a whole item within an array that matches certain criteria.
		if (this.type !== 'complex' && path[path.length - 1].match(/^\d+$/)) {
			let arrayPath = path.slice(0, -1);

			// We can delve watchlessly because we're not modifying the values.
			let array = delve(root, arrayPath);

			// If the array is one of our watched paths:
			// TODO: watchPaths besides 0?  Or only go this way if there's only one watchPath?
			if (Array.isArray(array) && utils.arrayEq_(this.watchPaths_[0].slice(1), arrayPath)) {

				let index = parseInt(path[path.length - 1]);
				if (action === 'remove') { // TODO: Combine with remove step below used for set.
					for (let vChild of this.vChildren_[index])
						vChild.remove_();
					this.vChildren_.splice(index, 1);
				}

				else { // insert or set

					// 1. Remove old ones from the DOM
					if (action === 'set' && this.vChildren_[index])
						for (let vChild of this.vChildren_[index])
							vChild.remove_();

					// 2. Create new loop item elements.
					if (action === 'insert')
						this.vChildren_.splice(index, 0, []);

					if (this.type === 'simple') // A simple expression ${this.var} always just prints the value.
						this.vChildren_[index] = [new VText(array[index], this.refr_)]; // TODO: What about html-escape?
					else { // loop
						this.vChildren_[index] = this.loopItemEls_.map(vel => vel.clone_(this.refr_, this));

					}

					// 3. Add/update those new elements in the real DOM.
					let i = 0;
					let startIndex = this.arrayToChildIndex_(index); // TODO: Could it be faster to get the index from an existing vchild here?
					let params = [array[index], index, array];
					for (let newItem of this.vChildren_[index]) {
						newItem.startIndex_ = startIndex + i;
						newItem.parent_ = this.parent_; // Everything works even when this is commented out.

						this.setScope_(newItem, params, i+index);
						newItem.apply_(this.parent_, null);
						i++;
					}
				}

				this.updateSubsequentIndices_();
				Globals.currentVElement_ = null;
				return;
			}
		}

		// Path 3:  Replace all items:
		this.apply_();
		this.updateSubsequentIndices_();

		Globals.currentVElement_ = null;


		// TODO: Should we have a path that generates the new children and compares them with the existing children and only change what's changed?
	}


	/**
	 * Remove this VExpression and its children from the virtual DOM. */
	remove_() {

		// 1 Remove watches
		for (let watch of this.watches_)
			Watch.remove(...watch);
		this.watches_ = [];

		// 2. Remove children, so that their watches are unsubscribed.
		for (let group of this.vChildren_)
			if (group instanceof HTMLElement)
				group.parentNode.removeChild(group);
			else
				for (let vChild of group) // TODO: Should group be .slice() like it is in apply() above?
					vChild.remove_();

		// This is necessary because notification callbacks may try to remove a vexpression more than once.
		// E.g. one will remove its parent vexpression and another will remove this one ourselves.
		// If we don't reset the vChildren array after the first remove, we'll try to remove elements more than once.
		// This is covered by the test: Refract.loop.ExprNested
		this.vChildren_ = [];

		// 3. Remove from parent.
		if (this.vParent_ instanceof VElement) {

			// TODO: Keep an index somewhere so this can be done in constant, not linear time.
			let index = this.vParent_.vChildren_.indexOf(this);
			//#IFDEV
			if (index < 0)
				throw new Error();
			//#ENDIF
			this.vParent_.vChildren_.splice(index, 1);

		}
		else // Parent is VEXpression
			for (let group of this.vParent_.vChildren_) {
				let index = group.indexOf(this);
				if (index >= 0) {
					group.splice(index, 1);
					break;
				}
			}

		// This is an easy way to test of a vexpression has been removed.
		this.vParent_ = null;
	}

	/**
	 * Recurse through vChildren to find all DOM children created by this VExpression.
	 * @return {(Node|HTMLElement)[]} */
	// getAllChildren() {
	// 	let result = [];
	// 	for (let group of this.vChildren) {
	// 		for (let vChild of group) {
	// 			if (vChild instanceof VExpression)
	// 				for (let vChild2 of vChild.getAllChildren())
	// 					result.push(vChild2.el);
	// 			else
	// 				result.push(vChild.el);
	// 		}
	// 	}
	// 	return result;
	// }

	/**
	 * @return {int} */
	getAllChildrenLength_() {
		let result = 0;
		for (let group of this.vChildren_) {
			if (group instanceof HTMLElement)
				result ++;
			else
				for (let vChild of group) {
					if (vChild.receiveNotification_) // Faster than (vChild instanceof VExpression)
						result += vChild.getAllChildrenLength_();
					else
						result++;
				}
		}

		return result;
	}

	/**
	 * Convert an index in this expression's loop array into the DOM child index.
	 * Since one loop item might create multiple children.
	 * @param index {int} */
	arrayToChildIndex_(index) {

		let result = this.startIndex_;

		// Get this VExpression's children before index.
		for (let group of this.vChildren_.slice(0, index)) {
			for (let vel of group) {
				if (vel instanceof VExpression)
					result += vel.getAllChildrenLength_();
				else
					result++;
			}
		}

		//#IFDEV
		if (result < 0)
			throw new Error();
		//#ENDIF

		return result;
	}

	/**
	 * Get the next VExpression that shares the same DOM element as a parent.
	 * @return {VExpression|null} */
	getNextVExpression_() {

		let vSiblings = this.vParent_.vChildren_.flat();

		// Check siblings for another VExpression.
		let index = vSiblings.indexOf(this);
		for (let vSibling of vSiblings.slice(index + 1))
			if (vSibling instanceof VExpression)
				return vSibling;

		// If not, go up a level, if that level has the same parent.
		if (this.vParent_.parent_ === this.parent_ && (this.vParent_ instanceof VExpression))
			return this.vParent_.getNextVExpression_();

		return null;
	}

	updateSubsequentIndices_() {
		let newLength = this.getAllChildrenLength_();
		let diff = newLength - this.childCount_;

		// Stop if going into a different parent
		let next = this;
		while (next = next.getNextVExpression_()) {
			next.startIndex_ += diff;
		}
	}

	/**
	 * All calls to Watch.add() (i.e. all watches) used by Refract come through this function.
	 * @param callback {function} */
	watch_(callback) {

		for (let path of this.watchPaths_) {
			let root = this.refr_;
			let scope;

			// slice() to remove the "this" element from the watch path.
			if (path[0] === 'this')
				path = path.slice(1);

			// Allow paths into the current scope to be watched.
			else if (path[0] in this.scope_ && path.length > 1) {

				// Resolve root to the path of the scope.
				root = this.scope_[path[0]];
				path = path.slice(1);
			}

			// If a path of length 1, subscribe to the parent array or object instead.
			// The 100k options benchmark is about 30% faster if I replace this brance with a continue statement.
			else if (scope = this.scope3_.get(path[0])) {

				// Only watch this path if it's an array or object, not a primitive.
				let obj = delve(root, scope.path.slice(1), delve.dontCreate, true);
				if (typeof obj !== 'object' && !Array.isArray(obj))
					continue;

				root = delve(this.refr_, scope.path.slice(1, -1), delve.dontCreate, true);
				path = scope.path.slice(-1);
			}



			// Make sure it's not a primitive b/c we can't subscribe to primitives.
			// In such cases we should already be subscribed to the parent object/array for changes.
			if (path.length && (typeof root === 'object' || Array.isArray(root))) {
				// An expression that's just ${this} won't have a length.  E.g. we might have <child-el parent="${this}"></child-el>

				this.watches_.push([root, path, callback]);  // Keep track of the subscription so we can remove it when this VExpr is removed.
				Watch.add(root, path, callback);

			}
		}
	}
}

lexHtmlJs.allowHashTemplates = true;

/**
 * A virtual representation of an Element.
 * Supports expressions (VExpression) as attributes and children that can be evaluated later. */
class VElement {
	tagName = '';

	/** @type {Object<string, (string|VExpression)[]>} */
	attributes_ = {};

	/** @type {VExpression[]} Expressions that create whole attribute name/value pairs. */
	attributeExpressions_ = [];


	/** @type {Refract} */
	refr_ = null;

	/** @type {HTMLElement|HTMLInputElement} */
	el = null;


	/** @type {VElement} */
	vParent_ = null;

	/** @type {(VElement|VExpression|VText)[]} */
	vChildren_ = [];

	/**
	 * TODO: We can speed things up if a VElement has no expressions within it.
	 * And no ids, no svg's, no events, no shadowdom, and no slots.
	 *
	 * We should just store the html, and create it as needed.
	 * Instead of recursing through all of the VElements attributes and children.
	 *
	 * I can add an getStaticCode() function that calculates and caches static code if it's static.
	 *
	 * Or we can apply id's, events, shadowdom, and slots manually after creating it?
	 * @type {string|null} */
	//staticCode = null;

	/**
	 * @deprecated for scope3
	 * @type {Object<string, string>} */
	scope_ = {};

	/**
	 * Stores a map from local variable names, to their value and their path from the root Refract object. */
	scope3_ = new Scope();

	/** @type {int} DOM index of the first DOM child created by this VExpression within parent. */
	startIndex_ = 0;

	/**
	 * @param tokens {?Token[]}
	 * @param parent {VElement|VExpression|Refract}
	 * @param scopeVars {string[]}*/
	constructor(tokens=null, parent=null, scopeVars=null) {

		if (parent instanceof HTMLElement)
			this.refr_ = parent;
		else if (parent) {
			this.vParent_ = parent;
			this.refr_ = parent.refr_;
			this.scope_ = {...parent.scope_};
			this.scope3_ = parent.scope3_.clone_();
		}

		//#IFDEV
		if (parent)
			assert(this.refr_);
		//#ENDIF

		if (tokens) {
			let attrName='';
			let tagTokens = tokens.filter(token => token.type !== 'whitespace'); // Tokens excluding whitespace.

			for (let j=0, token; (token = tagTokens[j]); j++) {
				if (j === 0)
					this.tagName = token.text.slice(1);

				else if (token.type === 'attribute') {
					attrName = token.text;
					this.attributes_[attrName] = []; // Attribute w/o value, or without value yet.
				}

				// Attribute value string or expression
				else if (attrName && tagTokens[j-1] == '=') {
					let attrValues = [];

					// Tokens within attribute value string.
					if (token.type === 'string')
						for (let exprToken of token.tokens.slice(1, -1)) { // slice to remove surrounding quotes.
							if (exprToken.type === 'expr')
								attrValues.push(new VExpression(exprToken.tokens, this, scopeVars, attrName));
							else // string:
								attrValues.push(exprToken.text);
						}
					else if (token.type === 'expr') // expr not in string.
						attrValues.push(new VExpression(token.tokens, this, scopeVars, attrName));
					//#IFDEV
					else
						throw new Error(); // Shouldn't happen.
					//#ENDIF

					this.attributes_[attrName] = attrValues;
					attrName = undefined;
				}

				// Expression that creates attribute(s)
				else if (token.type === 'expr') {
					let expr = new VExpression(token.tokens, this, scopeVars);
					expr.attributes_ = []; // Marks it as being an attribute expression.
					this.attributeExpressions_.push(expr);
				}
				else if (token.text === '>' || token.text === '/>')
					break;
			}

		}

		//this.scope3 = scope;
	}



	/**
	 * Add or update the HTMLElement linked to this VElement.
	 * apply() always replaces all children.  If this is to aggressive, apply() should be called
	 * on only the child elements that should be updated.
	 *
	 * @param parent {HTMLElement}
	 * @param el {HTMLElement} */
	apply_(parent=null, el=null) {
		let tagName = this.tagName;

		if (tagName === 'svg')
			inSvg = true;
		var oldEl = this.el;


		// 1A. Binding to existing element.
		if (el) {
			this.el = el;

			// This will cause trouble when we call cloneNode() on an element with a slot.
			// Because then the slot will be added to the slot, recursively forever.
			// So we only allow setting content that doesn't have slot tags.
			if (!el.querySelector('slot'))
				this.refr_.slotHtml = el.innerHTML; // At this point none of the children will be upgraded to web components?
			el.innerHTML = '';
		}
		// 1B. Create Element
		else {
			var newEl;
			Globals.currentVElement_ = this;

			// Special path, because we can't use document.createElement() to create an element whose constructor
			//     adds attributes and child nodes.
			// https://stackoverflow.com/questions/43836886
			if (tagName.includes('-') && customElements.get(tagName)) {
				let Class = customElements.get(tagName);

				let args = [];
				if (Class.prototype.init) {// new path with init()
					args = Refract.compiler.populateArgsFromAttribs(this, Class.getInitArgs_());
				}
				//#IFDEV
				else if (Class.constructorArgs) // old path that uses constructor()
					args = Class.constructorArgs.map(name => this.getAttrib_(name));
				//#ENDIF


				// Firefox:  "Cannot instantiate a custom element inside its own constructor during upgrades"
				// Chrome:  "TypeError: Failed to construct 'HTMLElement': This instance is already constructed"
				// Browsers won't let us nest web components inside slots when they're created all from the same html.
				// So we use this crazy hack to define a new version of the element.
				// See the Refract.nested.recursive test.
				let i = 2;
				let tagName2 = tagName;
				while (tagName2.toUpperCase() in Globals.constructing_) {
					tagName2 = tagName + '_' + i;
					var Class2 = customElements.get(tagName2);
					if (Class2) {
						Class = Class2;
						break;
					}

					else {
						Class = class extends Class {};
						customElements.define(tagName2, Class);
						i++;
					}
				}

				// If this code fails in the future due to an element not finished constructing/upgrading,
				// then modify the Refract constructor injecting code to make sure that
				// delete Refract.constructing[this.tagName]]
				// goes at the very end of the constructor.

				newEl = new Class(...args);
			}
			else if (inSvg) // SVG's won't render w/o this path.
				newEl = document.createElementNS('http://www.w3.org/2000/svg', tagName);
			else
				newEl = document.createElement(tagName);

			//newEl.style.display = 'none';
			if (oldEl) {  // Replacing existing element
				oldEl.parentNode.insertBefore(newEl, oldEl);
				oldEl.remove();
			} else {// if (parent)

				if (!oldEl) {
					let p2 = parent.shadowRoot || parent;

					// Insert into slot if it has one.  TODO: How to handle named slots here?
					if (p2 !== this.refr_ && p2.tagName && p2.tagName.includes('-') && newEl.tagName !== 'SLOT')
						p2 = p2.querySelector('slot') || p2;
					p2.insertBefore(newEl, p2.childNodes[this.startIndex_]);
				}
			}


			//Refract.virtualElements.set(newEl, this);
			this.el = newEl;


			Globals.currentVElement_ = null;

			if (Refract.elsCreated)
				Refract.elsCreated.push('<'+tagName + '>');
		}


		// 2. Shadow DOM
		if (!this.el.shadowRoot && 'shadow' in this.attributes_)
			this.el.attachShadow({mode: this.el.getAttribute('shadow') || 'open'});

		// 3. Slot content
		let count = 0;
		if (tagName === 'slot') {
			let slotChildren = VElement.fromHtml_(this.refr_.slotHtml, Object.keys(this.scope_), this, this.refr_);
			for (let vChild of slotChildren) {
				vChild.scope_ = {...this.scope_};
				vChild.scope3_ = this.scope3_.clone_();
				vChild.startIndex_ = count;
				count += vChild.apply_(this.el);
			}
		}

		// 4. Recurse through children
		let isText = this.el.tagName === 'TEXTAREA' || this.attributes_['contenteditable'] && (this.attributes_['contenteditable']+'') !== 'false';
		for (let vChild of this.vChildren_) {
			if (isText && (vChild instanceof VExpression))
				throw new Error("textarea and contenteditable can't have templates as children. Use value=${this.variable} instead.");

			vChild.scope_ = {...this.scope_}; // copy
			vChild.scope3_ = this.scope3_.clone_();
			vChild.refr_ = this.refr_;
			vChild.startIndex_ = count;
			count += vChild.apply_(this.el);
		}

		// 5. Attributes (besides shadow)
		for (let name in this.attributes_) {
			let value = this.attributes_[name];
			for (let attrPart of value)
				if (attrPart instanceof VExpression) {
					let expr = attrPart;
					expr.parent_ = this.el;
					expr.scope_ = this.scope_; // Share scope with attributes.
					expr.scope3_ = this.scope3_.clone_();
					expr.watch_(() => {
						if (name === 'value')
							setInputValue_(this.refr_, this.el, value, this.scope_);

						else {
							let value2 = VElement.evalVAttributeAsString_(this.refr_, value, this.scope_);
							this.el.setAttribute(name, value2);
						}
					});
				}

			// TODO: This happens again for inputs in step 5 below:
			let value2 = VElement.evalVAttributeAsString_(this.refr_, value, this.scope_);
			this.el.setAttribute(name, value2);


			// Id
			if (name === 'id' || name === 'data-id') {
				let path = this.el.getAttribute(name).split('.');
				delve(this.refr_, path, this.el);
			}

			// Events
			else if (name.startsWith('on') && (name in div)) {

				// Get the createFunction() from the class if it's already been instantiated.  Else use Refract's temporary createfunction().
				// This lets us use other variabls defiend in the same scope as the class that extends Refract.
				let createFunction = ((this.refr_ && this.refr_.constructor) || window.RefractCurrentClass).createFunction;

				let code = this.el.getAttribute(name);
				this.el.removeAttribute(name); // Prevent original attribute being executed, without `this` and `el` in scope.
				this.el[name] = event => { // e.g. el.onclick = ...
					let args = ['event', 'el', ...Object.keys(this.scope_)];
					let func = createFunction(...args, code).bind(this.refr_); // Create in same scope as parent class.
					func(event, this.el, ...Object.values(this.scope_));
				};
			}
		}

		// Attribute expressions
		for (let expr of this.attributeExpressions_) {
			expr.scope_ = this.scope_;
			expr.scope3_ = this.scope3_.clone_();
			expr.apply_(this.el);
			expr.watch_(() => {
				expr.apply_(this.el);
			});
		}


		// 6. Form field two-way binding.
		// Listening for user to type in form field.
		let hasValue = (('value' in this.attributes_)&& tagName !== 'option');
		if (hasValue) {
			let valueExprs = this.attributes_.value;
			let isSimpleExpr = valueExprs.length === 1 && (valueExprs[0] instanceof VExpression) && valueExprs[0].type === 'simple';

			// Don't grab value from input if we can't reverse the expression.
			if (isSimpleExpr) {
				let createFunction = ((this.refr_ && this.refr_.constructor) || window.RefractCurrentClass).createFunction;
				let assignFunc = createFunction(...Object.keys(this.scope_), 'val', valueExprs[0].code + '=val;').bind(this.refr_);

				// Update the value when the input changes:
				utils.watchInput_(this.el, (val, e) => {
					Globals.currentEvent_ = e;
					assignFunc(...Object.values(this.scope_), val);
					Globals.currentEvent_ = null;
				});
			}
		}

		/*
		// New as of Feb 2022.
		// If I can make a preprocessor add data-value-expr to any input fields within complex (or all) expressions,
		// then I can know I should bind to them.  Even if the origional ${} expression has already been evaluated.
		if ('data-value-expr' in this.attributes) {

			let expr = this.attributes['data-value-expr'][0];
			let createFunction = ((this.refr && this.refr.constructor) || window.RefractCurrentClass).createFunction;
			let assignFunc = createFunction(...Object.keys(this.scope), 'val', expr + '=val;').bind(this.refr);

			Utils.watchInput(this.el, (val, e) => {
				Globals.currentEvent_ = e;
				assignFunc(...Object.values(this.scope), val);
				Globals.currentEvent_ = null;
			});

		}
		*/


		// 8. Set initial value for select from value="" attribute.
		// List of input types:
		// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#input_types
		if (hasValue) // This should happen after the children are added, e.g. for select <options>
			// TODO: Do we only need to do this for select boxes b/c we're waiting for their children?  Other input types are handled above in step 2.
			setInputValue_(this.refr_, this.el, this.attributes_.value, this.scope_);


		if (tagName === 'svg')
			inSvg = false;

		return 1; // 1 element created, not counting children.
	}


	/**
	 * @param refr {Refract}
	 * @param vParent {null|VElement|VExpression}
	 * @return {VElement} */
	clone_(refr, vParent=null) {
		let result = new VElement();
		result.tagName = this.tagName;
		result.refr_ = refr || this.refr_;
		result.vParent_ = vParent;

		for (let attrName in this.attributes_) {
			result.attributes_[attrName] = [];
			for (let piece of this.attributes_[attrName]) {
				if (piece instanceof VExpression)
					result.attributes_[attrName].push(piece.clone_(result.refr_, this));
				else
					result.attributes_[attrName].push(piece);
			}
		}
		for (let expr of this.attributeExpressions_) // Expresions that create one or more attributes.
			result.attributeExpressions_.push(expr.clone_(result.refr_, this));

		for (let child of this.vChildren_)
			result.vChildren_.push(child.clone_(result.refr_, result)); // string for text node.

		return result;
	}


	/**
	 * Get the value of an attribute to use as a constructor argument.
	 * TODO: Reduce shared logic between this and evalVAttribute()
	 * @param name {string}
	 * @return {*} */
	getAttrib_(name) {
		let lname = name.toLowerCase();
		let val = name in this.attributes_ ? this.attributes_[name] : this.attributes_[lname];
		if (val === undefined || val === null)
			return val;

		// A solitary VExpression.
		if (val && val.length === 1 && val[0] instanceof VExpression)
			return val[0].exec_.apply(this.refr_, Object.values(this.scope_));

		// Attribute with no value.
		if (Array.isArray(val) && !val.length)
			return true;

		// Else evaluate as JSON, or as a string.
		let result = VElement.evalVAttributeAsString_(this.refr_, (val || []), this.scope_);
		try {
			result = JSON.parse(result);
		} catch (e) {

			// A code expression
			if (result.startsWith('${') && result.endsWith('}')) // Try evaluating as code if it's surrounded with ${}
				try {
					result = eval(result.slice(2, -1));
				} catch(e) {}
		}
		return result;
	}

	remove_() {

		// 1. Remove children, so that their watches are unsubscribed.
		for (let vChild of this.vChildren_)
			vChild.remove_();

		// 2. Remove the associated element.  We call parentNode.removeChild in case remove() is overridden.
		this.el.parentNode.removeChild(this.el);

		// 3. Mark it as removed so we don't accidently use it again.
		this.vParent_ = null;
	}

	//#IFDEV
	toString() {
		let attributes = [];
		for (let name in this.attributes_)
			attributes.push(` ${name}="${this.attributes_[name]}"`);

		return `<${this.tagName}${attributes.join('')}>`;
	}
	//#ENDIF


	/**
	 * TODO: Reduce shared logic between this and evalVAttribute
	 * If a solitary VExpression, return whatever object it evaluates to.
	 * Otherwise merge all pieces into a string and return that.
	 * value="${'one'}" becomes 'one'
	 * value="${['one', 'two']}" becomes ['one', 'two']
	 * value="${['one', 'two']}three" becomes ['onetwothree']
	 * @param refr {Refract}
	 * @param attrParts {(VExpression|string)[]}
	 * @param scope {object}
	 * @return {*|string} */
	static evalVAttribute_(refr, attrParts, scope={}) {
		let result = attrParts.map(expr =>
			expr instanceof VExpression ? expr.exec_.apply(refr, Object.values(scope)) : expr
		);

		// If it's a single value, return that.
		if (result.length === 1)
			return result[0];

		return result.flat().map(utils.toString).join('');
	}

	/**
	 * @param refr {Refract}
	 * @param attrParts {(VExpression|string)[]}
	 * @param scope {object}
	 * @return {string} */
	static evalVAttributeAsString_(refr, attrParts, scope={}) {
		let result = [];
		for (let attrPart of attrParts) {
			if (attrPart instanceof VExpression) {
				let val = attrPart.exec_.apply(refr, Object.values(scope));
				if (Array.isArray(val) || (val instanceof Set))
					val = Array.from(val).join(' '); // Useful for classes.
				else if (val && typeof val === 'object') { // style attribute
					if (val.constructor === Object) // If a simple object.
						val = Object.entries(val).map(([name, value]) => `${name}: ${val[name]}; `).join('');
					else
						val = ''; // val.constructor.name + '()';
				}
				result.push(val);
			}
			else
				result.push(Html.decode(attrPart)); // decode because this will be passed to setAttribute()
		}
		return result.map(utils.toString).join('');
	}

	/**
	 * Convert html to an array of child elements.
	 * @param html {string|string[]} Tokens will be removed from the beginning of the array as they're processed.
	 * @param scopeVars {string[]}
	 * @param vParent {VElement|VExpression}
	 * @param Class
	 * @return {(VElement|VExpression|string)[]} */
	static fromHtml_(html, scopeVars=[], vParent=null, Class) {
		let tokens = lex(lexHtmlJs, [html].flat().join(''), 'template');
		return VElement.fromTokens_(tokens, scopeVars, vParent, Class);
	}

	/**
	 * Convert tokens to an array of child elements.
	 * @param tokens {Token[]}
	 * @param scopeVars {string[]}
	 * @param vParent {VElement|VExpression?}
	 * @param refr {Refract}
	 * @param limit {int|boolean=} Find no more than this many nodes in the result.
	 * @param index {int=} used internally.
	 * @return {(VElement|VExpression|string)[]}
	 *     Array with a .index property added, to keep track of what token we're on. */
	static fromTokens_(tokens, scopeVars=[], vParent=null, refr, limit=false, index=0) {
		if (!tokens.length)
			return [];

		let result = [];
		do {
			let token = tokens[index];

			// Text node
			if (token.type === 'text')
				result.push(new VText(token.text, vParent?.refr_));

			// Expression child
			else if (token.type === 'expr')
				result.push(new VExpression(token.tokens, vParent, scopeVars));

			// Collect tagName and attributes from open tag.
			else if (token.type === 'openTag') {
				let vel = new VElement(token.tokens, vParent||refr, scopeVars);

				result.push(vel);

				let isSelfClosing = token.tokens[token.tokens.length-1].text == '/>' || vel.tagName.toLowerCase() in selfClosingTags_;

				// Process children if not a self-closing tag.
				if (!isSelfClosing) {
					index++;

					// New path:
					vel.vChildren_ = VElement.fromTokens_(tokens, scopeVars, vel, refr, false, index);
					index = vel.vChildren_.index; // What is this?
				}
			}

			// Collect close tag.
			else if (token.type === 'closeTag')
				break;

			if (result.length === limit)
				break;

			index++;
		} while (index < tokens.length);

		result.index = index;
		return result;
	}

	/**
	 * TODO: This should:
	 * Find every instance of value="${this.val"} and instert an adjacent attribute:  data-value-expr="this.val"
	 * value="${this.values[name]}" becomes data-value-expr="this.values['${name}']"
	 *
	 * These expressions are then read again later in VElement.apply()
	 *
	 * @param tokens {Token[]}
	 * @return {Token[]}
	static markValueAttributes(tokens) {

		// let valueAttrs = fregex.matchAll(['value', '='], tokens);
		//
		//
		// for (let token of tokens) {
		// 	if (token.tokens)
		// 		this.markValueAttributes(token.tokens);
		// }


		return tokens;
	} */
}

// TODO: What svg elements are self-closing?
var selfClosingTags_ = {'area':1, 'base':1, 'br':1, 'col':1, 'embed':1, 'hr':1, 'img':1, 'input':1, 'link':1, 'meta':1, 'param':1, 'source':1,
	'track':1, 'wbr':1, 'command':1, 'keygen':1, 'menuitem':1};


/**
 * Used by VElement.apply() to keep track of whether we're within an svg tag.
 * @type {boolean} */
var inSvg = false;



// TODO: Pair this with Utils.watchInput() ?
function setInputValue_(ref, el, value, scope) {

	// Don't update input elements if they triggered the event.
	if (Globals.currentEvent_ && el === Globals.currentEvent_.target)
		return;


	let isText = el.tagName === 'TEXTAREA'
		|| (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false');

	if (isText || el.tagName === 'INPUT') {

		let val = VElement.evalVAttributeAsString_(ref, value, scope);
		if (isText) {
			//if (el.innerHTML !== val) // Is this needed? Replacing a value can reset the cursor position.
				el.innerHTML = val;
		}
		else if (el.type === 'checkbox')
			el.checked = ['1', 'true'].includes((val+'').toLowerCase());
		else
			el.value = val;
	}
	else {
		let values = VElement.evalVAttribute_(ref, value, scope);
		if (el.tagName === 'SELECT')
			for (let opt of el.children)
				opt.selected = Array.isArray(values) ? values.includes(opt.value) : values === opt.value;
		else // Some custom elements can accept object or array for the value property:
			el.value = values;
	}
}

/**
 * Utility functions used internally by Refract for setting up a Refract class. */
class Compiler {


	//#IFDEV

	debugRender() {
		// .map() for objects.
		let omap = (o, cb) => { // Like .map() but for objects.
			let result = [];
			for (let name in o)
				result.push(cb(name, o[name]));
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
					result.push(renderItem(child2, inlineText));
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
		};

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
			let result = [];
			for (let name in o)
				result.push(cb(name, o[name]));
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
					result.push(renderItem(child2, inlineText));
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
		};

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
			let tokens = [...lex(lexHtmlJs, code)];

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
					innerTokens = lex(lexHtmlJs, code, 'template');
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
		};

		let result = [];
		for (let arg of argNames)
			if (typeof arg === 'string')
				result.push(el.getAttrib_(arg));
			else
				result.push(populateObject(arg));

		return result;
	}

}

lexHtmlJs.allowHashTemplates = true;

var Globals = {
	currentEvent_: null,
	currentVElement_: null,


	/**
	 * Keep track of which Refract elements are currently being constructed.  Indexed by tagname.
	 * This prevents us from creating another instance of an element when it's in the middle of being upgraded,
	 * which browsers don't like.
	 * @type {Object<string, boolean>} */
	constructing_: {},
};


/**
 * @property createFunction {function} Created temporarily during compilation.
 * @property styleId {int} */
class Refract extends HTMLElement {

	static compiler = Compiler;

	/** @type {string} */
	static tagName;


	static htmlTokens = null;

	/**
	 * A parsed representation of this class's html.
	 * @type VElement */
	static virtualElement;

	/**
	 * @deprecated
	 * @type {string[]} Names of the constructor's arguments. */
	static constructorArgs = null;

	/**
	 * @type {?string[]} Cached names of the arguments to the init function. */
	static initArgs = null;

	/**
	 * Change this from false to an empty array [] to keep a list of every element created by ever class that inherits
	 * from Refract.  Useful for debugging / seeing how many elements were recreated for a given operation.
	 * @type {boolean|(Node|HTMLElement)[]} */
	static elsCreated = false;

	/**
	 * TODO: Every event attribute should call this function.
	 * This will fix some of the event unit tests where events are added from ${} in odd ways.
	 * @param event {Event}
	 * @param el {HTMLElement} I probably don't need this, since i can get it from event.currentTarget */
	// static refractEvent(event, el) {}


	/** @type {string} */
	slotHtml = '';

	/** If true, call render() before the constructor, and every time after a property is changed */
	__autoRender = true;

	/**
	 * Value can be 'apply' or 'remove'
	 * @type {Map<VElement|VExpression|VText, string>} */
	__toRender= new Map();

	/**
	 * A copy of the static VElement from the Class, with specific VExpressions that match the watched properties of this instance.
	 * Will be set once render() has been called at least once to create the DOM
	 * @type {VElement} */
	virtualElement = null;


	__connected = false;
	__connectedCallbacks = [];
	__firstConnectedCallbacks = [];
	__disconnectedCallbacks = [];


	constructor(autoRender=true) {
		super();

		// old path from before we used init()
		if (autoRender === false)
			this.__autoRender = false;

		// Used in old path from before we used init()?
		this.constructorArgs2_ = arguments;
	}

	/**
	 * Bring this element's DOM nodes up to date.
	 * 1.  If calling render() for the first time on any instance, parse the html to the virtual DOM.
	 * 2.  If calling render() for the first time on this instance, Render the virtual DOM to the real DOM.
	 * 3.  Apply any updates to the real DOM. ? */
	render() {

		this.__autoRender = true;


		// If not already created by a super-class.  Is ` this.constructor.name===name` still needed?
		//if (!this.virtualElement && (!name || this.constructor.name===name)) {

		// Initial render
		if (!this.virtualElement) {

			// Parse the html tokens to Virtual DOM
			if (!this.constructor.virtualElement) {
				if (this.html && typeof this.html === 'function') { // new path
					this.constructor.htmlTokens = Parse.htmlFunctionReturn_(this.html.toString());
					if (!this.constructor.htmlTokens)
						throw new Error(`Class is missing an html function with a template value.`);
				}

				this.constructor.virtualElement = VElement.fromTokens_(this.constructor.htmlTokens, [], null, this, 1)[0];
				this.constructor.htmlTokens = null; // We don't need them any more.
			}

			Globals.constructing_[this.tagName] = true;

			this.virtualElement = this.constructor.virtualElement.clone_(this);
			this.virtualElement.apply_(null, this);

			delete Globals.constructing_[this.tagName];
		}

		// Render items from the queue.
		if (this.__toRender.size) {

			// Remove children of parents in this set.
			for (let vexpr of this.__toRender.keys()) {

				// If a parent vexpr is being re-applied, no need to re-apply this one too.
				let vparent = vexpr;
				while (vparent = vparent.vParent_)
					if (this.__toRender.has(vparent)) {
						this.__toRender.delete(vexpr);
						break;
					}
			}

			for (let [vexpr, args] of this.__toRender.entries())
				vexpr.receiveNotification_(...args);

			this.__toRender = new Map();
		}
	}


	/**
	 * Get the evaluated version of an attribute.
	 * @param name {string}
	 * @param alt {*} Defaults to undefined because that's what we get if the argument isn't specified by the caller.
	 * @return {*} */
	getAttrib_(name, alt=undefined) {
		let velement = Refract.currentVElement_;
		if (velement) {
			return velement.getAttrib(name);
		}
		else {
			let hval = this.getAttribute(name);
			if (hval === null)
				return alt;

			let val = Html.decode(hval);

			// As JSON
			try {
				return JSON.parse(val);
			}
			catch {}

			// As an expression
			if (val.startsWith('${') && val.endsWith('}'))
				try { // Is it possible to eval() in the context of the calling function?
					return eval('(' + val.slice(2, -1) + ')');
				}
				catch {}

			// As a string
			return val;
		}
	}

	static getInitArgs_() {
		if (!this.initArgs && this.prototype.init) {
			let pf = new ParsedFunction(this.prototype.init, false);
			this.initArgs = [...pf.getArgNames()];
		}
		return this.initArgs || [];
	}

	//#IFDEV
	/**
	 * @deprecated for onConnect()
	 * Call a function when a node is added to the DOM.
	 * @param node {HTMLElement|Node}
	 * @param callback {function()} */
	static onMount(node, callback) {
		let observer = new MutationObserver(mutations => {
			if (mutations[0].addedNodes[0] === node || document.body.contains(node)) {
				//observer.disconnect();
				callback();
			}
		});
		observer.observe(document.body, {childList: true, subtree: true});
	}

	/**
	 * @deprecated for onFirstConnect()
	 * Call a function when a node is first added to the DOM.
	 * Or call it immediately if it's already mounted.
	 * @param node {HTMLElement|Node}
	 * @param callback {function()}
	 * @param doc */
	static onFirstMount(node, callback, doc=document) {

		function contains2(parent, node) { // same as Node.contains() but also traverses shadow dom.
			while (node = node.parentNode || node.host)
				if (node === parent)
					return true;
			return false;
		}

		if (contains2(doc, node))
			callback();
		else {
			let observer = new MutationObserver(mutations => {
				if (mutations[0].addedNodes[0] === node || contains2(doc, node)) {
					observer.disconnect();
					callback();
				}
			});
			observer.observe(doc, {childList: true, subtree: true});
		}
	}
	//#ENDIF


	onConnect(callback) {
		if (this.__connected)
			callback();
		this.__connectedCallbacks.push(callback);
	}

	onFirstConnect(callback) {
		if (this.__connected)
			callback();
		else
			this.__firstConnectedCallbacks.push(callback);
	}

	onDisconnect(callback) {
		if (this.__connected)
			callback();
		this.__disconnectedCallbacks.push(callback);
	}

	/**
	 * This function is called automatically by the browser.
	 * If you override it, onConnect() and onFirstConnect() won't work. */
	connectedCallback() {
		this.__connected = true;
		for (let cb of this.__connectedCallbacks)
			cb();
		for (let cb of this.__firstConnectedCallbacks)
			cb();
		this.__firstConnectedCallbacks = [];
	}

	/**
	 * This function is called automatically by the browser.
	 * If you override it, onDisConnect() won't work. */
	disconnectedCallback() {
		this.__connected = false;
		for (let cb of this.__disconnectedCallbacks)
			cb();
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
				${this.name}.createFunction = (...args) => {
					let params = args.slice(0, -1).join(',');
					let code = args[args.length-1];
					return eval(\`(function(\${params}) {\${code}})\`);
				};
				let modified = ${this.name}.compiler.createModifiedClass(${this.name});
				${this.name} = eval('('+modified.code+')');		
				${this.name}.compiler.decorateAndRegister(${this.name}, modified);
				return ${this.name};	
			})();		
		`;
	}
}

Refract.htmlDecode = Html.decode;
Refract.htmlEncode = Html.encode;

var h = (text, quotes=`"'`) => Html.encode(text, quotes);

export default Refract;
export { Globals, utils as Utils, Watch, delve, fregex, h, lex, lexHtmlJs };
