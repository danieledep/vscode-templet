import * as vscode from 'vscode';
import { extract } from 'emmet';
import { AbbreviationError, compose, involvesTemplet } from './composer';
import { promptForAbbreviation, targetRange, type PreviewMode } from './prompt';
import { ConfigCache, dialectFor } from './config';
import { abbreviationOffer } from './offer';
import { AbbreviationCompletionProvider, TRIGGER_CHARACTERS } from './suggest';
import { InlinePreviewProvider } from './inline';

/**
 * The indentation the composer should emit. VS Code re-indents snippet text on
 * insert, but matching the editor up front keeps the live preview honest.
 */
function indentUnitFor(editor: vscode.TextEditor): string {
	if (editor.options.insertSpaces !== true) {
		return '\t';
	}
	const tabSize = typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 4;
	return ' '.repeat(tabSize);
}

function report(error: unknown, output: vscode.OutputChannel): void {
	if (error instanceof AbbreviationError) {
		void vscode.window.showErrorMessage(`Templet: ${error.message}`);
		return;
	}
	const reason = error instanceof Error ? error.stack ?? error.message : String(error);
	output.appendLine(reason);
	void vscode.window.showErrorMessage('Templet: expansion failed. See the Templet output channel.');
}

/** Surfaces configuration mistakes once, without blocking the expansion. */
function reportProblems(problems: string[], output: vscode.OutputChannel): void {
	if (problems.length === 0) {
		return;
	}
	for (const problem of problems) {
		output.appendLine(`config: ${problem}`);
	}
	void vscode.window.showWarningMessage(
		`Templet: ${problems.length} configuration problem(s). See the Templet output channel.`,
	);
}

async function expandCommand(configs: ConfigCache, output: vscode.OutputChannel): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const config = await configs.get(editor.document);
	const dialect = dialectFor(editor.document, config);
	const selection = editor.document.getText(editor.selection);
	const indent = indentUnitFor(editor);
	const mode = vscode.workspace
		.getConfiguration('templet', editor.document.uri)
		.get<PreviewMode>('preview', 'editor');

	// Captured before the prompt, which moves the selection while previewing.
	const range = targetRange(editor);
	const abbr = await promptForAbbreviation(editor, { dialect, config, indent, selection, mode });
	if (!abbr) {
		return;
	}

	try {
		const expanded = compose(abbr, dialect, config, {
			indent,
			selection: selection || undefined,
		});
		await editor.insertSnippet(new vscode.SnippetString(expanded), range);
	} catch (error) {
		report(error, output);
	}
}

/**
 * Expands the abbreviation immediately before the caret, the way Emmet's own
 * expand works. Emmet's extractor finds the boundary, so it stops at whitespace —
 * arguments containing spaces need the input box instead.
 */
async function expandInlineCommand(
	configs: ConfigCache,
	output: vscode.OutputChannel,
): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const caret = editor.selection.active;
	const line = editor.document.lineAt(caret.line).text;
	const found = extract(line, caret.character);
	if (!found) {
		void vscode.window.showInformationMessage('Templet: no abbreviation before the cursor.');
		return;
	}

	const config = await configs.get(editor.document);
	const range = new vscode.Range(caret.line, found.start, caret.line, found.end);
	try {
		const snippet = new vscode.SnippetString(
			compose(found.abbreviation, dialectFor(editor.document, config), config, {
				indent: indentUnitFor(editor),
			}),
		);
		await editor.insertSnippet(snippet, range);
	} catch (error) {
		report(error, output);
	}
}

/**
 * Reports why Templet is or is not active in the current file.
 *
 * "Nothing happens" has several plausible causes — the language maps to no dialect,
 * snippets are unconfigured, suggestions are switched off, the abbreviation uses
 * nothing Templet handles — and they are indistinguishable from the outside. This
 * prints all of them at once.
 */
