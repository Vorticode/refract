import Testimony, {assert} from './Testimony.js';
import Parse from './../src/Parse.js';
import lex from "./../src/lex.js";
import htmljs from "./../src/lex-htmljs.js";
import {ParsedFunction} from "../src/ParsedFunction.js";


/**
 * Convert an array of Token to an array of strings.
 * Also works with an array of arrays, to arbitrary depth, converting each Token to a string of its text property.
 * @param array {Token[]|Token[][]}
 * @returns {string[]|string[][]} */
function tokensToText(array) {
	let result = [];
	for (let i in array)
		if (Array.isArray(array[i]))
			result[i] = tokensToText(array[i]);
		else {
			result[i] = array[i].text;
			if (array[i].tokens)
				result[i] = Object.assign(result[i], {tokens: tokensToText(array[i].tokens)});
		}
	return result;
}

function toText(tokens) {
	return tokens.map(token => token.text);
}


Testimony.test('Parse.singleVar', () => {
	let code = 'fruit';
	let tokens = lex(htmljs, code, 'js');

	let pathTokens = Parse.varExpressions_(tokens, ['fruit']);
	assert.eqJson(tokensToText(pathTokens), [['fruit']]);

});


Testimony.test('Parse.thisVars', () => {

	let code = 'this.one';
	let tokens = lex(htmljs, code, 'js');

	let pathTokens = Parse.varExpressions_(tokens);
	pathTokens = tokensToText(pathTokens);
	assert.eqJson(pathTokens,	[['this', '.', 'one']]);
});


Testimony.test('Parse.multipleVars', () => {

	let code = 'this.one.two(); test["a"].b; test()';
	let tokens = lex(htmljs, code, 'js');

	let pathTokens = Parse.varExpressions_(tokens, ['test']);
	pathTokens = tokensToText(pathTokens);

	assert.eqJson(pathTokens,
		[
			['this', '.', 'one'],
			['test', '[', '"a"', ']', '.', 'b']
		]
	);
});

Testimony.test('Parse.duplicate', () => {

	let code = 'this.one.two; one.three';
	let tokens = lex(htmljs, code, 'js');

	let pathTokens = Parse.varExpressions_(tokens, ['one']);
	pathTokens = tokensToText(pathTokens);
	assert.eqJson(pathTokens,
		[ // Make sure we don't match the "one.two" within "this.one.two."
			['this', '.', 'one', '.', 'two'],
			['one', '.', 'three']
		]
	);

});

Testimony.test('Parse.varExpressionToPath', () => {
	let code = 'this["fruit"][0].name';
	let tokens = lex(htmljs, code, 'js');
	let pathTokens = Parse.varExpressions_(tokens);
	let paths = pathTokens.map(Parse.varExpressionToPath_);

	assert.eqJson(paths, [['this', 'fruit', '0', 'name']]);
});

Testimony.test('Parse.varExpressionWithinParens', () => {
	let code = 'escapeHtml(sport[0].name)';
	let tokens = lex(htmljs, code, 'js');
	let pathTokens = Parse.varExpressions_(tokens, ['fruit', 'sport']);
	let paths = pathTokens.map(Parse.varExpressionToPath_);

	assert.eqJson(paths, [['sport', '0', 'name']]);
});

Testimony.test('Parse.varExpressionOptionalChaining', () => {
	let code = 'this?.[0]?.name';
	let tokens = lex(htmljs, code, 'js');
	let pathTokens = Parse.varExpressions_(tokens);
	let paths = pathTokens.map(Parse.varExpressionToPath_);

	assert.eqJson(paths, [['this', '0', 'name']]);
});

Testimony.test('ParseFunction.construct.arrowParam', () => {
	let code = 'a => a+1; b=4';

	let pf = new ParsedFunction(code);

	assert.eq(pf.name, undefined);
	assert.eq(toText(pf.argTokens_), ['a']);
	assert.eq(toText(pf.bodyTokens_), ['a', '+', '1', ';']);
});

Testimony.test('ParseFunction.construct.arrowParams', () => {
	let code = '(a, b=()=>{}) => a+1; b=4';

	let pf = new ParsedFunction(code);

	assert.eq(pf.name, undefined);
	assert.eq(toText(pf.argTokens_).join(''), 'a, b=()=>{}');
	assert.eq(toText(pf.bodyTokens_), ['a', '+', '1', ';']);
});



