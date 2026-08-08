# Templet

Emmet-style abbreviations that compose **template-language keywords**, **plain Emmet** and **your own snippets** in a single expression.

Type this in a `.liquid` file:

```
if>div.card#hero>image
```

and get:

```liquid
{% if ${1:condition} %}
	<div class="card" id="hero"><img src="${2:src}" alt="${3:alt}" loading="lazy"></div>
{% endif %}
```

Tabstops are live, so you tab through `condition` → `src` → `alt` exactly like native Emmet.

## Why

Existing templating extensions give you syntax highlighting and a flat list of snippets. Their "Emmet support" is just `"emmet.includeLanguages": {"twig": "html"}`, which teaches Emmet nothing about `if` or `for`. Tag-wrapping extensions only wrap with plain HTML tags.

Extending Emmet's own snippet system doesn't work either: markup snippets have to resolve to element-like abbreviations, so `{% if %}` is not expressible. Templet therefore owns the abbreviation and delegates only the HTML-looking parts to Emmet.

## Usage

| Command | Default keybinding | What it does |
| --- | --- | --- |
| **Templet: Expand Abbreviation…** | `Ctrl+Alt+Enter` (`Cmd+Alt+Enter`) | Prompts for an abbreviation, with a live preview. Wraps the selection if there is one. |
| **Templet: Expand Abbreviation Before Cursor** | `Ctrl+Alt+E` (`Cmd+Alt+E`) | Expands the abbreviation already typed in the document, like Emmet's own expand. |

### Wrapping, previewed in the document

Select some markup, run **Expand Abbreviation…**, and the wrap appears **in the editor** as you type — real, syntax-coloured, indented in place. Cancel with `Esc` and the document goes back exactly as it was; accept and the expansion is inserted as a snippet, so the tabstops are live.

Set `templet.preview` to `input` to render it under the input box instead, or `off` for no preview.

### Preview as you type in the editor

You don't have to open the input box at all. Type an abbreviation directly in a template file and the expansion appears **as ghost text in the code**, accepted with `Tab`:

```liquid
if>div.card>image
{% if condition %}                  ← ghost text, greyed out
    <div class="card">
        <img src="src" alt="alt">
    </div>
{% endif %}
```

The same expansion is also offered in the suggestion list, with the markup rendered in its details pane.

There is also an opt-in ghost-text mode (`templet.inlinePreview`), which draws the expansion inline in dimmed text. It is off by default and only takes effect when `templet.suggest` is *also* off, because VS Code hides inline suggestions whenever the suggestion list is open — turning `templet.suggest` off on its own leaves you with no Templet suggestion at all, and your abbreviation falls through to built-in Emmet.

### What gets suggested

By default, only abbreviations using a **keyword or a Templet snippet** — something Emmet cannot expand on its own. Plain abbreviations like `ul>li*3` are left to VS Code's built-in Emmet so you don't get two competing suggestions for the same thing. If you haven't pointed Emmet at your template language via `emmet.includeLanguages`, set `templet.suggestPlainEmmet` to `true` and Templet will offer those too.

### Wrapping a selection

Select `<button>Delete</button>`, run **Expand Abbreviation…**, and type `if:user.admin>div.admin-panel`:

```liquid
{% if ${1:user.admin} %}
	<div class="admin-panel"><button>Delete</button></div>
{% endif %}
```

The selection becomes the innermost content, and the caret finishes at the end.

## Syntax

### `>` nests

Each `>`-separated segment is classified in order: **keyword** for the document's dialect → **your snippet** → otherwise **plain Emmet**. Consecutive Emmet segments are re-joined, so `div.a>ul>li*3` expands as one tree rather than three nested ones.

### `:` passes an argument

```
for:product in products>div.grid-item>a[href]>image
```

```liquid
{% for ${1:product in products} %}
	<div class="grid-item"><a href=""><img src="${2:src}" alt="${3:alt}" loading="lazy"></a></div>
{% endfor %}
```

Without an argument you get the keyword's default as a placeholder — `if` gives `${1:condition}`.

### `|` starts a branch

```
if:cart.items>ul.cart>li*3|else>p.empty
```

```liquid
{% if ${1:cart.items} %}
	<ul class="cart">
		<li>${2}</li>
		<li>${3}</li>
		<li>${4}</li>
	</ul>
{% else %}
	<p class="empty">$0</p>
{% endif %}
```

`elsif` / `elseif` / `elif` / `when` chain the same way and take their own arguments: `if:a>p|elsif:b>p|else>p`. A branch attaches to the **innermost** enclosing keyword, which reads the way the abbreviation does.

A `|` that isn't followed by a branch keyword is left alone, so ERB block parameters survive: `each:items.each do |item|>li`.

## Snippets

Define them in `settings.json`. Bodies are plain HTML with ordinary snippet tabstops:

```json
{
  "templet.snippets": {
    "image": "<img src=\"${1:src}\" alt=\"${2:alt}\" loading=\"lazy\">",
    "card": "<article class=\"card\">\n\t$0\n</article>",
    "field": "<label for=\"${1:name}\">${2:Label}</label>\n<input id=\"${1:name}\" name=\"${1:name}\">"
  }
}
```

