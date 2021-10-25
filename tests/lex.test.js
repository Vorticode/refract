import {assert, assertEquals, assertStartsWith, Testimony} from './lib/Testimony.js';
import lex from './../src/lex.js';
import jsHtml from './../src/lex-htmljs.js';
import htmljs from "../src/lex-htmljs.js";
import lexHtmlJs from "./../src/lex-htmljs.js";

Deno.test('lex.js', () => {
	let code = 'var a = 3';
	let tokens = lex(jsHtml, code);
	assertEquals(tokens, ['var', ' ', 'a', ' ', '=', ' ', '3']);
	assertEquals(tokens.map(t=>t.type), ['keyword','whitespace','identifier','whitespace','operator','whitespace','number']);
	assertEquals(tokens.map(t=>t.mode), ['js','js','js','js','js','js','js']);
});

Deno.test('lex.comment', () => {
	let code = 'var a = 3;// comment\nline2';
	let tokens = lex(jsHtml, code);
	assertEquals(tokens, ['var',' ','a',' ','=',' ','3',';','// comment','\n','line2']);
	assertEquals(tokens.map(t=>t.type), ['keyword','whitespace','identifier','whitespace','operator','whitespace','number','semicolon','comment','ln','identifier']);
});

Deno.test('lex.comment2', () => {
	let code = 'var a;\n// comment\nline2';
	let tokens = lex(jsHtml, code);
	assertEquals(tokens, ['var',' ','a',';','\n','// comment','\n','line2']);
	assertEquals(tokens.map(t=>t.type), ['keyword','whitespace','identifier','semicolon','ln','comment','ln','identifier']);
});

Deno.test('lex.comment3', () => {
	let code = 'var a;\n/*comment1\nline2\r\nline3*/\nline2/*comment2*/';
	let tokens = lex(jsHtml, code);
	assertEquals(tokens, ['var',' ','a',';','\n','/*comment1\nline2\r\nline3*/','\n','line2','/*comment2*/']);
	assertEquals(tokens.map(t=>t.type), ['keyword','whitespace','identifier','semicolon','ln','comment','ln','identifier','comment']);
});

Deno.test('lex.template', () => {
	let code = 'var a=`hello ${name}`;';
	let tokens = lex(jsHtml, code);
	// Javascript level
	assertEquals(tokens, ['var', ' ', 'a', '=', '`hello ${name}`', ';']);
	assertEquals(tokens.map(t=>t.type), ['keyword','whitespace','identifier','operator','template','semicolon']);
	assertEquals(tokens.map(t=>t.mode), ['js','js','js','js','js','js']);

	// Template string
	assertEquals(tokens[4].tokens, ['`', 'hello ', '${name}', '`']);
	assertEquals(tokens[4].tokens[0].mode, 'template');
	assertEquals(tokens[4].tokens.map(t=>t.type), ["template","text","expr","templateEnd"]);
	assertEquals(tokens[4].tokens.map(t=>t.mode), ['template','template','template','template']);

	// Js inside template string.
	assertEquals(tokens[4].tokens[2].tokens, ['${','name','}']);
	assertEquals(tokens[4].tokens[2].tokens[0].mode, 'js');
});

Deno.test('lex.identifier', () => {
	let code = 'formula=3'; // Make sure it doesn't match the keyword "for"
	let tokens = lex(jsHtml, code);
	assertEquals(tokens, ['formula', '=', '3']);
});

Deno.test('lex.templateHash', () => {
	let old = jsHtml.allowHashTemplates;
	jsHtml.allowHashTemplates = true;
	let code = 'var a=`hello #{name}`;';
	let tokens = lex(jsHtml, code);
	// Javascript level
	assertEquals(tokens, ['var', ' ', 'a', '=', '`hello #{name}`', ';']);

	// Template string
	assertEquals(tokens[4].tokens, ['`', 'hello ', '#{name}', '`']);
	assertEquals(tokens[4].tokens[0].mode, 'template');

	// Js inside template string.
	assertEquals(tokens[4].tokens[2].tokens, ['#{','name','}']);
	assertEquals(tokens[4].tokens[2].tokens[0].mode, 'js');

	jsHtml.allowHashTemplates = old;
});

Deno.test('lex.template-escape', () => {
	let code = 'var a=`hello \\${name}`;';
	let tokens = lex(jsHtml, code);
	// Javascript level
	assertEquals(tokens, ['var', ' ', 'a', '=', '`hello \\${name}`', ';']);

	// Template string
	assertEquals(tokens[4].tokens, ['`', 'hello \\${name}', '`']);
	assertEquals(tokens[4].tokens[0].mode, 'template');

	// Js inside template string.
	assertEquals(tokens[4].tokens[2].tokens, undefined);
});

