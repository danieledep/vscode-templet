import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compose } from '../composer/compose';
import { BUILTIN_DIALECTS } from '../composer/dialects';
import type { ComposerConfig } from '../composer/types';

/**
 * Keywords are declarative so that anything shipped as a built-in can equally be
 * written in settings.json. These exercise that path with the config shape a user
 * would actually type.
 */
describe('user-defined keywords', () => {
	const config: ComposerConfig = {
		dialects: {
			...BUILTIN_DIALECTS,
			svelte: {
				if: { open: '{#if ${arg}}', close: '{/if}', defaultArg: 'condition' },
				each: { open: '{#each ${arg}}', close: '{/each}', defaultArg: 'items as item' },
				else: { open: '{:else}', close: '', branch: true },
			},
			// Overriding a built-in keyword rather than adding one.
			liquid: {
				...BUILTIN_DIALECTS.liquid,
				if: { open: '{%- if ${arg} -%}', close: '{%- endif -%}', defaultArg: 'cond' },
			},
		},
		languages: { svelte: 'svelte' },
		snippets: {},
	};

	it('expands a dialect defined entirely in configuration', () => {
		assert.equal(
			compose('each:rows as row>if:row.live>li', 'svelte', config),
			[
				'{#each ${1:rows as row}}',
				'\t{#if ${2:row.live}}',
				'\t\t<li>$0</li>',
				'\t{/if}',
				'{/each}',
			].join('\n'),
		);
	});

	it('supports branches in a configured dialect', () => {
		assert.match(compose('if:a>p|else>p', 'svelte', config), /\{:else\}/);
	});

	it('lets an override replace a built-in keyword', () => {
		assert.match(compose('if>p', 'liquid', config), /\{%- if \$\{1:cond\} -%\}/);
	});

	it('keeps the other built-in keywords of an overridden dialect', () => {
		assert.match(compose('unless>p', 'liquid', config), /\{% unless \$\{1:condition\} %\}/);
	});

	it('allows a keyword template to carry its own tabstops', () => {
		const withStops: ComposerConfig = {
			...config,
			dialects: {
				custom: {
					wrap: { open: '<!-- ${1:label} -->\n{% wrap ${arg} %}', close: '{% endwrap %}' },
				},
			},
		};
		const result = compose('wrap:x>p', 'custom', withStops);
		assert.equal(
			result,
			['<!-- ${1:label} -->', '{% wrap ${2:x} %}', '\t<p>$0</p>', '{% endwrap %}'].join('\n'),
		);
	});

	it('falls back to the language id when no mapping exists', () => {
		// dialectFor does this in the extension; compose just takes the name.
		assert.match(compose('if>p', 'svelte', config), /\{#if/);
	});

	it('treats an unknown dialect as plain Emmet', () => {
		assert.equal(compose('div>p', 'nope', config), '<div>\n\t<p>$0</p>\n</div>');
	});
});
