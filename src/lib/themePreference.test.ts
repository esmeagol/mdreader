import { describe, it, expect } from 'vitest';
import { cycleThemePreference } from './themePreference';

describe('cycleThemePreference', () => {
	it('cycles system → light → dark → system', () => {
		expect(cycleThemePreference('system')).toBe('light');
		expect(cycleThemePreference('light')).toBe('dark');
		expect(cycleThemePreference('dark')).toBe('system');
	});
});
