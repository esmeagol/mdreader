import { writable, get as getStore } from 'svelte/store';

const MAX_RECENT = 10;

function createRecentFilesStore() {
	const store = writable<string[]>([]);

	return {
		subscribe: store.subscribe,
		get: () => getStore(store),
		set(paths: string[]) {
			store.set(paths);
		},
		prepend(path: string) {
			store.update((paths) => {
				const deduped = paths.filter((p) => p !== path);
				return [path, ...deduped].slice(0, MAX_RECENT);
			});
		}
	};
}

export const recentFiles = createRecentFilesStore();
