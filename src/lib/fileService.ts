import { document as doc } from './stores/document';
import { recentFiles } from './stores/recentFiles';

let tauriInvoke: (<T>(cmd: string, args: Record<string, unknown>) => Promise<T>) | null = null;

export function isTauriRuntime(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function initTauri(): Promise<void> {
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
	doc.load(content, selected);
	recentFiles.prepend(selected);
}

export async function save(): Promise<void> {
	if (!isTauriRuntime()) return;
	const { content, filePath } = doc.get();
	if (!filePath) {
		await saveAs();
		return;
	}
	try {
		await invoke<void>('save_file', { content });
		doc.markSaved();
	} catch (e) {
		doc.markSaveError(e instanceof Error ? e.message : String(e));
	}
}

export async function saveAs(): Promise<void> {
	if (!isTauriRuntime()) return;
	const { content } = doc.get();
	const { save: saveDialog } = await import('@tauri-apps/plugin-dialog');
	const path = await saveDialog({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
	if (!path || Array.isArray(path)) return;
	try {
		await invoke<void>('set_current_file', { path });
		await invoke<void>('save_file', { content });
		doc.setFilePath(path);
		doc.markSaved();
	} catch (e) {
		doc.markSaveError(e instanceof Error ? e.message : String(e));
	}
}

export function newFile(): void {
	doc.reset();
}
