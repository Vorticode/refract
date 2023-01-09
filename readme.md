# Refract

Refract is a fast, lightweight, "reactive" JavaScript library for creating user interface components to use in regular html pages.

```html
<script type="module">
    import Refract from '../src/Refract.js';

    class ShoppingList extends Refract {
        items = [];

        // Constructor
        init(items=[]) {
            this.items = items;
        }

        // Inserts only one div row, without recreating whole list:
        addItem() {
            this.items.push({name: '', qty: 0});
        }

        // Removes only one div row, without recreating whole list:
        removeItem(item) {
            let idx = this.items.indexOf(item);
            this.items.splice(idx, 1);
        }

        html() { return `
            <shopping-list>
                <button onclick="this.addItem()">Add Item</button>
                ${this.items.map(item => // Loop 
                    `<div style="display: flex; flex-direction: row">
                        <input value="${item.name}" placeholder="Name">
                        <input type="number" value="${item.qty}">
                        <div onclick="this.removeItem(item)">x</div>
                     </div>`
                )}
                <pre>items = ${JSON.stringify(this.items, null, 4)}</pre>
            </shopping-list>`
        }
    }

    // Setup the class and register it as a Web Component.
    eval(ShoppingList.compile());
</script>
<shopping-list items="${[{name: 'Avacados', qty: 2}]}"></shopping-list>
```

