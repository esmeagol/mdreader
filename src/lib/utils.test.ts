import { describe, it, expect } from 'vitest';
import { formatWordCount, formatTitle } from './utils';

describe('formatWordCount', () => {
	it('returns "0 words" for empty string', () => {
		expect(formatWordCount('')).toBe('0 words');
	});

	it('returns "1 word" for a single word', () => {
		expect(formatWordCount('hello')).toBe('1 word');
	});

	it('returns "3 words" for three words', () => {
		expect(formatWordCount('hello world foo')).toBe('3 words');
	});

	it('ignores extra whitespace', () => {
		expect(formatWordCount('  hello   world  ')).toBe('2 words');
	});
});

describe('formatTitle', () => {
	it('shows filename when clean', () => {
		expect(formatTitle('/docs/notes.md', false)).toBe('notes.md — mdreader');
	});
	it('shows bullet when dirty', () => {
		expect(formatTitle('/docs/notes.md', true)).toBe('• notes.md — mdreader');
	});
	it('shows Untitled for new file', () => {
		expect(formatTitle(null, false)).toBe('Untitled — mdreader');
	});
});
