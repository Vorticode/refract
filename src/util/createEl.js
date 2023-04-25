/**
 * Create a single html element, node, or comment from the html string.
 * Unless props=false, the string will be trimmed so that an element with space before it doesn't create a text node with spaces.
 *
 * Features:
 * id's become properties of the result.
 * props are written as properties and methods to the result.
 * Events are rewritten to support event, this, and el.
 * Scoped styles.
 * An init() function, if present in props, is called before rendering. This function can also call render().
 * A render() function is created that redraws the contents.
 *
 * Features in Refract but not createEl():
 * watches and auto redraw when properties change.
 * two way binding to form fields.
 * shadow dom.
 * slots.
 *
 *
 *
 * TODO: Allow specifying an existing div as props to bind a new set of html to it.
 *     This could be used for manually adding children.
 * TODO: Bind this to render() so I can render ${this.someField}
 * TODO: Make properties, ids, events, and scoped styles only happen if a props argument is passed in, or is not false?
 *
 * TODO: Get values and setValues() functions for form fields?  Can make it work with any html element.
 * I could use nested html to specify json structure of the result?
 * <div name="item[]">
 *     <input name="description">
 * </div>
 *
 * Will give me item[0].description
 *
 *
 * @param html {string|function} Must be a function that returns html if you want to call render() again later.
 * @param props {Object|boolean}
 * @param doc {Document} Use this document to create the element. */
export default function createEl(html, props=false, doc=document) {

	// Create a top level web component.
	if (html.match(/^<\S+-\S+/)) {
		let div = document.createElement('div');
		div.innerHTML = html;
		return div.removeChild(div.firstChild);
	}

	let parent = doc.createElement('template');
	let result = doc.createElement((html+'').match(/<(\w+[\w-]*)/)[1]);
	let ids; // Track them so they can be removed later.

	// Properties
	if (props)
		html = html.trim();
	if (typeof props === 'object')
		for (let name in props) {
			if (name in result)
				throw new Error(`Property ${name} already exists.`);
			result[name] = props[name];
		}

	// Render
	result.render = () => {
		parent.innerHTML = (typeof html === 'function' ? html() : html).trim();

		// Attributes and Children
		if (props) {
			result.innerHTML = '';
			[...result.attributes].map(attr => result.removeAttribute(attr.name));
		}
		[...parent.content.firstElementChild.attributes].map(attr => result.setAttribute(attr.name, attr.value));
		[...parent.content.firstElementChild.childNodes].map(child => result.append(child));

		if (props) {
			// Assign ids
			(ids || []).map(id => delete result[id]);
			ids = [...result.querySelectorAll('[id],[data-id]')].map(el => {
				if (el.id in result && !(el.id in props)) // allow id's to override our custom props.
					throw new Error(`Property ${el.id} already exists.`);
				result[el.id] = el;
				return [el.id];
			});

			// Bind events
			[result, ...result.querySelectorAll('*')].map(el =>
				[...el.attributes].filter(attr => attr.name.startsWith('on')).map(attr => {
					el[attr.name] = e => // e.g. el.onclick = ...
						(new Function('event', 'el', attr.value)).bind(result)(e, el) // put "event", "el", and "this" in scope for the event code.
				})
			);

			// Scoped Styles
			let styles = result.querySelectorAll('style');
			if (styles.length) {
				result.setAttribute('data-style-scope', styleId++); // TODO: re-use style id on re-render.
				[...styles].map(style => style.textContent = style.textContent.replace(/:host(?=[^a-z\d_])/gi,
					'[data-style-scope="' + result.getAttribute('data-style-scope') + '"]'));
			}
		}
	}

	if (typeof result.init === 'function')
		result.init();
	if (!ids) // if not called by init()
		result.render();

	return result;
}