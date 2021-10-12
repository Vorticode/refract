import {descendIf, ascendIf} from "./lex-tools.js";

/**
 * Grammar for html/js code, including js templates.
 *
 * Known bugs
 * 1. Javascript regex to match regex tokens might not be perfect.  Since no regex can match all regexes?
 *    We need a function here instead.
 */
{
	let lastTag = null; // Last tag name we descended into.

	let braceDepth = 0;
	let templateDepth = 0;
	let whitespace = /^[ \t\v\f\xa0]+/;
	let ln = /^\r?\n/
	let tagStart = /^<!?([\-_\w\xA0-\uFFFF]+)/i;
	let closeTag = /^<\/[\-_$\w\xA0-\uFFFF]+\s*>/i;

	// Functions re-used below:
	let expr = code => {
		if ((lexHtmlJs.allowHashTemplates && code.startsWith('#{')) || code.startsWith('${')) {
			if (templateDepth <= 0)
				templateDepth = 1;
			braceDepth = 0;
			return [
				code.slice(0, 2),
				'js'
			];
		}
	}

	let template = code => {
		if (code[0] === '`') {
			--templateDepth;
			return ['`', -1];
		}
	};

	let tag = { // html open tag
		attribute: /^[\-_$\w\xA0-\uFFFF]+/i,
		string: [
			descendIf("'", 'squote'),
			descendIf( '"', 'dquote')
		],
		equals: '=',
		tagEnd: code => {
			//let ret = lastTag === 'script' ? 'js' : -1;

			if (code[0] === '>')
				return ['>', -1];
			if (code.startsWith('/>'))
				return ['/>', -1];
		},
		whitespace: [whitespace, ln],

		unknown: code => lexHtmlJs.allowUnknownTagTokens
			? [code.match(/^\w+|\S/) || []][0] // Don't fail on unknown stuff in html tags.
			: undefined,
	};

	// Check previous token to see if we've just entered a script tag.
	let script = (code, prev, tokens) => {
		let lastToken = tokens[tokens.length-1];
		if (lastTag === 'script' && lastToken && lastToken.tokens && lastToken.tokens[lastToken.tokens.length-1] == '>')
			return ['', 'js'];
	};

	let value = 'null true false Infinity NaN undefined globalThis'.split(/ /g);
	let keyword = `
				await break case catch class constructor const continue debugger default delete do enum else export extends
				finally for function if implements import in instanceof interface let new package private protected public
				return static super switch this throw try typeof var void while with yield`.trim().split(/\s+/g);


	// Tokens that can occur before a regex.
	// https://stackoverflow.com/a/27120110
	let regexBefore =
		`{ ( [ . ; , < > <= >= == != === !== + - * % << >> >>> & | ^ ! ~ && || ? : = += -= *= %= <<= >>= >>>= &= |= ^= /=`
		.split(/ /g);

	/**
	 * A grammar for parsing js and html within js templates, for use with lex.js. */
	var lexHtmlJs = {

		js: {
			whitespace,
			ln, // Separate from whitespace because \n can be used instead of semicolon to separate js statements.
			semicolon: ';',
			comment: [/^\/\/.*(?=\r?\n)/, /^\/\*[\s\S]*?\*\//],
			template: code => {
				if (code[0] === '`') {
					++templateDepth;
					braceDepth = 0;
					return ['`', 'template'];
				}
			},
			brace1: code => {
				if (code[0] === '{') {
					braceDepth++;
					return ['{']
				}
			},
			brace2: code => {
				if (code[0] === '}') {
					if (braceDepth === 0 && templateDepth)
						return ['}', -1] // pop out of js mode, back to tempate mode.
					braceDepth--;
					return ['}']; // just match
				}
			},
			hex: /^0x[0-9a-f]+/i, // Must occur before number.
			number: /^\d*\.?\d+(e\d+)?/, // Must occur before . operator.

			end: code => code.startsWith('</script>') ? ['', -1] : undefined,

			// Can't use a regex to parse a regex, so instead we look for pairs of matching / and see if
			// the part in between can be passed to new RegExp().
			// 1. http://stackoverflow.com/questions/172303
			// 2. http://stackoverflow.com/questions/5519596
			// Matches \\ \/ [^/] [...]
			regex: (code, prev, tokens) => {
				if (code[0] !== '/')
					return;

				if (tokens.length) { // If the / is the first token, it can be a regex.
					let prevToken;
					for (let i = tokens.length - 1; i >= 0; i--)
						if (tokens[i].type !== 'ln' && tokens[i].type !== 'whitespace' && tokens[i].type !== 'comment') {
							prevToken = tokens[i] + '';
							break;
						}
					if (!regexBefore.includes(prevToken))
						return;
				}

				let nextSlash = 1;
				while(1) {
					nextSlash = code.indexOf('/', nextSlash+1);
					if (nextSlash === -1)
						return;

					try {
						let piece = code.slice(0, nextSlash+1);
						new RegExp(piece.slice(1, -1)); // without the slashes
						let suffix = code.slice(piece.length).match(/^[agimsx]*/)[0];
						return [piece + suffix]; // is a valid regex.
					} catch (e) {
					}
				}

			},

			operator: (
				'&& || ! => ' +                 // Logic / misc operators
				'<<= >>= &= ^= |= &&= ||= ' +   // Assignment operators
				'& | ^ ~ >>> << >> ' +          // Bitwise operators
				'=== !=== == != >= > <= < ' +   // Comparison operators
				'= **= += -= *= /= %= ??= ' +   // Assignment operators 2
				'++ -- ** + - * / % ' +         // Arithmetic operators
				', ... . ( ) [ ] ? :'			// Other operators
			).split(/ /g),
			// These are not included as keywords b/c they're also valid identifier names:  constructor, from
			identifier: code => {
				let result = (code.match(/^[_$a-z\xA0-\uFFFF][_$\w\xA0-\uFFFF]*/i) || [])[0] // variables, labels, other things?
				if (!keyword.includes(result) && !value.includes(result))
					return [result];
			},
			value,
			keyword,
			string: [/^"(\\\\|\\"|[^"])*"/, /^'(\\\\|\\'|[^'])*'/],
		},
		html: { // top level html not within javascript.  No other modes go to this mode.
			script,
			comment: descendIf('<!--', 'htmlComment'),
			closeTag,
			openTag: descendIf(tagStart, 'tag', match => lastTag = match[1]),
			text: /^[\s\S]+?(?=<|$)/,
		},
		htmlComment: {
			commentEnd: ascendIf('-->'),
			commentBody: /^[\s\S]+?(?=-->|$)/,
		},

		template: { // template within javascript
			script,
			expr,
			comment: descendIf('<!--', 'templateComment'),
			closeTag,
			openTag: descendIf(tagStart, 'templateTag', match => lastTag = match[1]),
			template,

			// Continue until end of text.
			// supports both ${} and #{} template expressions.
			text: code => [code.match(
				lexHtmlJs.allowHashTemplates  // (?<!\\) is a negative lookbehind to make sure the ${ isn't preceded by an escape \
					? /^[\s\S]+?(?=<|`|(?<!\\)\${|(?<!\\)#{|(?=$))/
					: /^[\s\S]+?(?=<|`|(?<!\\)\${|(?=$))/) || []][0],
		},

		// Comment within a `template` tag.
		templateComment: { // Like htmlComment, but allows expressions.
			expr,
			commentEnd: ascendIf('-->'),
			commentBody: code => [code.match(
				lexHtmlJs.allowHashTemplates
					? /^[\s\S]+?(?=-->|\${|#{|$)/
					: /^[\s\S]+?(?=-->|\${|$)/) || []][0],
		},
		tag,

		templateTag: { // html tag within template.
			expr,
			template, // A ` quote to end the template.
			...tag,
		},

		// TODO: template end with `
		squote: { // single quote string within tag
			expr,
			quote: ascendIf("'"),
			text: /^[\s\S]+?(?=(?<!\\)\${|(?<!\\\$?){|<|`|')/,
		},

		dquote: { // double quote string within tag.
			expr,
			quote: ascendIf('"'),
			text: /^[\s\S]+?(?=(?<!\\)\${|(?<!\\\$?){|<|`|")/,
		},

		// TODO: css?


		// Options:

		// Allow for {...} templates inside js template strings, instead of just ${}
		// Setting this true can cause problems in parsing css, since {} surrounds the rules.
		// Perhaps add a css mode?
		allowHashTemplates: false,
		allowUnknownTagTokens: false
	};
}

export default lexHtmlJs;