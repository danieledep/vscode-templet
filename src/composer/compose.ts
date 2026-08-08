import expand from 'emmet';
import { splitTop, substituteSnippetNames } from './split';
import {
	escapeSnippet,
	hasTabstop,
	mapTabstops,
	renumberInDocumentOrder,
	replaceLastBareTabstop,
	replaceTabstop,
} from './snippet';
import type { ComposeOptions, ComposerConfig, Dialect, KeywordDef } from './types';

/**
 * Marks a position where the caret should be able to land: the inside of an
 * otherwise empty block. Holes are resolved after the fold, once document order
 * is known — the last one becomes `$0` so tabbing ends where you would keep
 * typing, and the rest become ordinary tabstops.
 *
 * Alphanumeric because it has to survive a round trip through Emmet as an
 * element's text content.
 */
const HOLE = 'templetHole';
const HOLE_PATTERN = /templetHole\d+/g;

/** Placeholder element name standing in for a snippet inside an Emmet segment. */
const SNIPPET_TAG = 'templetsnippet';

/** Marks a snippet body's `$0` while content is nested into it. */
const NEST_MARK = 'templetNest';

/** Matches an element Emmet left empty apart from a field of its own. */
const ONLY_A_FIELD = /^\s*(\$\{\d+(:[^}]*)?\}|\$\d+)?\s*$/;

type Block =
	| { type: 'keyword'; def: KeywordDef; arg?: string; branches: Branch[] }
	| { type: 'snippet'; body: string }
	| { type: 'emmet'; abbr: string };

interface Branch {
	def: KeywordDef;
	arg?: string;
	blocks: Block[];
}

export class AbbreviationError extends Error {}

/**
 * Expands a Templet abbreviation into VS Code snippet syntax.
 *
 * Pure — no editor state — so it can be snapshot-tested directly.
 *
 * @param abbr Abbreviation, e.g. `if:user.admin>div.card>image`.
 * @param dialectName Dialect key, e.g. `liquid`. An unknown name simply
 *   contributes no keywords, leaving the whole abbreviation to Emmet.
 */
