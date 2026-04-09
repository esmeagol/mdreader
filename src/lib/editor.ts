/**
 * EditorHandle — imperative interface exposed by EditorPane via Svelte context.
 *
 * Components that need to drive the editor (e.g. EditorContainer loading
 * external content) call these methods instead of passing reactive props,
 * which eliminates the string-comparison guards and the third copy of content.
 */
export interface EditorHandle {
	/** Replace editor content without marking the document dirty. */
	setContent(markdown: string): void;
	/** Return the current content as Markdown. */
	getContent(): string;
}

export const EDITOR_HANDLE_KEY = Symbol('editorHandle');
