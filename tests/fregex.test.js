import Testimony, {assert, assertEquals} from './Testimony.js';
import fregex from './../src/fregex.js';

Testimony.test('fregex.sequence', () => {
	let isMatch = fregex('a', '=', 'b');
	assert(isMatch(['a', '=', 'b']));
	assert(!isMatch(['a', '=', 'd']));
});

Testimony.test('fregex.ruleTypes', () => {
	let isMatch = fregex(
		tokens => tokens[0] === 'a',	// function
		'=',							// string
		{length: 1}						// object
	);
	assert(isMatch(['a', '=', 'b']));
});

Testimony.test('fregex.or', () => {
	let isMatch = fregex.or('a', 'b');
	assert(isMatch(['a']));
	assert(isMatch(['b']));
	assert(!isMatch(['c']));
});

Testimony.test('fregex.andOr', () => {
	let isMatch = fregex(
		'a',
		fregex.or('b1', 'b2'),
		'c',
	);

	assertEquals(isMatch(['a', 'b1', 'c']), 3);
	assertEquals(isMatch(['a', 'b3', 'c']), false);
});

Testimony.test('fregex.andOr2', () => {
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

Testimony.test('fregex.orAnd', () => {
	let isMatch = fregex.or(
		['a', '=', 'b'], // array is equivalent to fregex.and()
		['c', '=', 'd']
	);
	assert(isMatch(['a', '=', 'b']));
	assert(isMatch(['c', '=', 'd']));
	assert(!isMatch(['a', '=', 'd']));
});

Testimony.test('fregex._not', () => {
	let isMatch = fregex.not(
		'a'
	);

	console.log(isMatch(['b']));
	assertEquals(isMatch(['a', 'c']), 2);
	assertEquals(isMatch(['b', 'c']), true);
	assertEquals(isMatch(['a', 'b']), false);
});
/*
// fregex.nor() isn't used by Refract, so it's commented out to reduce Refract bundle size.
Testimony.test('fregex.nor', () => {
	let isMatch = fregex(
		'a',
		fregex.nor('b1', 'b2'),
		'c',
	);

	assertEquals(isMatch(['a', 'b1', 'c']), false);
	assertEquals(isMatch(['a', 'b2', 'c']), false);
	assertEquals(isMatch(['a', 'b3', 'c']), 3);
});
*/
Testimony.test('fregex.zeroOrOne', () => {
	let isMatch = fregex(
		'a',
		fregex.zeroOrOne('b1'),
		'c',
	);

	assertEquals(isMatch(['a', 'b1', 'c']), 3);
	assertEquals(isMatch(['a', 'b2', 'c']), false);
	assertEquals(isMatch(['a', 'c']), 2);
});

Testimony.test('fregex.zeroOrOne2', () => {
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

Testimony.test('fregex.zeroOrMore', () => {
	let isMatch = fregex.zeroOrMore('b');

	assertEquals(isMatch(['a']), 0);
	assertEquals(isMatch(['b']), 1);
	assertEquals(isMatch(['a', 'b']), 0); // only find at start.
});

Testimony.test('fregex.zeroOrMore2', () => {
	let isMatch = fregex(
		fregex.zeroOrMore('b1'),
		'c',
	);
	assertEquals(isMatch(['c']), 1);
	assertEquals(isMatch(['b1', 'c']), 2);
	assertEquals(isMatch(['a', 'c']), false); // Doesn't start with the pattern.
	assertEquals(isMatch(['a', 'b1', 'c']), false);
});

Testimony.test('fregex.zeroOrMore3', () => {
	let isMatch = fregex(
		'a',
		fregex.zeroOrMore('b1'),
		'c',
	);

	assertEquals(isMatch(['a']), false);
	assertEquals(isMatch(['a', 'd']), false);
	assertEquals(isMatch(['a', 'c']), 2);
	assertEquals(isMatch(['a', 'c', 'b1', 'c']), 2); // Match the first ones only.
	assertEquals(isMatch(['a', 'b1', 'c']), 3);
	assertEquals(isMatch(['a', 'b1', 'b1', 'c']), 4);
});

Testimony.test('fregex.zeroOrMoreOr', () => {
	let isMatch = fregex(
		'a',
		fregex.zeroOrMore(fregex.or('b1', 'b2')),
		'c',
	);

	assertEquals(isMatch(['a', 'c']), 2);
	assertEquals(isMatch(['a', 'b1', 'c']), 3);
	assertEquals(isMatch(['a', 'b1', 'b2', 'b1', 'c']), 5);
	assertEquals(isMatch(['a', 'b1', 'b2', 'b3', 'c']), false);
	assertEquals(isMatch(['a', 'b1', 'b2', 'd']), false);
});


Testimony.test('fregex.oneOrMore', () => {
	let isMatch = fregex(
		'a',
		fregex.oneOrMore('b1'),
		'c',
	);

	assertEquals(isMatch(['a', 'c']), false);
	assertEquals(isMatch(['a', 'b1', 'c']), 3);
	assertEquals(isMatch(['a', 'b1', 'b1', 'c']), 4);
});

Testimony.test('fregex.oneOrMoreOr', () => {
	let isMatch = fregex(
		'a',
		fregex.oneOrMore(fregex.or('b1', 'b2', 'b3')),
		'c',
	);

	assertEquals(isMatch(['a', 'c']), false);
	assertEquals(isMatch(['a', 'b1', 'c']), 3);
	assertEquals(isMatch(['a', 'b1', 'b2', 'b3', 'b1', 'c']), 6);

	assertEquals(isMatch(['a', 'b1', 'b4', 'b3', 'c']), false);
});



Testimony.test('fregex.oneOrMoreOr', () => {
	let isMatch = fregex(
		'a',
		fregex.oneOrMore(
			fregex.or('b1', 'b2')
		),
		'c',
	);

	assertEquals(isMatch(['a', 'c']), false);
	assertEquals(isMatch(['a', 'b1', 'c']), 3);
	assertEquals(isMatch(['a', 'b1', 'b2', 'b1', 'c']), 5);

	assertEquals(isMatch(['a', 'b1', 'b3', 'c']), false);
});

Testimony.test('fregex.oneOrMoreNot', () => {
	let isMatch = fregex.oneOrMore(
		fregex.not(';')
	);

	assertEquals(isMatch([';']), false);
	assertEquals(isMatch(['a', 'b', ';']), 2);
	assertEquals(isMatch(['a', 'b', 'c']), 3);
});

Testimony.test('fregex.oneOrMoreNot2', () => {
	let isMatch = fregex.oneOrMore(
		fregex.not('end', ';')
	);

	assertEquals(isMatch(['end', ';']), false);
	assertEquals(isMatch(['a', 'b', 'end', ';']), 2);
	assertEquals(isMatch(['a', 'b', 'c', 'end']), 4);
});

Testimony.test('fregex.matchFirst', () => {
	let pattern = fregex('a', '=', 'b');
	let tokens = ['var', 'a', '=', 'b', ';'];
	let result = fregex.matchFirst(pattern, tokens);

	assert.eqJson(result, ['a', '=', 'b']);
	assertEquals(result.index, 1);
});

Testimony.test('fregex.end', () => {
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
Testimony.test('fregex.endOr', () => {
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