Deno.test('lex.template-brace-depth', () => {
	let code = '<div>${{a: `a`})}</div>';

	let tokens = lex(jsHtml, code, 'template');
	console.log(tokens); // TODO

	assertEquals(tokens, ['<div>', '${{a: `a`})}', '</div>']);
});

Deno.test('lex.template-brace-depth2', () => {
	let code = '`a ${{b: `${{c: 3}}`}}`.length';
	let tokens = lex(jsHtml, code);
	// Test braceDepth
	// TOOD: test.
	console.log(tokens);

	assertEquals(tokens, ['`a ${{b: `${{c: 3}}`}}`', '.', 'length']);
	assertEquals(tokens[0].tokens, ['`', 'a ', '${{b: `${{c: 3}}`}}', '`']);
	assertEquals(tokens[0].tokens[2].tokens, ['${', '{', 'b', ':', ' ', '`${{c: 3}}`', '}', '}']);
	assertEquals(tokens[0].tokens[2].tokens[5].tokens, ['`', '${{c: 3}}', '`']);
	assertEquals(tokens[0].tokens[2].tokens[5].tokens[1].tokens, ['${', '{', 'c', ':', ' ', '3', '}', '}']);
});

Deno.test('lex.template-tag-expr', () => {
	let code = 'var a=`hello <b class="one ${class}">world</b>!`;';
	let tokens = lex(jsHtml, code);

	// Javascript level
	assertEquals(tokens, ['var',' ','a','=','`hello <b class="one ${class}">world</b>!`',';']);

	// Template string
	assertEquals(tokens[4].tokens, ['`','hello ','<b class="one ${class}">','world','</b>','!','`']);
	assertEquals(tokens[4].tokens[0].mode, 'template');

	// Html tag inside template string.
	assertEquals(tokens[4].tokens[2].tokens, ['<b',' ','class','=','"one ${class}"','>']);
	assertEquals(tokens[4].tokens[2].tokens[0].mode, 'templateTag');

	// dquote string inside tag.
	assertEquals(tokens[4].tokens[2].tokens[4].tokens, ['"','one ','${class}','"']);
	assertEquals(tokens[4].tokens[2].tokens[4].tokens[0].mode, 'dquote');

	// js expression inside dquote string.
	assertEquals(tokens[4].tokens[2].tokens[4].tokens[2].tokens, ['${','class','}']);
	assertEquals(tokens[4].tokens[2].tokens[4].tokens[2].tokens[0].mode, 'js');
});

Deno.test('lex.error', () => {
	let code = 'div \n  ; ';
	let msg = '';

	jsHtml.allowUnknownTagTokens = false;
	try {
		lex(jsHtml, code, 'tag');
	}
	catch (e) {
		msg = e.message;
	}
	jsHtml.allowUnknownTagTokens = true;
	assertStartsWith(msg, 'Unknown token within "tag" at 2:3');
});

Deno.test('lex.template-multiple', () => {
	let code = '${this.$one}#${this.$two}';

	let tokens = lex(jsHtml, code, 'template');
	console.log(tokens); // TODO

});

Deno.test('lex.template-multiple2', () => {
	let old = jsHtml.allowHashTemplates;
	jsHtml.allowHashTemplates = true;

	let code = '#{this.$one} # #{this.$two} # #{this.three}';

	let tokens = lex(jsHtml, code, 'template');
	assertEquals(tokens, ['#{this.$one}', ' # ', '#{this.$two}', ' # ', '#{this.three}']);

	jsHtml.allowHashTemplates = old;
});

Deno.test('lex.template-misc', () => {
	let code = '${`<div>${this.one}#${this.two}#${this.three}</div>`}';

	let tokens = lex(jsHtml, code, 'template');
	console.log(tokens); // TODO
});



Deno.test('lex.template-script-tag', () => {
	let code = '${var a=`<script>var b=1<3</script>`}';
	let tokens = lex(jsHtml, code, 'template');

	let js = tokens[0].tokens;
	assertEquals(js, ['${', 'var', ' ', 'a', '=', '`<script>var b=1<3</script>`', '}']);

	let template = js[5].tokens;
	assertEquals(template, ['`', '<script>', 'var b=1<3', '</script>', '`']);


	let js2 = template[2].tokens;
	assertEquals(js2, ['var', ' ', 'b', '=', '1', '<', '3']);


	//console.log(tokens[0].tokens[1].tokens.tokens); // TODO

});

Deno.test('lex.template-script-tag2', () => {
	let code = '${`<div>${var a=`<script>var b=1<3</script>`}</div>`}';

	let tokens = lex(jsHtml, code, 'template');
	console.log(tokens.tokens); // TODO

});

