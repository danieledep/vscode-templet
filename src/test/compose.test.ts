import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compose, AbbreviationError } from '../composer/compose';
import { BUILTIN_DIALECTS } from '../composer/dialects';
import type { ComposerConfig } from '../composer/types';

const config: ComposerConfig = {
	dialects: BUILTIN_DIALECTS,
	languages: {},
	snippets: {
		image: '<img src="${1:src}" alt="${2:alt}" loading="lazy">',
		card: '<article class="card">\n\t$0\n</article>',
		field: '<label for="${1:name}">${2:Label}</label>\n<input id="${1:name}" name="${1:name}">',
	},
};

const run = (abbr: string, dialect = 'liquid', selection?: string) =>
	compose(abbr, dialect, config, { selection });

describe('keyword composition', () => {
	it('wraps an Emmet tree in a Liquid keyword', () => {
		assert.equal(
			run('if>div.card#hero>image'),
			[
				'{% if ${1:condition} %}',
				'\t<div class="card" id="hero"><img src="${2:src}" alt="${3:alt}" loading="lazy"></div>',
				'{% endif %}',
			].join('\n'),
		);
	});

	it('numbers tabstops in document order, not fold order', () => {
		// The condition is typed first, so it must be ${1} even though the fold
		// reaches the innermost image before it.
		const result = run('if>div>image');
		assert.match(result, /\$\{1:condition\}/);
		assert.ok(result.indexOf('${1:condition}') < result.indexOf('${2:src}'));
	});

	it('takes an explicit argument after a colon', () => {
		assert.equal(
			run('if:user.admin>div.admin-panel'),
			['{% if ${1:user.admin} %}', '\t<div class="admin-panel">$0</div>', '{% endif %}'].join('\n'),
		);
	});

	it('keeps a colon inside an argument', () => {
		assert.match(run('for:item in items>li'), /\{% for \$\{1:item in items\} %\}/);
	});

	it('nests keywords inside each other', () => {
		assert.equal(
			run('for:item in items>if:item.live>li'),
			[
				'{% for ${1:item in items} %}',
				'\t{% if ${2:item.live} %}',
				'\t\t<li>$0</li>',
				'\t{% endif %}',
				'{% endfor %}',
			].join('\n'),
		);
	});

	it('gives an argument-less keyword no tabstop', () => {
		assert.equal(run('comment>p'), ['{% comment %}', '\t<p>$0</p>', '{% endcomment %}'].join('\n'));
	});

	it('puts the caret inside a keyword with no content', () => {
		assert.equal(run('if'), ['{% if ${1:condition} %}', '\t$0', '{% endif %}'].join('\n'));
	});
});

describe('plain Emmet passthrough', () => {
	it('expands an abbreviation with no keywords as one tree', () => {
		// Every repeat keeps a stop of its own, and the last is where typing ends.
		assert.equal(run('div.a>ul>li*3'), [
			'<div class="a">',
			'\t<ul>',
			'\t\t<li>${1}</li>',
			'\t\t<li>${2}</li>',
			'\t\t<li>$0</li>',
			'\t</ul>',
			'</div>',
		].join('\n'));
	});

	it('re-joins consecutive Emmet segments rather than nesting separately', () => {
		assert.equal(run('div>p'), run('div>p', 'no-such-dialect'));
	});

	it('reports a bad abbreviation as an AbbreviationError', () => {
		assert.throws(() => run(''), AbbreviationError);
	});
});

describe('snippets', () => {
	it('expands a snippet named as its own segment', () => {
		assert.equal(run('image'), '<img src="${1:src}" alt="${2:alt}" loading="lazy">');
	});

	it('resolves a snippet at a sibling position inside a segment', () => {
		// The prototype handed `h2+image` straight to Emmet, which emitted a
		// literal <image> tag.
		const result = run('article.post>h2+image');
		assert.match(result, /<img src="\$\{2:src\}"/);
		assert.doesNotMatch(result, /<image>/);
	});

	it('resolves a snippet under multiplication', () => {
		const result = run('ul>image*2');
		assert.equal(result.match(/<img /g)?.length, 2);
	});

	it('gives each copy its own tabstops', () => {
		const result = run('image*2');
		assert.match(result, /\$\{1:src\}/);
		assert.match(result, /\$\{3:src\}/);
	});

	it('shadows a built-in Emmet snippet of the same name', () => {
		const shadowing: ComposerConfig = { ...config, snippets: { link: '<a href="${1:#}">$0</a>' } };
		assert.equal(compose('link', 'liquid', shadowing), '<a href="${1:#}">$0</a>');
	});

	it('leaves a name alone when it carries Emmet syntax it cannot express', () => {
		// `image.big` is asking for a class on the element, which a snippet body
		// cannot provide, so Emmet resolves it as an unknown tag.
		assert.match(run('image.big'), /<image class="big">/);
	});

	it('does not touch a snippet name inside text content', () => {
		assert.equal(run('p{image}'), '<p>image</p>');
	});

	it('does not touch a snippet name used as a class', () => {
		assert.equal(run('div.image'), '<div class="image">$0</div>');
	});

	it('keeps mirrored tabstops linked', () => {
		const result = run('field');
		// Three references to `name` must renumber to the same stop.
		assert.equal(result.match(/\$\{1:name\}/g)?.length, 3);
	});

	it('treats $0 in a body as the caret position', () => {
		assert.equal(run('card'), '<article class="card">\n\t$0\n</article>');
	});
});

