/**
 * EditorHandle — imperative interface returned via the EditorPane `onReady`
 * callback once the editor is mounted.
 *
 * Consumers (e.g. EditorContainer) call setContent to push external content
 * into the editor without a reactive prop round-trip, eliminating the need for
 * a local content copy and string-comparison guards.
 */
export interface EditorHandle {
	/** Replace editor content without marking the document dirty. */
	setContent(markdown: string): void;
	/** Return the current content as Markdown. */
	getContent(): string;
	/** Reset the DirtyState clean baseline to the current doc (called after save). */
	markSaved(): void;
}
