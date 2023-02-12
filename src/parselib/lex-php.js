import {functionize} from "./lex-tools.js";

var lexPhp = {
	notPhp: {
		php: code => {
			for (let tag of ['<?=', '<?php', '<?'])
				if (code.startsWith(tag))
					return [tag, 'php'];
		},
		notPhp: /^[\s\S]+?(?=<\?|$)/
	},

	php: {
		phpClose: code => {
			if (code.startsWith('?>'))
				return ['?>', -1]
		},
		whitespace: /^[ \t\v\f\xa0]+/,
		ln: /^\r?\n/,
		comment: /^\/\/.*(?=\r?\n)|^\/\*[\s\S]*?\*\//,
		octal: /^0o?[01234567]+/,
		hex: /^0x[0-9a-f]+/i, // Must occur before number.
		number: /^-?[_\d]*\.?[_\d]+(e\d+)?/, // Must occur before . operator.
		operator: ('@ and or xor && || & | ^ ~ >> << ... .= . -> ??= ?? ?: ? : <> <=> === !== == != ' +
			'>= <= > < ++ -- +- -= *= /= %= ** + - * / % = ! ( ) [ ] { } , ;').split(' '),
		variable: /^\$[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*/,
		keyword: ('__halt_compiler abstract array as break callable case catch class clone const continue ' +
			'declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval ' +
			'exit extends final finally fn for foreach function global goto if implements include include_once ' +
			'instanceof insteadof interface isset list match namespace new print private protected public readonly ' +
			'require require_once return static switch throw trait try unset use var while yield from').split(' '),
		identifier: /^[a-z_\x7f-\xff][a-z0-9_\x7f-\xff]*/i,
		string: /^"(\\\\|\\"|[^"])*"|^'(\\\\|\\'|[^'])*'/,
		unknown: /^[\S]+?(?=\?>|\s)/
	}
};

// Convert everything to a function.
functionize(lexPhp);

export default lexPhp;