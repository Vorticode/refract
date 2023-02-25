import Testimony, {assert} from './Testimony.js';
import lex from '../src/parselib/lex.js';
import lexHtmlJs from '../src/parselib/lex-htmljs.js';


/**
 * Convert an array of Token to an array of strings.
 * Also works with an array of arrays, to arbitrary depth, converting each Token to a string of its text property.
 * @param array {Token[]|Token[][]}
 * @returns {string[]|string[][]} */
function tokensToText(array) {
	if (!array)
		return undefined;
	let result = [];
	for (let i in array)
		if (Array.isArray(array[i]))
			result[i] = tokensToText(array[i]);
		else {
			result[i] = array[i].text;
			result[i] = Object.assign(result[i], {tokens: tokensToText(array[i].tokens), type: array[i].type, mode: array[i].mode});
		}
	return result;
}


Testimony.test('lex.js', () => {
	let code = 'var a = 3';
	let tokens = lex(lexHtmlJs, code);
	assert.eq(tokens.map(t=>t.text), ['var', ' ', 'a', ' ', '=', ' ', '3']);
	assert.eq(tokens.map(t=>t.type), ['keyword','whitespace','identifier','whitespace','operator','whitespace','number']);
	assert.eq(tokens.map(t=>t.mode), ['js','js','js','js','js','js','js']);
});

Testimony.test('lex.comment', () => {
	let code = 'var a = 3;// comment\nline2';
	let tokens = lex(lexHtmlJs, code);
	assert.eq(tokens.map(t=>t.text), ['var',' ','a',' ','=',' ','3',';','// comment','\n','line2']);
	assert.eq(tokens.map(t=>t.type), ['keyword','whitespace','identifier','whitespace','operator','whitespace','number','semicolon','comment','ln','identifier']);
});

Testimony.test('lex.comment2', () => {
	let code = 'var a;\n// comment\nline2';
	let tokens = lex(lexHtmlJs, code);
	assert.eq(tokens.map(t=>t.text), ['var',' ','a',';','\n','// comment','\n','line2']);
	assert.eq(tokens.map(t=>t.type), ['keyword','whitespace','identifier','semicolon','ln','comment','ln','identifier']);
});

Testimony.test('lex.comment3', () => {
	let code = 'var a;\n/*comment1\nline2\r\nline3*/\nline2/*comment2*/';
	let tokens = lex(lexHtmlJs, code);
	assert.eq(tokens.map(t=>t.text), ['var',' ','a',';','\n','/*comment1\nline2\r\nline3*/','\n','line2','/*comment2*/']);
	assert.eq(tokens.map(t=>t.type), ['keyword','whitespace','identifier','semicolon','ln','comment','ln','identifier','comment']);
});

Testimony.test('lex.template', () => {
	let code = 'var a=`hello ${name}`;';
	let tokens = lex(lexHtmlJs, code);
	// Javascript level
	assert.eq(tokens.map(t=>t.text), ['var', ' ', 'a', '=', '`hello ${name}`', ';']);
	assert.eq(tokens.map(t=>t.type), ['keyword','whitespace','identifier','operator','template','semicolon']);
	assert.eq(tokens.map(t=>t.mode), ['js','js','js','js','js','js']);

	// Template string
	assert.eq(tokens[4].tokens.map(t=>t.text), ['`', 'hello ', '${name}', '`']);
	assert.eq(tokens[4].tokens[0].mode, 'template');
	assert.eq(tokens[4].tokens.map(t=>t.type), ["template","text","expr","templateEnd"]);
	assert.eq(tokens[4].tokens.map(t=>t.mode), ['template','template','template','template']);

	// Js inside template string.
	assert.eq(tokens[4].tokens[2].tokens.map(t=>t.text), ['${','name','}']);
	assert.eq(tokens[4].tokens[2].tokens[0].mode, 'js');
});

Testimony.test('lex.identifier', () => {
	let code = 'formula=3'; // Make sure it doesn't match the keyword "for"
	let tokens = lex(lexHtmlJs, code);
	assert.eqJson(tokens.map(t=>t.text), ['formula', '=', '3']);
});

