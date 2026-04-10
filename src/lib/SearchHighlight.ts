/**
 * TipTap extension that highlights all occurrences of a search term
 * using ProseMirror inline decorations rendered as <mark> elements.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const searchHighlightKey = new PluginKey<SearchState>('searchHighlight');

interface SearchState {
	term: string;
	decorations: DecorationSet;
}

function buildDecorations(doc: import('@tiptap/pm/model').Node, term: string): DecorationSet {
	if (!term) return DecorationSet.empty;

	const decorations: Decoration[] = [];
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const regex = new RegExp(escaped, 'gi');

	doc.descendants((node, pos) => {
		if (!node.isText || !node.text) return;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(node.text)) !== null) {
			decorations.push(
				Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
					nodeName: 'mark'
				})
			);
		}
	});

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
						return { term: '', decorations: DecorationSet.empty };
					},

					apply(tr, old, _oldState, newState) {
						const meta = tr.getMeta(searchHighlightKey) as { term: string } | undefined;
						const term = meta !== undefined ? meta.term : old.term;

						if (!term) return { term, decorations: DecorationSet.empty };

						// Map existing decorations when only the document changed (no term change).
						if (meta === undefined && tr.docChanged) {
							return { term, decorations: old.decorations.map(tr.mapping, tr.doc) };
						}
						// Recompute on term change or initial state.
						return { term, decorations: buildDecorations(newState.doc, term) };
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
