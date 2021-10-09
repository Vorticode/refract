/**
 * Given one array, provide a set of operations to convert it into a second array.
 *
 * TODO: Ask on stack overflow for a function that finds all operations necesary to convert one string to another.
 * insert / remove / move
 * In O(n) or O(n * ln(n)).  Fast is better than perfect.
 */
 
 
 
 // TODO: Make a static class?
var ArrayDiff2 ={
	createOps(array1, array2) {},

	applyOps(array, ops) {}
}


 export default class ArrayDiff {
 
	// Map from objects to their index.
	lookup = new WeakMap();
	array = [];
 
	/**
	 * Provide an array for tracking.  Unlike a watch, no items in the array will be modified,
	 * but the whole array must be itereated to find changes. */
	constructor(array) {
		this.array = array;
		this.lookup = ArrayDiff.buildLookup(this.array);
	}

	/**
	 * Create a set of operations to convert our existing array to the new one.
	 * This could be used, for example, updating only the changed html elements in a loop.
	 * @return {*[][]}
	 * [
	 *     ['insert', 3, {object}],
	 *     ['remove', 2]
	 *     ['move', 3, 4]
	 * ]
	 */
	ops(array2) {

		// 1.  Copy so we can modify it as we go.
		let array1 = this.array.slice();
		let lookup1 = this.lookup;

		let lookup2 = ArrayDiff.buildLookup(array2);
		let result = []; // array of ops


		// 2.  Remove items not in array2 (the new array)
		for (let i1=0; i1<array1.length; i1++) {
			let obj1 = array1[i1];
			if (!lookup2.has(obj1)) {
				array1.splice(i1, 1);
				result.push(['remove', i1]);
			}
		}

		// 3.  Add items not in array1 (the old array)
		for (let i2=0; i2<array2.length; i2++) {
			let obj2 = array2[i2];
			if (!lookup1.has(obj2)) {

				// Insert after the previous item, if it exists.
				if (i2 > 0) {
					let obj2Prev = array2[i2 - 1];
					let index = lookup1.get(obj2Prev); // TODO: This doesn't account for changing indices.
					if (index !== undefined) {
						array1.splice(index+1, 0, obj2);
						result.push(['insert', index+1, obj2]);
						continue;
					}
				}

				// Insert before the next item, if it exists.
				if (i2 < array1.length-1) {
					let obj2Next = array2[i2 + 1];
					let index = lookup1.get(obj2Next);
					if (index !== undefined) {
						array1.splice(index, 0, obj2);
						result.push(['insert', index, obj2]);
						continue;
					}
				}

				// Insert it at the beginning.
				if (i2 === 0) {
					array1.splice(0, 0, obj2);
					result.push(['insert', 0, obj2]);
				}

				// Insert at the end.
				else {
					array1.push(obj2);
					result.push(['insert', array1.length-1, obj2]);
				}
			}
		}

		// 4.  Swap out of order items.
		// At this point, array1 and array2 will always have the same items, but not necessarily the same order.
		for (let i1=0; i1<array1.length; i1++) {
			let obj1 = array1[i1];
			let i2 = lookup2.get(obj1);

			// If new index isn't old index, move the item to new index.
			if (i2 !== i1) {
				array1.splice(i1, 1);
				array1.splice(i2, 0, obj1);
				result.push(['move', i1, i2]);

				// Process this index again since the last one moved forward.
				if (i1 < i2)
					i1 --;
			}
		}

		return result;
	}


	/**
	 * Updates array in place.
	 * TODO: Use insertBefore, etc. if we're working on a NodeList.
	 * But then how to handle stride?
	 * @param array
	 * @param ops
	 */
	static apply(array, ops) {
		for (let op of ops) {
			if (op[0] === 'insert')
				array.splice(op[1], 0, op[2]);

			if (op[0] === 'remove')
				array.splice(op[1], 1);

			if (op[0] === 'move') {
				let [obj] = array.splice(op[1], 1);
				array.splice(op[2], 0, obj);
			}
		}
	}

	// A reverse map from array items to their index.
	static buildLookup(array) {
		let result = new WeakMap();
		for (let i=0; i<array.length; i++)
			result.set(array[i], i);
		return result;
	}

}