Testimony.test('lex.templateHash', () => {
	let old = lexHtmlJs.allowHashTemplates;
	lexHtmlJs.allowHashTemplates = true;
	let code = 'var a=`hello #{name}`;';
	let tokens = lex(lexHtmlJs, code);
	// Javascript level
	assert.eq(tokens.map(t=>t.text), ['var', ' ', 'a', '=', '`hello #{name}`', ';']);

	// Template string
	assert.eq(tokens[4].tokens.map(t=>t.text), ['`', 'hello ', '#{name}', '`']);
	assert.eq(tokens[4].tokens[0].mode, 'template');

	// Js inside template string.
	assert.eq(tokens[4].tokens[2].tokens.map(t=>t.text), ['#{','name','}']);
	assert.eq(tokens[4].tokens[2].tokens[0].mode, 'js');

	lexHtmlJs.allowHashTemplates = old;
});

Testimony.test('lex.template-escape', () => {
	let code = 'var a=`hello \\${name}`;'; // Same as \$ instide a template string.
	let tokens = lex(lexHtmlJs, code);
	// Javascript level
	assert.eq(tokens.map(t=>t.text), ['var', ' ', 'a', '=', '`hello \\' +
	'${name}`', ';']);

	// Template string
	assert.eq(tokens[4].tokens.map(t=>t.text), ['`', 'hello \\${name}', '`']); // It's not split into "hello" and ${name}
	assert.eq(tokens[4].tokens[0].mode, 'template');
});



Testimony.test('lex.template-hash-escape', () => {
	let code = 'var a=`hello \\#{name}`;';
	let tokens = lex(lexHtmlJs, code);
	// Javascript level
	assert.eq(tokens.map(t=>t.text), ['var', ' ', 'a', '=', '`hello \\#{name}`', ';']);

	// Template string
	assert.eq(tokens[4].tokens.map(t=>t.text), ['`', 'hello \\#{name}', '`']);

	// Js inside template string.
	assert.eq(tokens[4].tokens[2].tokens, undefined);
});

Testimony.test('lex.template-brace-depth', () => {
	let code = '<div>${{a: `a`})}</div>';
	let tokens = lex(lexHtmlJs, code, 'template');
	assert.eqJson(tokensToText(tokens), ['<div>', '${{a: `a`})}', '</div>']);
});

Testimony.test('lex.template-brace-depth2', () => {
	let code = '`a ${{b: `${{c: 3}}`}}`.length';
	let tokens = lex(lexHtmlJs, code);
	// Test braceDepth
	// TOOD: test.
	tokens = tokensToText(tokens);

	assert.eqJson(tokens, ['`a ${{b: `${{c: 3}}`}}`', '.', 'length']);
	assert.eqJson(tokens[0].tokens, ['`', 'a ', '${{b: `${{c: 3}}`}}', '`']);
	assert.eqJson(tokens[0].tokens[2].tokens, ['${', '{', 'b', ':', ' ', '`${{c: 3}}`', '}', '}']);
	assert.eqJson(tokens[0].tokens[2].tokens[5].tokens, ['`', '${{c: 3}}', '`']);
	assert.eqJson(tokens[0].tokens[2].tokens[5].tokens[1].tokens, ['${', '{', 'c', ':', ' ', '3', '}', '}']);
});

Testimony.test('lex.template-tag-expr', () => {
	let code = 'var a=`hello <b class="one ${class}">world</b>!`;';
	let tokens = lex(lexHtmlJs, code);
	tokens = tokensToText(tokens);

	// Javascript level
	assert.eqJson(tokens, ['var',' ','a','=','`hello <b class="one ${class}">world</b>!`',';']);

	// Template string
	assert.eqJson(tokens[4].tokens, ['`','hello ','<b class="one ${class}">','world','</b>','!','`']);
	assert.eq(tokens[4].tokens[0].mode, 'template');

	// Html tag inside template string.
	assert.eqJson(tokens[4].tokens[2].tokens, ['<b',' ','class','=','"one ${class}"','>']);
	assert.eq(tokens[4].tokens[2].tokens[0].mode, 'templateTag');

	// dquote string inside tag.
	assert.eqJson(tokens[4].tokens[2].tokens[4].tokens, ['"','one ','${class}','"']);
	assert.eq(tokens[4].tokens[2].tokens[4].tokens[0].mode, 'dquote');

	// js expression inside dquote string.
	assert.eqJson(tokens[4].tokens[2].tokens[4].tokens[2].tokens, ['${','class','}']);
	assert.eq(tokens[4].tokens[2].tokens[4].tokens[2].tokens[0].mode, 'js');
});