export function compose(
	abbr: string,
	dialectName: string,
	config: ComposerConfig,
	options: ComposeOptions = {},
): string {
	const indentUnit = options.indent ?? '\t';
	const keywords: Dialect = config.dialects[dialectName] ?? {};
	const snippets = config.snippets;

	// One counter for every tabstop minted during the fold. The numbers are only
	// unique, not ordered; renumberInDocumentOrder puts them in sequence at the end.
	let counter = 0;
	const nextNumber = () => ++counter;
	const field = (placeholder?: string) =>
		placeholder ? `\${${nextNumber()}:${placeholder}}` : `\${${nextNumber()}}`;

	let holeCount = 0;
	const nextHole = () => `${HOLE}${holeCount++}`;

	const indent = (text: string) =>
		text
			.split('\n')
			.map((line) => (line.length > 0 ? indentUnit + line : line))
			.join('\n');

	/** Splits `if:user.admin` into its keyword and argument. */
	function keywordFor(segment: string): { def: KeywordDef; arg?: string } | null {
		const colon = segment.indexOf(':');
		const head = colon === -1 ? segment : segment.slice(0, colon);
		const def = keywords[head];
		if (!def) {
			return null;
		}
		const arg = colon === -1 ? undefined : segment.slice(colon + 1) || undefined;
		return { def, arg };
	}

	/** Turns one `>`-separated chain into the blocks to fold. */
	function toBlocks(chain: string): Block[] {
		const blocks: Block[] = [];

		for (const raw of splitTop(chain, '>')) {
			const segment = raw.trim();
			if (segment.length === 0) {
				continue;
			}

			const keyword = keywordFor(segment);
			if (keyword && !keyword.def.branch) {
				blocks.push({ type: 'keyword', def: keyword.def, arg: keyword.arg, branches: [] });
				continue;
			}

			// A bare snippet name becomes its own block so it can host the selection.
			// Anything more elaborate (`image*3`, `h2+image`) goes to Emmet with the
			// name substituted out.
			if (snippets[segment] !== undefined) {
				blocks.push({ type: 'snippet', body: snippets[segment] });
				continue;
			}

			const previous = blocks[blocks.length - 1];
			if (previous?.type === 'emmet') {
				// Re-join consecutive Emmet segments so `div.a>ul>li*3` expands as one
				// tree rather than three nested ones.
				previous.abbr += `>${segment}`;
			} else {
				blocks.push({ type: 'emmet', abbr: segment });
			}
		}

		return blocks;
	}

	/**
	 * Splits the abbreviation into a main chain plus branch chains.
	 *
	 * `|` only separates a branch when what follows names a branch keyword, because
	 * keyword arguments can contain it — ERB block parameters are written
	 * `items.each do |item|`. Anything else is stitched back onto the chain it came
	 * from, pipe included.
	 */
	function splitBranches(source: string): { main: string; branches: Branch[] } {
		const parts = splitTop(source, '|');
		if (parts.length === 1) {
			return { main: source, branches: [] };
		}

		const chains: { branch?: { def: KeywordDef; arg?: string }; chain: string }[] = [
			{ chain: parts[0] },
		];

		for (const part of parts.slice(1)) {
			const segments = splitTop(part, '>');
			const keyword = keywordFor((segments[0] ?? '').trim());
			if (keyword?.def.branch) {
				chains.push({ branch: keyword, chain: segments.slice(1).join('>') });
			} else {
				// Not a branch after all — put the `|` back where it was.
				const current = chains[chains.length - 1];
				current.chain = `${current.chain}|${part}`;
			}
		}

		return {
			main: chains[0].chain,
			branches: chains.slice(1).map(({ branch, chain }) => ({
				def: branch!.def,
				arg: branch!.arg,
				blocks: toBlocks(chain),
			})),
		};
	}

	/** Renders a keyword's opening tag, filling in `${arg}`. */
	function renderOpen(def: KeywordDef, arg?: string): string {
		const remap = new Map<number, number>();
		const template = mapTabstops(def.open, (num) => {
			const existing = remap.get(num);
			if (existing !== undefined) {
				return existing;
			}
			const assigned = nextNumber();
			remap.set(num, assigned);
			return assigned;
		});

		if (!template.includes('${arg}')) {
			return template;
		}
		const value = arg ?? def.defaultArg;
		return template.replace('${arg}', value === undefined ? field() : field(value));
	}

	/**
	 * Copies a snippet body into the output with its tabstops moved into the global
	 * sequence. Remapping by original number rather than by occurrence keeps
	 * deliberately mirrored tabstops linked.
	 *
	 * A `$0` in a body marks where the author wants the caret, so it becomes a hole
	 * and competes with the others for the final stop.
	 */
	function instantiateSnippet(body: string): string {
		const marked = hasTabstop(body, 0) ? replaceTabstop(body, 0, nextHole()) : body;
		const remap = new Map<number, number>();
		return mapTabstops(marked, (num) => {
			const existing = remap.get(num);
			if (existing !== undefined) {
				return existing;
			}
			const assigned = nextNumber();
			remap.set(num, assigned);
			return assigned;
		});
	}

	/** Re-indents continuation lines so a multi-line block lands at `lead`. */
	function applyIndent(lead: string, text: string): string {
		if (!lead) {
			return text;
		}
		return text
			.split('\n')
			.map((line, i) => (i === 0 || line.length === 0 ? line : lead + line))
			.join('\n');
	}

	/**
	 * Instantiates a snippet body with `inner` nested inside it.
	 *
	 * A body's `$0` says where its content belongs, so that is where the selection
	 * goes — which is what makes a snippet usable as a wrapper. A body without one
	 * (a void element like `image`) has nowhere to nest, so the content follows it as
	 * a sibling.
	 */
	function instantiateSnippetAround(body: string, inner: string): string {
		if (!inner) {
			return instantiateSnippet(body);
		}
		if (!hasTabstop(body, 0)) {
			return `${instantiateSnippet(body)}\n${inner}`;
		}
		const rendered = instantiateSnippet(replaceTabstop(body, 0, NEST_MARK));
		return rendered.replace(new RegExp(`([ \\t]*)${NEST_MARK}`), (_match, lead: string) =>
			applyIndent(lead, lead + inner),
		);
	}

	/** Grafts snippet bodies back over the placeholder elements Emmet produced. */
	function graftSnippets(html: string, bodies: Map<string, string>): string {
		let out = html;

		for (const [tag, body] of bodies) {
			const element = new RegExp(`([ \\t]*)(?:<${tag}>([\\s\\S]*?)</${tag}>|<${tag}\\s*/>)`, 'g');
			out = out.replace(element, (_match, lead: string, inner: string | undefined) => {
				// Emmet fills an empty element with a field of its own, which is
				// meaningless once the body lands. Real content — a wrapped selection —
				// has to be kept.
				const content = inner ?? '';
				const carried = ONLY_A_FIELD.test(content) ? '' : content;
				return lead + applyIndent(lead, instantiateSnippetAround(body, carried));
			});
		}

		return out;
	}

	/**
	 * Expands one Emmet segment. `content` is nested inside the deepest element; an
	 * empty string means there is nothing to nest, in which case Emmet's own fields
	 * mark the empty spots and the deepest of them becomes a caret candidate.
	 */
	function expandEmmet(abbreviation: string, content: string): string {
		const bodies = new Map<string, string>();
		let tagCount = 0;

		const prepared = substituteSnippetNames(
			abbreviation,
			(name) => snippets[name] !== undefined,
			(name) => {
				const tag = `${SNIPPET_TAG}${tagCount++}`;
				bodies.set(tag, snippets[name]);
				return tag;
			},
		);

		let html: string;
		try {
			html = expand(prepared, {
				// Passing empty text would append it after any literal `{text}` the
				// abbreviation already carries, so omit it entirely instead.
				...(content ? { text: content } : {}),
				options: {
					'output.field': (_index: number, placeholder: string) => field(placeholder || undefined),
					'output.indent': indentUnit,
				},
			});
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw new AbbreviationError(`Emmet could not expand "${abbreviation}": ${reason}`);
		}

		const grafted = bodies.size > 0 ? graftSnippets(html, bodies) : html;
		return content ? grafted : replaceLastBareTabstop(grafted, nextHole());
	}

	/** Folds a chain of blocks outward around `inner`. */
	function fold(blocks: Block[], inner: string): string {
		let content = inner;

		for (const block of [...blocks].reverse()) {
			if (block.type === 'snippet') {
				content = instantiateSnippetAround(block.body, content);
				continue;
			}

			if (block.type === 'emmet') {
				content = expandEmmet(block.abbr, content);
				continue;
			}

			let rendered = `${renderOpen(block.def, block.arg)}\n${indent(content || nextHole())}`;
			for (const branch of block.branches) {
				const body = fold(branch.blocks, '') || nextHole();
				rendered += `\n${renderOpen(branch.def, branch.arg)}\n${indent(body)}`;
			}
			content = block.def.close ? `${rendered}\n${block.def.close}` : rendered;
		}

		return content;
	}

	const trimmed = abbr.trim();
	if (trimmed.length === 0) {
		throw new AbbreviationError('Abbreviation is empty.');
	}

	const { main, branches } = splitBranches(trimmed);
	const blocks = toBlocks(main);
	if (blocks.length === 0) {
		throw new AbbreviationError(`Nothing to expand in "${abbr}".`);
	}

	// A branch continues the innermost enclosing block, which reads the way the
	// abbreviation does: in `if:a>div.x|else>div.y` the else belongs to the `if`.
	if (branches.length > 0) {
		const target = [...blocks].reverse().find((block) => block.type === 'keyword');
		if (!target || target.type !== 'keyword') {
			throw new AbbreviationError(
				`"${abbr}" has a branch keyword but no enclosing block to attach it to.`,
			);
		}
		target.branches = branches;
	}

	const folded = fold(blocks, options.selection ? escapeSnippet(options.selection) : '');
	return renumberInDocumentOrder(resolveHoles(folded, field));
}

/**
 * Turns holes into tabstops. The last hole in document order becomes `$0`, so the
 * caret finishes at the innermost point you would keep typing at; earlier holes
 * become ordinary stops on the way there.
 */
function resolveHoles(text: string, field: () => string): string {
	const holes = text.match(HOLE_PATTERN);
	if (!holes) {
		return text;
	}
	const last = holes[holes.length - 1];
	return text.replace(HOLE_PATTERN, (match) => (match === last ? '$0' : field()));
}
