import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Strike from '@tiptap/extension-strike';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { common, createLowlight } from 'lowlight';
import { getMarkdown } from './markdown';

const lowlight = createLowlight(common);

function createEditor(content = '') {
	return new Editor({ extensions: [StarterKit, Markdown], content });
}

function createExtendedEditor(content = '') {
	return new Editor({
		extensions: [
			StarterKit.configure({ codeBlock: false, strike: false }),
			Markdown,
			TaskList,
			TaskItem,
			Strike,
			CodeBlockLowlight.configure({ lowlight }),
			Table.configure({ resizable: false }),
			TableRow,
			TableHeader,
			TableCell
		],
		content
	});
}

describe('getMarkdown fallback', () => {
	it('returns empty string when editor has no Markdown extension', () => {
		// StarterKit alone has no markdown storage — exercises the ?? '' branch
		const editor = new Editor({ extensions: [StarterKit] });
		expect(getMarkdown(editor)).toBe('');
		editor.destroy();
	});
});

describe('markdown round-trip', () => {
	const cases: [string, string][] = [
		['heading 1', '# Hello World'],
		['heading 2', '## Section'],
		['heading 3', '### Subsection'],
		['bold', 'This is **bold** text.'],
		['italic', 'This is *italic* text.'],
		['inline code', 'Use `console.log()` here.'],
		['paragraph', 'Just a plain paragraph.']
	];

	for (const [name, markdown] of cases) {
		it(`round-trips ${name}`, () => {
			const editor = createEditor(markdown);
			const result = getMarkdown(editor).trim();
			editor.destroy();
			expect(result).toBe(markdown.trim());
		});
	}
});

describe('extended markdown round-trip', () => {
	it('round-trips strikethrough', () => {
		const md = 'This is ~~struck~~ text.';
		const editor = createExtendedEditor(md);
		const result = getMarkdown(editor).trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a fenced code block', () => {
		const md = '```javascript\nconsole.log("hello");\n```';
		const editor = createExtendedEditor(md);
		const result = getMarkdown(editor).trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips an unchecked task list item', () => {
		const md = '- [ ] Unchecked task';
		const editor = createExtendedEditor(md);
		const result = getMarkdown(editor).trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a checked task list item', () => {
		const md = '- [x] Checked task';
		const editor = createExtendedEditor(md);
		const result = getMarkdown(editor).trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a basic markdown table', () => {
		const md = '| Name | Role |\n| --- | --- |\n| Alice | Engineer |';
		const editor = createExtendedEditor(md);
		const result = getMarkdown(editor).trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a markdown table with inline formatting', () => {
		const md = '| Name | Notes |\n| --- | --- |\n| Alice | **Strong** and *italic* |';
		const editor = createExtendedEditor(md);
		const result = getMarkdown(editor).trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('parses blockquote to blockquote in the DOM', () => {
		const md = '> First line\n> Second line\n\nAfter';
		const editor = createExtendedEditor(md);
		expect(editor.getHTML()).toContain('<blockquote>');
		expect(editor.getHTML()).toContain('First line');
		expect(editor.getHTML()).toContain('Second line');
		editor.destroy();
	});
});
