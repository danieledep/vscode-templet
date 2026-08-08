import * as vscode from 'vscode';
import { extract } from 'emmet';
import { compose, involvesTemplet, toPlainText } from './composer';
import { dialectFor, type ConfigCache } from './config';

/**
 * Characters that end an abbreviation token but continue the abbreviation. VS Code
 * only opens the suggest widget by itself on word characters, so without these you
 * would lose the preview the moment you typed `>`.
 */
export const TRIGGER_CHARACTERS = ['>', '+', '^', '*', '.', '#', ':', '|', ')', ']', '}'];

/**
 * Offers the expansion of the abbreviation before the caret as a completion, with
 * the expanded markup rendered in the details pane — the same shape as Emmet's own
 * abbreviation completion.
 */
export class AbbreviationCompletionProvider implements vscode.CompletionItemProvider {
	constructor(private readonly configs: ConfigCache) {}

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): Promise<vscode.CompletionItem[] | undefined> {
		const settings = vscode.workspace.getConfiguration('templet', document.uri);
		if (!settings.get<boolean>('suggest', true)) {
			return undefined;
		}

		const line = document.lineAt(position.line).text;
		const found = extract(line, position.character);
		if (!found?.abbreviation) {
			return undefined;
		}

		const config = await this.configs.get(document);
		const dialect = dialectFor(document, config);
		// Only template languages get suggestions, so snippets cannot leak into a
		// .ts file that happens to contain the word `card`.
		if (!config.dialects[dialect]) {
			return undefined;
		}

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

		const item = new vscode.CompletionItem(found.abbreviation, vscode.CompletionItemKind.Snippet);
		item.detail = 'Templet';
		item.documentation = new vscode.MarkdownString().appendCodeblock(
			toPlainText(expanded),
			document.languageId,
		);
		item.insertText = new vscode.SnippetString(expanded);
		// Replace the whole abbreviation, never past the caret.
		item.range = new vscode.Range(
			position.line,
			found.start,
			position.line,
			Math.min(found.end, position.character),
		);
		// VS Code filters on the text from the range start to the caret, which is the
		// abbreviation itself — including characters it would not treat as a word.
		item.filterText = found.abbreviation;
		item.sortText = '0';
		item.preselect = true;
		return [item];
	}
}
