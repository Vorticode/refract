
/**
 * Follow a path into a object.
 * @param obj {object}
 * @param path {string[]}
 * @param createVal {*}  If set, non-existant paths will be created and value at path will be set to createVal.
 * @param watchless {boolean}
 * @return The value, or undefined if it can't be reached. */
export default function delve(obj, path, createVal=delve.dontCreate, watchless=false) {
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