import { describe, it, expect } from 'vitest';
import { countWords, documentDisplayName, formatWordCount, formatTitle } from './utils';

describe('countWords', () => {
	it('returns 0 for empty string', () => {
		expect(countWords('')).toBe(0);
	});

	it('returns 1 for a single word', () => {
		expect(countWords('hello')).toBe(1);
	});

	it('returns 3 for three words', () => {
		expect(countWords('hello world foo')).toBe(3);
	});

	it('ignores extra whitespace', () => {
		expect(countWords('  hello   world  ')).toBe(2);
	});
});

describe('formatWordCount', () => {
	it('returns "0 words" for 0', () => {
		expect(formatWordCount(0)).toBe('0 words');
	});

	it('returns "1 word" for 1', () => {
		expect(formatWordCount(1)).toBe('1 word');
	});

	it('returns "3 words" for 3', () => {
		expect(formatWordCount(3)).toBe('3 words');
	});
});

describe('documentDisplayName', () => {
	it('returns Untitled when path is null or empty', () => {
		expect(documentDisplayName(null)).toBe('Untitled');
		expect(documentDisplayName('')).toBe('Untitled');
		expect(documentDisplayName('   ')).toBe('Untitled');
	});

	it('returns final path segment for posix paths', () => {
		expect(documentDisplayName('/docs/notes.md')).toBe('notes.md');
	});

	it('returns final segment for Windows-style paths', () => {
		expect(documentDisplayName('C:\\Users\\me\\doc.md')).toBe('doc.md');
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
