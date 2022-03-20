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



Deno.test('Parse.findFunction.arrow1', () => {
	let code = 'b=3;a => a+1; b=4;';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunction(tokens);
	assertEquals(tokens.slice(...result).join(''), 'a => a+1');
});

Deno.test('Parse.findFunction.arrow2', () => {
	let code = 'b=3;a => (a+1); b=4;';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunction(tokens);
	assertEquals(tokens.slice(...result).join(''), 'a => (a+1)');
});

Deno.test('Parse.findFunction.arrow3', () => {
	let code = 'b=3;(a => a+1); b=4;';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunction(tokens);
	assertEquals(tokens.slice(...result).join(''), 'a => a+1');
});

Deno.test('Parse.findFunction.arrow4', () => {
	let code = 'b=3;a => { return a+1 }; b=4;';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunction(tokens);
	assertEquals(tokens.slice(...result).join(''), 'a => { return a+1 }');
});

Deno.test('Parse.findFunction.arrow5', () => {
	let code = 'b=3;a => { return {a:1} }; b=4;';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunction(tokens);
	assertEquals(tokens.slice(...result).join(''), 'a => { return {a:1} }');
});

Deno.test('Parse.findFunction.arrow6', () => {
	let code = 'b=3;(a) => a+1;';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunction(tokens);
	assertEquals(tokens.slice(...result).join(''), '(a) => a+1');
});

Deno.test('Parse.findFunction.arrow7', () => {
	let code = '() => a+1;';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunction(tokens);
	assertEquals(tokens.slice(...result).join(''), '() => a+1');
});

Deno.test('Parse.findFunction.func', () => {
	let code = 'b=3;function(a) { return a+1 }; b=4;';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunction(tokens);
	assertEquals(tokens.slice(...result).join(''), 'function(a) { return a+1 }');
});





Deno.test('Parse.findFunctionArgs.arrow1', () => {
	let code = 'a => a+1';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunctionArgs(tokens);
	assertEquals(tokens.slice(...result).join(''), 'a');
});

Deno.test('Parse.findFunctionArgs.arrow2', () => {
	let code = '(a) => (a+1)';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunctionArgs(tokens);
	assertEquals(tokens.slice(...result).join(''), 'a');
});

Deno.test('Parse.findFunctionArgs.arrow3', () => {
	let code = '(a, b) => a+1';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunctionArgs(tokens);
	assertEquals(tokens.slice(...result).join(''), 'a, b');
});

Deno.test('Parse.findFunctionArgs.arrow4', () => {
	let code = '(a=1) => { return a+1 }';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunctionArgs(tokens);
	assertEquals(tokens.slice(...result).join(''), 'a=1');
});

Deno.test('Parse.findFunctionArgs.arrow5', () => {
	let code = '(a={}, b) => { return {a:1} }';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunctionArgs(tokens);
	assertEquals(tokens.slice(...result).join(''), 'a={}, b');
});

Deno.test('Parse.findFunctionArgs.arrow6', () => {
	let code = '(a=x=> {return (x+1)},b) => { return {a:1} }';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunctionArgs(tokens);
	assertEquals(tokens.slice(...result).join(''), 'a=x=> {return (x+1)},b');
});

Deno.test('Parse.findFunctionArgs.func', () => {
	let code = 'function(a) { return a+1 }';
	let tokens = lex(htmljs, code, 'js');

	let result = Parse.findFunctionArgs(tokens);
	assertEquals(tokens.slice(...result).join(''), 'a');
});