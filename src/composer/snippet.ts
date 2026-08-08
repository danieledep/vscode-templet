/**
 * VS Code snippet-syntax utilities.
 *
 * Every layer of an expansion contributes tabstops: Emmet emits them for empty
 * elements and attributes, user snippets ship their own, and keyword arguments
 * become one each. They all have to land in a single sequence numbered in
 * document order, which means parsing snippet syntax rather than regex-replacing
 * it — placeholders nest (`${1:${2:x}}`) and transforms carry braces
 * (`${1/(.*)/${1:/upcase}/}`).
 */

/** Escapes text so it survives insertion as snippet syntax verbatim. */
export function escapeSnippet(text: string): string {
	return text.replace(/[\\$}]/g, '\\$&');
}

interface Tabstop {
	/** Index of the `$`. */
	start: number;
	/** Index just past the tabstop. */
	end: number;
	num: number;
	/** `${1:x}` rather than `$1`. */
	braced: boolean;
	/** For braced tabstops, everything after the digits and before the closing brace. */
	rest: string;
}

/**
 * Finds the top-level tabstops in `text`, left to right. Tabstops nested inside a
 * placeholder are not returned; recurse into `rest` to reach them.
 */
function scanTabstops(text: string): Tabstop[] {
	const found: Tabstop[] = [];
	let i = 0;

	while (i < text.length) {
		const ch = text[i];
		if (ch === '\\') {
			i += 2;
			continue;
		}
		if (ch !== '$') {
			i++;
			continue;
		}

		if (text[i + 1] === '{') {
			let depth = 1;
			let j = i + 2;
			while (j < text.length && depth > 0) {
				if (text[j] === '\\') {
					j += 2;
					continue;
				}
				if (text[j] === '{') {
					depth++;
				} else if (text[j] === '}') {
					depth--;
				}
				j++;
			}
			if (depth !== 0) {
				// Unbalanced: leave it alone rather than guessing.
				i++;
				continue;
			}
			const inner = text.slice(i + 2, j - 1);
			const digits = /^\d+/.exec(inner);
			if (digits) {
				found.push({
					start: i,
					end: j,
					num: Number(digits[0]),
					braced: true,
					rest: inner.slice(digits[0].length),
				});
			}
			i = j;
			continue;
		}

		const digits = /^\d+/.exec(text.slice(i + 1));
		if (digits) {
			found.push({
				start: i,
				end: i + 1 + digits[0].length,
				num: Number(digits[0]),
				braced: false,
				rest: '',
			});
			i = i + 1 + digits[0].length;
			continue;
		}
		i++;
	}

	return found;
}

type TabstopVisitor = (stop: Tabstop, recurse: (text: string) => string) => string;

/** Rewrites each top-level tabstop through `visit`, which may recurse into placeholders. */
function transformTabstops(text: string, visit: TabstopVisitor): string {
	const stops = scanTabstops(text);
	if (stops.length === 0) {
		return text;
	}

	const recurse = (inner: string) => transformTabstops(inner, visit);
	let out = '';
	let cursor = 0;
	for (const stop of stops) {
		out += text.slice(cursor, stop.start);
		out += visit(stop, recurse);
		cursor = stop.end;
	}
	return out + text.slice(cursor);
}

function render(num: number, stop: Tabstop, recurse: (text: string) => string): string {
	return stop.braced ? `\${${num}${recurse(stop.rest)}}` : `$${num}`;
}

/**
 * Rewrites every tabstop number in `text` through `map`, recursing into nested
 * placeholders. Returning the same number twice keeps those tabstops mirrored,
 * which is why user snippets are remapped by original number rather than by
 * occurrence.
 */
export function mapTabstops(text: string, map: (num: number) => number): string {
	return transformTabstops(text, (stop, recurse) => render(map(stop.num), stop, recurse));
}

/** Replaces every tabstop numbered `target` with literal `replacement`. */
export function replaceTabstop(text: string, target: number, replacement: string): string {
	return transformTabstops(text, (stop, recurse) =>
		stop.num === target ? replacement : render(stop.num, stop, recurse),
	);
}

/**
 * Replaces the final tabstop with `replacement`, but only when it carries no
 * placeholder text.
 *
 * This claims the deepest empty spot Emmet produced as the caret position rather
 * than injecting one — Emmet already knows where a tree's holes are, and an
 * abbreviation like `p{text}` has none. A tabstop *with* a placeholder is a hint
 * worth keeping (`alt="${4:alt}"` beats `alt="$0"`), so it is left alone and the
 * caret falls at the end of the snippet instead. Only the final tabstop is
 * considered: claiming an earlier one would send the caret backwards.
 */
export function replaceLastBareTabstop(text: string, replacement: string): string {
	let total = 0;
	const count: TabstopVisitor = (stop, recurse) => {
		total++;
		return render(stop.num, stop, recurse);
	};
	transformTabstops(text, count);
	if (total === 0) {
		return text;
	}

	let seen = 0;
	return transformTabstops(text, (stop, recurse) => {
		seen++;
		return seen === total && stop.rest === '' ? replacement : render(stop.num, stop, recurse);
	});
}

/** True if `text` contains a tabstop numbered `num`. */
export function hasTabstop(text: string, num: number): boolean {
	let found = false;
	transformTabstops(text, (stop, recurse) => {
		if (stop.num === num) {
			found = true;
		}
		return render(stop.num, stop, recurse);
	});
	return found;
}

/**
 * Renumbers every tabstop into 1..n by order of appearance, so tabbing through
 * the result follows the document. `$0` is the final stop and keeps its number.
 */
export function renumberInDocumentOrder(text: string): string {
	const seen = new Map<number, number>();
	let next = 1;
	return mapTabstops(text, (num) => {
		if (num === 0) {
			return 0;
		}
		const already = seen.get(num);
		if (already !== undefined) {
			return already;
		}
		const assigned = next++;
		seen.set(num, assigned);
		return assigned;
	});
}

/** Renders snippet syntax as the plain text it would insert, for previews. */
export function toPlainText(text: string): string {
	const bare = transformTabstops(text, (stop, recurse) =>
		// `${1:placeholder}` previews as its placeholder; a bare `$1` as nothing.
		stop.rest.startsWith(':') ? recurse(stop.rest.slice(1)) : '',
	);
	return bare.replace(/\\([\\$}])/g, '$1');
}
