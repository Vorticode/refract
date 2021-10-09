import {assert, assertEquals} from './lib/Testimony.js';
import fregex from './../src/fregex.js';

Deno.test('fregex.sequence', () => {
	let isMatch = fregex('a', '=', 'b');
	assert(isMatch(['a', '=', 'b']));
	assert(!isMatch(['a', '=', 'd']));
});

Deno.test('fregex.ruleTypes', () => {
	let isMatch = fregex(
		tokens => tokens[0] === 'a',	// function
		'=',							// string
		{length: 1}						// object
	);
	assert(isMatch(['a', '=', 'b']));
});

Deno.test('fregex.or', () => {
	let isMatch = fregex.or('a', 'b');
	assert(isMatch(['a']));
	assert(isMatch(['b']));
	assert(!isMatch(['c']));
});

Deno.test('fregex.andOr', () => {
	let isMatch = fregex(
		'a',
		fregex.or('b1', 'b2'),
		'c',
	);

	assertEquals(isMatch(['a', 'b1', 'c']), 3);
	assertEquals(isMatch(['a', 'b3', 'c']), false);
});

Deno.test('fregex.andOr2', () => {
	let isMatch = fregex(
		fregex.or('a', 'b'),
		'=',
		fregex.or('c', 'd')
	);
	assert(isMatch(['a', '=', 'c']));
	assert(isMatch(['b', '=', 'd']));
	assert(isMatch(['a', '=', 'd']));
	assert(!isMatch(['c', '=', 'd']));
});

Deno.test('fregex.orAnd', () => {
	let isMatch = fregex.or(
		['a', '=', 'b'], // array is equivalent to fregex.and()
		['c', '=', 'd']
	);
	assert(isMatch(['a', '=', 'b']));
	assert(isMatch(['c', '=', 'd']));
	assert(!isMatch(['a', '=', 'd']));
});

Deno.test('fregex._not', () => {
	let isMatch = fregex.not(
		'a'
	);

	console.log(isMatch(['b']));
	assertEquals(isMatch(['a', 'c']), 2);
	assertEquals(isMatch(['b', 'c']), true);
	assertEquals(isMatch(['a', 'b']), false);
});

Deno.test('fregex.nor', () => {
	let isMatch = fregex(
		'a',
		fregex.nor('b1', 'b2'),
		'c',
	);

	assertEquals(isMatch(['a', 'b1', 'c']), false);
	assertEquals(isMatch(['a', 'b2', 'c']), false);
	assertEquals(isMatch(['a', 'b3', 'c']), 3);
});

Deno.test('fregex.zeroOrOne', () => {
	let isMatch = fregex(
		'a',
		fregex.zeroOrOne('b1'),
		'c',
	);

	assertEquals(isMatch(['a', 'b1', 'c']), 3);
	assertEquals(isMatch(['a', 'b2', 'c']), false);
	assertEquals(isMatch(['a', 'c']), 2);
});

Deno.test('fregex.zeroOrOne2', () => {
	let isMatch = fregex(
		'a',
		fregex.zeroOrOne('b1', 'b2'),  // acts like an AND
		'c',
	);

	assertEquals(isMatch(['a', 'c']), 2);
	assertEquals(isMatch(['a', 'b1', 'c']), false);
	assertEquals(isMatch(['a', 'b2', 'c']), false);
	assertEquals(isMatch(['a', 'b1', 'b2', 'c']), 4);
});

Deno.test('fregex.zeroOrMore', () => {
	let isMatch = fregex.zeroOrMore('b');

	assertEquals(isMatch(['a']), 0);
	assertEquals(isMatch(['b']), 1);
});

Deno.test('fregex.zeroOrMore2', () => {
	let isMatch = fregex(
		'a',
		fregex.zeroOrMore('b1'),
		'c',
	);

	assertEquals(isMatch(['a']), false);
	assertEquals(isMatch(['a', 'd']), false);
	assertEquals(isMatch(['a', 'c']), 2);
	assertEquals(isMatch(['a', 'b1', 'c']), 3);
	assertEquals(isMatch(['a', 'b1', 'b1', 'c']), 4);
});

Deno.test('fregex.oneOrMore', () => {
	let isMatch = fregex(
		'a',
		fregex.oneOrMore('b1'),
		'c',
	);

	assertEquals(isMatch(['a', 'c']), false);
	assertEquals(isMatch(['a', 'b1', 'c']), 3);
	assertEquals(isMatch(['a', 'b1', 'b1', 'c']), 4);
});

Deno.test('fregex.oneOrMoreNot', () => {
	let isMatch = fregex.oneOrMore(
		fregex.not(';')
	);

	assertEquals(isMatch([';']), false);
	assertEquals(isMatch(['a', 'b', ';']), 2);
	assertEquals(isMatch(['a', 'b', 'c']), 3);
});

Deno.test('fregex.oneOrMoreNot2', () => {
	let isMatch = fregex.oneOrMore(
		fregex.not('end', ';')
	);

	assertEquals(isMatch(['end', ';']), false);
	assertEquals(isMatch(['a', 'b', 'end', ';']), 2);
	assertEquals(isMatch(['a', 'b', 'c', 'end']), 4);
});

Deno.test('fregex.matchFirst', () => {
	let pattern = fregex('a', '=', 'b');
	let tokens = ['var', 'a', '=', 'b', ';'];
	let result = fregex.matchFirst(pattern, tokens);

	assertEquals(result, ['a', '=', 'b']);
	assertEquals(result.index, 1);
});

Deno.test('fregex.end', () => {
	let isMatch = fregex(
		'a',
		'=',
		'1',
		fregex.end
	);
	assert(isMatch(['a', '=', '1']));
	assert(!isMatch(['a', '=', '1', ';']));
	assert(!isMatch(['a', '=', '2']));
});

// Make sure fregex.or can match items that advance 0 tokens.
// This used to be a bug.
Deno.test('fregex.endOr', () => {
	let isMatch = fregex(
		'a', '=', '1',
		fregex.or(
			fregex.end,
			';'
		)
	);
	assert(isMatch(['a', '=', '1']));
	assert(isMatch(['a', '=', '1', ';']));
	assert(!isMatch(['a', '=', '1', '+']));
	assert(!isMatch(['a', '=', '2']));
});
