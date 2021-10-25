import {assert, assertEquals, Testimony} from './lib/Testimony.js';
Testimony.enableJsDom();

import Refract from './../src/Refract.js';
import createEl from '../src/createEl.js';

Refract.elsCreated = [];

/**
 * Comment test. */
Deno.test('Refract.basic.empty', () => {
	class A extends Refract {
		html = `<x-1></x-1>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, '<x-1></x-1>');
	assertEquals(a.children.length, 0);
});

Deno.test('Refract.basic.constructor', () => {
	let constructorCalled = 0;

	class A extends Refract {
		constructor(a, from, b=window) {
			super();
			constructorCalled++;
		}

		html = `<a-2>hi</a-2>`;
	}
	eval(A.compile());

	let a = new A();

	// Make sure constructor is called when instantiative via createEl.
	assertEquals(constructorCalled, 1);

	console.log();

	let a2 = createEl('<a-2></a-2>');

	assertEquals(constructorCalled, 2);
});

Deno.test('Refract.basic.slash', () => {
	class A extends Refract {
		a = '//';
		html = `<a-3></a-3>`;
	}
	eval(A.compile());
});

Deno.test('Refract.basic.import', () => {

	class A extends Refract {
		constructor() {
			super();

			// Uses module's import
			assertEquals(1, 1);
			this.constructorCalled = true;
		}

		html = `<x-4>hi</x-4>`;
	}
	eval(A.compile());
	let a = new A();
	assertEquals(a.outerHTML, '<x-4>hi</x-4>');
	assertEquals(a.constructorCalled, true);
});

Deno.test('Refract.basic.text', () => {

	class A extends Refract {
		html = `<x-5>text</x-5>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, '<x-5>text</x-5>');
});

Deno.test('Refract.basic.entity', () => {

	class A extends Refract {
		html = `<x-6>a &lt; b</x-6>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, '<x-6>a &lt; b</x-6>');
});

Deno.test('Refract.basic.entity2', () => {

	class A extends Refract {
		html = `<x-7>a < b</x-7>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, '<x-7>a &lt; b</x-7>');
});

Deno.test('Refract.expr.string', () => {
	class A extends Refract {
		html = `<x-8>${'hi'}</x-8>`;
	}
	eval(A.compile());
	let a = new A();
	assertEquals(a.outerHTML, '<x-8>hi</x-8>');
	assertEquals(a.childNodes.length, 1);
});

Deno.test('Refract.expr.template', () => {
	class A extends Refract {
		html = `<x-12>${`hi`}</x-12>`;
	}
	eval(A.compile());
	let a = new A();
	assertEquals(a.outerHTML, '<x-12>hi</x-12>');
	assertEquals(a.childNodes.length, 1);
});

// Make sure parser leaves spaces.
Deno.test('Refract.expr.basic', () => {
	class A extends Refract {
		html = `<x-130>${new Date('2010-02-01 00:00:00').getUTCFullYear()}</x-130>`;
	}
	eval(A.compile());
	let a = new A();

	assertEquals(a.outerHTML, '<x-130>2010</x-130>');
});

Deno.test('Refract.expr._undefined', () => {
	class A extends Refract {
		value = 'undefined';
		html = `<x-135>${this.value}</x-135>`;
	}
	eval(A.compile());
	let a = new A();

	assertEquals(a.outerHTML, `<x-135></x-135>`);
});

Deno.test('Refract.expr.var', () => {
	class A extends Refract {
		value = 'Apple';
		html = `<x-140>${this.value}</x-140>`;
	}
	eval(A.compile());
	let a = new A();

	assertEquals(a.outerHTML, '<x-140>Apple</x-140>');
	assertEquals(a.childNodes.length, 1);

	a.value = 'Banana';
	assertEquals(a.outerHTML, '<x-140>Banana</x-140>');
	assertEquals(a.childNodes.length, 1);
});

Deno.test('Refract.expr.varDeep', () => {
	class A extends Refract {
		fruit = {name: 'Apple', shape: 'round'};
		html = `<x-150>${this.fruit.name}</x-150>`;
	}
	eval(A.compile());
	let a = new A();

	a.fruit.name = 'Cherry';
	assertEquals(a.outerHTML, '<x-150>Cherry</x-150>');
});

Deno.test('Refract.expr.varDeep2', () => {

	class A extends Refract {
		fruits = [{name: 'Apple'}, {name: 'Banana'}];
		html = `<x-16>${this.fruits[0].name}</x-16>`;
	}
	eval(A.compile());
	let a = new A();

	a.fruits[0].name = 'Cherry';
	assertEquals(a.outerHTML, '<x-16>Cherry</x-16>');

	a.fruits[0] = {name: 'Dragonfruit'};
	assertEquals(a.outerHTML, '<x-16>Dragonfruit</x-16>');

	a.fruits = [{name: 'Elderberry'}];
	assertEquals(a.outerHTML, '<x-16>Elderberry</x-16>');
});

Deno.test('Refract.expr.var2', () => {
	class A extends Refract {
		value = 'Apple';
		html = `<x-170>${this.value.toUpperCase() + '!'}</x-170>`;
	}
	eval(A.compile());
	let a = new A();

	assertEquals(a.outerHTML, '<x-170>APPLE!</x-170>');
	assertEquals(a.childNodes.length, 1);

	a.value = 'Banana';
	assertEquals(a.outerHTML, '<x-170>BANANA!</x-170>');
	assertEquals(a.childNodes.length, 1);
});

