import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { countWords } from './utils';

const WORD_COUNT_KEY = new PluginKey<number>('wordCount');

/**
 * TipTap extension that counts words directly from the ProseMirror document
 * and calls `onWordCountChange` whenever the count changes.
 *
 * This decouples word count from `doc.content` (the store's markdown string),
 * so the status bar stays live even after content is removed from the store.
 */
export function WordCount(onWordCountChange: (count: number) => void) {
	return Extension.create({
		name: 'wordCount',

		addProseMirrorPlugins() {
			return [
				new Plugin({
					key: WORD_COUNT_KEY,

					state: {
						init(_, editorState): number {
							return countWords(editorState.doc.textContent);
						},
						apply(tr, prev): number {
							if (!tr.docChanged) return prev;
							return countWords(tr.doc.textContent);
						}
					},

					view() {
						let lastCount = -1;
						return {
							update(view) {
								const count = WORD_COUNT_KEY.getState(view.state)!;
								if (count !== lastCount) {
									lastCount = count;
									onWordCountChange(count);
								}
							}
						};
					}
				})
			];
		}
	});
}
