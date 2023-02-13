import {assert, assertEquals, Testimony} from './Testimony.js';
Testimony.enableJsDom();

import watchProxy, {WatchUtil} from "../src/refract/watchProxy.js";
import Watch from "../src/refract/Watch.js";
import Refract from "../src/refract/Refract.js";

function trackGarbage(callback) {
	// Switch them from WeakMap to Map so we can check the size.
	WatchUtil.proxies = new Map();
	WatchUtil.roots = new Map();
	WatchUtil.callbacks = new Map();
	WatchUtil.paths = new Map();

	callback();

	//assert(!WatchUtil.proxies.size); // TODO
	assert(!WatchUtil.roots.size);
	//assert(!WatchUtil.callbacks.size);
	assert(!WatchUtil.paths.size);

	WatchUtil.proxies = new WeakMap();
	WatchUtil.roots = new WeakMap();
	WatchUtil.callbacks = new WeakMap();
	WatchUtil.paths = new WeakMap();
}

Testimony.test('watchProxy.simple', () => {
	let o = {
		a: [0, 1]
	};

	let log = [];
	let wp = watchProxy(o, (action, path, val)=>{
		log.push([action, path, val]);
	});

	wp.a[0] = 3;
	assert.eqJson(log, [['set', ['a', '0'], 3]]);
});

// Two watchers of the same array, make sure changing it through one path notifies the other.
Testimony.test('watchProxy.twoArrays', () => {
	var b = [1, 2, 3];
	var ops = [];

	var b1 = watchProxy(b, (action, path, value) => {
		ops.push('b1');
	});
	var b2 = watchProxy(b, (action, path, value) => {
		ops.push('b2');
	});

	b2[0] = 5;

	assert.eqJson(ops.length, 2);
	assert.eqJson(ops[0], 'b1');
	assert.eqJson(ops[1], 'b2');
});

// Watches with roots on both an object and it's sub-property.
Testimony.test('watchProxy.twoLevel', () => {

	var a = {
		b1: {parent: undefined},
		b2: [1, 2]
	};
	a.b1.parent = a;
	var called = new Set();

	var aW = watchProxy(a, (action, path, value) => {
		called.add('a.b2');
	});

	var bW = watchProxy(a.b1, (action, path, value) => {
		called.add('b1.parent.b2');
	});

	// Trigger proxies to be created via get.
	var v = aW.b1.parent.b2[0];
	v = bW.parent;
	v = v.b2[0];

	var b2 = bW.parent.b2[0] = 5;

	assertEquals(a.b2[0], 5);
	assert(called.has('a.b2'));
	assert(called.has('b1.parent.b2'));
});

Testimony.test('watchProxy.arrayShift', () => {

	var o = { a: [0, 1] };
	var ops = [];

	var wp = watchProxy(o, function(action, path, value) {
		ops.push([action, path, value]);
	});

	wp.a.shift(); // remove the 0 from the beginning.

	assertEquals(wp.a.length, 1);
	assertEquals(wp.a[0], 1);

	// Make sure we only have one op
	assert.eqJson(ops[0].slice(0, 3), ["remove", ['a', '0'], 0]);
	assertEquals(ops.length, 1);
});

Testimony.test('watchProxy.arrayShift2', () => {
	var o = {
		items:[
			{name: 'A'},
			{name: 'B'}
		]
	};
	var wp = watchProxy(o, ()=>{});

	// Get reference to item before splice.
	let b = wp.items[1];

	// remove first item.
	wp.items.splice(0, 1);


	// Make sure path of b has been updated.
	let path = WatchUtil.getPaths(o, b)[0];

	assert.eqJson(path, ['items', '0']);
});

// Same as above, but make sure references to sub-array are updated.
Testimony.test('watchProxy.arrayShiftRecurse', () => {
	var o = {
		items:[
			{
				parts: [
					{name: 'A'},
					{name: 'B'}
				]
			},
			{
				parts: [
					{name: 'C'},
					{name: 'D'}
				]
			}
		]
	};
	var wp = watchProxy(o, ()=>{});

	// Get reference to item before splice.
	let b = wp.items[1].parts[0];

	// remove first item.
	wp.items.splice(0, 1);


	let path = WatchUtil.getPaths(o, b)[0];

	assert.eqJson(path, ['items', '0', 'parts', '0']);
});