You can paste the code above into any html document to try it out, or [run it](https://jsfiddle.net/gqvy81s5/) on JSFiddle.net.

Refract is still **in development** and has several known bugs.  Exercise caution if using in a production environment.

## CDN / Download

- [Refract.js](https://cdn.jsdelivr.net/gh/Vorticode/refract/dist/Refract.js) - 156KB
- [Refract.min.js](https://cdn.jsdelivr.net/gh/Vorticode/refract/dist/Refract.min.js) - 46KB (15KB gzipped)

## Feature Summary:

- Automatically updates DOM elements when properties change.
- Fine grained change detection.  Adding a single item to a TODO list of 10,000 items won't create 10,000 virtual elements behind the scenes and compare them with the DOM to see what has changed.
- Lightweight.  **46KB** minified, **15KB** gzipped.
- No custom build steps and no dependencies.  Not even Node.js.  Just include Refract.js or Refract.min.js.
- Doesn't take over your whole project.  Place it within standard DOM nodes only where you need it.
- Uses standard, native html and JavaScript.  No need to learn another template or markup language.
- Supports events, shadow DOM, slots, and more.
- The whole library is MIT licensed.  Free for commercial use.  No attribution needed.

## Minimal Example

In this minimal example, we make a new class called Hello and set its html.  We give it an `r-` prefix because browsers require that any web component tag name must include at least one dash surrounded by letters.

```html
<script>
    import './Refract.js';
    
    class Hello extends Refract {
        name = 'Refract';
	    html() { return `<r-hello>Hello #{this.name}!</r-hello>`}
    }
    eval(Hello.compile());
</script>

<!-- Prints an element with textContent = "Hello Refract!" -->
<r-hello></r-hello>
```

Subsequent examples omit the  `import` statement for brevity.

An IDE like JetBrains [WebStorm](https://www.jetbrains.com/webstorm/), [PhpStorm](https://www.jetbrains.com/phpstorm/), or [IDEA](https://www.jetbrains.com/phpstorm/) will syntax highlight the html template strings.

## Features

### Ids

Any element in the html with an `id` or `data-id` attribute is automatically bound to a property with the same name on the class instance:

```javascript
class RaceTeam extends Refract {
	html() { return `
		<race-team>
            <input id="driver" value="Vermin Supreme">
            <div data-id="car">Cutlas Supreme</div>
            <div data-id="instructor.name">Lightning McQueen</div>
        </race-team>`
	}
}
eval(RaceTeam.compile());

var team = new RaceTeam();
console.log(team.driver.value);    // "Vermin Supreme"
console.log(team.car.textContent); // "Cutlas Supreme"
console.log(team.instructor.name.textContent); // "Lightning McQueen"
car.driver.value = 'Chuck Norris'; // Replaces text in input box.
car.driver = 3; // Error, property is read-only.


```

Ids that match html attribute names such as `title` or `disabled` may give unpredictable behavior.

### Template Interpolation

As with regular JavaScript, template strings can be inserted via `${...}`.  The alternate `#{...}` templates will escape html entities before they're printed:

```javascript
class Resume extends Refract {
	init() {
		this.name = 'John Smith';
		this.resumeHtml = '<b>Jobs:</b> Tesla.<br><b>Education:</b>: Belmont';
	}

	html() { return `
        <r-resume>
            <h1>Resume for #{this.name}</h1>
            <div>${this.resumeHtml}>/div>
            
        </r-resume>`
	}
}
eval(NameTag.compile());
```

Literal `$` and `#` characters can be escaped with a backslash as `\$` or `\#`.

As always, assigning different values to `this.name` or `this.resumeHtml` will update any changed html automatically.

### Form Elements

Refract performs two-way binding on form elements.  Setting the bound class property will change the value of the form element.  And changing the value of the form element will instantly change the class property.  Refract listens to the `oninput` event for typeable form elements, and `onchange` event for other form elements, during the capture phase.  

The values of `<input type="number">` and `<input type="range">` inputs will be converted to `float`, and datetime inputs to `Date`.  `<select multiple>` input values will provide the selected values in an array.

```javascript
class CoolForm extends Refract {
	
	init() {
		this.inputVal = 'Input val';
		this.selectVal = 'One';
		this.textareaVal = 'Textarea Content';
		this.customVal = 4;
	}

	html() { return `
		<cool-form>
            <input value="${this.inputVal}"/>
            <select value="${this.selectVal}">
                <option>One</option>
                <option>Two</option>
            </select>
            <textarea value="${this.textareaVal}"></textarea>
            <custom-refract-element value="${this.customVal}"></custom-refract-element>
        </cool-form>`
    }
}
eval(NameTag.compile());
```

In the example above, `<custom-refract-elemenet>` is a custom form element built using Refract, that exposes a `.value` getter and setter to modify its value.

Using a complex expression (an expression that doesn't link directly back to a class property) will only allow one-way binding.  In this case, typing in the input box will not update the class property:

```javascript
htlm = ` ... <input value="${this.inputVal+''}"/> ... `
```

### Loops

TODO:  Document this feature.

### Events

Events can be used via the conventional `on` attributes.  The event code is given these variables implicitly:

1. `this` The parent Refract class instance.
2. `event` The event object.
3. `el` The HTML Element where the attribute is present.
4. Any new variables in scope from a containing loop.

```javascript
class FastCar extends LiteElement {
    honk(event, el) {
        console.log(`${event.type} happened on ${el.tagName}.`);
    }

	html() { return `
        <fast-car>
            <button onclick="this.honk(event, el)">Honk</button>
        </fast-car>`
	}
}
eval(FastCar.compile());

var car = new FastCar();
document.body.append(car);
```

In the example above, clicking the button will print `click happened on BUTTON.`

### Constructors and Nesting

The classes that define Refract Elements have constructors, and values can be passed to those constructors when they're invoked via `new`, just as with any other JavaScript class.  However, constructors values can also be passed when creating a Refract element from HTML:

```html
<script>
    class ColorText extends Refract {
        init(color) {
            this.color = color;
        }
	    html() { 
			return `<color-text style="color: #{this.value}"></color-text>`
		}
    }
    eval(ColorText.compile());
</script>

<color-text color="red">I'm Red!</color-text>
```

Complex data can also be passed through constructor arguments.  Any constructor argument that is valid JSON will be parsed as such:

```html
<script>
    class TodoList extends Refract {
        init(items) {
            this.items = items;
        }

	    html() { return `
            <todo-list>
                ${this.items.map(item => 
                    `#{this.items[0])}<br>`
                )}
            </todo-list>`
		}
    }
    eval(TodoList.compile());
</script>

<todo-list items='["one", "two", "three"]'></todo-list>
```

Refract elements can also be embedded within the html of other Refract elements:

```javascript
class CarWheel extends Refract {
    
    // Don't create DOM nodes until we call render()
    autoRender = false; 
    
    init(number, parent) {
        this.number = number;
        this.parent = parent;
        this.render();
    }
	html() { 
		return `<car-wheel>Wheel ${this.number} of ${this.parent.name}</car-wheel>`
	}
}
eval(CarWheel.compile());

class CarBody extends Refract  {
    name = 'Camero';
	html() { return `
        <car-body>
            <car-wheel number="1" parent="${this}"></car-wheel>
            <car-wheel number="2" parent="${this}"></car-wheel>
            <car-wheel number="3" parent="${this}"></car-wheel>
            <car-wheel number="4" parent="${this}"></car-wheel>
        </car-body>`
	}
}
eval(CarBody.compile());
```

And as seen above, attributes can be used to pass arguments to the nested element constructors.  Alternatively, we could write the CarBody class to use a loop and pass the number argument dynamically.  When one Refract element is embedded within another, constructor arguments can also be passed via `${...}` templates:

```javascript
class CarWheel extends Refract {
    init(number) {
        this.number = number;
    }
	html() { 
		return `<car-wheel>Wheel #{this.number}</car-wheel>`
	}
}

class CarBody extends Refract  {
    wheels = [1, 2, 3, 4];

	html() { return `
        <car-wheel>
            ${this.wheels.map(wheel => 
                `<car-wheel number="${wheel}"></car-wheel>`
            )}
        </car-wheel>`
	}
}
```

Any valid JavaScript variable can be passed to the embedded class this way, including functions or complex objects.

Alternatively, one Refract component can be embedded within another using this syntax:

```javascript
class CarBody extends Refract  {
    wheels = [1, 2, 3, 4];
	html() { return `
        <car-wheel>
            ${this.wheels.map(wheel => 
                new CarWheel(wheel)
            )}
        </car-wheel>`
	}
}
```



==TODO: Document passing eval'd code as constructor args with {}==

### Deferred Rendering

Maybe you want to setup your object a little before it's rendered.  In this case, pass `false` to the `autoRender` property then call `this.render()` whenever it's ready:

```javascript
class TodoList extends Refract {

    items = [];
	
	// False to not create child nodes until we call this.render().
	autoRender = false;
    
    init(items) {
        console.log(this.listParent); // undefined, not created yet.
        this.items = items;
        this.render(); // Don't create child nodes until here.
        console.log(this.listParent); // Now it's created.
    }

	html() { return `
        <todo-list>
        	<ul id="listParent">
        	    ${this.items.map(item =>
                    `<li>${item}</li>`                                
                )}
        	</ul>
        </todo-list>`
    }
}
```



### Scoped Styles

Elements with `style` elements will be rewritten so that any style selectors beginning with `:host` within apply only to the Refract element.  This is done by:

1. Adding a `data-style` attribute to the root element with a custom id.
2. Replacing any `:host` selectors inside the style with `element-name#style-id`  For example below the `:host` selector would become `fancy-text[data-style="1"]`.

```javascript
class FancyText extends Refract {
	html() { return `
        <fancy-text>
            <style>
                :host { border: 10px dashed red } /* style for <fancy-text> */
                :host p { text-shadow: 0 0 5px orange } 
            </style>
            <p>I have a red border and shadow!</p>
        </fancy-text>`
	}
}
eval(FancyText.compile());
```

### Shadow DOM

Any element with the `shadow` attribute will have its child nodes attached within a [ShadowDOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM) element.  This allows styles to be embedded that **only** apply to the children of the Element with the `shadow` attribute.  The `:host` selector is used to style the element itself, per the ShadowDOM specification.  Unlike scoped styles, this scoping is performed automatically by the browser.

```javascript
class FancyText extends Refract {
	html() { return `
        <fancy-text shadow>
            <style>
                :host { border: 10px dashed red } /* style for <fancy-text> */
                p { text-shadow: 0 0 5px orange } /* No need for :host prefix */
            </style>
            <p>I have a red border and shadow!</p>
        </fancy-text>`
	}
}
eval(FancyText.compile());
```

### Slots

TODO:  Document this feature.

### Helper Functions

TODO:  Document this feature.

### Watching

TODO:  Document this feature.

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
html() { return `<${this.tagName}></${this.tagName}>`}
html() { return `<div data-${this.dataName}="1"></div>`}
html() { return `<div>${this.closeTag}`}
```

However these will all work:

```javascript
html() { return `${this.completeBlockOfHtml}`}
html() { return `<div class="one ${this.two} three"></div>`}
html() { return `<div ${this.isEdit ? 'contenteditable' : ''}></div>`}
html() { return `<div ${this.attributes.join(' ')}></div>`}
html() { return `<div>one ${this.two} three</div>`}
```

### document.createElement()

Refract element can't be instantiated via document.createElement():

```javascript
class RefractElement extends Refract {
	html() { return `<refract-element>Hi!</refract-element>`}
}
eval(RefractElement.compile());

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

The return value of a function cannot be watched for changes:

```javascript
class RefractElement extends Refract {
    count = 2;    
    getCount() {
        return this.count+1;   
    }

	html() { return `
        <refract-element>
            Count1: ${this.count+1}    <!-- will update -->
            Count2: ${this.getCount()} <!-- won't update -->
        </refract-element>`
	}
}
eval(RefractElement.compile());

let r = new RefractElement();
r.count = 3;
```

Only `Count1:` will be set to `3`, while `Count2:` will remain at `2`.  This happens because in the second instance, the `this.count` variable does not occur within the `${...}` expression and therefore Refract does not know to watch to see when it changes.

This can be remedied with the following code:

```javascript
class RefractElement extends Refract {
    count = 2;    
    getVar(variable) {
        return variable+1;   
    }

	html() { return `
        <refract-element>
            Count1: ${this.count+1}
            Count2: ${this.getVar(this.count)}
        </refract-element>`
	}    
}
eval(RefractElement.compile());

let r = new RefractElement();
r.count = 3;
```

In this case, Refract sees the `this.count` variable in the expression for `Count2:`.  When it changes, Refract is notified and the expression is re-evaluated.

## How Refract works

When `ClassName.compile()` is called, Refract parses the `html` property and calls `customElements.define` to register a custom tag name.  The first time a class is instantiated, Refract builds a virtual tree of the elements and expressions it contains.  It finds all `this.variables` within the expressions and watches for their values to change, via [JavaScript Proxies](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy).

Additionally, Refract has a special code path for watching loop expressions created via `this.array.map(...)`, so that when the array powering a loop changes, only the html elements connected to the items changed are updated.

## Development

### Running Tests

Tests can be run one of two ways:

1.  By loading tests/index.html in the browser and selecting which tests to run.

2.  Currently broken:  By typing `deno test --allow-net` from a command prompt in the tests folder.  Required the deno runtime to be installed.  Individual tests can be run by typing `deno test --allow-net filename.build2.js`.  The --allow-net flag allows downloading required deno libraries.



