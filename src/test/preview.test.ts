import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { capLines, preview, SELECTION_PLACEHOLDER } from '../composer/preview';
import { toPlainText } from '../composer/snippet';
import { BUILTIN_DIALECTS } from '../composer/dialects';
import type { ComposerConfig } from '../composer/types';

const config: ComposerConfig = {
	dialects: BUILTIN_DIALECTS,
	languages: {},
	snippets: { image: '<img src="${1:src}" alt="${2:alt}" loading="lazy">' },
};

describe('toPlainText', () => {
	it('renders placeholders and drops bare stops', () => {
		assert.equal(toPlainText('<p>${1:text}</p>$0'), '<p>text</p>');
	});

	it('unescapes snippet escapes', () => {
		assert.equal(toPlainText('cost: \\$5 {a\\}'), 'cost: $5 {a}');
	});

	it('renders nested placeholders', () => {
		assert.equal(toPlainText('${1:a${2:b}}'), 'ab');
	});
});

describe('preview', () => {
	it('shows the expansion as it would be inserted', () => {
		assert.equal(
			preview('if>div.card>image', 'liquid', config),
			[
				'{% if condition %}',
				'\t<div class="card"><img src="src" alt="alt" loading="lazy"></div>',
				'{% endif %}',
			].join('\n'),
		);
	});

	it('returns null for an empty abbreviation', () => {
		assert.equal(preview('   ', 'liquid', config), null);
	});

	it('tolerates a partial abbreviation', () => {
		// Typing towards `div[title="x"]` passes through unbalanced states, which
		// Emmet accepts, so the preview keeps up.
		assert.equal(preview('div[', 'liquid', config), '<div></div>');
	});

	it('returns null rather than throwing when the abbreviation is rejected', () => {
		// The core expander has no notion of Emmet's output filters.
		assert.equal(preview('div|c', 'liquid', config), null);
	});
});

describe('capLines', () => {
	it('leaves a short preview alone', () => {
		assert.equal(capLines('a\nb', 5), 'a\nb');
	});

	it('caps a long preview and says how much is hidden', () => {
		assert.equal(capLines('a\nb\nc\nd', 2), 'a\nb\n… 2 more lines');
	});

	it('uses the singular for one hidden line', () => {
		assert.equal(capLines('a\nb', 1), 'a\n… 1 more line');
	});
});

describe('previewing a wrap', () => {
	it('renders the shape around a placeholder rather than the whole selection', () => {
		// What the input box shows while wrapping a large block.
		assert.equal(
			preview('if>div.card', 'liquid', config, { selection: SELECTION_PLACEHOLDER }),
			['{% if condition %}', '\t<div class="card">…selected text…</div>', '{% endif %}'].join('\n'),
		);
	});
});