Deno.test('Refract.expr.scope', () => {
	var fruit = 'apple';


	class A extends Refract {
		html = `<x-175>${fruit}</x-175>`;
	}
	eval(A.compile());
	let a = new A();
	assertEquals(a.outerHTML, '<x-175>apple</x-175>');
	assertEquals(a.childNodes.length, 1);

	fruit = 'Banana'; // fruit is not watched, so changing this won't change the output.  This is by design:
	assertEquals(a.outerHTML, '<x-175>apple</x-175>');
	assertEquals(a.childNodes.length, 1);
});

Deno.test('Refract.expr.Complex', () => {
	class A extends Refract {
		value = 'Apple';
		html = `<x-180>${JSON.stringify(this.value)}</x-180>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<x-180>"Apple"</x-180>`);

	a.value = [{name: 'Apple'}];
	assertEquals(a.outerHTML, `<x-180>[{"name":"Apple"}]</x-180>`);

	a.value.push({name: 'Banana'});
	assertEquals(a.outerHTML, `<x-180>[{"name":"Apple"},{"name":"Banana"}]</x-180>`);

	a.value[1].name = 'Cherry';
	assertEquals(a.outerHTML, `<x-180>[{"name":"Apple"},{"name":"Cherry"}]</x-180>`);
});

Deno.test('Refract.expr.strings', () => {
	class A extends Refract {
		a = {b: {c: {d: 1}}}
		html = `<x-185>${this.a['b']["c"][`d`]}</x-185>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<x-185>1</x-185>`);

	a.a.b.c.d = 2
	assertEquals(a.outerHTML, `<x-185>2</x-185>`);
});

Deno.test('Refract.expr.strings2', () => {
	class A extends Refract {
		a = {b: {c: {d: {e12: 1}}}}
		html = `<x-187>${this.a['b']["c"][`d`][`e${1}2`]}</x-187>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<x-187>1</x-187>`);

	a.a.b.c.d.e12 = 2
	assertEquals(a.outerHTML, `<x-187>2</x-187>`);
});


Deno.test('Refract.expr.HashVar', () => {
	class A extends Refract {
		value = '<hi>';
		html = `<a-190>#{this.value.toUpperCase()}</a-190>`;
	}
	eval(A.compile());
	let a = new A();

	assertEquals(a.outerHTML, '<a-190>&lt;HI&gt;</a-190>');
});

Deno.test('Refract.expr.HashVarAttribute', () => {
	class A extends Refract {
		value = 'User';
		html = `<a-195><div title="Hello #{this.value}"></div></a-195>`;
	}
	eval(A.compile());
	let a = new A();

	assertEquals(a.outerHTML, '<a-195><div title="Hello User"></div></a-195>');
});


/**
 * Subscribe to an inherited property, then create the same property on the sub-class. */
Deno.test('Refract.expr.Inherited', () => {
	class A extends Refract {
		count = 2;
		html = `<a-200></a-200>`;
	}
	eval(A.compile());


	class B extends A {
		constructor() {
			super();
			// noinspection JSPotentiallyInvalidUsageOfThis
			this.count = 3;
		}

		html = `<b-200>${this.count}</b-200>`;
	}

	eval(B.compile());

	// This used to fail before the constructor checked if virutalElement.apply() had already been applied in a super class.
	let b = new B();

	assertEquals(b.outerHTML, '<b-200>3</b-200>');

});


// Loop:
Deno.test('Refract.loop.Push', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html = `<x-20>${this.fruits}</x-20>`;
	}
	eval(A.compile());
	let a = new A();

	assertEquals(a.childNodes.length, 2);
	assertEquals(a.outerHTML, '<x-20>AppleBanana</x-20>');

	Refract.elsCreated = [];
	a.fruits.push('Cherry');
	assertEquals(a.outerHTML, '<x-20>AppleBananaCherry</x-20>');
	assertEquals(Refract.elsCreated, ['Cherry']);


	Refract.elsCreated = [];
	a.fruits.pop();
	assertEquals(a.outerHTML, '<x-20>AppleBanana</x-20>');
	assertEquals(Refract.elsCreated, []);
});

Deno.test('Refract.loop.Unshift', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html = `<x-22>${this.fruits}</x-22>`;
	}
	eval(A.compile());
	let a = new A();
	assertEquals(a.childNodes.length, 2);
	assertEquals(a.outerHTML, '<x-22>AppleBanana</x-22>');

	Refract.elsCreated = [];
	a.fruits.unshift('Cherry');
	assertEquals(a.outerHTML, '<x-22>CherryAppleBanana</x-22>');
	assertEquals(Refract.elsCreated, ['Cherry']);


	Refract.elsCreated = [];
	a.fruits.shift();
	assertEquals(a.outerHTML, '<x-22>AppleBanana</x-22>');
	assertEquals(Refract.elsCreated, []);
});

Deno.test('Refract.loop.Set', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html = `<x-23>${this.fruits}</x-23>`;
	}
	eval(A.compile());
	let a = new A();

	//window.debug = true;
	a.fruits[0] = 'Cherry';
	assertEquals(a.outerHTML, '<x-23>CherryBanana</x-23>');
	assertEquals(a.childNodes.length, 2);


	a.fruits[1] = 'DragonFruit';
	assertEquals(a.outerHTML, '<x-23>CherryDragonFruit</x-23>');
	assertEquals(a.childNodes.length, 2);
});

Deno.test('Refract.loop.Pop', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html = `<x-25>${this.fruits}</x-25>`;
	}
	eval(A.compile());
	let a = new A();

	a.fruits.pop();
	assertEquals(a.outerHTML, '<x-25>Apple</x-25>');
	assertEquals(a.childNodes.length, 1);
});