Testimony.test('ParseFunction.construct.arrowParamsEmpty', () => {
	let code = '() => 2+1\r\nb=4';

	let pf = new ParsedFunction(code);

	assert.eq(pf.name, undefined);
	assert.eq(pf.argTokens_, []);
	assert.eq(toText(pf.bodyTokens_), ['2', '+', '1']);
});

Testimony.test('ParseFunction.construct.arrowParamBrace', () => {
	let code = 'a => {return a+1} b=4';

	let pf = new ParsedFunction(code);

	assert.eq(pf.name, undefined);
	assert.eq(toText(pf.argTokens_), ['a']);
	assert.eq(toText(pf.bodyTokens_), ['{', 'return', ' ', 'a', '+', '1', '}']);

});

Testimony.test('ParseFunction.construct.arrowParamsBrace', () => {
	let code = '(a, b=()=>{}, c) => {return a+1;} b=4';
	let pf = new ParsedFunction(code);

	assert.eq(pf.name, undefined);
	assert.eq(toText(pf.argTokens_).join(''), 'a, b=()=>{}, c');
	assert.eq(toText(pf.bodyTokens_), ['{', 'return', ' ', 'a', '+', '1', ';', '}']);
});

Testimony.test('ParseFunction.construct.arrowParamsEmptyBrace', () => {
	let code = '() => {return 2+1;} b=4';
	let pf = new ParsedFunction(code);

	assert.eq(pf.name, undefined);
	assert.eq(pf.argTokens_, []);
	assert.eq(toText(pf.bodyTokens_), ['{', 'return', ' ', '2', '+', '1', ';', '}']);
});



Testimony.test('ParseFunction.construct.function', () => {
	let code = 'function (a, b=()=>{}) {return a+1;} b=4';
	let pf = new ParsedFunction(code);

	assert.eq(pf.name, undefined);
	assert.eq(toText(pf.argTokens_).join(''), 'a, b=()=>{}');
	assert.eq(toText(pf.bodyTokens_), ['{', 'return', ' ', 'a', '+', '1', ';', '}']);
});


Testimony.test('ParseFunction.construct.functionName', () => {
	let code = 'function test(a, b=()=>{}) {return a+1;} b=4';
	let pf = new ParsedFunction(code);

	assert.eq(pf.name, 'test');
	assert.eq(toText(pf.argTokens_).join(''), 'a, b=()=>{}');
	assert.eq(toText(pf.bodyTokens_), ['{', 'return', ' ', 'a', '+', '1', ';', '}']);
});

Testimony.test('ParseFunction.construct.functionNamedArgs', () => {
	let code = 'function test({a, b=()=>{}}, c) {return a+1;} b=4';
	let pf = new ParsedFunction(code);

	assert.eq(pf.name, 'test');
	assert.eq(toText(pf.argTokens_).join(''), '{a, b=()=>{}}, c');
	assert.eq(toText(pf.bodyTokens_), ['{', 'return', ' ', 'a', '+', '1', ';', '}']);
});

Testimony.test('ParseFunction.construct.functionParamsEmpty', () => {
	let code = 'function test() {return 2+1;} b=4';
	let pf = new ParsedFunction(code);

	assert.eq(pf.name, 'test');
	assert.eq(pf.argTokens_, []);
	assert.eq(toText(pf.bodyTokens_), ['{', 'return', ' ', '2', '+', '1', ';', '}']);
});


Testimony.test('ParseFunction.construct.method', () => {
	let f = {test(a, b=()=>{}) {return a+1;}}.test;
	let pf = new ParsedFunction(f);

	assert.eq(pf.name, 'test');
	assert.eq(toText(pf.argTokens_).join(''), 'a, b=()=>{}');
	assert.eq(toText(pf.bodyTokens_), ['{', 'return', ' ', 'a', '+', '1', ';', '}']);
});



Testimony.test('ParseFunction.getArgNames.basic', () => {
	let f = function(a, b=window) { return a+1 };
	let args = [...new ParsedFunction(f).getArgNames()];
	assert.eq(args, ['a', 'b']);
});




Testimony.test('ParseFunction.getArgNames.named', () => {
	let f = function({a, b}={}, c) { return a+1 };
	let args = [...new ParsedFunction(f).getArgNames()];
	assert.eq(args, [{a:undefined, b:undefined}, 'c']);
});


Testimony.test('ParseFunction.getArgNames.named2', () => {
	let f = function({a, b: {c:d}}, e={f:2}, g=function() { return {window, document} }, h) { return a+1 };

	let args = [...new ParsedFunction(f).getArgNames()];

	assert.eq(args, [{a: undefined, b: {c: undefined}}, 'e', 'g', 'h']);
});




































































