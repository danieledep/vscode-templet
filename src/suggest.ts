import * as vscode from 'vscode';
import { toPlainText } from './composer';
import { abbreviationOffer } from './offer';
import type { ConfigCache } from './config';

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
 *
 * The details pane is collapsed until you press `Ctrl+Space` or click the chevron;
 * `InlinePreviewProvider` puts the same preview in the editor instead.
 */
/**
 * Language to tag the fenced preview with.
 *
 * A `.liquid` file with no language extension installed arrives as `plaintext`, and
 * VS Code has no grammar for that, so the preview renders as flat uncoloured text.
 * Every supported dialect embeds HTML, so that is the useful fallback — the markup
 * gets highlighted even when the template tags do not.
 */
function fenceLanguage(document: vscode.TextDocument): string {
	const language = document.languageId;
	return language === 'plaintext' || language === 'plain' ? 'html' : language;
}

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

		const offer = await abbreviationOffer(document, position, this.configs);
		if (!offer) {
			return undefined;
		}

		const item = new vscode.CompletionItem(offer.abbreviation, vscode.CompletionItemKind.Snippet);
		item.detail = 'Templet';
		item.documentation = new vscode.MarkdownString().appendCodeblock(
			toPlainText(offer.expanded),
			fenceLanguage(document),
		);
		item.insertText = new vscode.SnippetString(offer.expanded);
		item.range = offer.range;
		// VS Code filters on the text from the range start to the caret, which is the
		// abbreviation itself — including characters it would not treat as a word.
		item.filterText = offer.abbreviation;
		item.sortText = '0';
		item.preselect = true;
		return [item];
	}
}