Testimony.test('lex.error', () => {
	let code = 'div \n  ; ';
	let msg = '';

	try {
		lex(lexHtmlJs, code, 'tag', {failOnUnknown: true});
	}
	catch (e) {
		msg = e.message;
	}
	assert(msg.startsWith('Unknown token within "tag" at 2:3'));
});

Testimony.test('lex.template-multiple', () => {
	let code = '${this.$one}#${this.$two}';

	let tokens = lex(lexHtmlJs, code, 'template');
	tokens = tokensToText(tokens);
	console.log(tokens); // TODO

});

Testimony.test('lex.template-multiple2', () => {
	let old = lexHtmlJs.allowHashTemplates;
	lexHtmlJs.allowHashTemplates = true;

	let code = '#{this.$one} # #{this.$two} # #{this.three}';

	let tokens = lex(lexHtmlJs, code, 'template');
	tokens = tokensToText(tokens);
	assert.eqJson(tokens, ['#{this.$one}', ' # ', '#{this.$two}', ' # ', '#{this.three}']);

	lexHtmlJs.allowHashTemplates = old;
});

Testimony.test('lex.template-misc', () => {
	let code = '${`<div>${this.one}#${this.two}#${this.three}</div>`}';

	let tokens = lex(lexHtmlJs, code, 'template');
	console.log(tokens); // TODO
});



Testimony.test('lex.template-script-tag', () => {
	let code = '${var a=`<script>var b=1<3</script>`}';
	let tokens = lex(lexHtmlJs, code, 'template');
	tokens = tokensToText(tokens);

	let js = tokens[0].tokens;
	assert.eqJson(js, ['${', 'var', ' ', 'a', '=', '`<script>var b=1<3</script>`', '}']);

	let template = js[5].tokens;
	assert.eqJson(template, ['`', '<script>', 'var b=1<3', '</script>', '`']);
	assert.eq(template.map(t=>t.type), ['template', 'openTag', 'script', 'closeTag', 'templateEnd']);


	let js2 = template[2].tokens;
	assert.eqJson(js2, ['var', ' ', 'b', '=', '1', '<', '3']);


	//console.log(tokens[0].tokens[1].tokens.tokens); // TODO

});

Testimony.test('lex.template-script-tag2', () => {
	let code = '${`<div>${var a=`<script>var b=1<3</script>`}</div>`}';

	let tokens = lex(lexHtmlJs, code, 'template');
	tokens = tokensToText(tokens);
	console.log(tokens.tokens); // TODO

});

Testimony.test('lex.regex', () => {
	let code = 'a=/^\\/(\\\\\\\\|\\\\\\/|\\[\\^\\/]|\\[[^]]]|[^/])+\\/[agimsx]*/';
	let tokens = lex(lexHtmlJs, code, 'js');
	tokens = tokensToText(tokens);
	assert.eqJson(tokens, ['a', '=', '/^\\/(\\\\\\\\|\\\\\\/|\\[\\^\\/]|\\[[^]]]|[^/])+\\/[agimsx]*/']);
	assert.eq(tokens[2].type, 'regex');
});

Testimony.test('lex.regex2', () => {
	let code = `/[/]+/g; b='/'`;
	let tokens = lex(lexHtmlJs, code, 'js');
	tokens = tokensToText(tokens);
	assert.eqJson(tokens, ['/[/]+/g', ';', ' ', 'b', '=', "'/'"]);
	assert.eq(tokens[0].type, 'regex');
});

Testimony.test('lex.html-self-closing', () => {
	let code = '<img/>';

	let tokens = lex(lexHtmlJs, code, 'html');
	tokens = tokensToText(tokens);
	assert.eqJson(tokens[0].tokens, ['<img', '/>']);
	assert.eq(tokens[0].tokens.map(t=>t.type), ['openTag', 'tagEnd']);
	assert.eq(tokens[0].tokens.map(t=>t.mode), ['tag', 'tag']);
});

Testimony.test('lex.html-comment', () => {
	let code = '<div><!-- \r\ncomment --></div>';

	let tokens = lex(lexHtmlJs, code, 'html');
	tokens = tokensToText(tokens);

	assert.eqJson(tokens, ['<div>', '<!-- \r\ncomment -->', '</div>']);
	assert.eq(tokens.map(t=>t.type), ['openTag', 'comment', 'closeTag']);
	assert.eq(tokens.map(t=>t.mode), ['html', 'html', 'html']);
});

