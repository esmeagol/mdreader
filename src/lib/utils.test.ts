import { describe, it, expect } from 'vitest';
import { formatWordCount } from './utils';

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
