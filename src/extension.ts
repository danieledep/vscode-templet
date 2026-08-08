import * as vscode from 'vscode';
import { extract } from 'emmet';
import { AbbreviationError, compose, involvesTemplet, preview } from './composer';
import type { ComposerConfig } from './composer';
import { ConfigCache, dialectFor } from './config';
import { AbbreviationCompletionProvider, TRIGGER_CHARACTERS } from './suggest';

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

/**
 * Asks for an abbreviation, previewing the expansion under the box as it is typed.
 *
 * The preview goes in `validationMessage` at Info severity: it is the one place
 * VS Code will render arbitrary text under an input box without blocking accept.
 */
function promptForAbbreviation(
	dialect: string,
	config: ComposerConfig,
	options: { indent: string; selection?: string },
	showPreview: boolean,
): Promise<string | undefined> {
	return new Promise((resolve) => {
		const box = vscode.window.createInputBox();
		box.title = options.selection ? `Templet — wrap selection (${dialect})` : `Templet (${dialect})`;
		box.prompt = 'Abbreviation';
		box.placeholder = 'if>div.card#hero>image';

		let accepted: string | undefined;

		box.onDidChangeValue((value) => {
			if (!showPreview) {
				return;
			}
			const rendered = preview(value, dialect, config, options);
			box.validationMessage = rendered
				? { message: rendered, severity: vscode.InputBoxValidationSeverity.Info }
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
	const options = { indent: indentUnitFor(editor), selection: selection || undefined };
	const showPreview = vscode.workspace.getConfiguration('templet').get<boolean>('preview', true);

	const abbr = await promptForAbbreviation(dialect, config, options, showPreview);
	if (!abbr?.trim()) {
		return;
	}

	try {
		const snippet = new vscode.SnippetString(compose(abbr, dialect, config, options));
		await editor.insertSnippet(snippet);
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
	lines.push(`suggest:       ${suggest}${plainEmmet ? ' (including plain Emmet)' : ''}`);

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

export function activate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel('Templet');
	const configs = new ConfigCache((problems) => reportProblems(problems, output));

	context.subscriptions.push(
		output,
		configs,
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
			new AbbreviationCompletionProvider(configs),
			...TRIGGER_CHARACTERS,
		),
	);
}

export function deactivate(): void {
	// Nothing to tear down; disposables are owned by the extension context.
}
