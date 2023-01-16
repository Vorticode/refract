
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

	clone() {
		return new ScopeItem(this.path.slice(), this.value);
	}
}


/**
 * @extends {Map<string, ScopeItem>} */
export default class Scope extends Map {


	/**
	 * @return {Scope} */
	clone_() {
		let result = new Scope();
		for (let [name, scopeItem] of this)
			result.set(name, scopeItem.clone());
		return result;
	}

	/**
	 * Convert a local variable path to a path from the root Reflect element.
	 * @param path {string[]}
	 * @return {string[]} */
	getFullPath_(path) {
		if (path[0] === 'this')
			return path;

		while (path[0] in this) {
			let parentPath = this.get(path[0]).path;
			path = [...parentPath, ...path.slice(1)];
		}
		return path;
	}
}