/**
 * A template-language keyword, e.g. Liquid's `if` or Blade's `@foreach`.
 *
 * `open` and `close` are VS Code snippet syntax: they may carry tabstops of
 * their own, so a literal dollar sign has to be written `\$`. The token
 * `${arg}` marks where the keyword's argument goes.
 */
export interface KeywordDef {
	open: string;
	close: string;
	/** Placeholder text when the abbreviation supplies no argument. */
	defaultArg?: string;
	/**
	 * Branch keywords (`else`, `elsif`, `when`) continue an enclosing block
	 * rather than opening one of their own, so they have no `close`.
	 */
	branch?: boolean;
}

/** The keyword table for one template language. */
export type Dialect = Record<string, KeywordDef>;

export interface ComposerConfig {
	/** Dialect name -> keyword table. */
	dialects: Record<string, Dialect>;
	/** VS Code language id -> dialect name. */
	languages: Record<string, string>;
	/** Snippet name -> snippet body. */
	snippets: Record<string, string>;
}

export interface ComposeOptions {
	/** One indentation level. Defaults to a tab, which VS Code re-indents on insert. */
	indent?: string;
	/** Text to nest at the innermost position, typically the editor selection. */
	selection?: string;
}
