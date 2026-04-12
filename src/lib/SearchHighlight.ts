/**
 * TipTap extension that highlights all occurrences of a search term
 * using ProseMirror inline decorations rendered as <mark> elements.
 *
 * State shape:
 *   term        — current search string
 *   matches     — [{from, to}] sorted by document position
 *   current     — index into matches for the "active" match (-1 = none selected)
 *   decorations — DecorationSet (all marks, active mark gets an extra class)
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const searchHighlightKey = new PluginKey<SearchState>('searchHighlight');

export interface Match {
	from: number;
	to: number;
}

interface SearchState {
	term: string;
	matches: Match[];
	current: number;
	decorations: DecorationSet;
}

function findMatches(doc: import('@tiptap/pm/model').Node, term: string): Match[] {
	if (!term) return [];
	const matches: Match[] = [];
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const regex = new RegExp(escaped, 'gi');

	doc.descendants((node, pos) => {
		if (!node.isText || !node.text) return;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(node.text)) !== null) {
			matches.push({ from: pos + match.index, to: pos + match.index + match[0].length });
		}
	});

	return matches;
}

function buildDecorations(
	doc: import('@tiptap/pm/model').Node,
	matches: Match[],
	current: number
): DecorationSet {
	if (!matches.length) return DecorationSet.empty;

	const decorations = matches.map((m, i) =>
		Decoration.inline(m.from, m.to, {
			nodeName: 'mark',
			class: i === current ? 'search-current' : ''
		})
	);

	return DecorationSet.create(doc, decorations);
}

export const SearchHighlight = Extension.create({
	name: 'searchHighlight',

	addProseMirrorPlugins() {
		return [
			new Plugin<SearchState>({
				key: searchHighlightKey,

				state: {
					init() {
						return { term: '', matches: [], current: -1, decorations: DecorationSet.empty };
					},

					apply(tr, old, _oldState, newState) {
						const meta = tr.getMeta(searchHighlightKey) as
							| { term?: string; current?: number }
							| undefined;

						const term = meta?.term !== undefined ? meta.term : old.term;
						let current = meta?.current !== undefined ? meta.current : old.current;

						if (!term) {
							return { term, matches: [], current: -1, decorations: DecorationSet.empty };
						}

						// Recompute matches when term changes or doc changes.
						const needsRecompute = meta?.term !== undefined || tr.docChanged;
						const matches = needsRecompute ? findMatches(newState.doc, term) : old.matches;

						// Clamp current index after doc changes (matches may have shrunk).
						if (current >= matches.length) current = matches.length > 0 ? 0 : -1;

						return {
							term,
							matches,
							current,
							decorations: buildDecorations(newState.doc, matches, current)
						};
					}
				},

				props: {
					decorations(state) {
						return searchHighlightKey.getState(state)?.decorations ?? DecorationSet.empty;
					}
				}
			})
		];
	}
});
