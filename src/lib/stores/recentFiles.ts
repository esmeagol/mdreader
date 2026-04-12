import { writable, get as getStore } from 'svelte/store';

// Must stay in sync with MAX_RECENT in src-tauri/src/recent_files.rs (Rust trims
// the on-disk list to the same cap so the sidebar and the JSON file never disagree).
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
