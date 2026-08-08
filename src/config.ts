import * as vscode from 'vscode';
import { BUILTIN_DIALECTS, BUILTIN_LANGUAGES } from './composer';
import type { ComposerConfig, Dialect, KeywordDef } from './composer';

/** Shape of the workspace `templet.json`. */
interface FileConfig {
	keywords?: unknown;
	snippets?: unknown;
	languages?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keeps only string-valued entries, reporting the rest. */
function stringMap(value: unknown, where: string, problems: string[]): Record<string, string> {
	if (value === undefined) {
		return {};
	}
	if (!isRecord(value)) {
		problems.push(`${where} should be an object.`);
		return {};
	}
	const out: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry === 'string') {
			out[key] = entry;
		} else {
			problems.push(`${where}.${key} should be a string.`);
		}
	}
	return out;
}

function keywordDef(value: unknown, where: string, problems: string[]): KeywordDef | null {
	if (!isRecord(value) || typeof value.open !== 'string') {
		problems.push(`${where} needs an "open" string.`);
		return null;
	}
	const def: KeywordDef = {
		open: value.open,
		close: typeof value.close === 'string' ? value.close : '',
	};
	if (typeof value.defaultArg === 'string') {
		def.defaultArg = value.defaultArg;
	}
	if (value.branch === true) {
		def.branch = true;
	}
	// A keyword with no close tag only makes sense as a branch.
	if (!def.close && !def.branch) {
		problems.push(`${where} has no "close", so it is treated as a branch keyword.`);
		def.branch = true;
	}
	return def;
}

function dialectMap(value: unknown, where: string, problems: string[]): Record<string, Dialect> {
	if (value === undefined) {
		return {};
	}
	if (!isRecord(value)) {
		problems.push(`${where} should be an object keyed by dialect.`);
		return {};
	}
	const out: Record<string, Dialect> = {};
	for (const [dialect, keywords] of Object.entries(value)) {
		if (!isRecord(keywords)) {
			problems.push(`${where}.${dialect} should be an object keyed by keyword.`);
			continue;
		}
		const table: Dialect = {};
		for (const [keyword, raw] of Object.entries(keywords)) {
			const def = keywordDef(raw, `${where}.${dialect}.${keyword}`, problems);
			if (def) {
				table[keyword] = def;
			}
		}
		out[dialect] = table;
	}
	return out;
}

/** Layers keyword tables, merging keyword-by-keyword so overlays can add or replace one. */
function mergeDialects(layers: Record<string, Dialect>[]): Record<string, Dialect> {
	const out: Record<string, Dialect> = {};
	for (const layer of layers) {
		for (const [name, table] of Object.entries(layer)) {
			out[name] = { ...(out[name] ?? {}), ...table };
		}
	}
	return out;
}

async function readFileConfig(
	folder: vscode.WorkspaceFolder | undefined,
	relativePath: string,
	problems: string[],
): Promise<FileConfig> {
	if (!folder || !relativePath) {
		return {};
	}
	const uri = vscode.Uri.joinPath(folder.uri, relativePath);
	let raw: Uint8Array;
	try {
		raw = await vscode.workspace.fs.readFile(uri);
	} catch {
		// Absent is the normal case, not a problem worth reporting.
		return {};
	}
	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
		if (!isRecord(parsed)) {
			problems.push(`${relativePath} should contain a JSON object.`);
			return {};
		}
		return parsed as FileConfig;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		problems.push(`${relativePath} is not valid JSON (${reason}). Comments are not supported.`);
		return {};
	}
}

/**
 * Builds the effective configuration for a document.
 *
 * Three layers, each winning over the last: the built-in dialects, the user's
 * `templet.*` settings, and the workspace config file. Reading happens once per
 * command rather than being cached, so an edit to `templet.json` takes effect on
 * the next expansion.
 */
export async function resolveConfig(
	document: vscode.TextDocument,
	problems: string[] = [],
): Promise<ComposerConfig> {
	const settings = vscode.workspace.getConfiguration('templet', document.uri);
	const folder = vscode.workspace.getWorkspaceFolder(document.uri);
	const file = await readFileConfig(
		folder,
		settings.get<string>('configFile', 'templet.json'),
		problems,
	);

	return {
		dialects: mergeDialects([
			BUILTIN_DIALECTS,
			dialectMap(settings.get('keywords'), 'templet.keywords', problems),
			dialectMap(file.keywords, 'templet.json keywords', problems),
		]),
		languages: {
			...BUILTIN_LANGUAGES,
			...stringMap(settings.get('languages'), 'templet.languages', problems),
			...stringMap(file.languages, 'templet.json languages', problems),
		},
		snippets: {
			...stringMap(settings.get('snippets'), 'templet.snippets', problems),
			...stringMap(file.snippets, 'templet.json snippets', problems),
		},
	};
}

/**
 * Picks the dialect for a document. An unmapped language falls back to its own id,
 * so defining a dialect named after the language is enough to wire it up.
 */
export function dialectFor(document: vscode.TextDocument, config: ComposerConfig): string {
	return config.languages[document.languageId] ?? document.languageId;
}

/**
 * Caches the resolved configuration per workspace folder.
 *
 * The completion provider resolves configuration on every keystroke, which cannot
 * mean re-reading `templet.json` from disk each time. Entries are dropped when the
 * settings change, when the config file changes, or when the folder layout changes,
 * so an edit still takes effect immediately.
 */
export class ConfigCache implements vscode.Disposable {
	private readonly entries = new Map<string, Promise<ComposerConfig>>();
	private readonly listeners: vscode.Disposable[] = [];
	private watchers: vscode.FileSystemWatcher[] = [];

	constructor(private readonly onProblems: (problems: string[]) => void) {
		this.listeners.push(
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('templet')) {
					this.refresh();
				}
			}),
			vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
		);
		this.watch();
	}

	get(document: vscode.TextDocument): Promise<ComposerConfig> {
		const folder = vscode.workspace.getWorkspaceFolder(document.uri);
		const key = folder?.uri.toString() ?? '';

		let cached = this.entries.get(key);
		if (!cached) {
			const problems: string[] = [];
			cached = resolveConfig(document, problems).then((config) => {
				this.onProblems(problems);
				return config;
			});
			this.entries.set(key, cached);
		}
		return cached;
	}

	/** Watches each folder's config file. Only the cache is dropped on a change. */
	private watch(): void {
		for (const folder of vscode.workspace.workspaceFolders ?? []) {
			const name = vscode.workspace
				.getConfiguration('templet', folder.uri)
				.get<string>('configFile', 'templet.json');
			if (!name) {
				continue;
			}
			const watcher = vscode.workspace.createFileSystemWatcher(
				new vscode.RelativePattern(folder, name),
			);
			const clear = () => this.entries.clear();
			watcher.onDidChange(clear);
			watcher.onDidCreate(clear);
			watcher.onDidDelete(clear);
			this.watchers.push(watcher);
		}
	}

	/** Rebuilds watchers as well, since the configured file name may have changed. */
	private refresh(): void {
		this.entries.clear();
		for (const watcher of this.watchers) {
			watcher.dispose();
		}
		this.watchers = [];
		this.watch();
	}

	dispose(): void {
		for (const disposable of [...this.listeners, ...this.watchers]) {
			disposable.dispose();
		}
	}
}
