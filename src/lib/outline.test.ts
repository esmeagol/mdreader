import { describe, it, expect } from 'vitest';
import { extractHeadings } from './outline';

describe('extractHeadings', () => {
	it('returns empty array for no headings', () => {
		expect(extractHeadings('Just a paragraph.')).toEqual([]);
	});

	it('extracts a single H1', () => {
		const result = extractHeadings('# Title');
		expect(result).toEqual([{ level: 1, text: 'Title', slug: 'title' }]);
	});

	it('extracts mixed levels in order', () => {
		const md = '# H1\n\nparagraph\n\n## H2\n\n### H3';
		const result = extractHeadings(md);
		expect(result).toHaveLength(3);
		expect(result[0]).toMatchObject({ level: 1, text: 'H1' });
		expect(result[1]).toMatchObject({ level: 2, text: 'H2' });
		expect(result[2]).toMatchObject({ level: 3, text: 'H3' });
	});

	it('ignores headings inside code blocks', () => {
		const md = '```\n# not a heading\n```';
		expect(extractHeadings(md)).toHaveLength(0);
	});
});
