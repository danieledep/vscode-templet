/**
 * Abbreviation tokenizing.
 *
 * Templet owns the outer structure of an abbreviation and hands the HTML-looking
 * parts to Emmet, so splitting has to respect the places Emmet allows arbitrary
 * text: `[]` attributes, `{}` text content, `()` groups and quoted strings.
 */

/**
 * Splits on `sep` where it appears at bracket depth zero and outside quotes.
 * Parts are returned unmodified — keyword arguments carry significant whitespace,
 * so trimming is left to the caller.
 */
export function splitTop(abbr: string, sep: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let current = '';

	for (const ch of abbr) {
		if (quote) {
			if (ch === quote) {
				quote = null;
			}
			current += ch;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			current += ch;
			continue;
		}
		// Groups count here: splitting `(div>p)+span` on the inner `>` would tear
		// the group in half.
		if (ch === '[' || ch === '{' || ch === '(') {
			depth++;
		} else if (ch === ']' || ch === '}' || ch === ')') {
			depth = Math.max(0, depth - 1);
		}
		if (ch === sep && depth === 0) {
			parts.push(current);
			current = '';
			continue;
		}
		current += ch;
	}

	parts.push(current);
	return parts;
}

/** Element and snippet names. */
const NAME = /^[a-zA-Z_][a-zA-Z0-9_:-]*/;

/**
 * Characters after which an element name may begin. A name following `.` or `#`
 * is a class or id, so it is not a snippet reference.
 */
const NAME_POSITION = '>+^(,';

/**
 * Characters that may follow a snippet name. Anything else (`.`, `#`, `[`, `{`)
 * means the author is customising the element, which a snippet body cannot
 * express, so the name is left for Emmet to resolve.
 */
const NAME_TERMINATOR = '>+^*),';

/**
 * Replaces references to named snippets inside an Emmet abbreviation with unique
 * placeholder element names, so Emmet builds the tree and the bodies are grafted
 * in afterwards.
 *
 * This is what lets a snippet appear anywhere in a segment — `h2+image`,
 * `image*3`, `div>(h2+image)` — instead of only at a segment boundary. Because
 * the substitution happens before Emmet sees the abbreviation, a user snippet
 * also shadows the built-in Emmet snippet of the same name.
 */
export function substituteSnippetNames(
	abbr: string,
	isSnippet: (name: string) => boolean,
	placeholderFor: (name: string) => string,
): string {
	let out = '';
	// Only attributes and text content are literal; `()` is structural, and names
	// inside a group are real names.
	let literalDepth = 0;
	let quote: string | null = null;
	let i = 0;

	while (i < abbr.length) {
		const ch = abbr[i];

		if (quote) {
			if (ch === quote) {
				quote = null;
			}
			out += ch;
			i++;
			continue;
		}
		if (literalDepth > 0 && (ch === '"' || ch === "'")) {
			quote = ch;
			out += ch;
			i++;
			continue;
		}
		if (ch === '[' || ch === '{') {
			literalDepth++;
			out += ch;
			i++;
			continue;
		}
		if (ch === ']' || ch === '}') {
			literalDepth = Math.max(0, literalDepth - 1);
			out += ch;
			i++;
			continue;
		}

		const atNamePosition = i === 0 || NAME_POSITION.includes(abbr[i - 1]);
		if (literalDepth > 0 || !atNamePosition) {
			out += ch;
			i++;
			continue;
		}

		const match = NAME.exec(abbr.slice(i));
		if (!match) {
			out += ch;
			i++;
			continue;
		}

		const name = match[0];
		const after = abbr[i + name.length];
		const terminated = after === undefined || NAME_TERMINATOR.includes(after);
		out += terminated && isSnippet(name) ? placeholderFor(name) : name;
		i += name.length;
	}

	return out;
}
