import {assert, assertEquals, Testimony} from './lib/Testimony.js';
Testimony.enableJsDom();

import ArrayDiff from './../src/ArrayDiff.js';

Deno.test('ArrayDiff.removeEnd', () => {
	let array1 = [{name: 'A'}, {name: 'B'}, {name: 'C'}];
	let array2 = [array1[0], array1[1]];
	let ops = (new ArrayDiff(array1)).ops(array2);

	assertEquals(ops, [['remove', 2]]);
});

Deno.test('ArrayDiff.removeStart', () => {
	let array1 = [{name: 'A'}, {name: 'B'}, {name: 'C'}];
	let array2 = [array1[1], array1[2]];
	let ops = (new ArrayDiff(array1)).ops(array2);

	assertEquals(ops, [['remove', 0]]);
});

Deno.test('ArrayDiff.removeMiddle', () => {
	let array1 = [{name: 'A'}, {name: 'B'}, {name: 'C'}];
	let array2 = [array1[0], array1[2]];
	let ops = (new ArrayDiff(array1)).ops(array2);

	assertEquals(ops, [['remove', 1]]);
});



Deno.test('ArrayDiff.insertEnd', () => {
	let array1 = [{name: 'A'}, {name: 'B'}];
	let array2 = [array1[0], array1[1], {name: 'C'}];
	let ops = (new ArrayDiff(array1)).ops(array2);

	assertEquals(ops, [['insert', 2, {name: 'C'}]]);
});

Deno.test('ArrayDiff.insertStart', () => {
	let array1 = [{name: 'B'}, {name: 'C'}];
	let array2 = [{name: 'A'}, array1[0], array1[1]];
	let ops = (new ArrayDiff(array1)).ops(array2);

	assertEquals(ops, [['insert', 0, {name: 'A'}]]);
});

Deno.test('ArrayDiff.insertMiddle', () => {
	let array1 = [{name: 'A'}, {name: 'C'}];
	let array2 = [array1[0], {name: 'B'}, array1[1]];
	let ops = (new ArrayDiff(array1)).ops(array2);

	assertEquals(ops, [['insert', 1, {name: 'B'}]]);
});





Deno.test('ArrayDiff.swap2', () => {
	let array1 = [{name: 'A'}, {name: 'B'}];
	let array2 = [array1[1], array1[0]];
	let ops = (new ArrayDiff(array1)).ops(array2);

	assertEquals(ops, [['move', 0, 1]]);
});

Deno.test('ArrayDiff.reverse3', () => {
	let array1 = [{name: 'A'}, {name: 'B'}, {name: 'C'}];
	let array2 = [array1[2], array1[1], array1[0]];
	let ops = (new ArrayDiff(array1)).ops(array2);

	assertEquals(ops, [
		['move', 0, 2],
		['move', 0, 1]
	]);
});

Deno.test('ArrayDiff.reverse4', () => {
	let array1 = [{name: 'A'}, {name: 'B'}, {name: 'C'}, {name: 'D'}];
	let array2 = [array1[3], array1[2], array1[1], array1[0]];
	let ops = (new ArrayDiff(array1)).ops(array2);

	assertEquals(ops, [
		['move', 0, 3],
		['move', 0, 2],
		['move', 0, 1]
	]);
});




Deno.test('ArrayDiff.replaceStartEnd', () => {
	let array1 = [{name: 'A'}, {name: 'B'}, {name: 'C'}];
	let array2 = [{name: 'E'}, array1[1], {name: 'F'}];
	let ops = (new ArrayDiff(array1)).ops(array2);

	assertEquals(ops, [
		["remove",0],
		["remove",1],
		["insert",0,{"name":"E"}],
		["insert",2,{"name":"F"}]
	]);
});


Deno.test('ArrayDiff._swapReplace', () => {
	let array1 = [{name: 'A'}, {name: 'B'}, {name: 'C'}, {name: 'D'}];
	let array2 = [{name: 'E'}, array1[2], array1[1], {name: 'F'}];
	let ops = (new ArrayDiff(array1)).ops(array2);

	ArrayDiff.apply(array1, ops);
	console.log(array1)
	assertEquals(array1, array2);

	assertEquals(ops, [
		['move', 0, 3],
		['move', 0, 2],
		['move', 0, 1]
	]);
});