import type { ComposerConfig, Dialect } from './types';

/**
 * Built-in keyword tables.
 *
 * These are declarative on purpose: `templet.keywords` in settings.json uses the
 * exact same shape, so anything shipped here a user can override or extend
 * without writing code. `${arg}` is the argument slot; a literal dollar sign is
 * written `\$` because `open`/`close` are snippet syntax.
 */

/** `{% … %}` languages share most of their structure. */
function percentDialect(options: {
	forArg: string;
	elseIf: string;
	extra?: Dialect;
}): Dialect {
	return {
		if: { open: '{% if ${arg} %}', close: '{% endif %}', defaultArg: 'condition' },
		for: { open: '{% for ${arg} %}', close: '{% endfor %}', defaultArg: options.forArg },
		block: { open: '{% block ${arg} %}', close: '{% endblock %}', defaultArg: 'name' },
		raw: { open: '{% raw %}', close: '{% endraw %}' },
		else: { open: '{% else %}', close: '', branch: true },
		[options.elseIf]: {
			open: `{% ${options.elseIf} \${arg} %}`,
			close: '',
			defaultArg: 'condition',
			branch: true,
		},
		...options.extra,
	};
}

const liquid: Dialect = {
	if: { open: '{% if ${arg} %}', close: '{% endif %}', defaultArg: 'condition' },
	unless: { open: '{% unless ${arg} %}', close: '{% endunless %}', defaultArg: 'condition' },
	for: { open: '{% for ${arg} %}', close: '{% endfor %}', defaultArg: 'item in items' },
	case: { open: '{% case ${arg} %}', close: '{% endcase %}', defaultArg: 'variable' },
	capture: { open: '{% capture ${arg} %}', close: '{% endcapture %}', defaultArg: 'name' },
	form: { open: '{% form ${arg} %}', close: '{% endform %}', defaultArg: "'product', product" },
	tablerow: {
		open: '{% tablerow ${arg} %}',
		close: '{% endtablerow %}',
		defaultArg: 'item in items',
	},
	comment: { open: '{% comment %}', close: '{% endcomment %}' },
	raw: { open: '{% raw %}', close: '{% endraw %}' },
	else: { open: '{% else %}', close: '', branch: true },
	elsif: { open: '{% elsif ${arg} %}', close: '', defaultArg: 'condition', branch: true },
	when: { open: '{% when ${arg} %}', close: '', defaultArg: 'value', branch: true },
};

const twig: Dialect = percentDialect({
	forArg: 'item in items',
	elseIf: 'elseif',
	extra: {
		set: { open: '{% set ${arg} %}', close: '{% endset %}', defaultArg: 'name' },
		embed: { open: "{% embed '${arg}' %}", close: '{% endembed %}', defaultArg: 'template.twig' },
		apply: { open: '{% apply ${arg} %}', close: '{% endapply %}', defaultArg: 'escape' },
		verbatim: { open: '{% verbatim %}', close: '{% endverbatim %}' },
		with: { open: '{% with ${arg} %}', close: '{% endwith %}', defaultArg: '{ key: value }' },
		macro: { open: '{% macro ${arg} %}', close: '{% endmacro %}', defaultArg: 'name(args)' },
	},
});

const jinja: Dialect = percentDialect({
	forArg: 'item in items',
	elseIf: 'elif',
	extra: {
		set: { open: '{% set ${arg} %}', close: '{% endset %}', defaultArg: 'name' },
		filter: { open: '{% filter ${arg} %}', close: '{% endfilter %}', defaultArg: 'upper' },
		macro: { open: '{% macro ${arg} %}', close: '{% endmacro %}', defaultArg: 'name(args)' },
		call: { open: '{% call ${arg} %}', close: '{% endcall %}', defaultArg: 'name(args)' },
		with: { open: '{% with ${arg} %}', close: '{% endwith %}', defaultArg: 'key = value' },
		autoescape: {
			open: '{% autoescape ${arg} %}',
			close: '{% endautoescape %}',
			defaultArg: 'true',
		},
	},
});

const nunjucks: Dialect = percentDialect({
	forArg: 'item in items',
	elseIf: 'elif',
	extra: {
		set: { open: '{% set ${arg} %}', close: '{% endset %}', defaultArg: 'name' },
		macro: { open: '{% macro ${arg} %}', close: '{% endmacro %}', defaultArg: 'name(args)' },
		filter: { open: '{% filter ${arg} %}', close: '{% endfilter %}', defaultArg: 'upper' },
		call: { open: '{% call ${arg} %}', close: '{% endcall %}', defaultArg: 'name(args)' },
		asyncEach: {
			open: '{% asyncEach ${arg} %}',
			close: '{% endeach %}',
			defaultArg: 'item in items',
		},
		verbatim: { open: '{% verbatim %}', close: '{% endverbatim %}' },
	},
});