async function diagnoseCommand(configs: ConfigCache, output: vscode.OutputChannel): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	const lines = ['=== Templet diagnostics ==='];

	if (!editor) {
		lines.push('No active editor.');
		output.appendLine(lines.join('\n'));
		output.show(true);
		return;
	}

	const document = editor.document;
	const config = await configs.get(document);
	const dialect = dialectFor(document, config);
	const keywords = config.dialects[dialect];
	const settings = vscode.workspace.getConfiguration('templet', document.uri);
	const suggest = settings.get<boolean>('suggest', true);
	const plainEmmet = settings.get<boolean>('suggestPlainEmmet', false);

	lines.push(`file:          ${document.uri.fsPath}`);
	lines.push(`languageId:    ${document.languageId}`);
	lines.push(
		`dialect:       ${dialect}${keywords ? '' : '   <-- unknown, so keywords are unavailable here'}`,
	);
	lines.push(`keywords:      ${keywords ? Object.keys(keywords).sort().join(' ') : 'none'}`);
	const snippetNames = Object.keys(config.snippets).sort();
	lines.push(
		`snippets:      ${snippetNames.length > 0 ? snippetNames.join(' ') : 'none (templet.snippets is empty)'}`,
	);
	const inlinePreview = settings.get<boolean>('inlinePreview', false);
	lines.push(`templet.suggest:       ${suggest}${plainEmmet ? '  (including plain Emmet)' : ''}`);
	lines.push(`templet.inlinePreview: ${inlinePreview}`);
	if (!suggest && !inlinePreview) {
		lines.push('  <-- both off: typing does nothing, abbreviations fall through to Emmet');
	}

	let declined: string | undefined;
	const offer = await abbreviationOffer(document, editor.selection.active, configs, (reason) => {
		declined = reason;
	});
	lines.push(`offered here:  ${offer ? 'yes' : `no — ${declined ?? 'unknown'}`}`);

	const caret = editor.selection.active;
	const found = extract(document.lineAt(caret.line).text, caret.character);
	if (!found?.abbreviation) {
		lines.push('abbreviation:  none before the cursor');
	} else {
		const templet = involvesTemplet(found.abbreviation, dialect, config);
		lines.push(`abbreviation:  ${found.abbreviation}`);
		lines.push(`  uses a keyword or snippet: ${templet}`);
		lines.push(`  would be suggested:        ${!!keywords && suggest && (templet || plainEmmet)}`);
		try {
			const expanded = compose(found.abbreviation, dialect, config);
			lines.push('  expands to:');
			lines.push(
				expanded
					.split('\n')
					.map((line) => `    ${line}`)
					.join('\n'),
			);
		} catch (error) {
			lines.push(`  does not expand: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	output.appendLine(lines.join('\n'));
	output.show(true);
}

/**
 * Warns when configuration has switched off every in-editor entry point.
 *
 * With both off, typing an abbreviation does nothing and it falls through to
 * built-in Emmet, which expands `if>div.red` to a literal `<if>` tag. That looks
 * like Templet misbehaving rather than Templet being switched off, so it is worth
 * saying out loud.
 */
function warnIfSilenced(): void {
	const settings = vscode.workspace.getConfiguration('templet');
	if (settings.get<boolean>('suggest', true) || settings.get<boolean>('inlinePreview', false)) {
		return;
	}
	void vscode.window
		.showWarningMessage(
			'Templet: both "templet.suggest" and "templet.inlinePreview" are off, so typing an abbreviation in the editor does nothing — it falls through to built-in Emmet.',
			'Open settings',
		)
		.then((choice) => {
			if (choice) {
				void vscode.commands.executeCommand('workbench.action.openSettings', 'templet.suggest');
			}
		});
}

export function activate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel('Templet');
	const configs = new ConfigCache((problems) => reportProblems(problems, output));

	warnIfSilenced();

	context.subscriptions.push(
		output,
		configs,
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('templet')) {
				warnIfSilenced();
			}
		}),
		vscode.commands.registerCommand('templet.expand', () => expandCommand(configs, output)),
		vscode.commands.registerCommand('templet.expandInline', () =>
			expandInlineCommand(configs, output),
		),
		vscode.commands.registerCommand('templet.diagnose', () => diagnoseCommand(configs, output)),
		// Registered for every file rather than a fixed language list, so a dialect
		// added through `templet.languages` works without reloading the window. The
		// provider bails immediately for languages that have no dialect.
		vscode.languages.registerCompletionItemProvider(
			[{ scheme: 'file' }, { scheme: 'untitled' }],
			new AbbreviationCompletionProvider(configs, output),
			...TRIGGER_CHARACTERS,
		),
		// Ghost text in the editor itself, rather than in the suggest widget.
		vscode.languages.registerInlineCompletionItemProvider(
			[{ scheme: 'file' }, { scheme: 'untitled' }],
			new InlinePreviewProvider(configs),
		),
	);
}

export function deactivate(): void {
	// Nothing to tear down; disposables are owned by the extension context.
}
