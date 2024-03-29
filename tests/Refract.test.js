import Testimony, {assert} from './Testimony.js';
Testimony.enableJsDom();

//import Refract from './../dist/Refract.js';
//import Refract from './../dist/Refract.min.js';
import Refract, {h} from '../src/refract/Refract.js';
import createEl from '../src/util/createEl.js';

Refract.elsCreated = [];

/**
 * Comment test. */
Testimony.test('Refract.basic.empty', () => {
	class A extends Refract {
		html() { return `<x-10></x-10>` }
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, '<x-10></x-10>');
	assert.eq(a.childNodes.length, 0);
});

Testimony.test('Refract.basic.nonTemplate', () => {
	class A extends Refract {
		html() { return '<x-15>everyone\'s <b \t>happy</b></x-15>'}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, '<x-15>everyone\'s <b>happy</b></x-15>');
	assert.eq(a.childNodes.length, 2);
});

Testimony.test('Refract.basic.escaped', () => {
	class A extends Refract {
		html() { return `\r\n\t<x-16>everyone's ${`<b \t>happy</b>`}</x-16>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-16>everyone's <b>happy</b></x-16>`);
	assert.eq(a.childNodes.length, 2);
});


Testimony.test('Refract.basic.nonTemplateEscaped', () => {
	class A extends Refract {
		html() { return '\r\n\t<x-17>everyone\'s ${`<b \t>happy</b>`}</x-17>'}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, '<x-17>everyone\'s <b>happy</b></x-17>');
	assert.eq(a.childNodes.length, 2);
});


Testimony.test('Refract.basic.constructor', () => {
	let constructorCalled = 0;

	class A extends Refract {
		test = 3;


		init(a, from, b=window) {
						constructorCalled++;
		}

		html() { return `<a-20>hi</a-20>`}
	}
	eval(A.compile());

	let a = new A();

	// Make sure constructor is called when instantiative via createEl.
	assert.eq(constructorCalled, 1);

	// let a2 = createEl('<a-20></a-20>');
	//
	// assert.eq(constructorCalled, 2);
});

Testimony.test('Refract.basic.constructor2', () => {
	let constructorCalled = 0;

	class A extends Refract {
		init(int, json, expr=x=>x+1, func=function(){ return (1+1)}, d={}) {
			assert.eq(int, 1);
			assert.eq(json, [2]);
			assert.eq(expr, 3);
			constructorCalled++;
		}

		html() { return `<a-22>hi</a-22>`};
	}
	eval(A.compile());

	// Check constructor params when instaniated from javascript.
	let a = new A(1, [2], 3);
	assert.eq(constructorCalled, 1);


	// Check constructor params when instantiative via createEl.
	let a2 = createEl('<a-22 int="1" json="[2]" expr="${1+2}"></a-22>');
	assert.eq(constructorCalled, 2);
});



Testimony.test('Refract.basic.init', () => {
	let constructorCalled = 0;

	class A extends Refract {

		init(int, json, expr, undef) {

			assert.eq(int, 1);
			assert.eq(json, [2]);
			assert.eq(expr, 3);
			assert.eq(undef, undefined);

			constructorCalled++;
		}

		html() {
			return `<a-23>hi</a-23>`;
		}
	}
	eval(A.compile());

	// Check init(...params) params when instaniated from javascript.
	let a = new A(1, [2], 3);
	assert.eq(constructorCalled, 1);


	// Check init(...params) params when instantiative via createEl.
	let a2 = createEl('<a-23 int="1" json="[2]" expr="${1+2}"></a-23>');
	assert.eq(constructorCalled, 2);
});



Testimony.test('Refract.basic.initNamed', 'Test named init() parameters', () => {
	let constructorCalled = 0;

	class A extends Refract {

		// noinspection JSUnusedGlobalSymbols
		init({int, json, expr, undef}={}) {


			assert.eq(int, 1);
			assert.eq(json, [2]);
			assert.eq(expr, 3);
			assert.eq(undef, undefined);

			constructorCalled++;
		}

		html() {
			return `<a-24>hi</a-24>`;
		}
	}
	eval(A.compile());

	// Check init(...params) when instaniated from javascript.
	let a = new A({int:1, json:[2], expr:3});
	assert.eq(constructorCalled, 1);


	// Check init(...params) params when instantiative via createEl.
	let a2 = createEl('<a-24 int="1" json="[2]" expr="${1+2}"></a-24>');
	assert.eq(constructorCalled, 2);

	// Check init(...params) params when instantiative from another Refract element.
	class B extends Refract {
		html() {
			return `<b-24><a-24 int="1" json="[2]" expr="${1+2}"></a-24></b-24>`;
		}
	}
	eval(B.compile());


	let b = new B();
	assert.eq(constructorCalled, 3);
});


Testimony.test('Refract.basic.slash', () => {
	class A extends Refract {
		a = '//';
		html() { return `<a-30></a-30>`};
	}
	eval(A.compile());
});

Testimony.test('Refract.basic.import', () => {

	class A extends Refract {
		init() {
			
			// Uses module's import
			assert.eq(1, 1);
			this.constructorCalled = true;
		}

		html() { return `<x-4>hi</x-4>`};
	}
	eval(A.compile());
	let a = new A();
	assert.eq(a.outerHTML, '<x-4>hi</x-4>');
	assert.eq(a.constructorCalled, true);
});

Testimony.test('Refract.basic.text', () => {

	class A extends Refract {
		html() { return `<x-5>text</x-5>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, '<x-5>text</x-5>');
});

Testimony.test('Refract.basic.entity', () => {

	class A extends Refract {
		html() { return `<x-6>a &lt; b</x-6>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, '<x-6>a &lt; b</x-6>');
});

Testimony.test('Refract.basic.entity2', () => {

	class A extends Refract {
		html() { return `<b-70>a < b</b-70>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, '<b-70>a &lt; b</b-70>');
});

Testimony.test('Refract.render.delay', "Don't render anything until we call the render() function.", () => {

	let test1, test2;

	class A extends Refract {
		autoRender = false;

		init() {
			test1 = this.d;
			this.render();
			test2 = this.d;
		}

		html() { return `<b-71><div id="d"></div></b-71>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(test1, undefined);
	assert(test2);
	assert.eq(test2, a.firstChild);
});



Testimony.test('Refract.render.batch', "Disable rendering.", () => {

	class A extends Refract {
		x = 1;
		y = 2;

		update(x, y) {
			this.autoRender = false;
			this.x = x;
			this.y = y;
			this.autoRender = true;
		}

		html() { return `<b-72>${this.x + this.y}</b-72>`};
	}
	eval(A.compile());

	let a = new A();
	Refract.elsCreated = [];
	a.update(3, 4);

	assert.eq(a.outerHTML, `<b-72>7</b-72>`);
	assert.eq(Refract.elsCreated, ['7']);
});



Testimony.test('Refract.render.batch2', "Merge rendering ops", () => {

	class A extends Refract {
		items = [1, 2, 3];

		html() { return `<b-73>${this.items.map(item => `<div>${item}</div>`)}</b-73>`};
	}
	eval(A.compile());

	let a = new A();
	Refract.elsCreated = [];
	a.autoRender = false;
	a.items[1] = '2b';
	assert.eq(Refract.elsCreated, []);
	a.items = [4, 5];
	a.autoRender = true;

	assert.eq(a.outerHTML, '<b-73><div>4</div><div>5</div></b-73>');
	assert.eq(Refract.elsCreated, ['<div>', '4', '<div>', '5']);
});


Testimony.test('Refract.render.batch3', "Merge rendering ops", () => {

	class A extends Refract {
		items = [{name: 'Apple', qty: 1}, {name: 'Banana', qty: 2}];

		html() { return `<b-74>${this.items.map(item => `<div>${item.name} ${item.qty}</div>`)}</b-74>`};
	}
	eval(A.compile());

	let a = new A();
	Refract.elsCreated = [];
	a.autoRender = false;
	a.items[1] = {name: 'Cherry', qty: 3};
	a.items[1].name = 'Cantalope';
	a.autoRender = true;

	assert.eq(a.outerHTML, '<b-74><div>Apple 1</div><div>Cantalope 3</div></b-74>');
	assert.eq(Refract.elsCreated, ['<div>', 'Cantalope', ' ', '3'])
});

Testimony.test('Refract.expr.string', () => {
	class A extends Refract {
		html() { return `<b-80>${'hi'}</b-80>` }
	}
	eval(A.compile());
	let a = new A();
	assert.eq(a.outerHTML, '<b-80>hi</b-80>');
	assert.eq(a.childNodes.length, 1);
});

Testimony.test('Refract.expr.template', () => {
	class A extends Refract {
		html() { return `<x-120>${`hi`}</x-120>`}
	}
	eval(A.compile());
	let a = new A();
	assert.eq(a.outerHTML, '<x-120>hi</x-120>');
	assert.eq(a.childNodes.length, 1);
});

// Make sure parser leaves spaces.
Testimony.test('Refract.expr.basic', () => {
	class A extends Refract {
		html() { return `<x-123>${new Date('2010-02-01 00:00:00').getUTCFullYear()}</x-123>`}
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, '<x-123>2010</x-123>');
});

Testimony.test('Refract.expr.undefinedText', () => {
	class A extends Refract {
		value = undefined;
		html() { return `<x-130>${this.value}</x-130>` }
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, `<x-130></x-130>`);
});

Testimony.test('Refract.expr.loopInExprLoop', () => {
	class A extends Refract {
		items = ['a', 'b'];
		images = ['a', 'b'];

		html() { return `
			<x-133>
				${this.items.slice().map((variable, i) =>		
					`<div>
						${this.images.map(image => 
							`<div data-value="/#{image}"><div title="#{image}"></div>`
						)}		
					</div>`
				)}
			</x-133>`}
	}
	eval(A.compile());
	let a = new A();

});

Testimony.test('Refract.expr.undefinedAttr', () => {
	class A extends Refract {
		value;
		html() { return `<x-136><div title="${this.value}"></div></x-136>`};
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, `<x-136><div title=""></div></x-136>`);
});

Testimony.test('Refract.expr.undefinedAttr2', () => {
	class A extends Refract {
		value;                     // [below] Complex expression
		html() { return `<x-137><div title="${this['val' + 'ue']}"></div></x-137>`};
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, `<x-137><div title=""></div></x-137>`);
});

Testimony.test('Refract.expr.undefinedInputVal', () => {
	class A extends Refract {
		value;
		html() { return `<x-138><input value="${this.value}"></x-138>`};
	}
	eval(A.compile());
	let a = new A();
	assert.eq(a.firstElementChild.value, '');
	assert.eq(a.outerHTML, `<x-138><input value=""></x-138>`);
});

Testimony.test('Refract.expr.var', () => {
	class A extends Refract {
		value = 'Apple';

		init(a, b=()=>{}, c) {
					}

		html() { return `<x-140>${this.value}</x-140>` }
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, '<x-140>Apple</x-140>');
	assert.eq(a.childNodes.length, 1);

	a.value = 'Banana';
	assert.eq(a.outerHTML, '<x-140>Banana</x-140>');
	assert.eq(a.childNodes.length, 1);
});

Testimony.test('Refract.expr.varDeep', () => {
	class A extends Refract {
		fruit = {name: 'Apple', shape: 'round'};
		html() { return `<x-150>${this.fruit.name}</x-150>`};
	}
	eval(A.compile());
	let a = new A();

	a.fruit.name = 'Cherry';
	assert.eq(a.outerHTML, '<x-150>Cherry</x-150>');
});

Testimony.test('Refract.expr.varDeep2', () => {

	class A extends Refract {
		fruits = [{name: 'Apple'}, {name: 'Banana'}];
		html() { return `<x-160>${this.fruits[0].name}</x-160>`};
	}
	eval(A.compile());
	let a = new A();

	a.fruits[0].name = 'Cherry';
	assert.eq(a.outerHTML, '<x-160>Cherry</x-160>');

	a.fruits[0] = {name: 'Dragonfruit'};
	assert.eq(a.outerHTML, '<x-160>Dragonfruit</x-160>');

	a.fruits = [{name: 'Elderberry'}];
	assert.eq(a.outerHTML, '<x-160>Elderberry</x-160>');
});

Testimony.test('Refract.expr.var2', () => {
	class A extends Refract {
		value = 'Apple';
		html() { return `<x-170>${this.value.toUpperCase() + '!'}</x-170>`};
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, '<x-170>APPLE!</x-170>');
	assert.eq(a.childNodes.length, 1);

	a.value = 'Banana';
	assert.eq(a.outerHTML, '<x-170>BANANA!</x-170>');
	assert.eq(a.childNodes.length, 1);
});

Testimony.test('Refract.expr.optionalChaining', () => {
	class A extends Refract {
		path1 = {
			path2: {}
		}
		html() { return `<x-172>${this.path1?.path2?.path3}</x-172>`};
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, '<x-172></x-172>');

	a.path1.path2.path3 = 'a';
	assert.eq(a.outerHTML, '<x-172>a</x-172>');
});

Testimony.test('Refract.expr.scope', () => {
	var fruit = 'apple';


	class A extends Refract {
		html() { return `<x-175>${fruit}</x-175>`};
	}
	eval(A.compile());
	let a = new A();
	assert.eq(a.outerHTML, '<x-175>apple</x-175>');
	assert.eq(a.childNodes.length, 1);

	fruit = 'Banana'; // fruit is not watched, so changing this won't change the output.  This is by design:
	assert.eq(a.outerHTML, '<x-175>apple</x-175>');
	assert.eq(a.childNodes.length, 1);
});

Testimony.test('Refract.expr.Complex', () => {
	class A extends Refract {
		value = 'Apple';
		html() { return `<x-180>${JSON.stringify(this.value)}</x-180>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-180>"Apple"</x-180>`);

	a.value = [{name: 'Apple'}];
	assert.eq(a.outerHTML, `<x-180>[{"name":"Apple"}]</x-180>`);

	a.value.push({name: 'Banana'});
	assert.eq(a.outerHTML, `<x-180>[{"name":"Apple"},{"name":"Banana"}]</x-180>`);

	a.value[1].name = 'Cherry';
	assert.eq(a.outerHTML, `<x-180>[{"name":"Apple"},{"name":"Cherry"}]</x-180>`);
});

Testimony.test('Refract.expr.strings', () => {
	class A extends Refract {
		a = {b: {c: {d: 1}}}
		html() { return `<x-185>${this.a['b']["c"][`d`]}</x-185>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-185>1</x-185>`);

	a.a.b.c.d = 2
	assert.eq(a.outerHTML, `<x-185>2</x-185>`);
});

Testimony.test('Refract.expr._strings2', () => {
	class A extends Refract {
		a = {b: {c: {d: {e12: 1}}}}
		html() { return `<x-187>${this.a['b']["c"][`d`][`e${1}2`]}</x-187>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-187>1</x-187>`);

	a.a.b.c.d.e12 = 2
	assert.eq(a.outerHTML, `<x-187>2</x-187>`);
});


Testimony.test('Refract.expr.HashVar', () => {
	class A extends Refract {
		value = '<hi>';
		html() { return `<a-190>#{this.value.toUpperCase()}</a-190>`}
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, '<a-190>&lt;HI&gt;</a-190>');
});

Testimony.test('Refract.expr.HashVarAttribute', () => {
	class A extends Refract {
		value = 'User';
		html() { return `<a-195><div title="Hello #{this.value}"></div></a-195>`}
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, '<a-195><div title="Hello User"></div></a-195>');
});


/**
 * Subscribe to an inherited property, then create the same property on the sub-class. */
Testimony.test('Refract.expr.Inherited', () => {
	class A extends Refract {
		count = 2;
		html() { return `<a-200></a-200>`};
	}
	eval(A.compile());


	class B extends A {
		init() {
			this.count = 3;
		}

		html() { return `<b-200>${this.count}</b-200>`};
	}

	eval(B.compile());

	// This used to fail before the constructor checked if virutalElement.apply() had already been applied in a super class.
	let b = new B();

	assert.eq(b.outerHTML, '<b-200>3</b-200>');

});



Testimony.test('Refract.expr.conditional', () => {
	// This only works if we escape the $ via Parse.escape$()
	class A extends Refract {
		value = 'Apple';
		html() { return `<a-210>${true && `${this.value}`}</a-210>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<a-210>Apple</a-210>`);
	a.value = 'Banana';
	assert.eq(a.outerHTML, `<a-210>Banana</a-210>`);
});

Testimony.test('Refract.expr.doubleConditional', () => {

	class A extends Refract {
		value = 'Apple';
		html() { return `<a-220>${true && `${true && `${this.value}`}`}</a-220>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<a-220>Apple</a-220>`);
	a.value = 'Banana';
	assert.eq(a.outerHTML, `<a-220>Banana</a-220>`);
});

Testimony.test('Refract.expr.tripleConditional', () => {

	class A extends Refract {
		value = 'Apple';
		html() { return `<a-230>${true && `${true && `${true && `${this.value}`}`}`}</a-230>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<a-230>Apple</a-230>`);
	a.value = 'Banana';
	assert.eq(a.outerHTML, `<a-230>Banana</a-230>`);
});

Testimony.test('Refract.expr.exprDereference', () => {

	class A extends Refract {
		values = [1, 2];
		index = 0;
		html() { return `<a-240>${this.values[this.index]}</a-240>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<a-240>1</a-240>`);
	a.index = 1;
	assert.eq(a.outerHTML, `<a-240>2</a-240>`);
	a.index = 2; // undefined index
	assert.eq(a.outerHTML, `<a-240></a-240>`);

	a.values = [1, 2, 3];
	assert.eq(a.outerHTML, `<a-240>3</a-240>`);
});

Testimony.test('Refract.expr.exprTemplate', () => {

	class A extends Refract {
		values = [1, 2];
		delimiter = '-';
		html() { return `<a-250>${this.values.join(`${this.delimiter}`)}</a-250>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<a-250>1-2</a-250>`);

	a.values[0] = 0;
	assert.eq(a.outerHTML, `<a-250>0-2</a-250>`);

	a.values = [3, 4];
	assert.eq(a.outerHTML, `<a-250>3-4</a-250>`);

	a.delimiter = ';';
	assert.eq(a.outerHTML, `<a-250>3;4</a-250>`);
});

Testimony.test('Refract.expr.conditionalFunction', () => {

	class A extends Refract {
		value = [1, 2];
		html() { return `<a-260>${true && `${this.value.map(x=>x+1)}`}</a-260>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<a-260>23</a-260>`);
	a.value = [3, 4];
	a.delimiter = ';';
	assert.eq(a.outerHTML, `<a-260>45</a-260>`);
});

Testimony.test('Refract.expr.conditionalFunctionMap', () => {

	// This tests the inFunction detection of Parse.escape$()
	class A extends Refract {
		value = [1, 2];
		delimiter = '-';
		html() { return `<a-270>${this.value.map(x=>x+1).join(`${this.delimiter}`)}</a-270>`}
	}
	eval(A.compile());


	let a = new A();
	assert.eq(a.outerHTML, '<a-270>2-3</a-270>');

	a.value = [3, 4];
	assert.eq(a.outerHTML, '<a-270>4-5</a-270>');

	a.delimiter = ';';
	assert.eq(a.outerHTML, '<a-270>4;5</a-270>');
});

Testimony.test('Refract.expr.conditionalFunction2', () => {

	class A extends Refract {
		value = [1, 2];
		delimiter = '-';
		html() { return `<a-280>${true && `${this.value.map(x=>x+1).join(`${this.delimiter}`)}`}</a-280>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, '<a-280>2-3</a-280>');

	a.value = [3, 4];
	assert.eq(a.outerHTML, '<a-280>4-5</a-280>');

	a.delimiter = ';';
	assert.eq(a.outerHTML, '<a-280>4;5</a-280>');
});



// Attributes:
Testimony.test('Refract.attributes.basic', () => {

	class A extends Refract {
		title = 'Hello';
		html() { `<x-82 title="${this.title}"></x-82>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-82 title="Hello"></x-82>`);

	a.title = 'Goodbye';
	assert.eq(a.outerHTML, `<x-82 title="Goodbye"></x-82>`);

	a.title = [1, 2, 3];
});

Testimony.test('Refract.attributes.StyleObject', () => {

	class A extends Refract {
		styles = '';
		html() {`<x-87><div style="width: 10px; ${this.styles} height: 20px"></div></x-87>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-87><div style="width: 10px;  height: 20px"></div></x-87>`);

	a.styles = {top: 0, left: '3px'};
	assert.eq(a.outerHTML, `<x-87><div style="width: 10px; top: 0; left: 3px;  height: 20px"></div></x-87>`);

	a.styles = {};
	assert.eq(a.outerHTML, `<x-87><div style="width: 10px;  height: 20px"></div></x-87>`);

	a.styles = '';
	assert.eq(a.outerHTML, `<x-87><div style="width: 10px;  height: 20px"></div></x-87>`);
});

Testimony.test('Refract.attributes._Set', () => {
	class A extends Refract {
		classes = new Set();
		html() { `<x-85><div class="one ${this.classes}"></div></x-85>`}
	}
	eval(A.compile());
	let a = new A();
	assert.eq(a.outerHTML, `<x-85><div class="one "></div></x-85>`);

	a.classes.add('two');
	assert.eq(a.outerHTML, `<x-85><div class="one two"></div></x-85>`);

}); // Fails b/c Watch doesn't intercept Set() methods, so we don't get called on add().


Testimony.test('Refract.attributes.attributeExpression', () => {

	class A extends Refract {
		attr = 'contenteditable';
		html() { return `<x-88 ${this.attr}></x-88>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-88 contenteditable=""></x-88>`);

	a.attr = 'disabled';
	assert.eq(a.outerHTML, `<x-88 disabled=""></x-88>`);


	a.attr = 'style="color: red"';
	assert.eq(a.outerHTML, `<x-88 style="color: red"></x-88>`);

	a.attr = '';
	assert.eq(a.outerHTML, `<x-88></x-88>`);
	a.attr = null;
	assert.eq(a.outerHTML, `<x-88></x-88>`);
	a.attr = undefined;
	assert.eq(a.outerHTML, `<x-88></x-88>`);

	// TODO: Test attribute expression with ${} embedded in string.

});


// Loop:
Testimony.test('Refract.loop.Push', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return `<x-20>${this.fruits}</x-20>`}
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.childNodes.length, 2);
	assert.eq(a.outerHTML, '<x-20>AppleBanana</x-20>');

	Refract.elsCreated = [];
	a.fruits.push('Cherry');
	assert.eq(a.outerHTML, '<x-20>AppleBananaCherry</x-20>');
	assert.eq(Refract.elsCreated, ['Cherry']);


	Refract.elsCreated = [];
	a.fruits.pop();
	assert.eq(a.outerHTML, '<x-20>AppleBanana</x-20>');
	assert.eq(Refract.elsCreated, []);
});

Testimony.test('Refract.loop.Unshift', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return `<x-22>${this.fruits}</x-22>`}
	}
	eval(A.compile());
	let a = new A();
	assert.eq(a.childNodes.length, 2);
	assert.eq(a.outerHTML, '<x-22>AppleBanana</x-22>');

	Refract.elsCreated = [];
	a.fruits.unshift('Cherry');
	assert.eq(a.outerHTML, '<x-22>CherryAppleBanana</x-22>');
	assert.eq(Refract.elsCreated, ['Cherry']);


	Refract.elsCreated = [];
	a.fruits.shift();
	assert.eq(a.outerHTML, '<x-22>AppleBanana</x-22>');
	assert.eq(Refract.elsCreated, []);
});

Testimony.test('Refract.loop.Set', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return `<x-23>${this.fruits}</x-23>`}
	}
	eval(A.compile());
	let a = new A();

	a.fruits[0] = 'Cherry';
	assert.eq(a.outerHTML, '<x-23>CherryBanana</x-23>');
	assert.eq(a.childNodes.length, 2);

	a.fruits[1] = 'DragonFruit';
	assert.eq(a.outerHTML, '<x-23>CherryDragonFruit</x-23>');
	assert.eq(a.childNodes.length, 2);
});

Testimony.test('Refract.loop.Pop', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return `<x-25>${this.fruits}</x-25>`}
	}
	eval(A.compile());
	let a = new A();

	a.fruits.pop();
	assert.eq(a.outerHTML, '<x-25>Apple</x-25>');
	assert.eq(a.childNodes.length, 1);
});

Testimony.test('Refract.loop.Map', () => {
	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return `
			<x-26>${this.fruits.map(fruit => /* Block comment test */
				fruit
			)}</x-26>`
		}
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, '<x-26>AppleBanana</x-26>');

	Refract.elsCreated = [];
	a.fruits.push('Cherry');
	assert.eq(a.outerHTML, '<x-26>AppleBananaCherry</x-26>');
	assert.eq(Refract.elsCreated, ['Cherry']);
});

Testimony.test('Refract.loop.Map2', () => {
	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return
			`<x-28>${this . fruits . map ( ( fruit ) => // Inline comment test
				`<p>${fruit}</p>`
			)}</x-28>`
		}
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, '<x-28><p>Apple</p><p>Banana</p></x-28>');

	Refract.elsCreated = [];
	a.fruits.push('Cherry');
	assert.eq(a.outerHTML, '<x-28><p>Apple</p><p>Banana</p><p>Cherry</p></x-28>');
	assert.eq(Refract.elsCreated, ['<p>', 'Cherry']);
});

Testimony.test('Refract.loop.RandomItems', () => {

	class A extends Refract {
		items = ['a', 'b'];
		html() { return `<x-285>${this.items.map(item => item.repeat(Math.floor(Math.random()*5)))}</x-285>`};
	}
	eval(A.compile());
	let a = new A();
	a.items[0] = 'c'; // No tests, we just make sure it doesn't crash.
});

Testimony.test('Refract.loop._MapIndex', () => {
	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return
			`<x-300>
				${this.fruits.map((fruit, i, array) => 
					`<p>${i}/${array.length} '=' + fruit}</p>`
				)}
			</x-300>`}
	}

	//TODO: This fails b/c we can't subscribe to array.length
	eval(A.compile());
	let a = new A();

	document.body.append(a);
	a.fruits.push('Cherry');
});

Testimony.test('Refract.loop.MapAttributes', () => {
	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return `
			<x-310>${this.fruits.map(fruit =>
				`<p title="${fruit}"></p>`
			)}</x-310>`
		}
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, `<x-310><p title="Apple"></p><p title="Banana"></p></x-310>`);

	a.fruits.push('Cherry');
	assert.eq(a.outerHTML, `<x-310><p title="Apple"></p><p title="Banana"></p><p title="Cherry"></p></x-310>`);

});

Testimony.test('Refract.loop.MapTwoChilden', () => {
	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return `
			<x-320>${this.fruits.map(fruit =>
				`Hi <b>${fruit}</b>`
			)}</x-320>`
		}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, '<x-320>Hi <b>Apple</b>Hi <b>Banana</b></x-320>');

	a.fruits.pop();
	assert.eq(a.outerHTML, '<x-320>Hi <b>Apple</b></x-320>');

	window.debug = true;

	a.fruits.unshift('Cherry');
	assert.eq(a.outerHTML, '<x-320>Hi <b>Cherry</b>Hi <b>Apple</b></x-320>');

});

Testimony.test('Refract.loop.MapBrace', () => { // Make sure attribute quotes are escaped.

	class A extends Refract {
		items = [1, 2];
		html() { return `
			<x-330>${this.items.map(item => {
				return item;
			})}</x-330>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-330>12</x-330>`);

	Refract.elsCreated = [];
	a.items.push(3);
	assert.eq(a.outerHTML, `<x-330>123</x-330>`);
	assert.eq(Refract.elsCreated, ['3']);
});

Testimony.test('Refract.loop.MapBrace2', () => { // Make sure attribute quotes are escaped.

	class A extends Refract {
		items = [1, 2];
		html() { return `
			<x-340>${this.items.map(item => {
				return item + `a`;
			})}</x-340>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-340>1a2a</x-340>`);
});

Testimony.test('Refract.loop.ItemProps', () => {
	class A extends Refract {
		fruits = [
			{name: 'Apple'},
			{name: 'Banana'},
		];
		html() { return `
			<x-350>${this.fruits.map(fruit =>
				`<p>${fruit.name}</p>`
			)}</x-350>`}
	}
	eval(A.compile());
	let a = new A();
	assert.eq(a.outerHTML, '<x-350><p>Apple</p><p>Banana</p></x-350>');

	// Change object
	Refract.elsCreated = [];
	a.fruits[1].name = 'Banana Split';
	assert.eq(a.outerHTML, '<x-350><p>Apple</p><p>Banana Split</p></x-350>');
	assert.eq(Refract.elsCreated, ['Banana Split']);

	// Add object
	Refract.elsCreated = [];
	a.fruits.push({name: 'Cherry', order: 3});
	assert.eq(a.outerHTML, '<x-350><p>Apple</p><p>Banana Split</p><p>Cherry</p></x-350>');
	assert.eq(Refract.elsCreated, ['<p>', 'Cherry']);

	// Change added object
	Refract.elsCreated = [];
	a.fruits[2].name = 'Cherry Pie';
	assert.eq(a.outerHTML, '<x-350><p>Apple</p><p>Banana Split</p><p>Cherry Pie</p></x-350>');
	assert.eq(Refract.elsCreated, ['Cherry Pie']);

	// Remove object
	Refract.elsCreated = [];
	a.fruits.shift();
	assert.eq(a.outerHTML, '<x-350><p>Banana Split</p><p>Cherry Pie</p></x-350>');
	assert.eq(Refract.elsCreated, []);

});

Testimony.test('Refract.loop.ItemProps2', () => {
	class A extends Refract {
		fruits = [
			['Apple'],
			['Banana'],
		];
		html() { return `
			<x-355>${this.fruits.map(fruit =>
				`<p>${fruit[0]}</p>`
			)}</x-355>`}
	}
	eval(A.compile());
	let a = new A();
	assert.eq(a.outerHTML, '<x-355><p>Apple</p><p>Banana</p></x-355>');

	// Change item
	Refract.elsCreated = [];
	a.fruits[1][0] = 'Banana Split';
	assert.eq(a.outerHTML, '<x-355><p>Apple</p><p>Banana Split</p></x-355>');
	assert.eq(Refract.elsCreated, ['Banana Split']);

	// Add item
	Refract.elsCreated = [];
	a.fruits.push(['Cherry']);
	assert.eq(a.outerHTML, '<x-355><p>Apple</p><p>Banana Split</p><p>Cherry</p></x-355>');
	assert.eq(Refract.elsCreated, ['<p>', 'Cherry']);

	// Change added item
	Refract.elsCreated = [];
	a.fruits[2][0] = 'Cherry Pie';
	assert.eq(a.outerHTML, '<x-355><p>Apple</p><p>Banana Split</p><p>Cherry Pie</p></x-355>');
	assert.eq(Refract.elsCreated, ['Cherry Pie']);

	// Remove item
	Refract.elsCreated = [];
	a.fruits.shift();
	assert.eq(a.outerHTML, '<x-355><p>Banana Split</p><p>Cherry Pie</p></x-355>');
	assert.eq(Refract.elsCreated, []);

});

Testimony.test('Refract.loop.ItemProps3', () => {
	class A extends Refract {
		fruits = [
			{name: 'Apple', order: 1},
			{name: 'Banana', order: 2}
		];
		html() { return `
			<x-40>${this.fruits.map(fruit => 
				`<p>${fruit.order} ${fruit.name}</p>`
			)}</x-40>`}
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, '<x-40><p>1 Apple</p><p>2 Banana</p></x-40>');

	// Change object
	Refract.elsCreated = [];
	a.fruits[1].name = 'Banana Split';
	assert.eq(a.outerHTML, '<x-40><p>1 Apple</p><p>2 Banana Split</p></x-40>');
	assert.eq(Refract.elsCreated, ['Banana Split']);
});

Testimony.test('Refract.loop.PrimitiveToArray', () => { // Test changing a primitive property to an array.

	class A extends Refract {
		fruits = [
			'Apple',
			'Banana'
		];
		html() { return `<x-45>${this.fruits.map(fruit => `<p>${fruit}</p>`)}</x-45>`}
	}
	eval(A.compile());
	let a = new A();

	assert.eq(a.outerHTML, '<x-45><p>Apple</p><p>Banana</p></x-45>');

	// Replace primitive with array.
	Refract.elsCreated = [];
	a.fruits[0] = ['Apple Pie', 'Apple Cake'];
	assert.eq(a.outerHTML, '<x-45><p>Apple PieApple Cake</p><p>Banana</p></x-45>');
	assert.eq(Refract.elsCreated, ['<p>', 'Apple Pie', 'Apple Cake']);
});

// Two loops within the same parent
Testimony.test('Refract.loop.double', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		pets = ['Cat', 'Dog'];
		html() { return `<x-60>${this.fruits}${this.pets}</x-60>`};
	}
	eval(A.compile());
	let a = new A();

	//document.body.append(a.debugRender());

	// 1. Initial Checks
	assert.eq(a.childNodes.length, 4);
	assert.eq(a.outerHTML, '<x-60>AppleBananaCatDog</x-60>');

	// 2. Push item to first list.
	Refract.elsCreated = [];
	a.fruits.push('Cherry');
	assert.eq(a.outerHTML, '<x-60>AppleBananaCherryCatDog</x-60>');
	assert.eq(Refract.elsCreated, ['Cherry']);

	// 2. Shift item to second list.
	Refract.elsCreated = [];
	a.pets.unshift('Bird');
	assert.eq(a.outerHTML, '<x-60>AppleBananaCherryBirdCatDog</x-60>');
	assert.eq(Refract.elsCreated, ['Bird']);

	// 3. Splice item from first list.
	Refract.elsCreated = [];
	a.fruits.splice(1, 1);
	assert.eq(a.outerHTML, '<x-60>AppleCherryBirdCatDog</x-60>');
	assert.eq(Refract.elsCreated, []);

	// 3. Splice item from second list.
	Refract.elsCreated = [];
	a.pets.splice(1, 1);
	assert.eq(a.outerHTML, '<x-60>AppleCherryBirdDog</x-60>');
	assert.eq(Refract.elsCreated, []);
});

Testimony.test('Refract.loop.Constant', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return `
			<x-65>${this.fruits.map(fruit =>
				`<p>1</p>`
			)}</x-65>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-65><p>1</p><p>1</p></x-65>`);
});

Testimony.test('Refract.loop.nested', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana']; // TODO Test defining these properties with "pets" first, before fruits, with varExpressionsRecursive()
		pets = ['Cat', 'Dog'];
		html() { return `
			<x-70>${this.fruits.map(fruit => 
				`${this.pets.map(pet=> 
					`<p>${fruit} ${pet}</p>`
				)}`
			)}</x-70>`}
	}
	eval(A.compile());

	let a = new A();

	assert.eq(a.outerHTML, `<x-70><p>Apple Cat</p><p>Apple Dog</p><p>Banana Cat</p><p>Banana Dog</p></x-70>`);

	a.fruits.shift();
	assert.eq(a.outerHTML, `<x-70><p>Banana Cat</p><p>Banana Dog</p></x-70>`);

	a.fruits.unshift('Cherry');
	assert.eq(a.outerHTML, `<x-70><p>Cherry Cat</p><p>Cherry Dog</p><p>Banana Cat</p><p>Banana Dog</p></x-70>`);

	a.pets.pop();
	assert.eq(a.outerHTML, `<x-70><p>Cherry Cat</p><p>Banana Cat</p></x-70>`);


	// The second sub-array VExpression has its receiveNotification() called before the first,
	// Due to the order they were previously added and removed.
	a.pets.unshift('Bird');
	assert.eq(a.outerHTML, `<x-70><p>Cherry Bird</p><p>Cherry Cat</p><p>Banana Bird</p><p>Banana Cat</p></x-70>`);


	a.pets.pop();
	assert.eq(a.outerHTML, `<x-70><p>Cherry Bird</p><p>Banana Bird</p></x-70>`);

	a.pets.pop();
	assert.eq(a.outerHTML, `<x-70></x-70>`);

});

// Loop over item and sub-array
Testimony.test('Refract.loop.nested2', () => {

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

		html() { return `
			<x-72>${this.pets.map(pet =>
				pet.activities.map(activity=>
					`<p>#{pet.name} will ${activity}.</p>`
				)
			)}</x-72>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-72><p>Cat will Sleep.</p><p>Cat will Eat.</p><p>Cat will Pur.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p></x-72>`);


	Refract.elsCreated = [];
	a.pets[0].activities.splice(1, 1);
	assert.eq(a.outerHTML, `<x-72><p>Cat will Sleep.</p><p>Cat will Pur.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p></x-72>`);
	assert.eq(Refract.elsCreated, []); // Elements were only removed.  None should've been created.


	Refract.elsCreated = [];
	a.pets.push({name: 'Fish', activities: []});
	assert.eq(a.outerHTML, `<x-72><p>Cat will Sleep.</p><p>Cat will Pur.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p></x-72>`);
	assert.eq(Refract.elsCreated, []);

	Refract.elsCreated = [];
	a.pets[2].activities.push('Swim');
	assert.eq(a.outerHTML, `<x-72><p>Cat will Sleep.</p><p>Cat will Pur.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p><p>Fish will Swim.</p></x-72>`);
	assert.eq(Refract.elsCreated, ["<p>", "Fish", " will ", "Swim", "."]);

	Refract.elsCreated = [];
	a.pets.splice(1, 1);
	assert.eq(a.outerHTML, `<x-72><p>Cat will Sleep.</p><p>Cat will Pur.</p><p>Fish will Swim.</p></x-72>`);
	assert.eq(Refract.elsCreated, []);

	// Change pet name.
	Refract.elsCreated = [];
	a.pets[0].name = 'Bird';
	assert.eq(a.outerHTML, `<x-72><p>Bird will Sleep.</p><p>Bird will Pur.</p><p>Fish will Swim.</p></x-72>`);
	assert.eq(Refract.elsCreated, ['Bird', 'Bird']);

	// Change name of pet activity.
	Refract.elsCreated = [];
	a.pets[0].activities[1] = 'Tweet';
	assert.eq(a.outerHTML, `<x-72><p>Bird will Sleep.</p><p>Bird will Tweet.</p><p>Fish will Swim.</p></x-72>`);
	assert.eq(Refract.elsCreated, ["<p>", "Bird", " will ", "Tweet", "."]);
});

Testimony.test('Refract.loop.nested3', () => {

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

		html() { return `
			<x-740>${this.pets.map(pet =>
				pet.activities.map(activity=>
					`<p>#{pet.name} #{this.verb} ${activity.name}.</p>`
				)
			)}</x-740>`}
	}
	eval(A.compile());

	let a = new A();
	Refract.elsCreated = [];
	a.pets[0].activities[0].name = 'Purr';
	assert.eq(Refract.elsCreated, ['Purr']);

	Refract.elsCreated = [];
	a.verb = "won't";
	assert.eq(a.outerHTML, `<x-740><p>Cat won't Purr.</p><p>Cat won't Eat.</p><p>Dog won't Frolic.</p></x-740>`);
	assert.eq(Refract.elsCreated, ["won't", "won't", "won't"]);
});

Testimony.test('Refract.loop.grid', () => {

	class A extends Refract {
		rows = [[0]];
		init() {
			for (let i in this.rows)
				this.rows[i][0] = parseInt(i)+2;
		}

		html() { return `
			<a-745>${this.rows.map(row => 
					row.map(field => field)
			)}</a-745>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<a-745>2</a-745>`);

	Refract.elsCreated = [];
	a.rows[0][0] = 4;
	assert.eq(a.outerHTML, `<a-745>4</a-745>`);
	assert.eq(Refract.elsCreated, ['4']);

	a.rows = [];
	assert.eq(a.outerHTML, `<a-745></a-745>`);
});



Testimony.test('Refract.loop.grid2', () => {
	class ImportData extends Refract {
		rows = [];

		init() {
			let data = [1, 2];

			for (let i in data) {
				if (!this.rows[i]) {
					this.rows[i] = [];
				}


				this.rows[i][0] = data[i];
			}
			//this.rows = this.rows.slice();
		}

		html() { return `
			<a-750>${this.rows.map(row =>
				row.map(field => field)
			)}</a-750>`}
	}
	eval(ImportData.compile());

	let a = new ImportData();
	assert.eq(a.outerHTML, '<a-750>12</a-750>');

	Refract.elsCreated = [];
	a.rows[0][0] = 4;
	assert.eq(a.outerHTML, `<a-750>42</a-750>`);
	assert.eq(Refract.elsCreated, ['4']);

	a.rows = [];
	assert.eq(a.outerHTML, `<a-750></a-750>`);
});

Testimony.test('Refract.loop.grid3', 'Triple nested grid', () => {

	class A extends Refract {
		rows = [[[0]]];
		init() {
			window.debug = true;
			for (let i in this.rows)
				this.rows[i][0][0] = parseInt(i)+2;
		}

		html() { return `
			<a-752>${this.rows.map(row =>
				row.map(items => 
					items.map(item =>
						item
					))
			)}</a-752>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<a-752>2</a-752>`);

	Refract.elsCreated = [];
	a.rows[0][0][0] = 4;
	assert.eq(a.outerHTML, `<a-752>4</a-752>`);
	assert.eq(Refract.elsCreated, ['4']);

	a.rows = [];
	assert.eq(a.outerHTML, `<a-752></a-752>`);
});


Testimony.test('Refract.loop.Slice', () => {

	// fails if we have escape$, and it doesn't stop within function bodies:
	class A extends Refract {
		items = ['a', 'b'];
		html() { return `
			<x-755>${this.items.slice().map(item =>
				`${item}`
			)}</x-755>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-755>ab</x-755>`);

	a.items[0] = 'c';
	assert.eq(a.outerHTML, `<x-755>cb</x-755>`);


	a.items = ['d', 'e'];
	assert.eq(a.outerHTML, `<x-755>de</x-755>`);
});

Testimony.test('Refract.loop.Expr', () => {

	class A extends Refract {
		fruits = ['Apple'];
		html() { return `
			<x-757>${this.fruits.map(fruit =>
				fruit + `${fruit}`
			)}</x-757>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-757>AppleApple</x-757>`);

	a.fruits.push('Banana');
	assert.eq(a.outerHTML, `<x-757>AppleAppleBananaBanana</x-757>`);
});

Testimony.test('Refract.loop.Expr2', () => {

	class A extends Refract {
		formulas = ['a>b', 'c<d&e'];
		html() { return `
			<x-760>${this.formulas.slice().map(formula =>
				`#{formula}`
			)}</x-760>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-760>a&gt;bc&lt;d&amp;e</x-760>`);
});

Testimony.test('Refract.loop.Expr3', () => { // Make sure attribute quotes are escaped.

	class A extends Refract {
		entities = ['"', "'"];
		html() { return `
			<x-765>${this.entities.slice().map(ent =>
				`<div title="#{ent}">#{ent}</div>`
			)}</x-765>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-765><div title="&quot;">"</div><div title="'">'</div></x-765>`);
});

Testimony.test('Refract.loop.Expr4', () => {

	class A extends Refract {
		list = [];
		type = 1;

		init() {
			this.list = [1];

			// This will call receiveNotification on both the loop and the item VExpressions.
			// But the loop VExpression will remove the original item VExpression after it's evaluated, and create a new one.
			// So here we make sure it's not evaluated again.  Before this was fixed we'd have '2' printed twice.
			this.type = '2';
		}

		html() { return `
			<a-766>${this.list.map(item =>
				this.type
			)}</a-766>`}
	}
	eval(A.compile());

	Refract.elsCreated = [];

	let a = new A();
	assert.eq(a.outerHTML, '<a-766>2</a-766>');

	a.type = '3';
	assert.eq(a.outerHTML, '<a-766>3</a-766>');

	// Make sure we didn't do more work than necessary.
	assert.eq(Refract.elsCreated, ['1', '2', '3']);
});

// Same as above, but with slice() and using ${item}.  The scope goes missing!
Testimony.test('Refract.loop.Expr5', () => {
	class A extends Refract {
		items = [];
		autoRender = false;
		init() {
			this.items = [1];
			this.render();

			this.items[0] = 2; // Causes loop item to be re-evaluated
		}

		html() { return `
			<a-767>${this.items.slice().map(item =>
				false
					?  console.log(this.type)
					:  `${item}`
			)}</a-767>`
		}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, '<a-767>2</a-767>');
	assert.eq(a.childNodes.length, 1);
});


Testimony.test('Refract.loop.attributeExpr', () => { // Make sure loop scope is passed to attributes

	class A extends Refract {
		files = [
			{selected: 'no'},
		];
		html() { return `
			<x-768>${this.files.map(file =>
				`<div class="${file.selected}">one</div>`
			)}</x-768>`}
	}
	eval(A.compile());

	let a = new A();

	a.files[0].selected = 'yes';
	assert.eq(a.outerHTML, `<x-768><div class="yes">one</div></x-768>`);

	let file = {selected: 'no'};
	a.files.push(file);
	assert.eq(a.outerHTML, `<x-768><div class="yes">one</div><div class="no">one</div></x-768>`);

	file.selected = 'yes';
	assert.eq(a.outerHTML, `<x-768><div class="yes">one</div><div class="yes">one</div></x-768>`);
});

Testimony.test('Refract.loop.If', () => {

	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return `
			<x-770>${this.fruits.map(fruit =>
				fruit.startsWith('A') ? fruit : ''
			)}</x-770>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-770>Apple</x-770>`);

	a.fruits.push('Cherry');
	assert.eq(a.outerHTML, `<x-770>Apple</x-770>`);

	a.fruits.push('Avacado');
	assert.eq(a.outerHTML, `<x-770>AppleAvacado</x-770>`);


	a.fruits.shift();
	assert.eq(a.outerHTML, `<x-770>Avacado</x-770>`);

	a.fruits.unshift('Applesauce');
	assert.eq(a.outerHTML, `<x-770>ApplesauceAvacado</x-770>`);

	a.fruits[1] = 'Dragonfruit';
	assert.eq(a.fruits.slice(), ['Applesauce', 'Dragonfruit', 'Cherry', 'Avacado']);
	assert.eq(a.outerHTML, `<x-770>ApplesauceAvacado</x-770>`);
});

Testimony.test('Refract.loop.IfNested', () => {

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

		html() { return `
			<x-790>${this.pets.map(pet =>
				pet.activities.map(activity =>
					activity.length >= 5
						? `<p>#{pet.name} will ${activity}.</p>`
						: ``
				)
			)}</x-790>`}
	}

	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<x-790><p>Cat will Sleep.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p></x-790>`);

	Refract.elsCreated = [];
	a.pets[0].activities[0] = 'Doze'; // Less than 5 characters.
	assert.eq(a.outerHTML, `<x-790><p>Dog will Frolic.</p><p>Dog will Fetch.</p></x-790>`);
	assert.eq(Refract.elsCreated, []);

	Refract.elsCreated = [];
	a.pets[0].activities[0] = 'Slumber';
	assert.eq(a.outerHTML, `<x-790><p>Cat will Slumber.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p></x-790>`);
	assert.eq(Refract.elsCreated, ["<p>", "Cat", " will ", "Slumber", "."]);
});

Testimony.test('Refract.loop.ifNested2', () => {

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

		html() { return `
			<a-800>${this.pets.map(pet =>
				pet.name.startsWith('C')
					? pet.activities.map(activity =>
						`<p>#{pet.name} will ${activity}.</p>`)					
					: ''				
			)}</a-800>`}
	}

	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<a-800><p>Cat will Sleep.</p><p>Cat will Eat.</p></a-800>`);

	Refract.elsCreated = [];
	a.pets[1].name='Cat2';
	assert.eq(a.outerHTML, `<a-800><p>Cat will Sleep.</p><p>Cat will Eat.</p><p>Cat2 will Frolic.</p></a-800>`);
	assert.eq(Refract.elsCreated, ["<p>", "Cat2 will Frolic."]);

	a.pets[0].name = 'Bird';
	assert.eq(a.outerHTML, `<a-800><p>Cat2 will Frolic.</p></a-800>`);

	// It recreates the whole thing because it has to re-evaluate the pet.name.startsWith('C') expression.
	assert.eq(Refract.elsCreated, ['<p>', 'Cat2 will Frolic.']);
});

// Nested
Testimony.test('Refract.nested.basic', () => {

	class B extends Refract {
		name = '';
		init(name) {
						//debugger;
			this.name = name;
		}
		html() { return `<b-90>${this.name}</b-90>`};
	}
	eval(B.compile());


	class A extends Refract {
		html() { return `<a-90><b-90 name="Apple"></b-90></a-90>`};
	}
	eval(A.compile());


	let a = new A();
	assert.eq(a.outerHTML, `<a-90><b-90 name="Apple">Apple</b-90></a-90>`);
});

Testimony.test('Refract.nested.passOBj', () => {

	class B extends Refract {
		fruit2 = [];
		init(fruits) {
						this.fruits2 = fruits;
		}
		html() { return `<x-b95>${this.fruits2}</x-b95>`};
	}
	eval(B.compile());


	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return `<a-95><x-b95 fruits="${this.fruits}"></x-b95></a-95>`};
	}
	eval(A.compile());

	let a = new A();

	assert.eq(a.outerHTML, `<a-95><x-b95 fruits="Apple Banana">AppleBanana</x-b95></a-95>`);

	// Make sure the child refr watches the parent's array.
	Refract.elsCreated = [];
	a.fruits.push('Cherry');
	assert.eq(a.outerHTML, `<a-95><x-b95 fruits="Apple Banana Cherry">AppleBananaCherry</x-b95></a-95>`);
	assert.eq(Refract.elsCreated, ['Cherry']);


	Refract.elsCreated = [];
	a.fruits.push('DragonFruit');
	assert.eq(a.outerHTML, `<a-95><x-b95 fruits="Apple Banana Cherry DragonFruit">AppleBananaCherryDragonFruit</x-b95></a-95>`);
	assert.eq(Refract.elsCreated, ['DragonFruit']);

	Refract.elsCreated = [];
	a.fruits.shift();
	assert.eq(a.outerHTML, `<a-95><x-b95 fruits="Banana Cherry DragonFruit">BananaCherryDragonFruit</x-b95></a-95>`);
	assert.eq(Refract.elsCreated, []);
});

Testimony.test('Refract.nested.passSelf', "Pass a parent's 'this' reference to a child.", () => {

	class B extends Refract {
		parent = null;
		autoRender = false;
		init(parent) {
			this.parent = parent;
			this.render();
		}
		html() { return `<b-96>${this.parent.fruits}</b-96>`};
	}
	eval(B.compile());


	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return `<a-96><b-96 parent="${this}"></b-96></a-96>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<a-96><b-96 parent="">AppleBanana</b-96></a-96>`);

	// Make sure child subscribes to parent.
	a.fruits.push('Cherry');
	assert.eq(a.outerHTML, `<a-96><b-96 parent="">AppleBananaCherry</b-96></a-96>`);
});


Testimony.test('Refract.nested.loop', () => {

	class B extends Refract {
		fruit = undefined;
		init(fruit) {
			this.fruit = fruit;
		}
		html() { return `<x-b100><b>${this.fruit}</b></x-b100>`};
	}
	eval(B.compile());


	class A extends Refract {
		fruits = ['Apple', 'Banana'];
		html() { return `
			<a-100>${this.fruits.map(fruit => 
				`<x-b100 fruit="${fruit}"></x-b100>`
			)}</a-100>`}
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<a-100><x-b100 fruit="Apple"><b>Apple</b></x-b100><x-b100 fruit="Banana"><b>Banana</b></x-b100></a-100>`);

	a.fruits.push('Cherry');
	assert.eq(a.outerHTML, `<a-100><x-b100 fruit="Apple"><b>Apple</b></x-b100><x-b100 fruit="Banana"><b>Banana</b></x-b100><x-b100 fruit="Cherry"><b>Cherry</b></x-b100></a-100>`);

	a.fruits.splice(1, 1);
	assert.eq(a.outerHTML, `<a-100><x-b100 fruit="Apple"><b>Apple</b></x-b100><x-b100 fruit="Cherry"><b>Cherry</b></x-b100></a-100>`);
});

Testimony.test('Refract.nested.childProp', () => {

	class B extends Refract {
		name = '';

		init(name) {
			this.name = name;
		}
		html() { return `<b-102>${this.name}</b-102>`};
	}
	eval(B.compile());


	class A extends Refract {
		html() { return `<a-102><b-102 id="b" name="Apple"></b-102>${this.b.name}</a-102>`};
	}
	eval(A.compile());


	let a = new A();
	assert.eq(a.outerHTML, `<a-102><b-102 id="b" name="Apple">Apple</b-102>Apple</a-102>`);

	a.b.name = 'Banana'; // [below] name attribute doesn't change b/c it was a static value passed to the constructor
	assert.eq(a.outerHTML, `<a-102><b-102 id="b" name="Apple">Banana</b-102>Banana</a-102>`);
});

Testimony.test('Refract.nested.childProp2', () => {
	class B extends Refract {
		name = 'apple';

		update() {
			this.name = 'banana';
		}

		html() { return `<b-103>${this.name}</b-103>`};
	}
	eval(B.compile());

	class A extends Refract {
		html() { return `<a-103><b-103 id="b"></b-103>${this.b.name}</a-103>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.b.name, 'apple');

	a.b.update();
	assert.eq(a.outerHTML, '<a-103><b-103 id="b">banana</b-103>apple</a-103>');
});

Testimony.test('Refract.nested._recursive', () => {
	class A extends Refract {

		html() { return `<a-105 title="c"><slot></slot>b</a-105>`};
	}
	eval(A.compile());

	let a = new A();

	// Firefox:  "Cannot instantiate a custom element inside its own constructor during upgrades"
	// Chrome:  "TypeError: Failed to construct 'HTMLElement': This instance is already constructed"
	// See the code in VElement.apply() where we keep looping through different names calling customElements.define()
	// until we can create one.
	let div = createEl(`<a-105><a-105></a-105></a-105>`);
	assert.eq(div.outerHTML, '<a-105 title="c"><slot><a-105_1 title="c"><slot></slot>b</a-105_1></slot>b</a-105>');

	div = createEl(`<a-105><a-105><a-105></a-105></a-105></a-105>`);
	assert.eq(div.outerHTML, '<a-105 title="c"><slot><a-105_1 title="c"><slot><a-105_1 title="c"><slot></slot>b</a-105_1></slot>b</a-105_1></slot>b</a-105>');
});





Testimony.test('Refract.nested._childPropForwardReference', () => {

	class B extends Refract {
		name = '';

		init(name) {
						this.name = name;
		}
		html() { return `<b-107>${this.name}</b-107>`};
	}
	eval(B.compile());


	class A extends Refract { // Fails b/c this.b is not defined until the <b-107 element is added.
		html() { return `<a-107>${this.b.name}<b-107 id="b" name="${this.name}"></b-107></a-107>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, `<a-107>Apple<b-107 id="b" name="Apple">Apple</b-107></a-107>`);

	a.b.name = 'Banana';
	assert.eq(a.outerHTML, `<a-107>Banana<b-107 id="b" name="Apple">Banana</b-107></a-107>`);
});


// Form
Testimony.test('Refract.form.inputExpr', () => {

	class A extends Refract {
		value = 'Apple';
		html() { return `<a-120><input id="input" value="${this.value}"></a-120>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.input.value, 'Apple');

	// Set class value.
	a.value = 'Banana';
	assert.eq(a.input.value, 'Banana');

	// Set input value
	a.input.value = 'Cherry';
	a.input.dispatchEvent(new Event('input'));
	assert.eq(a.value, 'Cherry');
});

Testimony.test('Refract.form.inputExprUndefined', () => {

	class A extends Refract {
		form = {};
		html() { return `<a-122><input id="input" value="${this.form.value}"></a-122>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.input.value, '');

	// Set class value.
	a.form.value = 'Banana';
	assert.eq(a.input.value, 'Banana');

	// Set input value
	a.input.value = 'Cherry';
	a.input.dispatchEvent(new Event('input'));
	assert.eq(a.form.value, 'Cherry');
});

Testimony.test('Refract.form.inputEvent', () => {

	class A extends Refract {
		value = 'Apple';
		html() { return `<a-125><input id="input" oninput="this.value=el.value.replace(/ Pie$/i, '')" value="${this.value + ' Pie'}"></a-125>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.input.value, 'Apple Pie');

	a.value = 'Banana';
	assert.eq(a.input.value, 'Banana Pie');

	a.input.value = 'Cherry Pie';
	a.input.dispatchEvent(new Event('input'));
	assert.eq(a.value, 'Cherry');
});

Testimony.test('Refract.form.inputValueOnInputExpr', () => {

	class A extends Refract {
		value = 'Apple';
		html() { return `<a-130><input id="input" value="${this.value + ' Pie'}" oninput="${'this.value=el.value.replace(/ Pie$/i, "")'}"></a-130>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.input.value, 'Apple Pie');

	a.value = 'Banana';
	assert.eq(a.input.value, 'Banana Pie');

	a.input.value = 'Cherry Pie';
	a.input.dispatchEvent(new Event('input'));
	assert.eq(a.value, 'Cherry');
});

Testimony.test('Refract.form.inputExprDereference', () => {

	class A extends Refract {
		values = ['zero', 'one'];
		index = 0;
		html() { return `<a-235><input id="input" value="${this.values[this.index]}"></a-235>`};
	}
	eval(A.compile());

	let a = new A();

	a.input.value = 'two';
	a.input.dispatchEvent(new Event('input'));
	assert.eq(a.values[0], 'two');


	a.values[0] = 'three';
	assert.eq(a.input.value, 'three');

	a.index = 1;
	assert.eq(a.input.value, 'one');

	a.input.value = 'four';
	a.input.dispatchEvent(new Event('input'));
	assert.eq(a.values[1], 'four');
});


Testimony.test('Refract.form._inputExprComplex', () => {

	// Below, when name is resolved inside the loop, I need to watch it just like a regular variable.
	// Right now it's all just resolved as a single expression, and after it returns its html string,
	// we no longer know what var it's supposed to watch for changes.

	// What if in a preprocessing step with the tokens, we add a data-value-expr to anything with a value="${}" attribute that saves the expression?
	// Then below, we can bind each VElement's value to that path.
	class A extends Refract {
		values = {name: 'apple'};
		html() { return `
			<a-237>
				${Object.keys(this.values).map(name => 
					`<input value="${this.values.name}" data-value-expr="this.values.name">`
				)}
			</a-237>`}
	}
	eval(A.compile());

	//console.log(A.virtualElement);

	let a = new A();
	document.body.append(a);

	a.firstElementChild.value = 'cherry';
	a.firstElementChild.dispatchEvent(new Event('input'));
	console.log(a.values);
	//assert.eq(a.values.name, 'cherry');
});


Testimony.test('Refract.form._inputExprComplex2', () => {

	class A extends Refract {
		values = {name: 'apple', type: 'fruit'};
		html() { return `
			<a-238>
				${Object.keys(this.values).map(name =>
					`<input value="${this.values[name]}" data-value-expr="this.values['${name}']">`
				)}
			</a-238>`}
	}
	eval(A.compile());

	let a = new A();
	document.body.append(a);

	a.firstElementChild.value = 'cherry';
	a.firstElementChild.dispatchEvent(new Event('input'));
	console.log(a.values);
	//assert.eq(a.values.name, 'cherry');
});

Testimony.test('Refract.form._inputExprComplex3', () => {

	class A extends Refract {
		values = {name: 'apple', type: 'fruit'};
		indices = ['name', 'type'];
		index = name;
		html() { return `
			<a-239>
				${Object.keys(this.values).map(name =>
					`<input value="${this.values[name]}" data-value-expr="this.values[this.indices[this.index]]">`
				)}
			</a-239>`}
	}
	eval(A.compile());

	let a = new A();
	document.body.append(a);

	a.firstElementChild.value = 'cherry';
	a.firstElementChild.dispatchEvent(new Event('input'));
	console.log(a.values);
	//assert.eq(a.values.name, 'cherry');
});



Testimony.test('Refract.form.select', () => {

	class A extends Refract {
		value = 'two';
		html() { return `
			<a-140>
				<select id="select" value="${this.value}">
					<option value="one">1</option>
					<option value="two">2</option>
				</select>
			</a-140>`}
	}
	eval(A.compile());

	let a = new A();

	// document.body.append(a);
	// window.a = a;

	assert.eq(a.select.value, 'two');

	a.select.selectedIndex = 0;
	a.select.dispatchEvent(new Event('change'));
	assert.eq(a.value, 'one');
	assert.eq(a.select.value, 'one');

	a.value = 'two';
	assert.eq(a.select.value, 'two');

});

Testimony.test('Refract.form.SelectMultiple', () => {

	class A extends Refract {
		value = ['two'];
		html() { return `
			<a-150>
				<select id="select" value="${this.value}" multiple>
					<option value="one">1</option>
					<option value="two">2</option>
				</select>
			</a-150>`};
	}
	eval(A.compile());

	let a = new A();

	a.select.children[0].selected = true;
	a.select.dispatchEvent(new Event('change'));
	assert.eq(a.value, ['one', 'two']);

	a.value = ['two'];
	assert.eq(a.select.value, 'two');
	assert.eq(a.select.children[0].selected, false);
	assert.eq(a.select.children[1].selected, true);

	a.value = ['one', 'two'];
	assert.eq(a.select.value, 'one'); // Value will only have the first one.
	assert.eq(a.select.children[0].selected, true);
	assert.eq(a.select.children[1].selected, true);
});

Testimony.test('Refract.form.contenteditable', () => {

	class A extends Refract {
		value = 'Apple';
		html() { return `<a-160><div contenteditable id="input" value="${this.value}"></a-160>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.input.textContent, 'Apple');

	// Set class value.
	a.value = 'Banana';
	assert.eq(a.input.textContent, 'Banana');

	// Set input value
	a.input.textContent = 'Cherry';
	a.input.dispatchEvent(new Event('input'));
	assert.eq(a.value, 'Cherry');
});

Testimony.test('Refract.form.contenteditableExpr', () => {

	class A extends Refract {
		value = 'Apple';
		html() { return `<a-170><div contenteditable id="input">${this.value}</a-170>`};
	}
	eval(A.compile());

	// We forbid having expressions as children of editable text:
	let err;
	try {
		let a = new A();
	}
	catch (e) {
		err = e;
	}
	assert(err);
	assert.eq(err.message.includes('templates as children'), true);

});



// Events
Testimony.test('Refract.events.basic', () => {
	var clicked = {};
	let count = 0;
	class E extends Refract {
		onClick(event, el) {
			clicked.event = event;
			clicked.el = el;
		}

		html() { return `
			<e-1>
				<div id="btn" onclick="count++; this.onClick(event, el)">hi</div>
			</e-1>`};
	}
	E = eval(E.compile());
	let e = new E();
	e.btn.dispatchEvent(new MouseEvent('click', {view: window, bubbles: true, cancelable: true}));

	assert.eq(count, 1);
	assert.eq(clicked.event.type, 'click')
	assert.eq(clicked.el, e.btn);
});


Testimony.test('Refract.events.Loop', () => {
	var clicked = {};
	class E extends Refract {
		fruits = ['Apple', 'Banana']

		onClick(event, el, fruit) {
			clicked.event = event;
			clicked.el = el;
			clicked.fruit = fruit;
		}

		html() { return `
			<e-5>
				${this.fruits.map(fruit => 
					`}<div onclick="this.onClick(event, el, fruit)">hi</div>`
				)}
			</e-5>`
		}
	}
	E = eval(E.compile());
	let e = new E();
	e.children[1].dispatchEvent(new MouseEvent('click', {view: window, bubbles: true, cancelable: true}));

	assert.eq(clicked.event.type, 'click')
	assert.eq(clicked.el, e.children[1]);
	assert.eq(clicked.fruit, 'Banana');
});

// Same as above, but as an expression instead of a parsed loop.
Testimony.test('Refract.events._Loop2', () => {
	var clicked = {};
	class E extends Refract {
		fruits = ['Apple', 'Banana']

		onClick(event, el, fruit) {
			clicked.event = event;
			clicked.el = el;
			clicked.fruit = fruit;
		}

		html() { return `
			<e-10>
				${this.fruits.slice().map(fruit =>
					`<div onclick="this.onClick(event, el, fruit)">hi</div>`
				)}
			</e-10>`}
	}
	E = eval(E.compile());
	let e = new E();
	e.children[1].dispatchEvent(new MouseEvent('click', {view: window, bubbles: true, cancelable: true}));

	assert.eq(clicked.event.type, 'click')
	assert.eq(clicked.el, e.children[1]);
	assert.eq(clicked.fruit, 'Banana');
});

Testimony.test('Refract.shadow.basic', () => {
	class S extends Refract {
		html() { return `<s-1 shadow><div>hi</div></s-1>`};
	}
	S = eval(S.compile());

	let s = new S();
	assert(s.shadowRoot);
	assert.eq(s.shadowRoot.firstChild.tagName, 'DIV');
	assert.eq(s.shadowRoot.innerHTML, '<div>hi</div>');
});

Testimony.test('Refract.shadow.text', () => {
	class S extends Refract {
		html() { return `<s-2 shadow><div>hi</div> </s-2>`};
	}
	S = eval(S.compile());

	let s = new S();
	assert(s.shadowRoot);
	assert.eq(s.shadowRoot.innerHTML, '<div>hi</div> ');
});

Testimony.test('Refract.slot.basic', () => {
	class A extends Refract {
		init() {
					}

		html() { return `<a-400><p><slot></slot></p></a-400>`}
	}

	eval(A.compile());

	let a = createEl(`<a-400>test</a-400>`);
	assert.eq(a.outerHTML, '<a-400><p><slot>test</slot></p></a-400>');
});

Testimony.test('Refract.slot.Eval', () => {
	class A extends Refract {
		init() {
						this.item = 3;
		}

		html() { return `<a-402><p><slot></slot></p></a-402>`}
	}

	eval(A.compile());

	let a = createEl('<a-402>${this.item}</a-402>');
	assert.eq(a.outerHTML, '<a-402><p><slot>3</slot></p></a-402>');
});

Testimony.test('Refract.slot.Loop', () => {
	class A extends Refract {

		items = ['A', 'B', 'C'];

		init() {
					}

		html() { return `<a-404>${this.items.map(x => `<slot></slot>`)}</a-404>`}
	}

	eval(A.compile());

	let a = createEl('<a-404>${x}</a-404>');
	assert.eq(a.outerHTML, '<a-404><slot>A</slot><slot>B</slot><slot>C</slot></a-404>');
});

Testimony.test('Refract.slot.multiple', () => {
	class A extends Refract {
		html() { return `<a-415><p><slot></slot></p><slot></slot></a-415>`}
	}
	eval(A.compile());

	let a = createEl(`<a-415>test</a-415>`);
	assert.eq(a.outerHTML,
		`<a-415><p><slot>test</slot></p><slot>test</slot></a-415>`);
});

Testimony.test('Refract.slot.nested', () => {
	class B extends Refract {
		html() { return `<b-420><slot></slot></b-420>`};
	}
	eval(B.compile());

	class A extends Refract { // A has B nested, passes html to BS's slot.
		html() { return `<a-420 shadow><b-420><div>apple</div></b-420></a-420>`};
	}
	eval(A.compile());

	let a = createEl(`<a-420></a-420>`);
	assert.eq(a.innerHTML, ``);
	assert.eq(a.shadowRoot.innerHTML, `<b-420><slot><div>apple</div></slot></b-420>`);
});


/**
 * This calls C's constructor twice!
 * The first time is when the slot content is populated inside VElement.apply() step 3.
 *
 * The second time, the browser applies the slot content on its own.
 *
 * This happens even if I rename slot to slot2 and update the code to work with slot2.
 * So it doesn't seem to be anything special with the 'slot' tagName.
 *
 * The second C that's constructed is never added to the DOM.
 */
Testimony.test('Refract.slot._nested2', () => {
	let cCount = 0;


	class C extends Refract {
		init() { // TODO: This constructor is called twice because it's instantiated inside A.
						cCount++;
			this.innerHTML = cCount;
			//console.log('c');
		}

		html() { return `<c-421>hello</c-421>`};
	}
	eval(C.compile());

	class B extends Refract {
		html() { return `<b-421><slot></slot></b-421>`};
	}
	eval(B.compile());

	let div = document.createElement('div');
	div.innerHTML = '<b-421><c-421></c-421></b-421>';
	console.log(div.innerHTML);

	//let b = new B();


});

Testimony.test('Refract.slot._named', () => {
	class A extends Refract {
		html() { return `<a-425>begin<slot name="slot1"></slot>end</a-425>`};
	}
	eval(A.compile());

	let a = createEl(`<a-425><div slot="slot1">content</div></a-425>`);
	assert.eq(a.outerHTML, '<a-425>begin<slot name="slot1">content</slot>end</a-425>');
});

Testimony.test('Refract._debugRender', () => {

	class A extends Refract {
		fruits = [];
		html() { return `
			<a-430>
				hi
				<b name="${this.a}" title="b">test</b>
				${this.fruits.map(fruit =>
					`<p>{fruit.order} <b>${fruit.name + `<i>test</i>`}</b></p><img src=""/>`
				)}
				${this.fruits.map(fruit =>
					fruit.order // TODO: This should be parsed and render as a sub-expression.
				)}
			</a-430>`}
	}
	eval(A.compile());


	let el = A.compiler.debugRender();
	document.body.append(el);
});


Testimony.test('Refract.scopedStyle', () => {

	class A extends Refract {
		html() { return `<a-440><style>:host { background: red }</style></a-440>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.outerHTML, '<a-440 data-style="1"><style>a-440[data-style="1"] { background: red }</style></a-440>');
});


Testimony.test('Refract.misc.formInputDeep', () => {

	class A extends Refract {
		deep = { value: 'Apple'};
		html() { return `<a-520><input id="input" value="${this.deep.value}"></a-520>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.input.value, 'Apple');

	// Set class value
	a.deep.value = 'Banana';
	assert.eq(a.input.value, 'Banana');

	// Set input value
	a.input.value = 'Cherry';
	a.input.dispatchEvent(new Event('input'));
	assert.eq(a.deep.value, 'Cherry');

	window.a = a;
});

Testimony.test('Refract.misc.TwoVars', () => {

	class A extends Refract {
		a = 1;
		b = 2;
		html() { return `<a-530>${this.a + this.b}</a-530>`};
	}
	eval(A.compile());

	let a = new A();
	assert.eq(a.innerHTML, '3');

	a.b = 3;
	assert.eq(a.innerHTML, '4');

	a.a = 2;
	assert.eq(a.innerHTML, '5');
});


Testimony.test('Refract.misc.htmlFirst', () => {
	class A extends Refract {
		html() { return `<a-521>hi</a-521>`}; // html property occurs before constructor.
		init() {
					}
	}
	eval(A.compile());

	let a = createEl(`<a-521>hi</a-521>`);
	assert.eq(a.outerHTML, '<a-521>hi</a-521>')

});



Testimony.test('Refract.benchmark.10kOptions', () => {
	const num = 100_000;

	class A extends Refract {
		items = Array(num).fill(1);
		html() { return `<a-600><select id="select">${this.items.map(item => `<option>#{item}</option>`)}</select></a-600>`}
	}
	eval(A.compile());

	let start = new Date();
	let a = new A();
	let time = new Date() - start;
	console.log(time);

	assert.eq(a.select.childNodes.length, num);

});