Deno.test('lex.regex', () => {
	let code = 'a=/^\\/(\\\\\\\\|\\\\\\/|\\[\\^\\/]|\\[[^]]]|[^/])+\\/[agimsx]*/';
	let tokens = lex(jsHtml, code, 'js');
	assertEquals(tokens, ['a', '=', '/^\\/(\\\\\\\\|\\\\\\/|\\[\\^\\/]|\\[[^]]]|[^/])+\\/[agimsx]*/']);
	assertEquals(tokens[2].type, 'regex');
});

Deno.test('lex.regex2', () => {
	let code = `/[/]+/g; b='/'`;
	let tokens = lex(jsHtml, code, 'js');
	assertEquals(tokens, ['/[/]+/g', ';', ' ', 'b', '=', "'/'"]);
	assertEquals(tokens[0].type, 'regex');
});

Deno.test('lex.html-self-closing', () => {
	let code = '<img/>';

	let tokens = lex(jsHtml, code, 'html');
	assertEquals(tokens[0].tokens, ['<img', '/>']);
	assertEquals(tokens[0].tokens.map(t=>t.type), ['openTag', 'tagEnd']);
	assertEquals(tokens[0].tokens.map(t=>t.mode), ['tag', 'tag']);
});

Deno.test('lex.html-comment', () => {
	let code = '<div><!-- \r\ncomment --></div>';

	let tokens = lex(jsHtml, code, 'html');

	assertEquals(tokens, ['<div>', '<!-- \r\ncomment -->', '</div>']);
	assertEquals(tokens.map(t=>t.type), ['openTag', 'comment', 'closeTag']);
	assertEquals(tokens.map(t=>t.mode), ['html', 'html', 'html']);
});

Deno.test('lex.comment-expr', () => {
	let code = '`<div><!-- ${a} --></div>`';

	let tokens = lex(jsHtml, code, 'js');

	assertEquals(tokens[0].tokens[2].tokens, ['<!--', ' ', '${a}', ' ', '-->']);
	assertEquals(tokens[0].tokens[2].tokens.map(t=>t.type), ['comment', 'commentBody', 'expr', 'commentBody', 'commentEnd']);
});

Deno.test('lex.attr', () => {
	let code = '<div a="${one}" b="#{two}" ${three} #{four}></div>';

	let old = lexHtmlJs.allowHashTemplates;
	lexHtmlJs.allowHashTemplates = true;
	let tokens = lex(jsHtml, code, 'template');
	lexHtmlJs.allowHashTemplates = old;

	console.log(tokens[0]);

	assertEquals(tokens[0].tokens[4].tokens[1].tokens, ['${', 'one', '}']);
	assertEquals(tokens[0].tokens[8].tokens[1].tokens, ['#{', 'two', '}']);
	assertEquals(tokens[0].tokens[10].tokens, ['${', 'three', '}']);
	assertEquals(tokens[0].tokens[12].tokens, ['#{', 'four', '}']);

	// assertEquals(tokens[0].tokens[2].tokens, ['<!--', ' ', '${a}', ' ', '-->']);
	// assertEquals(tokens[0].tokens[2].tokens.map(t=>t.type), ['comment', 'commentBody', 'expr', 'commentBody', 'commentEnd']);
});

// console.error( 'Oops, something went wrong!' );
// console.error( 'Please, report the following error on https://github.com/ckeditor/ckeditor5/issues with the build id and the error stack trace:' );
// console.warn( 'Build id: hhtn6uwszmtw-2t2n2eo10ccs' );
Deno.test('lex.unclosed-tag', () => {
	let code = `<p>text`;

	let tokens = lex(jsHtml, code, 'html');

	assertEquals(tokens, ['<p>', 'text']);
	assertEquals(tokens.map(t=>t.type), ['openTag', 'text']);
});

Deno.test('lex.unclosed-comment', () => {
	let code = `<!--text`;

	let tokens = lex(jsHtml, code, 'html');

	assertEquals(tokens, ['<!--text']);
	assertEquals(tokens[0].tokens, ['<!--', 'text']);
	assertEquals(tokens[0].tokens.map(t=>t.type), ['comment', 'commentBody']);
});

Deno.test('lex.badHtml1', () => {
	let code = "a = `Template <${3}>`;";
	let tokens = lex(htmljs, code, 'js');
	console.log(tokens);
});

Deno.test('lex.badHtml2', () => {

	let code = "a = `Template <$3}>`;";
	let tokens = lex(htmljs, code, 'js');
	console.log(tokens); // TODO


});

Deno.test('lex.badHtml3', () => {
	let code = "a = `Template <${3>`;";
	let tokens = lex(htmljs, code, 'js');
	console.log(tokens); // TODO
});

Deno.test('lex.php', () => {
	var code = `<?php print 1?-->`;
	let tokens = lex(htmljs, code, 'html');
	assertEquals(tokens, ['<?php print 1?-->']);
	assertEquals(tokens[0].type, 'text');


});

