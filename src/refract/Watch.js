import Utils, {assert, csv} from './utils.js';
import watchProxy, {WatchUtil} from './watchProxy.js';
import utils from "./utils.js";
import ObjectUtil from "../util/ObjectUtil.js";


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
		let newVal = ObjectUtil.delve(this.obj_, path, ObjectUtil.delveDontCreate, true);
		for (let name in this.subs_)
			if (name.startsWith(cpath) && name.length > cpath.length) {
				let subPath = name.slice(cpath.length > 0 ? cpath.length + 1 : cpath.length); // +1 for ','
				let oldSubPath = JSON.parse('[' + subPath + ']');

				let oldSubVal = utils.removeProxy(ObjectUtil.delve(oldVal, oldSubPath, ObjectUtil.delveDontCreate, true));
				let newSubVal = utils.removeProxy(ObjectUtil.delve(newVal, oldSubPath, ObjectUtil.delveDontCreate, true));

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
				if (!Utils.hasKeyStartingWith_(this.subs_, propCpath)) {

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

export {WatchProperties};
export default Watch;