import { document as doc } from './stores/document';
import { recentFiles } from './stores/recentFiles';
import { getRichHandle, getSourceHandle, getActiveContent } from './editor';

let tauriInvoke: (<T>(cmd: string, args: Record<string, unknown>) => Promise<T>) | null = null;

export function isTauriRuntime(): boolean {
	// Match @tauri-apps/api/core `isTauri()` — not `__TAURI_INTERNALS__`, which can exist in dev without IPC.
	return (
		typeof globalThis !== 'undefined' &&
		Boolean((globalThis as unknown as { isTauri?: boolean }).isTauri)
	);
}

async function initTauri(): Promise<void> {
	if (!isTauriRuntime()) return;
	const { invoke } = await import('@tauri-apps/api/core');
	tauriInvoke = invoke;
}

async function invoke<T>(command: string, payload: Record<string, unknown>): Promise<T> {
	if (!tauriInvoke) {
		const { invoke: imp } = await import('@tauri-apps/api/core');
		tauriInvoke = imp;
	}
	return tauriInvoke<T>(command, payload);
}

/** Call once at app startup to pre-warm the invoke reference and populate recent files. */
export async function loadRecentFiles(): Promise<void> {
	if (!isTauriRuntime()) return;
	await initTauri();
	const paths = await invoke<string[]>('get_recent_files', {});
	recentFiles.set(paths);
}

async function confirmDiscardChanges(): Promise<boolean> {
	if (isTauriRuntime()) {
		const { ask } = await import('@tauri-apps/plugin-dialog');
		return ask('You have unsaved changes. Open anyway?', {
			title: 'Unsaved Changes',
			kind: 'warning'
		});
	}
	return window.confirm('You have unsaved changes. Open anyway?');
}

export async function openFile(path?: string): Promise<void> {
	if (doc.get().isDirty) {
		const confirmed = await confirmDiscardChanges();
		if (!confirmed) return;
	}
	if (!isTauriRuntime()) return;
	let selected = path;
	if (!selected) {
		const { open } = await import('@tauri-apps/plugin-dialog');
		const picked = await open({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
		if (!picked || Array.isArray(picked)) return;
		selected = picked;
	}
	const content = await invoke<string>('open_file', { path: selected });
	// Set the file path FIRST so the image NodeView's get(doc).filePath is already
	// populated when setContent triggers node rendering — otherwise relative image
	// srcs can't be resolved to asset:// URLs.
	doc.load(selected);
	getRichHandle()?.setContent(content, { markClean: true });
	getSourceHandle()?.setContent(content);
	recentFiles.prepend(selected);
}

export async function save(): Promise<void> {
	if (!isTauriRuntime()) return;
	const { filePath } = doc.get();
	if (!filePath) {
		await saveAs();
		return;
	}
	const content = getActiveContent();
	try {
		await invoke<void>('save_file', { content });
		doc.markSaved();
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error('[mdreader] save failed:', msg);
		doc.markSaveError(msg);
	}
}

export async function saveAs(): Promise<void> {
	if (!isTauriRuntime()) return;
	const { save: saveDialog } = await import('@tauri-apps/plugin-dialog');
	const path = await saveDialog({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
	if (!path || Array.isArray(path)) return;
	const content = getActiveContent();
	try {
		await invoke<void>('set_current_file', { path });
		await invoke<void>('save_file', { content });
		doc.setFilePath(path);
		doc.markSaved();
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error('[mdreader] saveAs failed:', msg);
		doc.markSaveError(msg);
	}
}

export function newFile(): void {
	getRichHandle()?.setContent('', { markClean: true });
	getSourceHandle()?.setContent('');
	doc.reset();
}
