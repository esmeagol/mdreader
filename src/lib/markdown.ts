import type { Editor } from '@tiptap/core';

interface MarkdownStorage {
	markdown?: {
		getMarkdown: () => string;
	};
}

export function getMarkdown(editor: Editor): string {
	return (editor.storage as MarkdownStorage).markdown?.getMarkdown() ?? '';
}