Deno.test('Refract.loop.Map', () => {
	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html = `
			<x-26>${this.fruits.map(fruit => /* Block comment test */
				fruit
			)}</x-26>`;
	}
	eval(A.compile());
	let a = new A();

	assertEquals(a.outerHTML, '<x-26>AppleBanana</x-26>');

	Refract.elsCreated = [];
	a.fruits.push('Cherry');
	assertEquals(a.outerHTML, '<x-26>AppleBananaCherry</x-26>');
	assertEquals(Refract.elsCreated, ['Cherry']);
});

Deno.test('Refract.loop.Map2', () => {
	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html =
			`<x-28>${this . fruits . map ( ( fruit ) => // Inline comment test
				`<p>${fruit}</p>`
			)}</x-28>`;
	}
	eval(A.compile());
	let a = new A();

	assertEquals(a.outerHTML, '<x-28><p>Apple</p><p>Banana</p></x-28>');

	Refract.elsCreated = [];
	a.fruits.push('Cherry');
	assertEquals(a.outerHTML, '<x-28><p>Apple</p><p>Banana</p><p>Cherry</p></x-28>');
	assertEquals(Refract.elsCreated, ['<p>', 'Cherry']);
});

Deno.test('Refract.loop.RandomItems', () => {

	class A extends Refract {
		items = ['a', 'b'];
		html = `<x-285>${this.items.map(item => item.repeat(Math.floor(Math.random()*5)))}</x-285>`;
	}
	eval(A.compile());
	let a = new A();
	a.items[0] = 'c'; // No tests, we just make sure it doesn't crash.
});

Deno.test('Refract.loop._MapIndex', () => {
	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html =
			`<x-300>
				${this.fruits.map((fruit, i, array) => 
					`<p>${i}/${array.length} '=' + fruit}</p>`
				)}
			</x-300>`;
	}

	//TODO: This fails b/c we can't subscribe to array.length
	eval(A.compile());
	let a = new A();

	document.body.append(a);
	a.fruits.push('Cherry');
});

Deno.test('Refract.loop.MapAttributes', () => {
	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html =
			`<x-310>${this.fruits.map(fruit =>
				`<p title="${fruit}"></p>`
			)}</x-310>`;
	}
	eval(A.compile());
	let a = new A();

	assertEquals(a.outerHTML, `<x-310><p title="Apple"></p><p title="Banana"></p></x-310>`);

	a.fruits.push('Cherry');
	assertEquals(a.outerHTML, `<x-310><p title="Apple"></p><p title="Banana"></p><p title="Cherry"></p></x-310>`);

});

