export type ThemePreference = 'system' | 'light' | 'dark';

const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

export function cycleThemePreference(current: ThemePreference): ThemePreference {
	const i = ORDER.indexOf(current);
	const next = (i + 1) % ORDER.length;
	return ORDER[next]!;
}
