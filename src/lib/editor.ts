/**
 * EditorHandle — imperative interface returned via the EditorPane / SourcePane
 * `onReady` callback once the editor is mounted.
 *
 * Consumers (e.g. EditorContainer, fileService) use this to push content into
 * the editor and query current content without going through the document store.
 */
export interface EditorHandle {
	/** Replace editor content. Pass `{ markClean: true }` on file load/save to
	 *  reset the DirtyState clean baseline so undo correctly shows clean state. */
	setContent(markdown: string, opts?: { markClean?: boolean }): void;
	/** Return the current content as Markdown (or plain text for source pane). */
	getContent(): string;
	/** Reset the DirtyState clean baseline to the current doc (called after save). */
	markSaved(): void;
}

// ---------------------------------------------------------------------------
// Module-level singletons — set by EditorPane/SourcePane on mount so that
// fileService can read/write editor content without routing through the store.
// ---------------------------------------------------------------------------

let _richHandle: EditorHandle | null = null;
let _sourceHandle: EditorHandle | null = null;
let _activeMode: 'rich' | 'source' = 'rich';

export function setRichHandle(h: EditorHandle | null): void {
	_richHandle = h;
}
export function setSourceHandle(h: EditorHandle | null): void {
	_sourceHandle = h;
}
export function setActiveMode(mode: 'rich' | 'source'): void {
	_activeMode = mode;
}

/** Returns the markdown content of the currently active editor. */
export function getActiveContent(): string {
	return (_activeMode === 'rich' ? _richHandle : _sourceHandle)?.getContent() ?? '';
}

export function getRichHandle(): EditorHandle | null {
	return _richHandle;
}
export function getSourceHandle(): EditorHandle | null {
	return _sourceHandle;
}