const blade: Dialect = {
	if: { open: '@if (${arg})', close: '@endif', defaultArg: 'condition' },
	unless: { open: '@unless (${arg})', close: '@endunless', defaultArg: 'condition' },
	// Blade arguments are PHP, so the dollar signs need escaping.
	foreach: {
		open: '@foreach (${arg})',
		close: '@endforeach',
		defaultArg: '\\$items as \\$item',
	},
	forelse: {
		open: '@forelse (${arg})',
		close: '@endforelse',
		defaultArg: '\\$items as \\$item',
	},
	for: {
		open: '@for (${arg})',
		close: '@endfor',
		defaultArg: '\\$i = 0; \\$i < 10; \\$i++',
	},
	while: { open: '@while (${arg})', close: '@endwhile', defaultArg: 'condition' },
	isset: { open: '@isset (${arg})', close: '@endisset', defaultArg: '\\$value' },
	empty: { open: '@empty (${arg})', close: '@endempty', defaultArg: '\\$value' },
	auth: { open: '@auth', close: '@endauth' },
	guest: { open: '@guest', close: '@endguest' },
	section: { open: "@section('${arg}')", close: '@endsection', defaultArg: 'content' },
	push: { open: "@push('${arg}')", close: '@endpush', defaultArg: 'scripts' },
	once: { open: '@once', close: '@endonce' },
	verbatim: { open: '@verbatim', close: '@endverbatim' },
	error: { open: "@error('${arg}')", close: '@enderror', defaultArg: 'field' },
	else: { open: '@else', close: '', branch: true },
	elseif: { open: '@elseif (${arg})', close: '', defaultArg: 'condition', branch: true },
};

const handlebars: Dialect = {
	if: { open: '{{#if ${arg}}}', close: '{{/if}}', defaultArg: 'condition' },
	unless: { open: '{{#unless ${arg}}}', close: '{{/unless}}', defaultArg: 'condition' },
	each: { open: '{{#each ${arg}}}', close: '{{/each}}', defaultArg: 'items' },
	with: { open: '{{#with ${arg}}}', close: '{{/with}}', defaultArg: 'context' },
	else: { open: '{{else}}', close: '', branch: true },
};

const erb: Dialect = {
	if: { open: '<% if ${arg} %>', close: '<% end %>', defaultArg: 'condition' },
	unless: { open: '<% unless ${arg} %>', close: '<% end %>', defaultArg: 'condition' },
	each: { open: '<% ${arg} %>', close: '<% end %>', defaultArg: 'items.each do |item|' },
	for: { open: '<% for ${arg} %>', close: '<% end %>', defaultArg: 'item in items' },
	case: { open: '<% case ${arg} %>', close: '<% end %>', defaultArg: 'value' },
	form: {
		open: '<%= form_with ${arg} do |f| %>',
		close: '<% end %>',
		defaultArg: 'model: record',
	},
	else: { open: '<% else %>', close: '', branch: true },
	elsif: { open: '<% elsif ${arg} %>', close: '', defaultArg: 'condition', branch: true },
	when: { open: '<% when ${arg} %>', close: '', defaultArg: 'value', branch: true },
};

export const BUILTIN_DIALECTS: Record<string, Dialect> = {
	liquid,
	twig,
	jinja,
	nunjucks,
	blade,
	handlebars,
	erb,
};

/**
 * VS Code language id -> dialect. Ids vary between the extensions that provide
 * these languages, so the common spellings are all mapped.
 */
export const BUILTIN_LANGUAGES: Record<string, string> = {
	liquid: 'liquid',
	'liquid-html': 'liquid',
	twig: 'twig',
	'html-twig': 'twig',
	jinja: 'jinja',
	'jinja-html': 'jinja',
	jinja2: 'jinja',
	'django-html': 'jinja',
	'html-django': 'jinja',
	nunjucks: 'nunjucks',
	njk: 'nunjucks',
	'nunjucks-html': 'nunjucks',
	blade: 'blade',
	'laravel-blade': 'blade',
	handlebars: 'handlebars',
	hbs: 'handlebars',
	mustache: 'handlebars',
	erb: 'erb',
	'html.erb': 'erb',
	'erb-html': 'erb',
};

/**
 * File extension -> dialect, checked when the language id maps to nothing.
 *
 * VS Code has no built-in knowledge of `.liquid`, `.twig`, `.njk` or `.erb`, so
 * without a dedicated language extension installed those files come through as
 * `plaintext` and mapping by language id alone would leave Templet inert in exactly
 * the files it exists for. Longest match wins, so `.blade.php` beats `.php`.
 */
export const BUILTIN_FILE_EXTENSIONS: Record<string, string> = {
	'.liquid': 'liquid',
	'.twig': 'twig',
	'.jinja': 'jinja',
	'.jinja2': 'jinja',
	'.j2': 'jinja',
	'.njk': 'nunjucks',
	'.nunjucks': 'nunjucks',
	'.erb': 'erb',
	'.html.erb': 'erb',
	'.blade.php': 'blade',
	'.hbs': 'handlebars',
	'.handlebars': 'handlebars',
};

const EXTENSIONS_BY_LENGTH = Object.entries(BUILTIN_FILE_EXTENSIONS).sort(
	([a], [b]) => b.length - a.length,
);

/**
 * Picks the dialect for a document, given its language id and path.
 *
 * Precedence: an explicit `templet.languages` or built-in language mapping, then a
 * dialect named after the language id, then the file extension. Falling back to the
 * language id last means defining a dialect named after a language is enough to
 * wire it up.
 *
 * Pure, so the resolution order is testable without an editor.
 */
export function resolveDialect(
	languageId: string,
	filePath: string,
	config: ComposerConfig,
): string {
	const mapped = config.languages[languageId];
	if (mapped) {
		return mapped;
	}
	if (config.dialects[languageId]) {
		return languageId;
	}

	const path = filePath.toLowerCase();
	for (const [extension, dialect] of EXTENSIONS_BY_LENGTH) {
		if (path.endsWith(extension)) {
			return dialect;
		}
	}

	return languageId;
}
