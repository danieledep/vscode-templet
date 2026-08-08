import * as vscode from 'vscode';
import { extract } from 'emmet';
import { compose, involvesTemplet } from './composer';
import { dialectFor, type ConfigCache } from './config';

export interface AbbreviationOffer {
	abbreviation: string;
	/** VS Code snippet syntax, with live tabstops. */
	expanded: string;
	/** The text the expansion replaces. */
	range: vscode.Range;
}

/**
 * Finds the abbreviation before `position` and expands it, or returns undefined
 * when there is nothing Templet should offer.
 *
 * Shared by the suggestion and the inline preview so the two can never disagree
 * about when Templet is willing to act.
 */
export async function abbreviationOffer(
	document: vscode.TextDocument,
	position: vscode.Position,
	configs: ConfigCache,
	/** Receives the reason when nothing is offered, for the diagnostic. */
	declined?: (reason: string) => void,
): Promise<AbbreviationOffer | undefined> {
	const found = extract(document.lineAt(position.line).text, position.character);
	if (!found?.abbreviation) {
		declined?.('no abbreviation found before the cursor');
		return undefined;
	}

	const config = await configs.get(document);
	const dialect = dialectFor(document, config);
	// Template languages only, so a snippet named `card` cannot surface in a .ts file.
	if (!config.dialects[dialect]) {
		declined?.(`"${dialect}" is not a known dialect, so Templet stays out of this file`);
		return undefined;
	}

	const settings = vscode.workspace.getConfiguration('templet', document.uri);
	if (
		!involvesTemplet(found.abbreviation, dialect, config) &&
		!settings.get<boolean>('suggestPlainEmmet', false)
	) {
		declined?.(
			`"${found.abbreviation}" uses no keyword or snippet, so it is left to Emmet (see templet.suggestPlainEmmet)`,
		);
		return undefined;
	}

	let expanded: string;
	try {
		expanded = compose(found.abbreviation, dialect, config);
	} catch (error) {
		// Half-typed abbreviations are the normal case here.
		declined?.(`does not expand: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}

	return {
		abbreviation: found.abbreviation,
		expanded,
		range: new vscode.Range(
			position.line,
			found.start,
			position.line,
			// Never replace past the caret.
			Math.min(found.end, position.character),
		),
	};
}
