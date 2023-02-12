/**
 * Grammar for php code.
 * This is separate from lex-htmljs because php tags can occor anywhere in the code.
 * So it's best to parse the php sections, splice together the remaining "nonphp" sections, and lex them with the lex-htmljs grammar.
 */

import {descendIf, ascendIf} from "../parselib/lex-tools.js";

var lexPhp = {


	nonPhp: {
		php: [
			descendIf(/<?php/i, 'php'),
			descendIf('<?=', 'php')
		],
		nonphp: /^[\s\S]*?(?=<?php|<?=|$)/i
	},

	php: {
		whitespace: /^[ \t\v\f\xa0\r\n]+/,
		semicolon: ';',
		brace: ['{', '}'],
		bracket: ['[', ']'],
		parent: ['(', ')'],

		// TODO: Make case insensitive.
		constant: '__CLASS__|__DIR__|__FILE__|__FUNCTION__|__LINE__|__METHOD__|__NAMESPACE__|__TRAIT__'.split('|'),


		// TODO: What if code ends inside a string.
		// TODO: Parse vars from strings?
		stringS: /^'[^'\\]*(?:\\.[^'\\]*)*'/,
		stringD: /^"[^"\\]*(?:\\.[^"\\]*)*"/,

		end: ascendIf('?>'),
		variable: /\$\s+/,
		number: /^-?^[\d_]*\.?\d*/,
		bool: /^true|^false/i,
		comma: ',',
		scope: ['::', '->', '=>'],

		// TODO: aNd and other cases of letter operators:
		operator: '===|!==|<=>|\*\*=|<<=|>>=|and|or|xor|\*\*|\+\+|--|<<|>>|<=|>=|==|&&|\|\||\?\?|\+=|-=|\*=|\/=|\.=|%=|&\|\|=|^=|[\*\/%!+-\.&<>&^\|\?:=|@]'.split('|'), // http://php.net/manual/en/language.operators.precedence.php

		comment: /^\/\*[\s\S]*?\*\/|\/\/.*?(?=\?>)|\/\/.*?(?=[\r\n])|#.*?(?=\?>)|#.*?(?=[\r\n])/m,
		keywords: ('__halt_compiler|abstract|array|as|break|callable|case|catch|class|clone|const|continue|declare|' +
			'default|die|do|echo|else|elseif|empty|end|declare|endfor|endforeach|endif|endswitch|endwhile|eval|exit|' +
			'extends|final|finally|for|foreach|function|global|goto|if|implements|include_once|include|instanceof|' +
			'insteadof|interface|isset|list|namespace|new|print|private|protected|public|require_once|require|return|' +
			'static|switch|throw|trait|try|unset|use|var|while|yield').split('|'),

		identifier: /^[_$a-z\xA0-\uFFFF][_$\w\xA0-\uFFFF]*/i, // variables, labels, other things?
		unknown: /^./
	},

	phpDString: {

	}


}