describe('selection wrapping', () => {
	it('nests the selection at the innermost position', () => {
		assert.equal(
			run('if:user.admin>div.admin-panel', 'liquid', '<button>Delete</button>'),
			[
				'{% if ${1:user.admin} %}',
				'\t<div class="admin-panel"><button>Delete</button></div>',
				'{% endif %}',
			].join('\n'),
		);
	});

	it('escapes snippet syntax in the selection', () => {
		const result = run('div', 'liquid', 'cost: $5 {a}');
		assert.match(result, /cost: \\\$5 \{a\\\}/);
	});

	it('emits no caret stop when wrapping, so the caret lands at the end', () => {
		assert.doesNotMatch(run('if>div', 'liquid', 'x'), /\$0/);
	});

	it('indents a multi-line selection', () => {
		const result = run('if>div', 'liquid', '<a>1</a>\n<a>2</a>');
		assert.match(result, /\t<div>\n\t\t<a>1<\/a>\n\t\t<a>2<\/a>\n\t<\/div>/);
	});

	it('nests the selection at a snippet body\'s $0, so snippets wrap', () => {
		assert.equal(run('card', 'liquid', '<p>hi</p>'), [
			'<article class="card">',
			'\t<p>hi</p>',
			'</article>',
		].join('\n'));
	});

	it('indents a multi-line selection nested into a snippet body', () => {
		assert.equal(run('card', 'liquid', '<p>a</p>\n<p>b</p>'), [
			'<article class="card">',
			'\t<p>a</p>',
			'\t<p>b</p>',
			'</article>',
		].join('\n'));
	});

	it('puts the selection after a snippet body that has nowhere to nest', () => {
		// `image` is a void element, so there is no $0 to nest into.
		assert.equal(
			run('image', 'liquid', '<p>hi</p>'),
			'<img src="${1:src}" alt="${2:alt}" loading="lazy">\n<p>hi</p>',
		);
	});
});

describe('branches', () => {
	it('attaches an else to the enclosing keyword', () => {
		assert.equal(
			run('if:user.admin>div.admin|else>div.guest'),
			[
				'{% if ${1:user.admin} %}',
				'\t<div class="admin">${2}</div>',
				'{% else %}',
				'\t<div class="guest">$0</div>',
				'{% endif %}',
			].join('\n'),
		);
	});

	it('supports elsif chains with their own arguments', () => {
		assert.equal(
			run('if:a>p|elsif:b>p|else>p'),
			[
				'{% if ${1:a} %}',
				'\t<p>${2}</p>',
				'{% elsif ${3:b} %}',
				'\t<p>${4}</p>',
				'{% else %}',
				'\t<p>$0</p>',
				'{% endif %}',
			].join('\n'),
		);
	});

	it('attaches a branch to the innermost keyword', () => {
		const result = run('for:i in items>if:i.live>p|else>span');
		assert.match(result, /\{% else %\}\n\t\t<span>/);
		assert.match(result, /\{% endif %\}\n\{% endfor %\}/);
	});

	it('wraps a selection in the main arm, leaving the caret in the branch', () => {
		const result = run('if:a>div|else>p', 'liquid', '<b>x</b>');
		assert.match(result, /<div><b>x<\/b><\/div>/);
		assert.match(result, /<p>\$0<\/p>/);
	});

	it('keeps a pipe that is not a branch', () => {
		// ERB block arguments contain pipes.
		assert.match(
			compose('each:items.each do |item|>li', 'erb', config),
			/<% \$\{1:items\.each do \|item\|\} %>/,
		);
	});

	it('rejects a branch with nothing to attach to', () => {
		assert.throws(() => run('div|else>p'), AbbreviationError);
	});
});

describe('dialects', () => {
	const cases: [string, string, RegExp][] = [
		['twig', 'if:a>p', /\{% if \$\{1:a\} %\}[\s\S]*\{% endif %\}/],
		['twig', 'if:a>p|elseif:b>p', /\{% elseif \$\{3:b\} %\}/],
		['jinja', 'if:a>p|elif:b>p', /\{% elif \$\{3:b\} %\}/],
		['nunjucks', 'for:i in items>li', /\{% for \$\{1:i in items\} %\}[\s\S]*\{% endfor %\}/],
		['blade', 'if:a>p', /@if \(\$\{1:a\}\)[\s\S]*@endif/],
		['blade', 'foreach>li', /@foreach \(\$\{1:\\\$items as \\\$item\}\)/],
		['handlebars', 'each:items>li', /\{\{#each \$\{1:items\}\}\}[\s\S]*\{\{\/each\}\}/],
		['handlebars', 'if:a>p|else>p', /\{\{else\}\}/],
		['erb', 'if:a>p', /<% if \$\{1:a\} %>[\s\S]*<% end %>/],
		['erb', 'case:x>p|when:1>p', /<% when \$\{3:1\} %>/],
	];

	for (const [dialect, abbr, pattern] of cases) {
		it(`${dialect}: ${abbr}`, () => {
			assert.match(compose(abbr, dialect, config), pattern);
		});
	}

	it('escapes literal dollars in Blade defaults', () => {
		// `\$items` must reach the editor as a literal, not a tabstop.
		assert.match(compose('foreach>li', 'blade', config), /\\\$items as \\\$item/);
	});
});

describe('indentation', () => {
	it('honours a custom indent unit', () => {
		assert.equal(
			compose('if>div', 'liquid', config, { indent: '  ' }),
			['{% if ${1:condition} %}', '  <div>$0</div>', '{% endif %}'].join('\n'),
		);
	});
});
