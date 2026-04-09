import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node } from '@tiptap/pm/model';

/**
 * Meta key sent on transactions that should reset the clean baseline (load/save).
 * Pass `tr.setMeta(MARK_CLEAN_KEY, true)` before dispatching.
 */
export const MARK_CLEAN_KEY = 'dirtyStateMarkClean';

interface DirtyPluginState {
	cleanDoc: Node;
	isDirty: boolean;
}

const DIRTY_PLUGIN_KEY = new PluginKey<DirtyPluginState>('dirtyState');

/**
 * TipTap extension that tracks document dirty state via ProseMirror node
 * equality (`doc.eq(cleanDoc)`) rather than string comparison.
 *
 * - `cleanDoc` is initialised to the doc at editor creation and reset whenever
 *   a transaction carries the `MARK_CLEAN_KEY` meta flag (on load or save).
 * - When dirty state changes, `onDirtyChange` is called synchronously from
 *   `view.update` (which runs outside of transactions, so Svelte store updates
 *   are safe). Both the setContent and MARK_CLEAN transactions happen in the
 *   same JS turn, so the DOM never renders the intermediate dirty=true state.
 */
export function DirtyState(onDirtyChange: (isDirty: boolean) => void) {
	return Extension.create({
		name: 'dirtyState',

		addProseMirrorPlugins() {
			return [
				new Plugin({
					key: DIRTY_PLUGIN_KEY,

					state: {
						init(_, editorState): DirtyPluginState {
							return { cleanDoc: editorState.doc, isDirty: false };
						},

						apply(tr, prev): DirtyPluginState {
							if (tr.getMeta(MARK_CLEAN_KEY)) {
								return { cleanDoc: tr.doc, isDirty: false };
							}
							if (!tr.docChanged) return prev;
							const isDirty = !tr.doc.eq(prev.cleanDoc);
							return { cleanDoc: prev.cleanDoc, isDirty };
						}
					},

					view() {
						let lastDirty = false;
						return {
							update(view) {
								const { isDirty } = DIRTY_PLUGIN_KEY.getState(view.state)!;
								if (isDirty !== lastDirty) {
									lastDirty = isDirty;
									onDirtyChange(isDirty);
								}
							}
						};
					}
				})
			];
		}
	});
}