Deno.test('Refract.loop.MapTwoChilden', () => {
	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html = `
			<x-320>${this.fruits.map(fruit =>
				`Hi <b>${fruit}</b>`
			)}</x-320>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, '<x-320>Hi <b>Apple</b>Hi <b>Banana</b></x-320>');

	a.fruits.pop();
	assertEquals(a.outerHTML, '<x-320>Hi <b>Apple</b></x-320>');

	a.fruits.unshift('Cherry');
	assertEquals(a.outerHTML, '<x-320>Hi <b>Cherry</b>Hi <b>Apple</b></x-320>');

});




Deno.test('Refract.loop.MapBrace', () => { // Make sure attribute quotes are escaped.

	class A extends Refract {
		items = [1, 2];
		html =
			`<x-330>${this.items.map(item => {
				return item;
			})}</x-330>`;
	}
	eval(A.compile());

	//document.body.append(A.debugRender());

	// let a = new A();
	// console.log(a.outerHTML);
});

Deno.test('Refract.loop.ItemProps', () => {
	class A extends Refract {
		fruits = [
			{name: 'Apple'},
			{name: 'Banana'},
		];
		html =
			`<x-350>${this.fruits.map(fruit =>
				`<p>${fruit.name}</p>`
			)}</x-350>`;
	}
	eval(A.compile());
	let a = new A();
	assertEquals(a.outerHTML, '<x-350><p>Apple</p><p>Banana</p></x-350>');

	// Change object
	Refract.elsCreated = [];
	a.fruits[1].name = 'Banana Split';
	assertEquals(a.outerHTML, '<x-350><p>Apple</p><p>Banana Split</p></x-350>');
	assertEquals(Refract.elsCreated, ['Banana Split']);

	// Add object
	Refract.elsCreated = [];
	a.fruits.push({name: 'Cherry', order: 3});
	assertEquals(a.outerHTML, '<x-350><p>Apple</p><p>Banana Split</p><p>Cherry</p></x-350>');
	assertEquals(Refract.elsCreated, ['<p>', 'Cherry']);

	// Change added object
	Refract.elsCreated = [];
	a.fruits[2].name = 'Cherry Pie';
	assertEquals(a.outerHTML, '<x-350><p>Apple</p><p>Banana Split</p><p>Cherry Pie</p></x-350>');
	assertEquals(Refract.elsCreated, ['Cherry Pie']);

	// Remove object
	Refract.elsCreated = [];
	a.fruits.shift();
	assertEquals(a.outerHTML, '<x-350><p>Banana Split</p><p>Cherry Pie</p></x-350>');
	assertEquals(Refract.elsCreated, []);

});

Deno.test('Refract.loop.ItemProps2', () => {
	class A extends Refract {
		fruits = [
			{name: 'Apple', order: 1},
			{name: 'Banana', order: 2}
		];
		html =
			`<x-40>${this.fruits.map(fruit => 
				`<p>${fruit.order} ${fruit.name}</p>`
			)}</x-40>`;
	}
	eval(A.compile());
	let a = new A();

	assertEquals(a.outerHTML, '<x-40><p>1 Apple</p><p>2 Banana</p></x-40>');

	// Change object
	Refract.elsCreated = [];
	a.fruits[1].name = 'Banana Split';
	assertEquals(a.outerHTML, '<x-40><p>1 Apple</p><p>2 Banana Split</p></x-40>');
	assertEquals(Refract.elsCreated, ['Banana Split']);
});

Deno.test('Refract.loop.PrimitiveToArray', () => { // Test changing a primitive property to an array.

	class A extends Refract {
		fruits = [
			'Apple',
			'Banana'
		];
		html = `<x-45>${this.fruits.map(fruit => `<p>${fruit}</p>`)}</x-45>`;
	}
	eval(A.compile());
	let a = new A();

	assertEquals(a.outerHTML, '<x-45><p>Apple</p><p>Banana</p></x-45>');

	// Replace primitive with array.
	Refract.elsCreated = [];
	a.fruits[0] = ['Apple Pie', 'Apple Cake'];
	assertEquals(a.outerHTML, '<x-45><p>Apple PieApple Cake</p><p>Banana</p></x-45>');
	assertEquals(Refract.elsCreated, ['<p>', 'Apple Pie', 'Apple Cake']);
});

// Two loops within the same parent
Deno.test('Refract.loop.double', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		pets = ['Cat', 'Dog'];
		html = `<x-60>${this.fruits}${this.pets}</x-60>`;
	}
	eval(A.compile());
	let a = new A();

	//document.body.append(a.debugRender());

	// 1. Initial Checks
	assertEquals(a.childNodes.length, 4);
	assertEquals(a.outerHTML, '<x-60>AppleBananaCatDog</x-60>');

	// 2. Push item to first list.
	Refract.elsCreated = [];
	//window.debug = true;
	a.fruits.push('Cherry');
	assertEquals(a.outerHTML, '<x-60>AppleBananaCherryCatDog</x-60>');
	assertEquals(Refract.elsCreated, ['Cherry']);
	//document.body.append(a.debugRender());
	//return;

	// 2. Shift item to second list.
	Refract.elsCreated = [];
	a.pets.unshift('Bird');
	assertEquals(a.outerHTML, '<x-60>AppleBananaCherryBirdCatDog</x-60>');
	assertEquals(Refract.elsCreated, ['Bird']);

	//document.body.append(a.debugRender());

	// 3. Splice item from first list.
	Refract.elsCreated = [];
	a.fruits.splice(1, 1);
	assertEquals(a.outerHTML, '<x-60>AppleCherryBirdCatDog</x-60>');
	assertEquals(Refract.elsCreated, []);

	//document.body.append(a.debugRender());

	// 3. Splice item from second list.
	Refract.elsCreated = [];
	a.pets.splice(1, 1);
	assertEquals(a.outerHTML, '<x-60>AppleCherryBirdDog</x-60>');
	assertEquals(Refract.elsCreated, []);


	//document.body.append(a.debugRender());
});

Deno.test('Refract.loop.Constant', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html =
			`<x-65>${this.fruits.map(fruit =>
				`<p>1</p>`
			)}</x-65>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<x-65><p>1</p><p>1</p></x-65>`);
});

Deno.test('Refract.loop.nested', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana']; // TODO Test defining these properties with "pets" first, before fruits, with varExpressionsRecursive()
		pets = ['Cat', 'Dog'];
		html =
			`<x-70>${this.fruits.map(fruit => 
				`${this.pets.map(pet=> 
					`<p>${fruit} ${pet}</p>`
				)}`
			)}</x-70>`;
	}
	eval(A.compile());

	let a = new A();

	assertEquals(a.outerHTML, `<x-70><p>Apple Cat</p><p>Apple Dog</p><p>Banana Cat</p><p>Banana Dog</p></x-70>`);

	a.fruits.shift();
	assertEquals(a.outerHTML, `<x-70><p>Banana Cat</p><p>Banana Dog</p></x-70>`);

	a.fruits.unshift('Cherry');
	assertEquals(a.outerHTML, `<x-70><p>Cherry Cat</p><p>Cherry Dog</p><p>Banana Cat</p><p>Banana Dog</p></x-70>`);

	a.pets.pop();
	assertEquals(a.outerHTML, `<x-70><p>Cherry Cat</p><p>Banana Cat</p></x-70>`);


	// The second sub-array VExpression has its receiveNotification() called before the first,
	// Due to the order they were previously added and removed.
	a.pets.unshift('Bird');
	assertEquals(a.outerHTML, `<x-70><p>Cherry Bird</p><p>Cherry Cat</p><p>Banana Bird</p><p>Banana Cat</p></x-70>`);


	a.pets.pop();
	assertEquals(a.outerHTML, `<x-70><p>Cherry Bird</p><p>Banana Bird</p></x-70>`);

	a.pets.pop();
	assertEquals(a.outerHTML, `<x-70></x-70>`);

});

// Loop over item and sub-array
Deno.test('Refract.loop.nested2', () => {

	class A extends Refract {

		pets = [
			{
				name: 'Cat',
				activities: ['Sleep', 'Eat', 'Pur']
			},
			{
				name: 'Dog',
				activities: ['Frolic', 'Fetch']
			}
		];

		html =
			`<x-72>${this.pets.map(pet =>
				pet.activities.map(activity=>
					`<p>#{pet.name} will ${activity}.</p>`
				)
			)}</x-72>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<x-72><p>Cat will Sleep.</p><p>Cat will Eat.</p><p>Cat will Pur.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p></x-72>`);


	Refract.elsCreated = [];
	a.pets[0].activities.splice(1, 1);
	assertEquals(a.outerHTML, `<x-72><p>Cat will Sleep.</p><p>Cat will Pur.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p></x-72>`);
	assertEquals(Refract.elsCreated, []);


	Refract.elsCreated = [];
	a.pets.push({name: 'Fish', activities: []});
	assertEquals(a.outerHTML, `<x-72><p>Cat will Sleep.</p><p>Cat will Pur.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p></x-72>`);
	assertEquals(Refract.elsCreated, []);

	Refract.elsCreated = [];
	a.pets[2].activities.push('Swim');
	assertEquals(a.outerHTML, `<x-72><p>Cat will Sleep.</p><p>Cat will Pur.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p><p>Fish will Swim.</p></x-72>`);
	assertEquals(Refract.elsCreated, ["<p>", "Fish", " will ", "Swim", "."]);

	Refract.elsCreated = [];
	a.pets.splice(1, 1);
	assertEquals(a.outerHTML, `<x-72><p>Cat will Sleep.</p><p>Cat will Pur.</p><p>Fish will Swim.</p></x-72>`);
	assertEquals(Refract.elsCreated, []);

	// Change pet name.
	Refract.elsCreated = [];
	a.pets[0].name = 'Bird';
	assertEquals(a.outerHTML, `<x-72><p>Bird will Sleep.</p><p>Bird will Pur.</p><p>Fish will Swim.</p></x-72>`);
	assertEquals(Refract.elsCreated, ['Bird', 'Bird']);

	// Change name of pet activity.
	Refract.elsCreated = [];
	a.pets[0].activities[1] = 'Tweet';
	assertEquals(a.outerHTML, `<x-72><p>Bird will Sleep.</p><p>Bird will Tweet.</p><p>Fish will Swim.</p></x-72>`);
	assertEquals(Refract.elsCreated, ["<p>", "Bird", " will ", "Tweet", "."]);
});

Deno.test('Refract.loop.nested3', () => {

	class A extends Refract {
		verb = 'will';
		pets = [
			{
				name: 'Cat',
				activities: [{name: 'Sleep'}, {name: 'Eat'}]
			},
			{
				name: 'Dog',
				activities: [{name: 'Frolic'}]
			}
		];

		html =
			`<x-74>${this.pets.map(pet =>
				pet.activities.map(activity=>
					`<p>#{pet.name} #{this.verb} ${activity.name}.</p>`
				)
			)}</x-74>`;
	}
	eval(A.compile());

	let a = new A();
	Refract.elsCreated = [];
	a.pets[0].activities[0].name = 'Purr';
	assertEquals(Refract.elsCreated, ['Purr']);

	Refract.elsCreated = [];
	a.verb = "won't";
	assertEquals(a.outerHTML, `<x-74><p>Cat won't Purr.</p><p>Cat won't Eat.</p><p>Dog won't Frolic.</p></x-74>`);
	assertEquals(Refract.elsCreated, ["won't", "won't", "won't"]);
});

