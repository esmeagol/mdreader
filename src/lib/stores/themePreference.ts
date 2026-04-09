import { writable } from 'svelte/store';
import { cycleThemePreference, type ThemePreference } from '$lib/themePreference';

const STORAGE_KEY = 'mdreader-theme-preference';

function readStorage(): ThemePreference {
	if (typeof localStorage === 'undefined') return 'system';
	const v = localStorage.getItem(STORAGE_KEY);
	if (v === 'light' || v === 'dark' || v === 'system') return v;
	return 'system';
}

function writeStorage(value: ThemePreference) {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, value);
	}
}

function createThemePreferenceStore() {
	const { subscribe, set, update } = writable<ThemePreference>('system');
	let hydrated = false;

	return {
		subscribe,
		/** Call once on client before reading preference for theme application. */
		initFromStorage() {
			if (hydrated) return;
			hydrated = true;
			set(readStorage());
		},
		set(value: ThemePreference) {
			writeStorage(value);
			set(value);
		},
		cycle() {
			update((current) => {
				const next = cycleThemePreference(current);
				writeStorage(next);
				return next;
			});
		}
	};
}

export const themePreference = createThemePreferenceStore();
