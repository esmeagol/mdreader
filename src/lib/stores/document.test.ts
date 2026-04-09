import { describe, it, expect, beforeEach } from 'vitest';
import { document } from './document';

describe('document store', () => {
	beforeEach(() => {
		document.reset();
	});

	it('load sets filePath and clears dirty flag', () => {
		document.load('/path/to/file.md');
		expect(document.get().isDirty).toBe(false);
		expect(document.get().filePath).toBe('/path/to/file.md');
	});

	it('load with null filePath represents an unsaved new file', () => {
		document.load('/some/file.md');
		document.load(null);
		expect(document.get().filePath).toBeNull();
		expect(document.get().isDirty).toBe(false);
	});

	it('markDirty sets isDirty independently', () => {
		document.load('/file.md');
		document.markDirty(true);
		expect(document.get().isDirty).toBe(true);
		document.markDirty(false);
		expect(document.get().isDirty).toBe(false);
	});

	it('markSaved clears dirty flag and records timestamp', () => {
		document.markDirty(true);
		document.markSaved();
		expect(document.get().isDirty).toBe(false);
		expect(document.get().lastSaved).toBeInstanceOf(Date);
	});

	it('reset returns to empty state', () => {
		document.load('/file.md');
		document.markDirty(true);
		document.reset();
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
		document.load('/new.md');
		expect(document.get().saveError).toBeNull();
	});

	it('setFilePath updates filePath without touching isDirty', () => {
		document.load('/old.md');
		document.markDirty(true);
		document.setFilePath('/new.md');
		expect(document.get().filePath).toBe('/new.md');
		expect(document.get().isDirty).toBe(true);
	});
});
