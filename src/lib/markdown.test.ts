import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Strike from '@tiptap/extension-strike';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';

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
			CodeBlockLowlight.configure({ lowlight })
		],
		content
	});
}

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
			const result = editor.storage.markdown.getMarkdown().trim();
			editor.destroy();
			expect(result).toBe(markdown.trim());
		});
	}
});

describe('extended markdown round-trip', () => {
	it('round-trips strikethrough', () => {
		const md = 'This is ~~struck~~ text.';
		const editor = createExtendedEditor(md);
		const result = editor.storage.markdown.getMarkdown().trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a fenced code block', () => {
		const md = '```javascript\nconsole.log("hello");\n```';
		const editor = createExtendedEditor(md);
		const result = editor.storage.markdown.getMarkdown().trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips an unchecked task list item', () => {
		const md = '- [ ] Unchecked task';
		const editor = createExtendedEditor(md);
		const result = editor.storage.markdown.getMarkdown().trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a checked task list item', () => {
		const md = '- [x] Checked task';
		const editor = createExtendedEditor(md);
		const result = editor.storage.markdown.getMarkdown().trim();
		editor.destroy();
		expect(result).toBe(md);
	});
});
