import { writable, get as getStore } from 'svelte/store';

export interface DocumentState {
	content: string;
	filePath: string | null;
	isDirty: boolean;
	lastSaved: Date | null;
}

function createDocumentStore() {
	const store = writable<DocumentState>({
		content: '',
		filePath: null,
		isDirty: false,
		lastSaved: null
	});

	return {
		subscribe: store.subscribe,
		get: () => getStore(store),
		load(content: string, filePath: string | null) {
			store.set({ content, filePath, isDirty: false, lastSaved: null });
		},
		update(content: string) {
			store.update((s) => ({ ...s, content, isDirty: true }));
		},
		markSaved() {
			store.update((s) => ({ ...s, isDirty: false, lastSaved: new Date() }));
		},
		reset() {
			store.set({ content: '', filePath: null, isDirty: false, lastSaved: null });
		}
	};
}

export const document = createDocumentStore();
