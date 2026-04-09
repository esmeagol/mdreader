import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { slugify } from './outline';

/**
 * Adds `id` attributes to heading elements via ProseMirror decorations.
 *
 * Decorations are presentational overlays managed entirely by ProseMirror —
 * they add HTML attributes to DOM nodes without changing the underlying
 * document. This means:
 *   - No `appendTransaction` → no spurious `onUpdate` → no false dirty flag.
 *   - No new node attributes → `tiptap-markdown` serialisation is unchanged.
 *   - IDs are recomputed on every state change, so they stay in sync as the
 *     user types.
 *   - ProseMirror applies the attribute itself, so it survives every DOM
 *     reconciliation and re-render.
 */
export const HeadingId = Extension.create({
	name: 'headingId',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('headingId'),
				props: {
					decorations(state) {
						const decorations: Decoration[] = [];

						state.doc.descendants((node, pos) => {
							if (node.type.name !== 'heading') return;
							decorations.push(
								Decoration.node(pos, pos + node.nodeSize, {
									id: slugify(node.textContent)
								})
							);
						});

						return DecorationSet.create(state.doc, decorations);
					}
				}
			})
		];
	}
});
