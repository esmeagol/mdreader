import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const sourceOnFocusKey = new PluginKey<DecorationSet>('sourceOnFocus');

/**
 * Marks the top-level block containing the cursor with the CSS class `block-active`.
 * NodeViews (e.g. headings) react to this class to show raw markdown syntax.
 */
export const SourceOnFocus = Extension.create({
	name: 'sourceOnFocus',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: sourceOnFocusKey,

				state: {
					init: () => DecorationSet.empty,

					apply(tr, _old, _oldState, newState) {
						const $pos = newState.selection.$anchor;
						if ($pos.depth === 0) return DecorationSet.empty;

						const blockPos = $pos.before(1);
						const node = newState.doc.nodeAt(blockPos);
						if (!node) return DecorationSet.empty;

						return DecorationSet.create(newState.doc, [
							Decoration.node(blockPos, blockPos + node.nodeSize, {
								class: 'block-active'
							})
						]);
					}
				},

				props: {
					decorations(state) {
						return this.getState(state);
					}
				}
			})
		];
	}
});