Deno.test('Refract.loop.Expr', () => {

	class A extends Refract {
		fruits = ['Apple'];
		html =
			`<x-75>${this.fruits.map(fruit =>
				fruit + `${fruit}`
			)}</x-75>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<x-75>AppleApple</x-75>`);

	a.fruits.push('Banana');
	assertEquals(a.outerHTML, `<x-75>AppleAppleBananaBanana</x-75>`);
});

Deno.test('Refract.loop.Expr2', () => {

	class A extends Refract {
		formulas = ['a>b', 'c<d&e'];
		html =
			`<x-760>${this.formulas.slice().map(formula =>
				`#{formula}`
			)}</x-760>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<x-760>a&gt;bc&lt;d&amp;e</x-760>`);
});

Deno.test('Refract.loop.Expr3', () => { // Make sure attribute quotes are escaped.

	class A extends Refract {
		entities = ['"', "'"];
		html =
			`<x-765>${this.entities.slice().map(ent =>
				`<div title="#{ent}">#{ent}</div>`
			)}</x-765>`;
	}
	eval(A.compile());

	let a = new A();
	//console.log(Refract.htmlEncode('"', '"'));
	console.log(a.outerHTML);
});

Deno.test('Refract.loop.If', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html =
			`<x-770>${this.fruits.map(fruit =>
				fruit.startsWith('A') ? fruit : ''
			)}</x-770>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<x-770>Apple</x-770>`);

	a.fruits.push('Cherry');
	assertEquals(a.outerHTML, `<x-770>Apple</x-770>`);

	a.fruits.push('Avacado');
	assertEquals(a.outerHTML, `<x-770>AppleAvacado</x-770>`);


	a.fruits.shift();
	assertEquals(a.outerHTML, `<x-770>Avacado</x-770>`);

	a.fruits.unshift('Applesauce');
	assertEquals(a.outerHTML, `<x-770>ApplesauceAvacado</x-770>`);

	a.fruits[1] = 'Dragonfruit';
	assertEquals(a.fruits.slice(), ['Applesauce', 'Dragonfruit', 'Cherry', 'Avacado']);
	assertEquals(a.outerHTML, `<x-770>ApplesauceAvacado</x-770>`);
});

Deno.test('Refract.loop.IfNested', () => {

	class A extends Refract {
		pets = [
			{
				name: 'Cat',
				activities: ['Sleep', 'Eat', 'Pur']
			},
			{
				name: 'Dog',
				activities: ['Frolic', 'Fetch']
			}
		];

		html =
			`<x-79>${this.pets.map(pet =>
				pet.activities.map(activity =>
					activity.length >= 5
						? `<p>#{pet.name} will ${activity}.</p>`
						: ''
				)
			)}</x-79>`;
	}

	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<x-79><p>Cat will Sleep.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p></x-79>`);

	Refract.elsCreated = [];
	a.pets[0].activities[0] = 'Doze'; // Less than 5 characters.
	assertEquals(a.outerHTML, `<x-79><p>Dog will Frolic.</p><p>Dog will Fetch.</p></x-79>`);
	assertEquals(Refract.elsCreated, []);

	Refract.elsCreated = [];
	a.pets[0].activities[0] = 'Slumber';
	assertEquals(a.outerHTML, `<x-79><p>Cat will Slumber.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p></x-79>`);
	assertEquals(Refract.elsCreated, ["<p>", "Cat will Slumber."]);
});