A snippet name works **anywhere an element name can appear**, not just at a segment boundary — `article.post>h2+image`, `ul>image*3`, `div>(h2+image)` all resolve. Each copy gets its own tabstops, and tabstops you deliberately repeat (`${1:name}` above) stay mirrored.

A `$0` in a body marks where the caret should land — and where nested content goes, which lets a snippet act as a wrapper. Expanding `card` around a selected `<p>hi</p>` gives:

```html
<article class="card">
	<p>hi</p>
</article>
```

A body with no `$0` has nowhere to nest, so content follows it as a sibling — the right answer for a void element like `image`.

A snippet name shadows the built-in Emmet snippet of the same name, so you can redefine `link` or `img`. Adding Emmet syntax the body can't express (`image.big` — a class on the element) leaves the name to Emmet instead.

VS Code exposes no API for reading your existing snippet files, so Templet snippets have to live in its own configuration.

## Keywords

Seven dialects ship built in — **Liquid**, **Twig**, **Jinja**, **Nunjucks**, **Blade**, **Handlebars** and **ERB** — mapped from the usual language ids.

Keywords are declarative, so anything built in can equally be written in `settings.json`. Add a dialect, add a keyword, or override one:

```json
{
  "templet.keywords": {
    "svelte": {
      "if":   { "open": "{#if ${arg}}",   "close": "{/if}",   "defaultArg": "condition" },
      "each": { "open": "{#each ${arg}}", "close": "{/each}", "defaultArg": "items as item" },
      "else": { "open": "{:else}", "close": "", "branch": true }
    }
  },
  "templet.languages": { "svelte": "svelte" }
}
```

- `open` / `close` — the tags. `${arg}` is the argument slot.
- `defaultArg` — placeholder when the abbreviation gives no argument. Omit it and the keyword takes no argument.
- `branch` — `true` for `else`-like keywords, which continue an enclosing block instead of opening their own.

`open` and `close` are snippet syntax, so they may carry tabstops of their own and a **literal dollar sign must be written `\$`** — that's why Blade's default reads `\$items as \$item`.

An unmapped language falls back to a dialect named after its own language id, so `templet.languages` is only needed when the names differ.

### Project-specific configuration

A `templet.json` at the workspace root takes precedence over user settings:

```json
{
  "snippets": {
    "hero": "<section class=\"hero\">\n\t<h1>${1:Title}</h1>\n\t$0\n</section>"
  },
  "keywords": {
    "liquid": {
      "section": { "open": "{% section '${arg}' %}", "close": "", "branch": true }
    }
  }
}
```

It must be strict JSON — comments and trailing commas are not supported. Mistakes are reported in the **Templet** output channel rather than blocking the expansion.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `templet.snippets` | `{}` | Named snippet bodies. |
| `templet.keywords` | `{}` | Keyword tables, merged over the built-in dialects. |
| `templet.languages` | `{}` | Language id → dialect, merged over the built-in mapping. |
| `templet.preview` | `editor` | How the input box previews: `editor`, `input` or `off`. |
| `templet.inlinePreview` | `true` | Preview the expansion as ghost text in the editor. |
| `templet.suggest` | `true` | Also offer the expansion in the suggestion list. |
| `templet.suggestPlainEmmet` | `false` | Also suggest abbreviations using no keyword or snippet. |
| `templet.configFile` | `templet.json` | Workspace-relative project config. |

## Troubleshooting

Run **Templet: Diagnose Current File** from the Command Palette. It prints, for the current file, the language id, the dialect it resolved to, the available keywords and snippets, whether suggestions are on, and what the abbreviation before your cursor would expand to.

The usual causes of "nothing happens":

- **The language maps to no dialect.** Templet is inert in a file whose dialect is unknown, which is what stops a snippet named `card` from appearing in a `.ts` file. The diagnostic flags this. Point a language at a dialect with `templet.languages`, e.g. `{ "html": "liquid" }`.
- **The file isn't recognised.** VS Code has no built-in knowledge of `.liquid`, `.twig`, `.njk` or `.erb`, so with no dedicated language extension installed those files come through as **Plain Text** — check the language indicator in the status bar. Templet falls back to the file extension so it still works, but install a language extension for syntax highlighting.
- **Snippets aren't configured.** `templet.snippets` starts empty. `image` and `card` in this README are examples, not built-ins; without them `if>div>image` produces a literal `<image>` tag.
- **The suggestion is gated.** By default only abbreviations using a keyword or snippet are suggested. See the section above.

## Known limitations

- **Inline expansion stops at whitespace.** Emmet's extractor finds the abbreviation before the caret, so arguments containing spaces (`for:item in items`) need the input box.
- **Emmet output filters aren't supported.** `div|c` is rejected by the Emmet library Templet calls; filters are a VS Code-layer feature that never reaches it.
- **A customised snippet name falls through to Emmet.** `image.big` asks for a class on the element, which a snippet body cannot express.

## Development

```sh
npm install
npm test        # compiles, then runs the composer tests
npm run watch   # incremental compile
```

The composer is a pure `(abbreviation, dialect, config, options) => string` with no dependency on `vscode`, so it is tested directly with the Node test runner — no editor harness required. Press `F5` to launch an Extension Development Host.

## License

MIT
