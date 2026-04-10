<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import type { EditorProps } from '@tiptap/pm/view';
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
	import { getMarkdown } from '$lib/markdown';
	import { Headings } from '$lib/Headings';
	import { type EditorHandle, setRichHandle } from '$lib/editor';
	import { DirtyState, MARK_CLEAN_KEY } from '$lib/DirtyState';
	import { WordCount } from '$lib/WordCount';
	import { document as doc } from '$lib/stores/document';
	import { wordCount } from '$lib/stores/wordCount';
	import { headings } from '$lib/stores/headings';

	const lowlight = createLowlight(common);

	interface Props {
		content: string;
		onChange: (md: string) => void;
		onReady?: (handle: EditorHandle) => void;
		theme: 'light' | 'dark';
	}

	let { content, onChange, onReady, theme }: Props = $props();

	let editorEl: HTMLElement;
	let editor: Editor;
	let linkClickHandler: ((e: MouseEvent) => void) | undefined;

	function buildEditorProps(themeVal: 'light' | 'dark'): EditorProps {
		return {
			attributes: {
				class: 'tiptap',
				'data-editor-theme': themeVal
			},
			handleKeyDown(_view, e) {
				if (!editor?.isFocused) return false;
				if (e.metaKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
					e.preventDefault();
					return true;
				}
				if (e.metaKey && !e.shiftKey && (e.key === '`' || e.code === 'Backquote')) {
					e.preventDefault();
					return editor.chain().focus().toggleCode().run();
				}
				return false;
			}
		};
	}

	onMount(() => {
		editor = new Editor({
			element: editorEl,
			extensions: [
				StarterKit.configure({ codeBlock: false, strike: false }),
				Headings((h) => headings.set(h)),
				DirtyState((isDirty) => doc.markDirty(isDirty)),
				WordCount((count) => wordCount.set(count)),
				Markdown,
				TaskList,
				TaskItem.configure({ nested: true }),
				Strike,
				CodeBlockLowlight.configure({ lowlight }),
				Table.configure({ resizable: false }),
				TableRow,
				TableHeader,
				TableCell
			],
			content,
			editorProps: buildEditorProps(theme),
			onUpdate: ({ editor }) => {
				onChange(getMarkdown(editor));
			}
		});

		const handle: EditorHandle = {
			setContent(markdown: string, opts?: { markClean?: boolean }) {
				editor.commands.setContent(markdown, { emitUpdate: false });
				if (opts?.markClean) {
					const { tr } = editor.state;
					editor.view.dispatch(tr.setMeta(MARK_CLEAN_KEY, true));
				}
			},
			getContent(): string {
				return getMarkdown(editor);
			},
			markSaved() {
				const { tr } = editor.state;
				editor.view.dispatch(tr.setMeta(MARK_CLEAN_KEY, true));
			},
			setSearchTerm(_term: string) {},
			setReplaceTerm(_term: string) {},
			nextMatch() {},
			prevMatch() {},
			replaceOne() {},
			replaceAll() {}
		};
		setRichHandle(handle);
		onReady?.(handle);

		linkClickHandler = async (e: MouseEvent) => {
			const anchor = (e.target as HTMLElement).closest('a');
			if (!anchor) return;
			const href = anchor.getAttribute('href');
			if (!href) return;
			e.preventDefault();
			if (href.startsWith('http://') || href.startsWith('https://')) {
				const { open } = await import('@tauri-apps/plugin-shell');
				open(href);
			}
		};
		editorEl.addEventListener('click', linkClickHandler);
	});

	$effect(() => {
		if (!editor) return;
		editor.setOptions({
			editorProps: buildEditorProps(theme)
		});
	});

	onDestroy(() => {
		setRichHandle(null);
		if (linkClickHandler) editorEl?.removeEventListener('click', linkClickHandler);
		editor?.destroy();
	});
</script>

<div bind:this={editorEl} class="editor-mount"></div>

<style>
	.editor-mount {
		height: 100%;
	}

	:global(.tiptap) {
		outline: none;
		min-height: 100%;
		font-size: var(--font-size-editor);
		line-height: 1.7;
		color: var(--color-text);
	}
	:global(.tiptap h1) {
		font-size: 2em;
		font-weight: 700;
		margin: 0.5em 0;
	}
	:global(.tiptap h2) {
		font-size: 1.5em;
		font-weight: 600;
		margin: 0.5em 0;
	}
	:global(.tiptap h3) {
		font-size: 1.25em;
		font-weight: 600;
		margin: 0.5em 0;
	}
	:global(.tiptap p) {
		margin: 0.5em 0;
	}
	:global(.tiptap blockquote) {
		margin: 0.75em 0;
		padding: 0.35em 0 0.35em 1em;
		border-left: 4px solid var(--color-border);
		color: var(--color-text-muted);
		background: var(--color-bg-sidebar);
		border-radius: 0 6px 6px 0;
	}
	:global(.tiptap blockquote p) {
		margin: 0.35em 0;
	}
	:global(.tiptap blockquote p:first-child) {
		margin-top: 0;
	}
	:global(.tiptap blockquote p:last-child) {
		margin-bottom: 0;
	}
	:global(.tiptap strong) {
		font-weight: 700;
	}
	:global(.tiptap em) {
		font-style: italic;
	}
	:global(.tiptap code) {
		font-family: 'Menlo', monospace;
		background: rgba(0, 0, 0, 0.06);
		padding: 0.1em 0.3em;
		border-radius: 3px;
		font-size: 0.9em;
	}
	:global(.tiptap pre) {
		background: var(--color-bg-sidebar);
		border-radius: 6px;
		padding: 1em;
		overflow-x: auto;
		font-family: 'Menlo', monospace;
		font-size: 0.875em;
	}
	:global(.tiptap input[type='checkbox']) {
		margin-right: 6px;
	}
	:global(.tiptap s) {
		text-decoration: line-through;
		opacity: 0.6;
	}
	:global(.tiptap table) {
		border-collapse: collapse;
		margin: 1em 0;
		width: 100%;
		overflow: hidden;
	}
	:global(.tiptap th),
	:global(.tiptap td) {
		border: 1px solid var(--color-border);
		padding: 0.4em 0.6em;
		text-align: left;
		vertical-align: top;
	}
	:global(.tiptap th) {
		background: var(--color-bg-sidebar);
		font-weight: 600;
	}
</style>