Deno.test('Refract.loop.ifNested2', () => {

	class A extends Refract {
		pets = [
			{
				name: 'Cat',
				activities: ['Sleep', 'Eat']
			},
			{
				name: 'Dog',
				activities: ['Frolic']
			}
		];

		html =
			`<x-80>${this.pets.map(pet =>
				pet.name.startsWith('C')
					? pet.activities.map(activity =>
						`<p>#{pet.name} will ${activity}.</p>`)					
					: ''				
			)}</x-80>`;
	}

	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<x-80><p>Cat will Sleep.</p><p>Cat will Eat.</p></x-80>`);

	Refract.elsCreated = [];
	a.pets[1].name='Cat2';
	assertEquals(a.outerHTML, `<x-80><p>Cat will Sleep.</p><p>Cat will Eat.</p><p>Cat2 will Frolic.</p></x-80>`);
	assertEquals(Refract.elsCreated, ["<p>", "Cat2 will Frolic."]);

	a.pets[0].name = 'Bird';
	assertEquals(a.outerHTML, `<x-80><p>Cat2 will Frolic.</p></x-80>`);

	// It recreates the whole thing because it has to re-evaluate the pet.name.startsWith('C') expression.
	assertEquals(Refract.elsCreated, ['<p>', 'Cat2 will Frolic.']);
});

Deno.test('Refract.attributes.basic', () => {

	class A extends Refract {
		title = 'Hello';
		html =
			`<x-82 title="${this.title}"></x-82>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<x-82 title="Hello"></x-82>`);

	a.title = 'Goodbye';
	assertEquals(a.outerHTML, `<x-82 title="Goodbye"></x-82>`);

	a.title = [1, 2, 3];

});

Deno.test('Refract.attributes.StyleObject', () => {

	class A extends Refract {
		styles = '';
		html = `<x-87><div style="width: 10px; ${this.styles} height: 20px"></div></x-87>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<x-87><div style="width: 10px;  height: 20px"></div></x-87>`);

	a.styles = {top: 0, left: '3px'};
	assertEquals(a.outerHTML, `<x-87><div style="width: 10px; top: 0; left: 3px;  height: 20px"></div></x-87>`);

	a.styles = {};
	assertEquals(a.outerHTML, `<x-87><div style="width: 10px;  height: 20px"></div></x-87>`);

	a.styles = '';
	assertEquals(a.outerHTML, `<x-87><div style="width: 10px;  height: 20px"></div></x-87>`);
});

// Fails b/c Watch doesn't intercept Set() methods, so we don't get called on add().

Deno.test('Refract.attributes._Set', () => {
	class A extends Refract {
		classes = new Set();
		html = `<x-85><div class="one ${this.classes}"></div></x-85>`;
	}
	eval(A.compile());
	let a = new A();
	assertEquals(a.outerHTML, `<x-85><div class="one "></div></x-85>`);

	a.classes.add('two');
	assertEquals(a.outerHTML, `<x-85><div class="one two"></div></x-85>`);

});

Deno.test('Refract.nested.basic', () => {

	class B extends Refract {
		name = '';
		constructor(name) {
			super();
			this.name = name;
		}
		html = `<x-b90>${this.name}</x-b90>`;
	}
	B = eval(B.compile());


	class A extends Refract {
		html = `<a-90><x-b90 name="Apple"></x-b90></a-90>`;
	}
	eval(A.compile());


	let a = new A();
	assertEquals(a.outerHTML, `<a-90><x-b90 name="Apple">Apple</x-b90></a-90>`);
});

Deno.test('Refract.nested.passOBj', () => {

	class B extends Refract {
		fruit2 = [];
		constructor(fruits) {
			super();
			this.fruits2 = fruits;
		}
		html = `<x-b95>${this.fruits2}</x-b95>`;
	}
	B = eval(B.compile());


	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html = `<a-95><x-b95 fruits="${this.fruits}"></x-b95></a-95>`;
	}
	eval(A.compile());

	let a = new A();

	assertEquals(a.outerHTML, `<a-95><x-b95 fruits="Apple Banana">AppleBanana</x-b95></a-95>`);

	// Make sure the child xel watches the parent's array.
	Refract.elsCreated = [];
	a.fruits.push('Cherry');
	assertEquals(a.outerHTML, `<a-95><x-b95 fruits="Apple Banana Cherry">AppleBananaCherry</x-b95></a-95>`);
	assertEquals(Refract.elsCreated, ['Cherry']);


	Refract.elsCreated = [];
	a.fruits.push('DragonFruit');
	assertEquals(a.outerHTML, `<a-95><x-b95 fruits="Apple Banana Cherry DragonFruit">AppleBananaCherryDragonFruit</x-b95></a-95>`);
	assertEquals(Refract.elsCreated, ['DragonFruit']);

	Refract.elsCreated = [];
	a.fruits.shift();
	assertEquals(a.outerHTML, `<a-95><x-b95 fruits="Banana Cherry DragonFruit">BananaCherryDragonFruit</x-b95></a-95>`);
	assertEquals(Refract.elsCreated, []);
});

