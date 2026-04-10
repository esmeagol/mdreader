import { describe, it, expect } from 'vitest';
import {
	countWords,
	documentDisplayName,
	formatWordCount,
	formatTitle,
	resolveImages,
	unresolveImages
} from './utils';

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

	it('returns Untitled for a bare root path that yields no segments', () => {
		expect(documentDisplayName('/')).toBe('Untitled');
	});
});

// Tauri's asset protocol handler does:
//   path = percentDecode(url.path().bytes()[1..])
// So the leading "/" of the URL path is stripped, then the remainder is decoded.
// To get an absolute path back, the ENTIRE absolute path (including its leading "/")
// must be encodeURIComponent'd as one token, e.g.:
//   /docs/notes/Redis1.png → encodeURIComponent → %2Fdocs%2Fnotes%2FRedis1.png
//   URL: asset://localhost/%2Fdocs%2Fnotes%2FRedis1.png
//   Handler: strip leading "/", decode → /docs/notes/Redis1.png  ✓
describe('resolveImages', () => {
	const filePath = '/docs/notes/Redis.md';
	// expected asset URL for /docs/notes/Redis1.png
	const encoded = encodeURIComponent('/docs/notes/Redis1.png');

	it('rewrites a relative image to an asset URL using encodeURIComponent on the full path', () => {
		expect(resolveImages('![alt](Redis1.png)', filePath)).toBe(
			`![alt](asset://localhost/${encoded})`
		);
	});

	it('leaves absolute http URLs untouched', () => {
		const md = '![alt](https://example.com/img.png)';
		expect(resolveImages(md, filePath)).toBe(md);
	});

	it('leaves existing asset:// URLs untouched', () => {
		const md = `![alt](asset://localhost/${encoded})`;
		expect(resolveImages(md, filePath)).toBe(md);
	});

	it('leaves absolute paths (starting with /) untouched', () => {
		const md = '![alt](/absolute/path.png)';
		expect(resolveImages(md, filePath)).toBe(md);
	});

	it('rewrites multiple images in one document', () => {
		const md = '![a](A.png)\n\nSome text\n\n![b](B.png)';
		const result = resolveImages(md, filePath);
		expect(result).toContain(encodeURIComponent('/docs/notes/A.png'));
		expect(result).toContain(encodeURIComponent('/docs/notes/B.png'));
	});

	it('encodes spaces in directory segments (full-path encodeURIComponent)', () => {
		const spaced = '/Interview Prep/System Design/Redis.md';
		const result = resolveImages('![alt](Redis1.png)', spaced);
		const expected = encodeURIComponent('/Interview Prep/System Design/Redis1.png');
		expect(result).toBe(`![alt](asset://localhost/${expected})`);
	});
});

describe('unresolveImages', () => {
	const filePath = '/docs/notes/Redis.md';

	it('strips the asset prefix back to a relative path', () => {
		const md = `![alt](asset://localhost/${encodeURIComponent('/docs/notes/Redis1.png')})`;
		expect(unresolveImages(md, filePath)).toBe('![alt](Redis1.png)');
	});

	it('leaves non-asset URLs untouched', () => {
		const md = '![alt](https://example.com/img.png)';
		expect(unresolveImages(md, filePath)).toBe(md);
	});

	it('leaves asset URLs from a different directory untouched', () => {
		const md = `![alt](asset://localhost/${encodeURIComponent('/other/dir/img.png')})`;
		expect(unresolveImages(md, filePath)).toBe(md);
	});

	it('round-trips: unresolve(resolve(md)) === md', () => {
		const original = '![a](A.png)\n\n![b](B.png)';
		expect(unresolveImages(resolveImages(original, filePath), filePath)).toBe(original);
	});

	it('round-trips correctly when path has spaces', () => {
		const spaced = '/Interview Prep/System Design/Redis.md';
		const original = '![alt](Redis1.png)';
		expect(unresolveImages(resolveImages(original, spaced), spaced)).toBe(original);
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
