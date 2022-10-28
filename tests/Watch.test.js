import {assert, assertEquals, Testimony} from './Testimony.js';
Testimony.enableJsDom();

import Watch, {WatchProperties} from "../src/Watch.js";
import Watcher from "../src/Watcher.js";
import watchProxy, {WatchUtil} from '../src/watchProxy.js';


/**
 * Make sure all data is cleaned up after the test completes. */
function trackGarbage(callback) {
	// Switch them from WeakMap to Map so we can check the size.
	WatchUtil.proxies = new Map();
	WatchUtil.roots = new Map();
	WatchUtil.callbacks = new Map();
	WatchUtil.paths = new Map();
	Watch.objects = new Map();

	callback();

	//assert(!WatchUtil.proxies.size); // TODO
	assert(!WatchUtil.roots.size);
	//assert(!WatchUtil.callbacks.size);
	assert(!WatchUtil.paths.size);
	assert(!Watch.objects.size);

	WatchUtil.proxies = new WeakMap();
	WatchUtil.roots = new WeakMap();
	WatchUtil.callbacks = new WeakMap();
	WatchUtil.paths = new WeakMap();
	Watch.objects = new WeakMap();
}



Deno.test('Watcher.init', () => {
	var o = {a: [0, 1]};

	Watch.add(o,['a'], (action, path, value) => {});
	assertEquals(o.a.length, 2);
	assertEquals(o.a[0], 0);
	assertEquals(o.a[1], 1);
});

Deno.test('Watcher.set', () => {
	var o = {a: 1};

	var called = [];
	Watch.add(o,['a'], (action, path, value) => {

	});
});


// old:

Deno.test('Watch.init', () => {
	var o = {a: [0, 1]};
	var wp = new WatchProperties(o);
	wp.subscribe_(['a'], (action, path, value) => {});
	assertEquals(o.a.length, 2);
	assertEquals(o.a[0], 0);
	assertEquals(o.a[1], 1);
});


// Assign proxied.
Deno.test('Watch.removeProxy', () => {
	var b = {
		items: [{name: 1}]
	};
	Watch.add(b, 'items', function() {
	//	console.log(arguments);
	});

	// Make sure setting an array with a proxied item inside doesn't add the proxy to the underlying object.
	b.items = [b.items[0]]; // new array, proxied original object inside.

	b.items[0].name = 2;

	assert(!b.items.$removeProxy[0].$isProxy);
});

Deno.test('Watch.removeProxy2', () => {
	var o = {
		a: {
			c: undefined
		},
		b: undefined
	};
	Watch.add(o, ['a'], ()=>{});

	// o is an object with Object.defineProperty()'s defined and isn't a proxy.
	//assertEqDeep(o.$removeProxy, {a: {c: undefined}, b: undefined});
	assert.eqJson(o.a.$removeProxy, {c: undefined});
	assertEquals(o.a.$removeProxy.c, undefined);
});

// Same as WatchProxy.twoLevel, but with watch() instead of watchProxy.
Deno.test('Watch.nestedUpdate', () => {
	var a = {
		b1: {
			c: 1,
			parent: undefined
		},
		b2: [1, 2]
	};
	a.b1.parent = a;
	var called = new Set();

	var cb1 = function(action, path, value) {
		called.add('a.b2');
	};
	Watch.add(a, ['b2'], cb1);

	var cb2 = function(action, path, value) {
		called.add('b1.parent.b2');
	};
	Watch.add(a.b1, ['parent', 'b2'], cb2);

	a.b1.parent.b2[0] = 5;

	assertEquals(a.b2[0], 5);
	assert(called.has('a.b2'));
	assert(called.has('b1.parent.b2'));
});



Deno.test('Watch._nestedUpdateViaFunction', () => {
	var b = {
		name: 'apple',
		update() {
			this.name = 'banana';
		}
	}

	var a = {b};

	var called = [];
	Watch.add(a, ['b', 'name'], (action, path) => {
		called.push('a.' + path);
	});

	Watch.add(a.b, ['name'], (action, path) => {
		called.push('b.' + path);
	});

	a.b.update();
	assertEquals(called, ['a.b.name', 'b.name']);
});


// Test finding proxied items.
Deno.test('Watch.indexOf', () => {
	//trackGarbage(() => {

		var b = {
			items: [{name: 1}]
		};
		let cb = ()=>{
			var item = b.items[0];
			var i = b.items.indexOf(item);
			assertEquals(i, 0);
		};

		Watch.add(b, 'items', cb);

		b.items.push({name: 2});

		Watch.remove(b, 'items', cb);
	//});

});

Deno.test('Watch.pop', () => {
	trackGarbage(() => {

		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		var cb = ()=>{};
		wp.subscribe_(['a', 0], cb);
		wp.subscribe_(['a', 1], cb);

		assert(wp.subs_);
		o.a.pop();

		assert(wp.subs_); // doesn't remove the watch.  But I think that's correct behavior.

		wp.unsubscribe_(['a', 0], cb);
		wp.unsubscribe_(['a', 1], cb);
	});
});

Deno.test('Watch.unsubscribe', () => {
	trackGarbage(() => {

		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		var cb = ()=>{ console.log(1);};

		wp.subscribe_(['a'], cb);
		assertEquals(Object.keys(wp.subs_).length, 1);

		wp.unsubscribe_(['a'], cb);
		assertEquals(Object.keys(wp.subs_).length, 0);

		wp.subscribe_(['a', 0], cb);
		assertEquals(Object.keys(wp.subs_).length, 1);
		o.a[0] = 2; // Watch isn't created until this step.

		wp.unsubscribe_(['a', 0], cb);
		assertEquals(Object.keys(wp.subs_).length, 0);
	});
});

Deno.test('Watch.unsubscribe2', () => {
	trackGarbage(() => {

		// Make sure unsubscribing a child leaves the parent.  This used to fail.
		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		var cb = ()=>{};

		//for (let i=0; i<30; i++) {
			wp.subscribe_(['a'], cb);
			wp.subscribe_(['a', '0'], cb);

			// Unsubscribe one callback from a[0]
			wp.unsubscribe_(['a', '0'], cb);
			assert(o.a.$isProxy);

			// Unsubscribe all callbacks from a[0]
			wp.unsubscribe_(['a', '0']);
			assert(o.a.$isProxy);

			// Unsubscribe last callbacks from a.
			wp.unsubscribe_(['a'], cb);
			assert(!o.a.$isProxy);
		//}

		// Make sure we can subscribe back again.
		wp.subscribe_(['a'], cb);
		assert(o.a.$isProxy);

		wp.unsubscribe_(['a'], cb);

	});
});

// Same as WatchProxy.htmlelement, but with watch() instead of watchProxy.
Deno.test('Watch.htmlElement', () => {
	var o = {
		a: document
	};
	Watch.add(o, 'a', function(action, path, value) {});
	o.a.getElementById('test'); // Will throw if fails because a is a proxy instead of an HTMLDocument.
});


Deno.test('Watch.reSubscribeInCallback', () => {

	trackGarbage(() => {

		// Make sure unsubscribing a child leaves the parent.  This used to fail.
		var o = {a: [0, 'item2']};

		let cb = () => {
			Watch.remove(o, ['a', '0'], cb);
			assert(WatchUtil.roots.size === 0);
			Watch.add(o, ['a', '0'], cb);
		};

		Watch.add(o, ['a', '0'], cb);


		for (let i = 0; i < 30; i++)
			o.a[0] = i;

		Watch.remove(o, ['a', '0'], cb);

		assert(WatchUtil.roots.size === 0);

	});
});

// TODO: Watch sub-property then Watch.remove main object.