// Test an object that refers to another object twice.
Testimony.test('watchProxy.doubleRef', () => {
	let item = {name: 1};
	var o = {
		item: item,
		items: [item]
	};

	let paths =[];
	let wp = watchProxy(o, function(action, path, value) {
		// Path will be the path it was set from.
		paths.push(path);
	});

	// wp.items[0].name has never been accessed so it isn't registered:
	wp.item.name = 3;
	assert.eqJson(paths, [
		['item', 'name']
	]);


	// watchProxy knows about wp.items[0].name now that it's been accessed the first time.
	paths = [];
	var a = wp.items[0].name;
	wp.item.name = 4;
	assert.eqJson(paths, [
		['item', 'name'],
		['items', '0', 'name']
	]);

	// Value not changed, so we shouldn't get any notifications.
	paths = [];
	a = wp.items[0].name;
	wp.item.name = 4;
	assert.eqJson(paths, []);



	// Set the value via p.items[0].name
	paths = [];
	wp.items[0].name = 2;
	assert.eqJson(paths, [
		['item', 'name'],
		['items', '0', 'name']
	]);
});



// Make sure proxies don't extend into html elements and nodes.
Testimony.test('watchProxy.htmlElement', () => {
	var o = {
		a: document
	};
	var wp = watchProxy(o, function(action, path, value) {});
	o.a.getElementById('test');
	wp.a.getElementById('test'); // Will throw if fails because a is a proxy instead of an HTMLDocument.
});

/**
 * Make sure that hanler.get return's the underlying array's iterator.
 * This uses the `if (field === Symbol.iterator)` code in watchproxy.js */
Testimony.test('watchProxy.forOf', () => {
	var o = {a: [{b: 1}]};
	var called = 0;
	var wp = watchProxy(o, () => {
		called++;
	});

	// For of implicity removes the proxy so we're not notified of the change!
	for (let a2 of wp.a)
		a2.b = 2;

	assert.eqJson(called, 1);
});

/**
 * Make sure removing an item from the beginning sends a remove operation. */
Testimony.test('watchProxy.shift', () => {
	let o = {
		a: [1, 2]
	};

	let log = [];
	let wp = watchProxy(o, (action, path, val)=>{
		log.push([action, path, val]);
	});

	wp.a.shift();
	assertEquals(log, [['remove', ['a', '0'], 1]]); // 1 was the value removed.
});


Testimony.test('watchProxy.spliceReplace', () => {
	let o = {
		a: [0, 1, 2, 3, 4]
	};

	let log = [];
	let wp = watchProxy(o, (action, path, val)=>{
		log.push([action, path, val]);
	});

	wp.a.splice(2, 2, 'C', 'D');
	assert.eqJson(log, [
		['set', ['a', '2'], 'C'],
		['set', ['a', '3'], 'D']
	]);
});

Testimony.test('watchProxy.spliceAdd', () => {
	let o = {
		a: [0, 1, 2, 3, 4]
	};

	let log = [];
	let wp = watchProxy(o, (action, path, val)=>{
		log.push([action, path, val]);
	});

	var item = wp.a.splice(2, 2, 'C', 'D', 'E');
	assert.eqJson(log, [
		['set', ['a', '2'], 'C'],
		['set', ['a', '3'], 'D'],
		['insert', ['a', '4'], 'E']
	]);
});

Testimony.test('watchProxy.spliceRemove', () => {
	let o = {
		a: [0, 1, 2, 3, 4]
	};

	let log = [];
	let wp = watchProxy(o, (action, path, val)=>{
		log.push([action, path, val]);
	});

	var item = wp.a.splice(2, 2, 'C');
	assert.eqJson(log, [
		['set', ['a', '2'], 'C'],
		['remove', ['a', '3'], 3]
	]);
});
