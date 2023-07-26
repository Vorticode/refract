var ObjectUtil = {

	/**
	 * Equivalent of php's array_combine()
	 * @param keys {string[]}
	 * @param values {*[]}
	 * @returns {Object} */
	combine(keys, values) {
		let result = {}
		for (let i=0; i<keys.length; i++)
			result[keys[i]] = values[i];
		return result
	},

	/**
	 * Follow a path into a object.
	 * @param obj {object}
	 * @param path {string[]}
	 * @param createVal {*}  If set, non-existant paths will be created and value at path will be set to createVal.
	 * @param watchless {boolean}
	 * @return The value, or undefined if it can't be reached. */
	delve(obj, path, createVal=ObjectUtil.delveDontCreate, watchless=false) {
		let create = createVal !== ObjectUtil.delveDontCreate;

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
	},

	delveDontCreate: {},

	/**
	 * @deprecated for isSame(), which should be renamed to equals()
	 * @param a {Object}
	 * @param b {Object}
	 * @return {boolean} */
	equalsOld(a, b) {
		for (var name in a)
			if (!(name in b) || a[name] !== b[name])
				return false;
		for (name in b)
			if (!(name in a) || a[name] !== b[name])
				return false;
		return true;
	},

	/**
	 * Returns true if x and y are deeply equal.
	 * https://stackoverflow.com/a/6713782/
	 * This function also exists in Testimony.js
	 * @param x
	 * @param y
	 * @return {boolean} */
	equals(x, y) {

		if (x === y)
			return true; // if both x and y are null or undefined and exactly the same

		if (!(x instanceof Object) || !(y instanceof Object)) // Array is also instanceof Obect.
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

			if (typeof x[p] !== 'object')
				return false; // Numbers, Strings, Functions, Booleans must be strictly equal

			if (!ObjectUtil.equals(x[p], y[p]))
				return false; // Objects and Arrays must be tested recursively
		}

		for (p in y) // allows x[ p ] to be set to undefined
			if (y.hasOwnProperty(p) && !x.hasOwnProperty(p))
				return false;

		return true;
	},

	/**
	 * Filter an array of objects using an SQL WHERE like data structure.
	 * @param rows {Object[]}
	 * @param where
	 * @param mode {string}
	 * @returns {Object[]} */
	findRows(rows, where, mode='AND') {

		// Convert an SQL LIKE expression into a regex.
		function sqlLike(input, expression) {
			const pattern = expression
				.replace(/([.+?^=!:${}()|[\]/\\])/g, '\\$1') // Escape special characters
				.replace(/%/g, '.*') // Convert % to .*
				.replace(/_/g, '.') // Convert _ to .
			const regex = new RegExp(`^${pattern}$`, 'i') // Ignore case

			return regex.test(input)
		}

		function rowMatches(row, where, mode='AND') {
			if (!where || (Array.isArray(where) && !where.length))
				return true;

			if (!Array.isArray(where))
				where = ['id', '=', where];

			if (!Array.isArray(where[0])) {
				const [name, op, expr] = where;
				let val = row[name];
				const validOps = ['=', '!=', '<', '<=', '>', '>=', 'LIKE', 'NOT LIKE', 'IS', 'IS NOT', 'IN', 'NOT IN', /*'GLOB', 'NOT GLOB',*/ 'REGEXP', 'NOT REGEXP'];

				if (!validOps.includes(op.toUpperCase()))
					throw new Error(`Unsupported op ${op}`);

				switch (op) {
					case 'IS':
					case '=': return val == expr;
					case 'IS NOT':
					case '!=': return val != expr;
					case '<': return val < expr;
					case '<=': return val <= expr;
					case '>': return val > expr;
					case '>=': return val >= expr;
					case 'LIKE': return sqlLike(val, expr);
					case 'NOT LIKE': return !sqlLike(val, expr);
					case 'IN': return expr.includes(val);
					case 'NOT IN': return !expr.includes(val);
					case 'REGEXP': return expr.match(val);
					case 'NOT REGEXP': return !expr.match(val);
				}

			} else {
				mode = mode.toUpperCase() === 'AND' ? 'AND' : 'OR';
				const subMode = mode === 'AND' ? 'OR' : 'AND';

				if (mode === 'AND') {
					for (let expr of where)
						if (!rowMatches(row, expr, subMode))
							return false;
					return true;
				}

				else {
					for (let expr of where)
						if (rowMatches(row, expr, subMode))
							return true;
					return false;
				}
			}
		}

		return rows.filter(row => rowMatches(row, where, mode));
	},

	/**
	 * @param obj {Object<string, string>} */
	invert(obj) {
		var result = {};
		for(var key in obj)
			result[obj[key]] = key;
		return result;
	},

	isSimpleObject(o) { // TODO: This function needs to be improved.
		return (typeof o === 'object') && !o.prototype && !(o instanceof Node) && !Array.isArray(o);
	},

	/**
	 * Returns true if larger contains every key and value in smaller.
	 * At present, only primitive values are understood.
	 * @param smaller {Object<string, string|number|boolean>}
	 * @param larger {Object<string, string|number|boolean>}
	 * @return {boolean} */
	isSubset(smaller, larger) {
		for (var name in smaller)
			if (!(name in larger) || larger[name] !== smaller[name])
				return false;
		return true;
	},

	/**
	 * Performs a recursive merge when a and b both have an object sub-properties.
	 * If b has a property set to undefined, it will be removed from the result.
	 * Does not modify a or b.
	 * @param a {object}
	 * @param b {object}
	 * @return {object}
	 *
	 * @example
	 * To assign to `a` instead of doign a copy:
	 * Object.assign(a, ObjectUtil.merge(a, b)); */
	merge(a, b) {
		const isObject = o => o && typeof o === 'object' && !Array.isArray(o);

		var result = Object.assign({}, a);
		for (var prop in b) {
			if (b[prop] === undefined)
				delete result[prop];
			else if (isObject(a[prop]) && isObject(b[prop]))
				result[prop] = this.merge(a[prop], b[prop]);
			else
				result[prop] = b[prop];
		}
		return result;
	},

	/**
	 * @param obj {object}
	 * @return {object} A copy of the object. */
	sortByKey(obj) {
		var keys = Object.keys(obj);
		keys.sort();
		var result = {};
		for (let key of keys)
			result[key] = obj[key];
		return result;
	},
};


export default ObjectUtil;