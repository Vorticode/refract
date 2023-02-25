import Testimony, {assert} from './Testimony.js';
import fregex from '../src/parselib/fregex.js';
import lexPhp from "../src/parselib/lex-php.js";
import lex from "../src/parselib/lex.js";

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

Testimony.test('fregexOr', () => {
	let isMatch = fregex(
		'a',
		fregex.or('b1', 'b2'),
		'c',
	);

	assert.eq(isMatch(['a', 'b1', 'c']), 3);
	assert.eq(isMatch(['a', 'b3', 'c']), false);
});

Testimony.test('fregexOr2', () => {
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
		['a', '=', 'b'], // array is equivalent to fregex()
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
	assert.eq(isMatch(['a', 'c']), 2);
	assert.eq(isMatch(['b', 'c']), true);
	assert.eq(isMatch(['a', 'b']), false);
});
/*
// fregex.nor() isn't used by Refract, so it's commented out to reduce Refract bundle size.
Testimony.test('fregex.nor', () => {
	let isMatch = fregex(
		'a',
		fregex.nor('b1', 'b2'),
		'c',
	);

	assert.eq(isMatch(['a', 'b1', 'c']), false);
	assert.eq(isMatch(['a', 'b2', 'c']), false);
	assert.eq(isMatch(['a', 'b3', 'c']), 3);
});
*/
Testimony.test('fregex.zeroOrOne', () => {
	let isMatch = fregex(
		'a',
		fregex.zeroOrOne('b1'),
		'c',
	);

	assert.eq(isMatch(['a', 'b1', 'c']), 3);
	assert.eq(isMatch(['a', 'b2', 'c']), false);
	assert.eq(isMatch(['a', 'c']), 2);
});

Testimony.test('fregex.zeroOrOne2', () => {
	let isMatch = fregex(
		'a',
		fregex.zeroOrOne('b1', 'b2'),  // acts like an AND
		'c',
	);

	assert.eq(isMatch(['a', 'c']), 2);
	assert.eq(isMatch(['a', 'b1', 'c']), false);
	assert.eq(isMatch(['a', 'b2', 'c']), false);
	assert.eq(isMatch(['a', 'b1', 'b2', 'c']), 4);
});

Testimony.test('fregex.zeroOrMore', () => {
	let isMatch = fregex.zeroOrMore('b');

	assert.eq(isMatch(['a']), 0);
	assert.eq(isMatch(['b']), 1);
	assert.eq(isMatch(['a', 'b']), 0); // only find at start.
});

Testimony.test('fregex.zeroOrMore2', () => {
	let isMatch = fregex(
		fregex.zeroOrMore('b1'),
		'c',
	);
	assert.eq(isMatch(['c']), 1);
	assert.eq(isMatch(['b1', 'c']), 2);
	assert.eq(isMatch(['a', 'c']), false); // Doesn't start with the pattern.
	assert.eq(isMatch(['a', 'b1', 'c']), false);
});

Testimony.test('fregex.zeroOrMore3', () => {
	let isMatch = fregex(
		'a',
		fregex.zeroOrMore('b1'),
		'c',
	);

	assert.eq(isMatch(['a']), false);
	assert.eq(isMatch(['a', 'd']), false);
	assert.eq(isMatch(['a', 'c']), 2);
	assert.eq(isMatch(['a', 'c', 'b1', 'c']), 2); // Match the first ones only.
	assert.eq(isMatch(['a', 'b1', 'c']), 3);
	assert.eq(isMatch(['a', 'b1', 'b1', 'c']), 4);
});

Testimony.test('fregex.zeroOrMoreOr', () => {
	let isMatch = fregex(
		'a',
		fregex.zeroOrMore(fregex.or('b1', 'b2')),
		'c',
	);

	assert.eq(isMatch(['a', 'c']), 2);
	assert.eq(isMatch(['a', 'b1', 'c']), 3);
	assert.eq(isMatch(['a', 'b1', 'b2', 'b1', 'c']), 5);
	assert.eq(isMatch(['a', 'b1', 'b2', 'b3', 'c']), false);
	assert.eq(isMatch(['a', 'b1', 'b2', 'd']), false);
});


Testimony.test('fregex.oneOrMore', () => {
	let isMatch = fregex(
		'a',
		fregex.oneOrMore('b1'),
		'c',
	);

	assert.eq(isMatch(['a', 'c']), false);
	assert.eq(isMatch(['a', 'b1', 'c']), 3);
	assert.eq(isMatch(['a', 'b1', 'b1', 'c']), 4);
});

Testimony.test('fregex.oneOrMoreOr', () => {
	let isMatch = fregex(
		'a',
		fregex.oneOrMore(fregex.or('b1', 'b2', 'b3')),
		'c',
	);

	assert.eq(isMatch(['a', 'c']), false);
	assert.eq(isMatch(['a', 'b1', 'c']), 3);
	assert.eq(isMatch(['a', 'b1', 'b2', 'b3', 'b1', 'c']), 6);

	assert.eq(isMatch(['a', 'b1', 'b4', 'b3', 'c']), false);
});



