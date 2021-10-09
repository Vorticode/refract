import {assert, assertEquals} from './lib/Testimony.js';
import Parse from './../src/Parse.js';
import lex from "./../src/lex.js";
import htmljs from "./../src/lex-htmljs.js";



Deno.test('Parse.singleVar', () => {
	let code = 'fruit';
	let tokens = lex(htmljs, code, 'js');

	let pathTokens = Parse.varExpressions_(tokens, ['fruit']);
	assertEquals(pathTokens,	[['fruit']]);

});


Deno.test('Parse.thisVars', () => {

	let code = 'this.one';
	let tokens = lex(htmljs, code, 'js');

	let pathTokens = Parse.varExpressions_(tokens);
	assertEquals(pathTokens,	[['this', '.', 'one']]);
});


Deno.test('Parse.multipleVars', () => {

	let code = 'this.one.two(); test["a"].b; test()';
	let tokens = lex(htmljs, code, 'js');

	let pathTokens = Parse.varExpressions_(tokens, ['test']);
	assertEquals(pathTokens,
		[
			['this', '.', 'one'],
			['test', '[', '"a"', ']', '.', 'b']
		]
	);
});

Deno.test('Parse.duplicate', () => {

	let code = 'this.one.two; one.three';
	let tokens = lex(htmljs, code, 'js');

	let pathTokens = Parse.varExpressions_(tokens, ['one']);
	assertEquals(pathTokens,
		[ // Make sure we don't match the "one.two" within "this.one.two."
			['this', '.', 'one', '.', 'two'],
			['one', '.', 'three']
		]
	);

});

Deno.test('Parse.varExpressionToPath', () => {
	let code = 'this["fruit"][0].name';
	let tokens = lex(htmljs, code, 'js');
	let pathTokens = Parse.varExpressions_(tokens);
	let paths = pathTokens.map(Parse.varExpressionToPath_);

	assertEquals(paths, [['this', 'fruit', '0', 'name']]);
});

Deno.test('Parse.varExpressionWithinParens', () => {
	let code = 'escapeHtml(sport[0].name)';
	let tokens = lex(htmljs, code, 'js');
	let pathTokens = Parse.varExpressions_(tokens, ['fruit', 'sport']);
	let paths = pathTokens.map(Parse.varExpressionToPath_);

	assertEquals(paths, [['sport', '0', 'name']]);
});