Deno.test('Refract.nested.loop', () => {

	class B extends Refract {
		fruit = undefined;
		constructor(fruit) {
			super();
			this.fruit = fruit;
		}
		html = `<x-b100><b>${this.fruit}</b></x-b100>`;
	}
	B = eval(B.compile());


	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html = `
			<a-100>${this.fruits.map(fruit => 
				`<x-b100 fruit="${fruit}"></x-b100>`
			)}</a-100>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.outerHTML, `<a-100><x-b100 fruit="Apple"><b>Apple</b></x-b100><x-b100 fruit="Banana"><b>Banana</b></x-b100></a-100>`);

	a.fruits.push('Cherry');
	assertEquals(a.outerHTML, `<a-100><x-b100 fruit="Apple"><b>Apple</b></x-b100><x-b100 fruit="Banana"><b>Banana</b></x-b100><x-b100 fruit="Cherry"><b>Cherry</b></x-b100></a-100>`);

	a.fruits.splice(1, 1);
	assertEquals(a.outerHTML, `<a-100><x-b100 fruit="Apple"><b>Apple</b></x-b100><x-b100 fruit="Cherry"><b>Cherry</b></x-b100></a-100>`);
});

Deno.test('Refract.form.inputExpr', () => {

	class A extends Refract {
		value = 'Apple';
		html = `<a-120><input id="input" value="${this.value}"></a-120>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.input.value, 'Apple');

	// Set class value.
	a.value = 'Banana';
	assertEquals(a.input.value, 'Banana');

	// Set input value
	a.input.value = 'Cherry';
	a.input.dispatchEvent(new Event('input'));
	assertEquals(a.value, 'Cherry');
});

Deno.test('Refract.form.inputEvent', () => {

	class A extends Refract {
		value = 'Apple';
		html = `<a-125><input id="input" oninput="this.value=el.value.replace(/ Pie$/i, '')" value="${this.value + ' Pie'}"></a-125>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.input.value, 'Apple Pie');

	a.value = 'Banana';
	assertEquals(a.input.value, 'Banana Pie');

	a.input.value = 'Cherry Pie';
	a.input.dispatchEvent(new Event('input'));
	assertEquals(a.value, 'Cherry');
});

Deno.test('Refract.form.inputValueOnInputExpr', () => {

	class A extends Refract {
		value = 'Apple';
		html = `<a-130><input id="input" value="${this.value + ' Pie'}" oninput="${'this.value=el.value.replace(/ Pie$/i, "")'}"></a-130>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.input.value, 'Apple Pie');

	a.value = 'Banana';
	assertEquals(a.input.value, 'Banana Pie');

	a.input.value = 'Cherry Pie';
	a.input.dispatchEvent(new Event('input'));
	assertEquals(a.value, 'Cherry');
});

Deno.test('Refract.form.select', () => {

	class A extends Refract {
		value = 'two';
		html = `
			<a-140>
				<select id="select" value="${this.value}">
					<option value="one">1</option>
					<option value="two">2</option>
				</select>
			</a-140>`;
	}
	eval(A.compile());

	let a = new A();

	// document.body.append(a);
	// window.a = a;

	assertEquals(a.select.value, 'two');

	a.select.selectedIndex = 0;
	a.select.dispatchEvent(new Event('change'));
	assertEquals(a.value, 'one');
	assertEquals(a.select.value, 'one');

	a.value = 'two';
	assertEquals(a.select.value, 'two');

});

Deno.test('Refract.form.SelectMultiple', () => {

	class A extends Refract {
		value = ['two'];
		html = `
			<a-150>
				<select id="select" value="${this.value}" multiple>
					<option value="one">1</option>
					<option value="two">2</option>
				</select>
			</a-150>`;
	}
	eval(A.compile());

	let a = new A();

	a.select.children[0].selected = true;
	a.select.dispatchEvent(new Event('change'));
	assertEquals(a.value, ['one', 'two']);

	a.value = ['two'];
	assertEquals(a.select.value, 'two');
	assertEquals(a.select.children[0].selected, false);
	assertEquals(a.select.children[1].selected, true);

	a.value = ['one', 'two'];
	assertEquals(a.select.value, 'one'); // Value will only have the first one.
	assertEquals(a.select.children[0].selected, true);
	assertEquals(a.select.children[1].selected, true);
});

Deno.test('Refract.events.basic', () => {
	var clicked = {};
	class E extends Refract {
		onClick(event, el) {
			clicked.event = event;
			clicked.el = el;
		}

		html = `
			<e-1>
				<div id="btn" onclick="this.onClick(event, el)">hi</div>
			</e-1>`;
	}
	E = eval(E.compile());
	let e = new E();
	e.btn.dispatchEvent(new MouseEvent('click', {view: window, bubbles: true, cancelable: true}));

	assertEquals(clicked.event.type, 'click')
	assertEquals(clicked.el, e.btn);
});

