# Refract

Refract is a fast, lightweight, "reactive" JavaScript library for creating user interface components to use in regular html pages.

```html
<body>
<script>
    import Refract from 'Refract.js';
    
    class ShoppingList extends Refract {
        items = [];

    	// Only inserts one div row, without recreating the whole list:
        addItem() {
            this.items.push({name: '', qty: 0});
        }

		// Only removes one div row, without recreating the whole list:
        removeItem(item) {
            let idx = this.items.indexOf(item);
            this.items.splice(idx, 1);
        }

        html = `
            <shopping-list>
                <button onclick="this.addItem()">Add Item</button>
                ${this.items.map(item => // Loop
                   `<div style="display: flex; flex-direction: row">
                        <input value="${item.name}">
                        <input type="number" value="${item.qty}">
                        <div onclick="this.removeItem(item)">x</div>
                    </div>`
                )}
            </shopping-list>`;
    }
    eval(ShoppingList.compile()); // Creates a Web Component from the class.
</script>
<shopping-list></shopping-list>
</body>
```

==TODO== Add to JSFiddle with link.

### Feature Summary:

- React-like, Model-View-View Model (MVVM) pattern for convenient data binding.  Automatically updates DOM elements when bound properties change.
- Fast and intelligent.  Adding a single item to a TODO list of 10,000 items won't create 10,000 virtual elements behind the scenes and compare them with the DOM to see what has changed.
- Lightweight.  Less than **30KB** minified, **9KB** gzipped.
- No custom build steps and no dependencies.  Not even Node.js.  Just include Refract.js or Refract.min.js.
- Doesn't take over your whole project.  Place it within standard DOM nodes only where you need it.
- Uses standard, native html and JavaScript.  No need to learn another template or markup language.
- Supports events, shadow DOM, slots, and more.
- MIT license.  Free for commercial use.

==Words to describe Refract: Opt-in, fast, lightweight, native, "reactive", compile-less.==

==Possible names: Refract, LiteElement, Shadow.js  Atlas.js, LiteComponent.js==

## Minimal Example

In this minimal example, we make a new class called Hello and set its html.  We give it an `r-` prefix because browsers require that any web component tag name must include at least one dash surrounded by letters.

```html
<script>
    import './Refract.js';
    
    class Hello extends Refract {
        name = 'Refract';
        html = `<r-hello>Hello #{this.name}!</r-hello>`;
    }
	eval(Hello.compile());
</script>

<!-- Prints an element with textContent = "Hello Refract!" -->
<r-hello></r-hello>
```

Subsequent examples omit the  `import` statement for brevity.

## Features

### Ids

Any element in the html with an `id` or `data-id` attribute is automatically bound to a property with the same name on the class instance:

```javascript
class RaceTeam extends Refract {
	html = `
        <race-team>
            <input id="driver" value="Vermin Supreme">
            <div data-id="car">Lightning McQueen</div>
        </race-team>`;
}
eval(RaceTeam.compile());

var team = new RaceTeam();
console.log(team.driver.value);     // "Vermin Supreme"
console.log(team.car.textContent);  // "Lightning McQueen"
car.driver.value = 'Chuck Norris'; // Replaces text in input box.
car.driver = 3; // Error, property is read-only.


```

Ids that match html attribute names such as `title` or `disabled` may give unpredictable behavior.

### Template Interpolation

As with regular JavaScript, template strings can be inserted via `${...}`.  The alternate `#{...}` templates will escape html entities before they're printed:

```javascript
class Resume extends Refract {
    this.name = 'John Smith';
	this.resumeHtml = '<b>Jobs:</b> Tesla.<br><b>Education:</b>: Belmont';

	html = `
        <r-resume>
            <h1>Resume for #{this.name}</h1>
			<div>${this.resumeHtml}>/div>
			
        </r-resume>`;
}
eval(NameTag.compile());
```

Literal `$` and `#` characters can be escaped with a backslash as `\$` or `\#`.

As always, assigning different values to `this.name` or `this.resumeHtml` will update any changed html automatically.

### Form Elements

TODO

### Constructors

TODO

### Loops

TODO

### Events

Events can be used via the conventional `on` attributes.  The event code is given these variables implicitly:

1. `this` The parent Refract element.
2. `event` The event object.
3. `el` The HTML Element where the attribute is present.
4. Any new variables in scope from a containing loop.

```javascript
class FastCar extends LiteElement {
    honk(event, el) {
        console.log(`${event.type} happened on ${el.tagName}.`);
    }

    html = `
        <fast-car>
            <button onclick="this.honk(event, el)">Honk</button>
        </fast-car>`;
}
eval(FastCar.compile());

var car = new FastCar();
document.body.append(car);
```

In the example above, clicking the button will print `click happened on BUTTON.`

### Nesting

Refract elements can also be embedded within the html of other Refract elements:

