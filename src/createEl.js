// TODO: Move this into Html.js?
let cache = {}; // TODO: Cache should exist per-document?
let divCache = new WeakMap();
let templateCache = new WeakMap();

// let div = document.createElement('div');
// let template = document.createElement('template');

/**
 * Create a single html element, node, or comment from the html string.
 * The string will be trimmed so that an element with space before it doesn't create a text node with spaces.
 * @param html {string}
 * @param trim {boolean=}
 * @param doc {HTMLDocument}
 * @return {HTMLElement|Node} */
export default function(html, trim=true, doc=document) {

	// Get from cache
	if (trim)
		html = html.trim();

	// If creating a web component, don't use a tempalte because it prevents the constructor from being called.
	// And don't use an item from the cache with cloneNode() because that will call the constructor more than once!
	if (html.match(/^<\S+-\S+/)) {

		let div = divCache.get(doc);
		if (!div)
			divCache.set(doc, div = doc.createElement('div'));
		div.innerHTML = html;
		return div.removeChild(div.firstChild)
	}

	let existing = cache[html];
	if (existing)
		return existing.cloneNode(true);


	let template = templateCache.get(doc);
	if (!template)
		templateCache.set(doc, template = doc.createElement('template'));

	// Create
	template.innerHTML = html;

	// Cache
	// We only cache the html if there are no slots.
	// Because if we use cloneNode with a custom element that has slots, it will take all of the regular, non-slot
	// children of the element and insert them into the slot.
	if (!template.content.querySelector('slot'))
		cache[html] = template.content.firstChild.cloneNode(true);

	return template.content.removeChild(template.content.firstChild);
}