Testimony.test('lex.comment-expr', () => {
	let code = '`<div><!-- ${a} --></div>`';

	let tokens = lex(lexHtmlJs, code, 'js');
	tokens = tokensToText(tokens);

	assert.eqJson(tokens[0].tokens[2].tokens, ['<!--', ' ', '${a}', ' ', '-->']);
	assert.eq(tokens[0].tokens[2].tokens.map(t=>t.type), ['comment', 'commentBody', 'expr', 'commentBody', 'commentEnd']);
});

Testimony.test('lex.attr', () => {
	let code = '<div a="${one}" b="#{two}" ${three} #{four}></div>';

	let old = lexHtmlJs.allowHashTemplates;
	lexHtmlJs.allowHashTemplates = true;
	let tokens = lex(lexHtmlJs, code, 'template');
	tokens = tokensToText(tokens);
	lexHtmlJs.allowHashTemplates = old;

	console.log(tokens[0]);

	assert.eqJson(tokens[0].tokens[4].tokens[1].tokens, ['${', 'one', '}']);
	assert.eqJson(tokens[0].tokens[8].tokens[1].tokens, ['#{', 'two', '}']);
	assert.eqJson(tokens[0].tokens[10].tokens, ['${', 'three', '}']);
	assert.eqJson(tokens[0].tokens[12].tokens, ['#{', 'four', '}']);

	// assert.eq(tokens[0].tokens[2].tokens, ['<!--', ' ', '${a}', ' ', '-->']);
	// assert.eq(tokens[0].tokens[2].tokens.map(t=>t.type), ['comment', 'commentBody', 'expr', 'commentBody', 'commentEnd']);
});

// console.error( 'Oops, something went wrong!' );
// console.error( 'Please, report the following error on https://github.com/ckeditor/ckeditor5/issues with the build id and the error stack trace:' );
// console.warn( 'Build id: hhtn6uwszmtw-2t2n2eo10ccs' );
Testimony.test('lex.unclosed-tag', () => {
	let code = `<p>text`;

	let tokens = lex(lexHtmlJs, code, 'html');
	tokens = tokensToText(tokens);

	assert.eqJson(tokens, ['<p>', 'text']);
	assert.eq(tokens.map(t=>t.type), ['openTag', 'text']);
});

Testimony.test('lex.unclosed-comment', () => {
	let code = `<!--text`;

	let tokens = lex(lexHtmlJs, code, 'html');
	tokens = tokensToText(tokens);

	assert.eqJson(tokens, ['<!--text']);
	assert.eqJson(tokens[0].tokens, ['<!--', 'text']);
	assert.eq(tokens[0].tokens.map(t=>t.type), ['comment', 'commentBody']);
});

Testimony.test('lex.badHtml1', () => {
	let code = "a = `Template <${3}>`;";
	let tokens = lex(lexHtmlJs, code, 'js');
	tokens = tokensToText(tokens);
	console.log(tokens);
});

Testimony.test('lex.badHtml2', () => {

	let code = "a = `Template <$3}>`;";
	let tokens = lex(lexHtmlJs, code, 'js');
	tokens = tokensToText(tokens);
	console.log(tokens); // TODO


});

Testimony.test('lex.badHtml3', () => {
	let code = "a = `Template <${3>`;";
	let tokens = lex(lexHtmlJs, code, 'js');
	tokens = tokensToText(tokens);
	console.log(tokens); // TODO
});

Testimony.test('lex.php.1', 'Test parsing it as html', () => {
	var code = `<?php print 1?-->`;
	let tokens = lex(lexHtmlJs, code, 'html');
	tokens = tokensToText(tokens);
	assert.eqJson(tokens, ['<?php print 1?-->']);
	assert.eq(tokens[0].type, 'text');

});


Testimony.test('lex.benchmark.100kOptions', () => {
	const num = 100_000;
	const code = `<select id="select">${Array(num).fill(`<option>item</option>`).join('')}</select>`;

	let start = new Date();

	let tokens = lex(lexHtmlJs, code, 'html');
	let time = new Date() - start;
	console.log(time);
});

