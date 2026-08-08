import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { involvesTemplet } from '../composer/classify';
import { BUILTIN_DIALECTS } from '../composer/dialects';
import type { ComposerConfig } from '../composer/types';

const config: ComposerConfig = {
	dialects: BUILTIN_DIALECTS,
	languages: {},
	snippets: { image: '<img src="${1:src}">', card: '<article>$0</article>' },
};

/** Decides whether the editor suggestion appears, so noise lives or dies here. */
describe('involvesTemplet', () => {
	const yes = [
		'if',
		'if>div.card',
		'if:user.admin>div',
		'for:item in items>li',
		'div.wrap>if>p',
		'image',
		'article.post>h2+image',
		'ul>image*3',
		'if:a>p|else>p',
	];

	const no = [
		'div',
		'div.card#hero',
		'ul>li*3',
		'div>(h2+p)',
		'p{some text}',
		'a[href=#]',
		// A snippet name as a class or literal text is not a reference.
		'div.image',
		'p{image}',
		// A name carrying syntax a snippet body cannot express falls to Emmet.
		'image.big',
	];

	for (const abbr of yes) {
		it(`suggests for ${abbr}`, () => {
			assert.equal(involvesTemplet(abbr, 'liquid', config), true);
		});
	}

	for (const abbr of no) {
		it(`stays quiet for ${abbr}`, () => {
			assert.equal(involvesTemplet(abbr, 'liquid', config), false);
		});
	}

	it('does not treat another dialect\'s keyword as its own', () => {
		// `foreach` is Blade; Liquid uses `for`.
		assert.equal(involvesTemplet('foreach>li', 'liquid', config), false);
		assert.equal(involvesTemplet('foreach>li', 'blade', config), true);
	});

	it('stays quiet for a language with no dialect', () => {
		assert.equal(involvesTemplet('if>div', 'typescript', config), false);
	});

	it('still recognises snippets in a dialect with no keywords', () => {
		assert.equal(involvesTemplet('image', 'typescript', config), true);
	});
});
