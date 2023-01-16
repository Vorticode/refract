# Refract

Refract is a fast, lightweight, "reactive" JavaScript library for creating user interface components to use in regular html pages.

```html
<script type="module">
    import Refract from 'https://vorticode.github.io/refract/dist/Refract.min.js';

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
- [Refract.min.js](https://cdn.jsdelivr.net/gh/Vorticode/refract/dist/Refract.min.js) - 42KB (14KB gzipped)

## Feature Summary:

- Automatically updates DOM elements when properties change.
- Fine-grained change detection.  Adding a single item to a TODO list of 10,000 items won't create 10,000 virtual elements behind the scenes and compare them with the DOM to see what has changed.
- Lightweight.  **42KB** minified, **14KB** gzipped.
- No custom build steps and no dependencies.  Not even Node.js.  Just `import` Refract.js or Refract.min.js.
- Doesn't take over your whole project.  Place Refract web components among standard DOM nodes only where you need them.
- Uses standard, native html and JavaScript.  No need to learn another template or markup language.
- Supports events, shadow DOM, slots, scoped styles, and more.
- The whole library is MIT licensed.  Free for commercial use.  No attribution needed.

## Minimal Example

In this minimal example, we make a new class called Hello and provide an `html()` function to set its html.  Refract never calls this function directly (and neither should you, but it provides code that Refract parses into a tree of objects so it can only update nodes whose values are changed, instead of all nodes.

Make sure the element name has a dash (`-`) in the middle because all browsers require custom web component names to have a dash in the middle..

```html
<script>
    import Refract from 'https://vorticode.github.io/refract/dist/Refract.min.js';
    
    class HelloRefract extends Refract {
        name = 'Refract';
	    html() { return `<hello-refract>Hello #{this.name}!</hello-refract>`}
    }
    eval(HelloRefract.compile());
</script>

<!-- Prints an element with textContent = "Hello Refract!" -->
<hello-refract></hello-refract>
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

As with regular JavaScript, template strings can be inserted via `${...}`.  The alternate `#{...}` templates will escape html entities before they're printed.  If your IDE doesn't understand `#{...}` syntax, you can also use the `h()` function to escape HTML.  But note that the `h()` function will always convert single and double quotes to html entities by default, since it doesn't know when it's escaping text for an attribute.

```javascript
import Refract, {h} from 'https://vorticode.github.io/refract/dist/Refract.min.js';

class Resume extends Refract {
	init() {
		this.name = 'John Smith';
		this.resumeHtml = '<b>Jobs:</b> Tesla.<br><b>Education:</b>: Belmont';
	}

	html() { return `
        <r-resume>
            <h1>Resume for #{this.firstName} ${h(this.lastName)}</h1>
            <div title="${h(this.lastName)}">${this.resumeHtml}>/div>            
        </r-resume>`
	}
}
eval(NameTag.compile());
```

Literal `$` and `#` characters can be escaped with a backslash as `\$` or `\#`.

As with the other examples, assigning different values to `this.name` or `this.resumeHtml` will update the rendered html automatically.

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

It's not necessary to escape html by using `#{...}` syntax when using two-way binding for the value of input, select, textarea, and contenteditable elements.  `${...}` will suffice.

Using a complex expression (an expression that doesn't link directly back to a class property) will only allow one-way binding.  In this case, typing in the input box will not update the class property:

```javascript
htlm = ` ... <input value="${this.inputVal+''}"/> ... `
```

Two-way binding can also be used on custom web components that expose a `.value` property.

### Loops

As seen in some of the examples above, loops can be written with the standard [Array.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map) function.  Refract looks for this pattern in the html and parses it into a structure so it will know to only update loop items that have been changed:

```javascript
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

In order for Refract to understand a loop and only update specific items that are changed, the loops must be written in the specific format of calling map on a variable that's an array, and passing it a lambda function inline.  

```javascript
// Parsed as loops, changing an item updates only re-renders the affected html
html() { return `
    <todo-list>
        ${this.items.map(item => `<p>#{item}</p>`)}
        ${this.items.map((item, i) => `<p>#{i} #{item}</p>`)}
        ${this.items.map(item => item = ' | ')}
        ${this.items[3]['subItems'].map(item => `<p>#{item}</p>`)}
        ${this.items.map(function(item) { return `<p>#{item}</p>`})}
    </todo-list>`
}

// Not parsed as loops, changes are slower b/c all html created 
// by the loop is re-rendered.  This is still ok, but slower.
html() { return `
    <todo-list>
        ${this.items.slice().map(item => `<p>#{item}</p>`)}
        ${this.items.map(item => `<p>#{item}</p>`).join('')}
        ${this.getItems().map(item => `<p>#{item}</p>`)}
        ${this.items.map(function(item) { return `<p>#{item}</p>`})}
    </todo-list>`
}
```

### Events

Events can be used via the conventional `on` attributes.  The event code is given these variables implicitly:

1. `this` The parent Refract class instance.
2. `event` The event object.
3. `el` The HTML Element where the attribute is present.
4. Any variables in scope from containing loops.

```javascript
class FastCar extends LiteElement {
    honk(event, el, volume) {
        console.log(
            `A #{volume} ${event.type} happened on <${el.tagName.toLowerCase()}>.`
        );
    }

	html() { return `
        <fast-car>
            <button onclick="this.honk(event, el, 'loud')">Honk</button>
        </fast-car>`
	}
}
eval(FastCar.compile());

var car = new FastCar();
document.body.append(car);
```

In the example above, clicking the button will print `A loud click happened on <button>.`

### Constructors and Nesting

Refract classes should have an optional `init()` function instead of a constructor.  Internally, `init()` is called after the super constructor and after all class properties have been evaluated.

Values can be passed to those constructors when they're invoked via `new`, just as with any other JavaScript class.  However, constructors values can also be passed via attributes when creating a Refract element from HTML:

```html
<script>
    class ColorText extends Refract {
        init(color) {
            this.color = color;
        }
	    html() { 
			return `<color-text style="color: #{this.value}">What color?</color-text>`
		}
    }
    eval(ColorText.compile());
</script>

<color-text color="red"></color-text>
```

If using a JavaScript mangler, the constructor argument names might be mangled.  To prevent that, you can either disable variable name mangling or used name parameters via [JavaScript destructuring assignment](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment) for the constructor.  Named parameters will still receive their values from attributes:

```html
<script>
    class ColorText extends Refract {
        init({color}={}) { // Named parameter
            this.color = color;
        }
	    html() { 
			return `<color-text style="color: #{this.value}"></color-text>`
		}
    }
    eval(ColorText.compile());
    
    // Instantiate via JavaScript
    let color = new Color({color: 'red'});
</script>

<!-- Instantiate via html -->
<color-text color="red"></color-text>
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

Likewise, unmodified JavaScript objects can be passed to attributes via `${...}`.  In the example below, an instance of the parent Refract web component instance is passed to the child instances:

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

Alternatively, we could write the CarBody class to use a loop and pass the number argument dynamically:

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
        this.autoRender = true; // Don't create child nodes until here.
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

## Functions

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

When `ClassName.compile()` is called, Refract parses the code in the `html()` function and calls `customElements.define` to register a custom tag name.  The first time a class is instantiated, Refract builds a virtual tree of the elements and expressions it contains.  It finds all variables referencing class properties within the expressions and watches for their values to change, via [JavaScript Proxies](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy).

Additionally, Refract has a special code path for watching loop expressions created via `this.array.map(...)`, so that when the array powering a loop changes, only the html elements connected to the items changed are updated.

## Development

Tests can be run by loading tests/index.html in the browser and selecting which tests to run.

