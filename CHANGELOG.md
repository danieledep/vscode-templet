# Changelog

## Unreleased

- Preview expansions as you type in the editor, via a completion item whose details pane shows the expanded markup — the same shape as Emmet's own abbreviation completion. Gated to abbreviations using a keyword or snippet so it does not duplicate Emmet's suggestions; widen it with `templet.suggestPlainEmmet`, or disable it with `templet.suggest`.
- Resolved configuration is cached per workspace folder and invalidated on settings, config-file and folder changes, since the suggestion path resolves it on every keystroke.

## 0.1.0

Initial release.

- Compose template-language keywords, plain Emmet and user snippets in one abbreviation.
- `>` nests, `:` passes a keyword argument, `|` starts an `else`/`elsif` branch.
- Wrap the current selection as the innermost content.
- Live preview of the expansion while typing in the input box.
- Inline expansion of the abbreviation before the caret.
- Built-in dialects: Liquid, Twig, Jinja, Nunjucks, Blade, Handlebars, ERB.
- Keywords, snippets and language mappings configurable in `settings.json` or a workspace `templet.json`.
