import { referencedSnippetNames, splitTop } from './split';
import type { ComposerConfig } from './types';

/**
 * True when an abbreviation uses something only Templet can expand — a dialect
 * keyword or a configured snippet.
 *
 * This gates the editor suggestion. VS Code's built-in Emmet already offers
 * completions for plain abbreviations wherever `emmet.includeLanguages` maps a
 * language to HTML, so suggesting `div.card` again would just double up. What Emmet
 * cannot offer is anything involving `if`, `for` or a Templet snippet, and that is
 * what earns a suggestion of our own.
 */
export function involvesTemplet(
	abbr: string,
	dialectName: string,
	config: ComposerConfig,
): boolean {
	const keywords = config.dialects[dialectName] ?? {};
	const snippets = config.snippets;
	const isSnippet = (name: string) => snippets[name] !== undefined;

	for (const chain of splitTop(abbr, '|')) {
		for (const raw of splitTop(chain, '>')) {
			const segment = raw.trim();
			if (segment.length === 0) {
				continue;
			}

			const colon = segment.indexOf(':');
			const head = colon === -1 ? segment : segment.slice(0, colon);
			if (keywords[head] !== undefined || isSnippet(segment)) {
				return true;
			}
			// Catches a snippet nested inside a segment, e.g. `h2+image`.
			if (referencedSnippetNames(segment, isSnippet).length > 0) {
				return true;
			}
		}
	}

	return false;
}
