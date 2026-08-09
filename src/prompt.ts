import * as vscode from 'vscode';
import { capLines, preview, SELECTION_PLACEHOLDER } from './composer';
import type { ComposerConfig } from './composer';

/** Keeps the input box's own preview inside the space VS Code gives it. */
const MAX_PREVIEW_LINES = 24;

export type PreviewMode = 'editor' | 'input' | 'off';

/** Where the expansion ends if `text` is inserted at `start`. */
function endOf(start: vscode.Position, text: string): vscode.Position {
	const lines = text.split('\n');
	return lines.length === 1
		? start.translate(0, text.length)
		: new vscode.Position(start.line + lines.length - 1, lines[lines.length - 1].length);
}

/** Indents continuation lines to sit under the line the expansion starts on. */
function indentBlock(text: string, indent: string): string {
	if (!indent) {
		return text;
	}
	return text
		.split('\n')
		.map((line, i) => (i === 0 || line.length === 0 ? line : indent + line))
		.join('\n');
}

/**
 * Shows the expansion in the document itself while the abbreviation is being typed,
 * putting it back if the prompt is dismissed.
 *
 * A popup can only render the preview as reflowed, unhighlighted text. Writing it
 * into the editor means it is syntax-coloured and indented in place, which is the
 * only way to see what wrapping a real block will actually look like.
 */
class DocumentPreview {
	/** The range the preview currently occupies, if one is showing. */
	private applied: vscode.Range | undefined;
	/** The input box fires changes faster than edits complete, so edits are serialised. */
	private queue: Promise<unknown> = Promise.resolve();
	private readonly indent: string;

	constructor(
		private readonly editor: vscode.TextEditor,
		private readonly origin: vscode.Range,
		private readonly original: string,
	) {
		const line = editor.document.lineAt(origin.start.line).text;
		this.indent = /^[ \t]*/.exec(line)?.[0] ?? '';
	}

	private enqueue(task: () => Promise<void>): Promise<void> {
		const next = this.queue.then(task, task);
		this.queue = next.catch(() => undefined);
		return next;
	}

	show(text: string): Promise<void> {
		return this.enqueue(async () => {
			await this.restore();
			await this.write(indentBlock(text, this.indent));
		});
	}

	/** Puts the original text back. Safe to call when nothing is showing. */
	revert(): Promise<void> {
		return this.enqueue(() => this.restore());
	}

	private async write(text: string): Promise<void> {
		const applied = await this.editor.edit((builder) => builder.replace(this.origin, text), {
			undoStopBefore: false,
			undoStopAfter: false,
		});
		if (applied) {
			this.applied = new vscode.Range(this.origin.start, endOf(this.origin.start, text));
		}
	}

	private async restore(): Promise<void> {
		const range = this.applied;
		if (!range) {
			return;
		}
		// Cleared first so a failed edit cannot leave us trying to revert twice.
		this.applied = undefined;
		await this.editor.edit((builder) => builder.replace(range, this.original), {
			undoStopBefore: false,
			undoStopAfter: false,
		});
	}
}

export interface PromptOptions {
	dialect: string;
	config: ComposerConfig;
	indent: string;
	/** The text being wrapped, empty when expanding at the caret. */
	selection: string;
	mode: PreviewMode;
}

/**
 * Asks for an abbreviation, previewing the expansion as it is typed.
 *
 * In `editor` mode the preview is written into the document and reverted when the
 * prompt closes, so accepting is just a matter of replacing it with the real
 * snippet — which keeps the tabstops live.
 */
export async function promptForAbbreviation(
	editor: vscode.TextEditor,
	options: PromptOptions,
): Promise<string | undefined> {
	const { dialect, config, indent, selection, mode } = options;
	const origin = new vscode.Range(editor.selection.start, editor.selection.end);
	const livePreview =
		mode === 'editor' ? new DocumentPreview(editor, origin, selection) : undefined;

	const inputPreviewOptions = {
		indent,
		// Rendering a large selection into the box would bury the shape being
		// wrapped around it under its own text.
		selection: selection ? SELECTION_PLACEHOLDER : undefined,
	};

	const abbreviation = await new Promise<string | undefined>((resolve) => {
		const box = vscode.window.createInputBox();
		box.title = selection ? `Templet — wrap selection (${dialect})` : `Templet (${dialect})`;
		box.prompt = 'Abbreviation';

		let accepted: string | undefined;

		box.onDidChangeValue((value) => {
			if (mode === 'off') {
				return;
			}
			if (livePreview) {
				// The real selection, since the point is seeing your own content wrapped.
				const expanded = value.trim()
					? preview(value, dialect, config, { indent, selection })
					: null;
				void livePreview.show(expanded === null ? selection : expanded);
				return;
			}
			const rendered = preview(value, dialect, config, inputPreviewOptions);
			box.validationMessage = rendered
				? {
						message: capLines(rendered, MAX_PREVIEW_LINES),
						severity: vscode.InputBoxValidationSeverity.Info,
					}
				: undefined;
		});
		box.onDidAccept(() => {
			accepted = box.value;
			box.hide();
		});
		box.onDidHide(() => {
			box.dispose();
			resolve(accepted);
		});

		box.show();
	});

	// Always put the document back, whether accepted or cancelled: what goes in on
	// accept is the snippet, so that the tabstops are live.
	await livePreview?.revert();

	if (!abbreviation?.trim()) {
		return undefined;
	}
	return abbreviation;
}

/** The range an accepted expansion should replace. */
export function targetRange(editor: vscode.TextEditor): vscode.Range {
	return new vscode.Range(editor.selection.start, editor.selection.end);
}
