import { describe, it, expect, beforeEach } from 'vitest';
import { document } from './document';

describe('document store', () => {
	beforeEach(() => {
		document.reset();
	});

	it('load sets content and clears dirty flag', () => {
		document.load('# Hello', '/path/to/file.md');
		expect(document.get().content).toBe('# Hello');
		expect(document.get().isDirty).toBe(false);
		expect(document.get().filePath).toBe('/path/to/file.md');
	});

	it('update sets content and marks dirty', () => {
		document.load('initial', '/file.md');
		document.update('changed');
		expect(document.get().content).toBe('changed');
		expect(document.get().isDirty).toBe(true);
	});

	it('markSaved clears dirty flag', () => {
		document.update('some content');
		document.markSaved();
		expect(document.get().isDirty).toBe(false);
		expect(document.get().lastSaved).toBeInstanceOf(Date);
	});

	it('reset returns to empty state', () => {
		document.load('# Content', '/file.md');
		document.reset();
		expect(document.get().content).toBe('');
		expect(document.get().filePath).toBeNull();
		expect(document.get().isDirty).toBe(false);
	});
});
