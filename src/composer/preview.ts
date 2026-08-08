import { compose } from './compose';
import { toPlainText } from './snippet';
import type { ComposeOptions, ComposerConfig } from './types';

/**
 * Renders what an abbreviation would insert, as plain text with placeholders
 * shown in place of tabstops. Used for the live preview under the input box,
 * where partial abbreviations are the normal case, so failures come back as
 * `null` rather than throwing.
 */
/**
 * Stands in for the selection when previewing a wrap.
 *
 * Wrapping a large block would otherwise render the whole of it into a small UI,
 * burying the one thing the preview exists to show: the shape being wrapped around
 * it.
 */
export const SELECTION_PLACEHOLDER = '…selected text…';

/** Caps a preview so a long expansion stays readable in a small UI. */
export function capLines(text: string, maxLines: number): string {
	const lines = text.split('\n');
	if (lines.length <= maxLines) {
		return text;
	}
	const hidden = lines.length - maxLines;
	return [...lines.slice(0, maxLines), `… ${hidden} more line${hidden === 1 ? '' : 's'}`].join('\n');
}

export function preview(
	abbr: string,
	dialectName: string,
	config: ComposerConfig,
	options: ComposeOptions = {},
): string | null {
	if (abbr.trim().length === 0) {
		return null;
	}
	try {
		return toPlainText(compose(abbr, dialectName, config, options));
	} catch {
		return null;
	}
}
