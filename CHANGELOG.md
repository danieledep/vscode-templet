# Changelog

## Unreleased

- Tag the suggestion's preview with HTML when the document language has no grammar, so a `.liquid` file opened as plain text still gets a syntax-coloured preview instead of flat grey text.

- Preview the expansion as **ghost text in the editor** while typing, accepted with `Tab`, via an inline completion provider. The suggestion list could only show the expansion in its details pane, which VS Code keeps collapsed. Toggle with `templet.inlinePreview`.
- Share the extraction, gating and expansion between the suggestion and the inline preview so the two cannot disagree about when Templet acts.

- Resolve the dialect from the file extension when the language id maps to nothing, so `.liquid`, `.twig`, `.njk`, `.erb` and `.blade.php` work even with no dedicated language extension installed (VS Code reports those files as plain text).
- Add **Templet: Diagnose Current File**, reporting the resolved dialect, available keywords and snippets, suggestion state, and what the abbreviation before the cursor expands to.
- Fix `npm test` on Node 20: glob expansion in `node --test` arguments requires Node 22, so the runner now searches the compiled output directory instead.
- Set `noEmitOnError` so a build with type errors fails the pre-launch task rather than emitting JavaScript that fails at activation.

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
