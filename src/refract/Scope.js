
export class ScopeItem {
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
 * A Map from variable name to its path and value:
 * @extends {Map<string, ScopeItem>} */
export default class Scope extends Map {

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

	getValues() {
		return [...this.values()].map(scopeItem => scopeItem.value);
	}

}