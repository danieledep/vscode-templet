import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILTIN_DIALECTS, BUILTIN_LANGUAGES, resolveDialect } from '../composer/dialects';
import type { ComposerConfig } from '../composer/types';

const config: ComposerConfig = {
	dialects: BUILTIN_DIALECTS,
	languages: BUILTIN_LANGUAGES,
	snippets: {},
};

describe('resolveDialect', () => {
	it('maps a known language id', () => {
		assert.equal(resolveDialect('liquid', '/a/b.liquid', config), 'liquid');
	});

	it('maps language id spellings that differ between extensions', () => {
		assert.equal(resolveDialect('jinja-html', '/a/b.html', config), 'jinja');
		assert.equal(resolveDialect('html-twig', '/a/b.html', config), 'twig');
	});

	it('falls back to the file extension when the language is unrecognised', () => {
		// VS Code has no built-in knowledge of .liquid, so with no Liquid extension
		// installed the document arrives as plaintext.
		assert.equal(resolveDialect('plaintext', '/a/b.liquid', config), 'liquid');
		assert.equal(resolveDialect('plaintext', '/a/b.njk', config), 'nunjucks');
		assert.equal(resolveDialect('plaintext', '/a/templates/x.j2', config), 'jinja');
	});

	it('prefers the longest matching extension', () => {
		assert.equal(resolveDialect('php', '/a/view.blade.php', config), 'blade');
		assert.equal(resolveDialect('php', '/a/plain.php', config), 'php');
		assert.equal(resolveDialect('plaintext', '/a/index.html.erb', config), 'erb');
	});

	it('ignores case in the path', () => {
		assert.equal(resolveDialect('plaintext', '/a/B.LIQUID', config), 'liquid');
	});

	it('lets an explicit mapping win over the extension', () => {
		const mapped: ComposerConfig = {
			...config,
			languages: { ...BUILTIN_LANGUAGES, plaintext: 'twig' },
		};
		assert.equal(resolveDialect('plaintext', '/a/b.liquid', mapped), 'twig');
	});

	it('lets a dialect named after the language win over the extension', () => {
		const named: ComposerConfig = {
			...config,
			dialects: { ...BUILTIN_DIALECTS, php: { if: { open: '@if', close: '@endif' } } },
		};
		assert.equal(resolveDialect('php', '/a/view.blade.php', named), 'php');
	});

	it('falls back to the language id when nothing matches', () => {
		assert.equal(resolveDialect('typescript', '/a/b.ts', config), 'typescript');
	});
});
