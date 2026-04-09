import { writable, get as getStore } from 'svelte/store';

export interface DocumentState {
	content: string;
	filePath: string | null;
	isDirty: boolean;
	lastSaved: Date | null;
	saveError: string | null;
}

function createDocumentStore() {
	const store = writable<DocumentState>({
		content: '',
		filePath: null,
		isDirty: false,
		lastSaved: null,
		saveError: null
	});

	return {
		subscribe: store.subscribe,
		get: () => getStore(store),
		load(content: string, filePath: string | null) {
			store.set({ content, filePath, isDirty: false, lastSaved: null, saveError: null });
		},
		update(content: string) {
			store.update((s) => ({ ...s, content }));
		},
		markDirty(isDirty: boolean) {
			store.update((s) => ({ ...s, isDirty }));
		},
		markSaved() {
			store.update((s) => ({ ...s, isDirty: false, lastSaved: new Date(), saveError: null }));
		},
		setFilePath(path: string) {
			store.update((s) => ({ ...s, filePath: path }));
		},
		markSaveError(message: string) {
			store.update((s) => ({ ...s, saveError: message }));
		},
		reset() {
			store.set({ content: '', filePath: null, isDirty: false, lastSaved: null, saveError: null });
		}
	};
}

export const document = createDocumentStore();
