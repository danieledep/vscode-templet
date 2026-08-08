import * as vscode from 'vscode';
import { abbreviationOffer } from './offer';
import type { ConfigCache } from './config';

/**
 * Renders the expansion as ghost text in the editor itself, under the abbreviation
 * you are typing, accepted with `Tab`.
 *
 * The suggestion list can only show the expansion in its details pane, which is
 * collapsed by default. This puts the preview in the code where you are looking.
 * `editor.inlineSuggest.enabled` is on by default, so it needs no setup.
 *
 * Note that VS Code hides inline suggestions while the suggest widget is open. With
 * both on you see the completion item; turn `templet.suggest` off to leave only the
 * ghost text, or set `editor.suggest.preview` to preview the highlighted suggestion
 * inline instead.
 */
export class InlinePreviewProvider implements vscode.InlineCompletionItemProvider {
	constructor(private readonly configs: ConfigCache) {}

	async provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): Promise<vscode.InlineCompletionItem[] | undefined> {
		const settings = vscode.workspace.getConfiguration('templet', document.uri);
		if (!settings.get<boolean>('inlinePreview', true)) {
			return undefined;
		}

		const offer = await abbreviationOffer(document, position, this.configs);
		if (!offer) {
			return undefined;
		}

		// A SnippetString keeps the tabstops live when the preview is accepted, so
		// Tab lands on the condition exactly as the other entry points do.
		return [
			new vscode.InlineCompletionItem(new vscode.SnippetString(offer.expanded), offer.range),
		];
	}
}