Deno.test('Refract.events.Loop', () => {
	var clicked = {};
	class E extends Refract {
		fruits = ['Apple', 'Banana']

		onClick(event, el, fruit) {
			clicked.event = event;
			clicked.el = el;
			clicked.fruit = fruit;
		}

		html = `
			<e-5>
				${this.fruits.map(fruit => 
					`<div onclick="this.onClick(event, el, fruit)">hi</div>`
				)}
			</e-5>`;
	}
	E = eval(E.compile());
	let e = new E();
	e.children[1].dispatchEvent(new MouseEvent('click', {view: window, bubbles: true, cancelable: true}));

	assertEquals(clicked.event.type, 'click')
	assertEquals(clicked.el, e.children[1]);
	assertEquals(clicked.fruit, 'Banana');
});

// Same as above, but without a simple loop.
Deno.test('Refract.events._Loop2', () => {
	var clicked = {};
	class E extends Refract {
		fruits = ['Apple', 'Banana']

		onClick(event, el, fruit) {
			clicked.event = event;
			clicked.el = el;
			clicked.fruit = fruit;
		}

		html = `
			<e-10>
				${this.fruits.slice().map(fruit =>
					`<div onclick="this.onClick(event, el, fruit)">hi</div>`
				)}
			</e-10>`;
	}
	E = eval(E.compile());
	let e = new E();
	e.children[1].dispatchEvent(new MouseEvent('click', {view: window, bubbles: true, cancelable: true}));

	assertEquals(clicked.event.type, 'click')
	assertEquals(clicked.el, e.children[1]);
	assertEquals(clicked.fruit, 'Banana');
});

Deno.test('Refract.shadowDom', () => {
	class S extends Refract {
		html = `
			<s-1 shadow>
				<div>hi</div>
			</s-1>`;
	}
	S = eval(S.compile());

	let s = new S();
	assert(s.shadowRoot);
	assertEquals(s.shadowRoot.firstChild.tagName, 'DIV');
});

Deno.test('Refract.slot.basic', () => {
	class A extends Refract {
		constructor() {
			super();
		}

		html =  `<a-400><p><slot></slot></p></a-400>`;
	}

	eval(A.compile());

	let a = createEl(`<a-400>test</a-400>`);
	assertEquals(a.outerHTML, '<a-400><p><slot>test</slot></p></a-400>');
});

Deno.test('Refract.slot.Eval', () => {
	class A extends Refract {
		constructor() {
			super();
			this.item = 3;
		}

		html =  `<a-402><p><slot></slot></p></a-402>`;
	}

	eval(A.compile());

	let a = createEl('<a-402>${this.item}</a-402>');
	assertEquals(a.outerHTML, '<a-402><p><slot>3</slot></p></a-402>');
});

Deno.test('Refract.slot.Loop', () => {
	class A extends Refract {

		items = ['A', 'B', 'C'];

		constructor() {
			super();
		}

		html = `<a-404>${this.items.map(x => `<slot></slot>`)}</a-404>`;
	}

	eval(A.compile());

	let a = createEl('<a-404>${x}</a-404>');
	assertEquals(a.outerHTML, '<a-404><slot>A</slot><slot>B</slot><slot>C</slot></a-404>');
});

Deno.test('Refract.slot.multiple', () => {
	class A extends Refract {
		html =
		`<a-405><p><slot></slot></p><slot></slot></a-405>`;
	}
	eval(A.compile());

	let a = createEl(`<a-405>test</a-405>`);
	assertEquals(a.outerHTML,
		`<a-405><p><slot>test</slot></p><slot>test</slot></a-405>`);
});

Deno.test('Refract.slot._named', () => {
	class A extends Refract {
		html = `<a-410>begin<slot name="slot1"></slot>end</a-410>`;
	}
	eval(A.compile());

	let a = createEl(`<a-410><div slot="slot1">content</div></a-410>`);
	assertEquals(a.outerHTML, '<a-410>begin<slot name="slot1">content</slot>end</a-410>');
});

Deno.test('Refract._debugRender', () => {

	class A extends Refract {
		fruits = [];
		html = `
			<x-135>
				hi
				<b name="${this.a}" title="b">test</b>
				${this.fruits.map(fruit =>
					`<p>{fruit.order} <b>${fruit.name + `<i>test</i>`}</b></p><img src=""/>`
				)}
				${this.fruits.map(fruit =>
					fruit.order // TODO: This should be parsed and render as a sub-expression.
				)}
			</x-135>`;
	}
	eval(A.compile());


	let el = A.debugRender();
	document.body.appendChild(el);
});

Deno.test('Refract.misc.formInputDeep', () => {

	class A extends Refract {
		deep = { value: 'Apple'};
		html = `<a-121><input id="input" value="${this.deep.value}"></a-121>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.input.value, 'Apple');

	// Set class value
	a.deep.value = 'Banana';
	assertEquals(a.input.value, 'Banana');

	// Set input value
	a.input.value = 'Cherry';
	a.input.dispatchEvent(new Event('input'));
	assertEquals(a.deep.value, 'Cherry');

	window.a = a;
});

Deno.test('Refract.misc.TwoVars', () => {

	class A extends Refract {
		a = 1;
		b = 2;
		html = `<a-122>${this.a + this.b}</a-122>`;
	}
	eval(A.compile());

	let a = new A();
	assertEquals(a.innerHTML, '3');

	a.b = 3;
	assertEquals(a.innerHTML, '4');

	a.a = 2;
	assertEquals(a.innerHTML, '5');
});
