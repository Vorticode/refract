import {descendIf, ascendIf, functionize} from "./lex-tools.js";
import Utils from './utils.js';
/**
 * Grammar for html/js code, including js templates.
 *
 * Known bugs
 * 1. Javascript regex to match regex tokens might not be perfect.  Since no regex can match all regexes?
 *    We need a function here instead.
 * 2. Lex parses out html elements inside comments inside css and javascript.  When it should just be one big block of text.
 */
{
	let lastTag = null; // Last tag name we descended into.

	let braceDepth = 0;
	let braceStack = []; // Keep track of the brace depth in outer demplates.
	let templateDepth = 0;
	let whitespace = /^[ \t\v\f\xa0]+/;
	let ln = /^\r?\n/
	let tagStart = /^<!?([\w\xA0-\uFFFF:-]+)/i; // \w includes underscore
	let closeTag = /^<\/[\w\xA0-\uFFFF:-]+\s*>/i;

	let operator = (
		'&& || => ' +                 // Logic / misc operators
		'<<= >>= &= ^= |= &&= ||= ' +   // Assignment operators
		'& | ^ ~ >>> << >> ' +          // Bitwise operators
		'=== !=== == != >= > <= < ' +   // Comparison operators
		'= **= += -= *= /= %= ??= ' +   // Assignment operators 2
		'++ -- ** + - * / % ' +         // Arithmetic operators
		', ... . ( ) [ ] ?. ? : !'		// Other operators
	).split(/ /g);

	let operatorMap = {};
	for (let op of operator) // Used to speed up operator search.
		operatorMap[op[0]] = [...(operatorMap[op[0]]||[]), op];


	//let svg = /^<svg[\S\s]*?<\/svg>/;

	// Functions re-used below:
	let expr = code => {
		if (code[1] !== '{') // Fast reject
			return;

		if ((lexHtmlJs.allowHashTemplates && code.startsWith('#{')) || code.startsWith('${')) {
			if (templateDepth <= 0)
				templateDepth = 1;
			braceStack.push(braceDepth);
			braceDepth = 0;
			return [
				code.slice(0, 2),
				'js' // Go from template mode into javascript
			];
		}
	}

	let templateEnd = code => {
		if (code[0] === '`') {
			--templateDepth;
			braceDepth = braceStack.pop();
			return ['`', -1];
		}
	};

	let tagCommon = { // html open tag
		attribute: /^[\-_$\w\xA0-\uFFFF:]+/i,
		string: code =>
			descendIf("'", 'squote')(code) ||
			descendIf('"', 'dquote')(code)
		,
		equals: '=',
		tagEnd: code => {
			if (code[0] === '>')
				return ['>', -1]; // exit tag mode
			if (code.startsWith('/>'))
				return ['/>', -1]; // exit tag mode.
		},
	};

	// Check previous token to see if we've just entered a script tag.
	let script = (code, prev, tokens) => {
		let lastToken = tokens[tokens.length-1];
		if (lastTag === 'script' && lastToken && lastToken.tokens && lastToken.tokens[lastToken.tokens.length-1] == '>')
			return ['', 'js'];
	};

	// null true false Infinity NaN undefined globalThis // <-- These will be parsed as identifiers, which is fine.
	let keyword = `await break case catch class constructor const continue debugger default delete do enum else export extends
				finally for function if implements import in instanceof interface let new package private protected public
				return static super switch this throw try typeof var void while with yield`.trim().split(/\s+/g);

	// let keywordMap = {};
	// for (let kw of keyword) // Used to speed up keyword search.
	// 	keywordMap[kw[0]] = [...(keywordMap[kw[0]]||[]), kw];


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
			comment: /^\/\/.*(?=\r?\n)|^\/\*[\s\S]*?\*\//,
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
					} catch (e) {}
				}

			},
			hex: /^0x[0-9a-f]+/, // Must occur before number.
			number: /^-?\d*\.?\d+(e\d+)?/, // Must occur before . operator.
			// These are not included as keywords b/c they're also valid identifier names:  constructor, from
			identifier: code => {
				let result = (code.match(/^[_$a-z\xA0-\uFFFF][_$\w\xA0-\uFFFF]*/i) || [])[0] // variables, labels, other things?
				if (!keyword.includes(result))
					return [result];
			},
			template: code => { // go into a template
				if (code[0] === '`') {
					++templateDepth;
					braceStack.push(braceDepth);
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
					if (braceDepth === 0 && templateDepth) {
						braceDepth = braceStack.pop();
						return ['}', -1] // pop out of js mode, back to tempate mode.
					}
					braceDepth--;
					return ['}']; // just match
				}
			},
			semicolon: ';',
			keyword,
			operator,
			string: /^"(\\\\|\\"|[^"])*"|^'(\\\\|\\'|[^'])*'/
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
			templateEnd,

			// Continue until end of text.
			// supports both ${} and #{} template expressions.
			text: code => {
				let regex = lexHtmlJs.allowHashTemplates // https://stackoverflow.com/a/977294
						? /^(?:\\#{|\\\${|\s|(?!(#{|\${|`|<[\w\xA0-\uFFFF!:/-]|$)).)+/
						: /^(?:\\\${|\s|(?!(\${|`|<[\w\xA0-\uFFFF!:/-]|$)).)+/;

				let matches = code.match(regex);
				if (matches) {
					let result = matches[0];
					result = Utils.unescapeTemplate_(result);
					//result = Object.assign(result, {originalLength: matches[0].length});
					// if (result.length !== matches[0].length)
					// 	debugger;
					return [result, undefined, matches[0].length];
				}
			}
		},
		// Comment within a `template` tag.
		templateComment: { // Like htmlComment, but allows expressions.
			expr,
			commentEnd: ascendIf('-->'),
			commentBody: code => [code.match(
				lexHtmlJs.allowHashTemplates
					? /^[\s\S]+?(?=-->|[$#]{|$)/
					: /^[\s\S]+?(?=-->|\${|$)/) || []][0],
		},
		tag: {
			whitespace: /^[ \r\n\t\v\f\xa0]+/,
			...tagCommon
		},
		templateTag: { // html tag within template.
			whitespace: code => { // TODO: Why do we have the double-escaped versions?
				let matches = code.match(/^( |\r|\n|\t|\v|\f|\xa0|\\r|\\n|\\t|\\v|\\f|\\xa0)+/);
				if (matches) {
					let result = matches[0];
					result = Utils.unescapeTemplate_(result);
					//result = Object.assign(result, {originalLength: matches[0].length});
					return [result, undefined, matches[0].length];
				}
			},
			expr,
			templateEnd, // A ` quote to end the template.
			...tagCommon,
		},
		// TODO: template end with `
		squote: { // single quote string within tag.  Used for both js strings and html attributes.
			expr,
			quote: ascendIf("'"),
			text: code => [code.match(
				lexHtmlJs.allowHashTemplates
				? /^(?:\\'|(?!'|#{|\${)[\S\s])+/
				: /^(?:\\'|(?!'|\${)[\S\s])+/) || []][0]
		},

		dquote: { // double quote string within tag.
			expr,
			quote: ascendIf('"'),
			text: code => [code.match(
				lexHtmlJs.allowHashTemplates
				? /^(?:\\"|(?!"|#{|\${)[\S\s])+/
				: /^(?:\\"|(?!"|\${)[\S\s])+/) || []][0]
		},

		// TODO: css?


		// Options:

		// Allow for {...} templates inside js template strings, instead of just ${}
		// Setting this true can cause problems in parsing css, since {} surrounds the rules.
		// Perhaps add a css mode?
		allowHashTemplates: false,
	};

	// Convert everything to a function.
	functionize(lexHtmlJs);

	// A fast lookup table based on starting characters.
	// Be careful not to suggest a pattern that must come after another pattern.
	// E.g. all js.identifier would also match js.keyword
	// This isn't finished.
	lexHtmlJs.fastMatch = {
		html: {
			'<': {
				'/': [lexHtmlJs.html, 'closeTag'],
				'a-z0-9': [lexHtmlJs.html, 'openTag'],
				'!': [lexHtmlJs.html, 'comment'],
			},
			'a-z0-9 \t\r\n': [lexHtmlJs.html, 'text']
		},

		tag: {
			'a-z0-9': [lexHtmlJs.tag, 'attribute'],
			' \t\r\n': [lexHtmlJs.tag, 'whitespace'],
			'"': [lexHtmlJs.tag, 'string'],
			"'": [lexHtmlJs.tag, 'string'],
			">": [lexHtmlJs.tag, 'tagEnd'],
			"/": {
				'>': [lexHtmlJs.tag, 'tagEnd']
			},
			'=': [lexHtmlJs.tag, 'equals'],
		},
		dquote: {
			'"': [lexHtmlJs.dquote, 'quote'],
			'a-z0-9 \t.()[]/': [lexHtmlJs.dquote, 'text'],
			'$#': [lexHtmlJs.dquote, 'expr'],
		},
		js: {
			' \t\v\f\xa0': [lexHtmlJs.js, 'whitespace'],
			'=&|^!+-*%,.()[]?!>:': [lexHtmlJs.js, 'operator'], // omits "/" b/c it can also be regex.  Omits < b/c it can also be close tag.
			'\r\n' : [lexHtmlJs.js, 'ln'],
			';': [lexHtmlJs.js, 'semicolon'],
			'/' : {
				'/*':  [lexHtmlJs.js, 'comment'],
			},
			'{': [lexHtmlJs.js, 'brace1'],
			'}': [lexHtmlJs.js, 'brace2'],
			'a-z$_': [lexHtmlJs.js, 'identifier'],
			'0-9': [lexHtmlJs.js, 'number'],
			'\'"': [lexHtmlJs.js, 'string'],
			'`': [lexHtmlJs.js, 'template'],
		},
		template: {
			//'a-z0-9 ': [lexHtmlJs.template, 'text'], // Can't work because the slow version does a look-behind to see if we're in a script tag.
			'`': [lexHtmlJs.template, 'templateEnd'],
			'$#': [lexHtmlJs.template, 'expr'],
			'<': {
				'a-z': [lexHtmlJs.template, 'openTag'],
				'/': [lexHtmlJs.template, 'closeTag'],
				'!': [lexHtmlJs.template, 'comment']
			}
		},
		templateTag: {
			'$': [lexHtmlJs.templateTag, 'expr']
		},
		templateComment: {
			'-': [lexHtmlJs.templateComment, 'commentEnd'],
			'a-z0-9\t\r\n ': [lexHtmlJs.templateComment, 'commentBody']
		}
	}; // end fastMatch object.

	lexHtmlJs.fastMatch.templateTag = lexHtmlJs.fastMatch.tag;

	/**
	 * Expand the lookup rules such as a-z and 0-9, in place. */
	function expandFastMatch_(obj) {
		for (let name in obj) {
			if (!obj[name].length) // not an array, recurse:
				expandFastMatch_(obj[name]);

			if (name.length > 1) {
				let originalName = name;

				if (name.includes('a-z')) {
					for (let letter of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
						obj[letter] = obj[originalName];
					name = name.replace('a-z', '');
				}
				if (name.includes('0-9')) {
					for (let letter of '0123456789')
						obj[letter] = obj[originalName];
					name = name.replace('0-9', '');
				}

				if (name.length > 1)
					for (let letter of name)
						obj[letter] = obj[originalName];

				delete obj[originalName];
			}
		}
		Object.freeze(obj); // Theoretically makes it faster, but benchmarking doesn't show this.

	}
	for (let name in lexHtmlJs.fastMatch)
		expandFastMatch_(lexHtmlJs.fastMatch[name]);

	Object.freeze(lexHtmlJs.fastMatch);



} // end scope

export default lexHtmlJs;