Testimony.test('fregex.oneOrMoreOr', () => {
	let isMatch = fregex(
		'a',
		fregex.oneOrMore(
			fregex.or('b1', 'b2')
		),
		'c',
	);

	assert.eq(isMatch(['a', 'c']), false);
	assert.eq(isMatch(['a', 'b1', 'c']), 3);
	assert.eq(isMatch(['a', 'b1', 'b2', 'b1', 'c']), 5);

	assert.eq(isMatch(['a', 'b1', 'b3', 'c']), false);
});

Testimony.test('fregex.oneOrMoreNot', () => {
	let isMatch = fregex.oneOrMore(
		fregex.not(';')
	);

	assert.eq(isMatch([';']), false);
	assert.eq(isMatch(['a', 'b', ';']), 2);
	assert.eq(isMatch(['a', 'b', 'c']), 3);
});

Testimony.test('fregex.oneOrMoreNot2', () => {
	let isMatch = fregex.oneOrMore(
		fregex.not('end', ';')
	);

	assert.eq(isMatch(['end', ';']), false);
	assert.eq(isMatch(['a', 'b', 'end', ';']), 2);
	assert.eq(isMatch(['a', 'b', 'c', 'end']), 4);
});

Testimony.test('fregex.matchFirst', () => {
	let pattern = fregex('a', '=', 'b');
	let tokens = ['var', 'a', '=', 'b', ';'];
	let result = fregex.matchFirst(pattern, tokens);

	assert.eq([...result], ['a', '=', 'b']);
	assert.eq(result.index, 1);
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

Testimony.test('fregex.munch', () => {
	const code = '<?php $var = (function() { return "Apple";})(); // comment';
	const tokens = lex(lexPhp, code)[0].tokens;
	const result = fregex.munch(tokens, { text: ';' }, { text: '{' }, { text: '}' });

	let code2 = '';
	for (const token of result) {
		code2 += token.text;
	}

	// Make sure it stops before the semicolon.
	assert.eq(code2, '<?php $var = (function() { return "Apple";})()');
});

Testimony.test('fregex.capture', () => {
	const isMatch = fregex('a', '=', fregex.capture(/\d+/));

	let capture = [];
	assert.eq(isMatch(['a', '=', 1, ';'], capture), 3);
	assert.eq(capture, [{ index: 2, match: [1] }]);
});

Testimony.test('fregex.captureAnd', () => {
	const isMatch = fregex('a', '=', fregex.capture(/\d+/, ';'));

	let capture = [];
	assert.eq(isMatch(['a', '=', 1, ';'], capture), 4);
	assert.eq(capture, [{ index: 2, match: [1, ';'] }]);
});

Testimony.test('fregex.captureOr', () => {
	const isMatch = fregex('a', '=', fregex.capture(fregex.or('1', '2')));

	let capture = [];
	assert.eq(isMatch(['a', '=', '1', ';'], capture), 3);
	assert.eq(capture, [{ index: 2, match: ['1'] }]);
});

Testimony.test('fregex.orCapture', () => {
	const isMatch = fregex('a', '=', fregex.or('1', fregex.capture('2')));

	let capture = [];
	assert.eq(isMatch(['a', '=', '1', ';'], capture), 3);
	assert.eq(capture, []);

	capture = [];
	assert.eq(isMatch(['a', '=', '2', ';'], capture), 3);
	assert.eq(capture, [{ index: 2, match: ['2'] }]);
});

Testimony.test('fregex.captureAndZeroOrMore', () => {
	const isMatch = fregex('a', '=', fregex.capture(/\d+/, fregex.zeroOrMore(';')));

	let capture = [];
	assert.eq(isMatch(['a', '=', '1'], capture), 3);
	assert.eq(capture, [{ index: 2, match: ['1'] }]);

	capture = [];
	assert.eq(isMatch(['a', '=', '1', ';', ';', ';'], capture), 6);
	assert.eq(capture, [{ index: 2, match: ['1', ';', ';', ';'] }]);
});

Testimony.test('fregex.zeroOrMoreCapture', () => {
	const isMatch = fregex('a', '=', t => typeof t[0] === 'number',
		fregex.zeroOrMore(fregex.capture(';')));

	let capture = [];
	assert.eq(isMatch(['a', '=', 1], capture), 3);
	assert.eq(capture, []);

	capture = [];
	assert.eq(isMatch(['a', '=', 1, ';', ';', ';'], capture), 6);
	assert.eq(capture, [
		{ index: 3, match: [';'] },
		{ index: 4, match: [';'] },
		{ index: 5, match: [';'] }
	]);
});




