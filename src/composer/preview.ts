import { compose } from './compose';
import { toPlainText } from './snippet';
import type { ComposeOptions, ComposerConfig } from './types';

/**
 * Renders what an abbreviation would insert, as plain text with placeholders
 * shown in place of tabstops. Used for the live preview under the input box,
 * where partial abbreviations are the normal case, so failures come back as
 * `null` rather than throwing.
 */
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