```javascript
class Wheel extends Refract {
    constructor(number) {
     	super();
        this.number = number;
    }
    
	html = '<car-wheel>Wheel #{this.number}</car-wheel>';
}

class FastCar extends Refract  {
    html = `
        <fast-car>
            <car-wheel number="1"></car-wheel>
            <car-wheel number="2"></car-wheel>
            <car-wheel number="3"></car-wheel>
            <car-wheel number="4"></car-wheel>
        </fast-car>`;
}
```

And as seen above, attributes can be used to pass arguments to the nested element constructors.  Alternatively, we could write the FastCar class to use a loop and pass the number argument dynamically:

```javascript
class FastCar extends Refract  {
    this.wheels = [1, 2, 3, 4];
    html = `
        <fast-car>
			${this.wheels.map(wheel => 
            	`<car-wheel number="${wheel}"></car-wheel>`
            )}
        </fast-car>`;
}
```

Any valid JavaScript variable can be passed to the embedded class this way, including functions or complex objects.

### Shadow DOM

If the `shadow` attribute is present on a Refract element or any of its children, any child nodes will be created as as [ShadowDOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM).  This allows styles to be embedded that **only** apply to the children of the Element with teh `shadow` attribute.  The `:host` selector is used to style the element itself, per the ShadowDOM specification:

```javascript
class FancyText extends Refract {
    html = `
        <fancy-text shadow>
            <style>
                :host { border: 10px dashed red }
                p { text-shadow: 0 0 5px orange }
            </style>
            <p>Fancy text!</p>
        </fancy-text>`;
}
eval(FancyText.compile());
```



### Slots

TODO

### Helper Functions

TODO.

### Watching

TODO

## Browser Support

TODO

## Limitations

### Compilation

Refract elements cannot be used unless you call `eval(ClassName.compile()` after defining the class.

### Partial Tokens are Unsupported

Template expressions can:

1. Inject one or more html elements.
2. Insert values into html attribute.
3. Insert whole html attributes.
4. Insert text among other text.

However they cannot alter the entire structure of html tags or attributes.  All of the following will fail:

```javascript
html = `<${this.tagName}></${this.tagName}>`;
html = `<div data-${this.dataName}="1"></div>`;
html = `<div>${this.closeTag}`;
```

However these will all work:

```javascript
html = `${this.completeBlockOfHtml}`;
html = `<div class="one ${this.two} three"></div>`;
html = `<div ${this.isEdit ? 'contenteditable' : ''}></div>`;
html = `<div ${this.attributes.join(' ')}></div>`;
html = `<div>one ${this.two} three</div>`;
```

### document.createElement()

Imagine the following Refract element:

```javascript
class RefractElement extends Refract {
	html = `<refract-element>Hi!</refract-element>`;
}
eval(RefractElement.compile());
```

Refract element can't be instantiated via document.createElement():

```javascript
document.createElement('refract-element'); // Error
```

But they can be by assigning their tag names as innerHTML to another element:

```javascript
let div = document.createElement('div');
div.innerHTML = '<refract-element>';
```

This is also valid:

```html
<body>
    <script type="module" src="RefractElement.js"></script>
    <refract-element></refract-element>
</body>
```

### Cannot Watch Function Result

Imagine the following code:

```javascript
class RefractElement extends Refract {
    count = 2;    
    getCount() {
    	return this.count;   
    }
    
	html = `
		<refract-element>
			Count1: ${this.count}
			Count2: ${this.getCount()}
		</refract-element>`;
}
eval(RefractElement.compile());

let r = new RefractElement();
r.count = 3;
```

Only `Count1:` will be set to `3`, while `Count2:` will remain at `2`.  This happens because in the second instance, Refract cannot see the `this.count` variable and therefore cannot watch it to know when it has changed.

This can be remedied with the following code:

```javascript
class RefractElement extends Refract {
    count = 2;    
    getVar(variable) {
    	return variable;   
    }
    
	html = `
		<refract-element>
			Count1: ${this.count}
			Count2: ${this.getVar(this.count)}
		</refract-element>`;
}
eval(RefractElement.compile());

let r = new RefractElement();
r.count = 3;
```

In this case, Refract sees the `this.count` variable in the expression for `Count2:`.  When it changes, Refract is notified and the expression is re-evaluated.

## How Refract works

When `ClassName.compile()` is called, Refract parses the `html` property, building a virtual tree of the elements and expressions it contains.  It finds all `this.variables` within the expressions and watches for their values to change, via [JavaScript Proxies](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy).  Finally, `compile()` calls `customElements.define` to register a custom tag name.

Additionally, Refract has a special code path for watching loop expressions created via `this.array.map(...)`, so that when the array powering a loop changes, only the html elements connected to the items changed are updated.

## Development

### Running Tests

Tests can be run one of two ways:

1.  By loading tests/index.html in the browser and selecting which tests to run.

2.  Currently broken:  By typing `deno test --allow-net` from a command prompt in the tests folder.  Required the deno runtime to be installed.  Individual tests can be run by typing `deno test --allow-net filename.build2.js`.  The --allow-net flag allows downloading required deno libraries.



