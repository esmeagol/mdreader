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

	it('update sets content without changing isDirty (DirtyState plugin owns the flag)', () => {
		document.load('initial', '/file.md');
		document.update('changed');
		expect(document.get().content).toBe('changed');
		expect(document.get().isDirty).toBe(false); // plugin calls markDirty separately
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

	it('markSaveError sets error message', () => {
		document.markSaveError('Could not write file: permission denied');
		expect(document.get().saveError).toBe('Could not write file: permission denied');
	});

	it('markSaved clears saveError', () => {
		document.markSaveError('some error');
		document.markSaved();
		expect(document.get().saveError).toBeNull();
	});

	it('load clears saveError', () => {
		document.markSaveError('some error');
		document.load('# New', '/new.md');
		expect(document.get().saveError).toBeNull();
	});

	it('setFilePath updates filePath without touching content or isDirty', () => {
		document.load('# Hello', '/old.md');
		document.update('# Hello edited');
		document.markDirty(true);
		document.setFilePath('/new.md');
		expect(document.get().filePath).toBe('/new.md');
		expect(document.get().content).toBe('# Hello edited');
		expect(document.get().isDirty).toBe(true);
	});

	it('markDirty sets isDirty independently of content', () => {
		document.load('initial', '/file.md');
		document.markDirty(true);
		expect(document.get().isDirty).toBe(true);
		expect(document.get().content).toBe('initial');
		document.markDirty(false);
		expect(document.get().isDirty).toBe(false);
	});
});
