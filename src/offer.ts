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
): Promise<AbbreviationOffer | undefined> {
	const found = extract(document.lineAt(position.line).text, position.character);
	if (!found?.abbreviation) {
		return undefined;
	}

	const config = await configs.get(document);
	const dialect = dialectFor(document, config);
	// Template languages only, so a snippet named `card` cannot surface in a .ts file.
	if (!config.dialects[dialect]) {
		return undefined;
	}

	const settings = vscode.workspace.getConfiguration('templet', document.uri);
	if (
		!involvesTemplet(found.abbreviation, dialect, config) &&
		!settings.get<boolean>('suggestPlainEmmet', false)
	) {
		return undefined;
	}

	let expanded: string;
	try {
		expanded = compose(found.abbreviation, dialect, config);
	} catch {
		// Half-typed abbreviations are the normal case here.
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
