import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { slugify, type Heading } from './outline';

const HEADINGS_KEY = new PluginKey<{ decorations: DecorationSet; headings: Heading[] }>('headings');

/**
 * Merged replacement for HeadingId + Sidebar's extractHeadings.
 *
 * In a single pass over the ProseMirror document on each state change it:
 *   1. Builds `id` decorations for heading nodes (same approach as HeadingId).
 *   2. Extracts the heading list and calls `onHeadingsChange` when it changes.
 *
 * Merging both concerns into one plugin avoids traversing the document twice.
 */
export function Headings(onHeadingsChange: (headings: Heading[]) => void) {
	return Extension.create({
		name: 'headings',

		addProseMirrorPlugins() {
			return [
				new Plugin({
					key: HEADINGS_KEY,

					state: {
						init(_, editorState) {
							return buildState(editorState.doc);
						},
						apply(tr, prev) {
							if (!tr.docChanged) return prev;
							return buildState(tr.doc);
						}
					},

					props: {
						decorations(state) {
							return HEADINGS_KEY.getState(state)!.decorations;
						}
					},

					view() {
						let lastHeadings: Heading[] = [];
						return {
							update(view) {
								const { headings } = HEADINGS_KEY.getState(view.state)!;
								if (!headingsEqual(headings, lastHeadings)) {
									lastHeadings = headings;
									onHeadingsChange(headings);
								}
							}
						};
					}
				})
			];
		}
	});
}

function buildState(doc: import('@tiptap/pm/model').Node) {
	const decorations: Decoration[] = [];
	const headings: Heading[] = [];

	doc.descendants((node, pos) => {
		if (node.type.name !== 'heading') return;
		const text = node.textContent;
		const slug = slugify(text);
		decorations.push(Decoration.node(pos, pos + node.nodeSize, { id: slug }));
		headings.push({ level: node.attrs.level as number, text, slug });
	});

	return { decorations: DecorationSet.create(doc, decorations), headings };
}

function headingsEqual(a: Heading[], b: Heading[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((h, i) => h.slug === b[i].slug && h.text === b[i].text && h.level === b[i].level);
}
