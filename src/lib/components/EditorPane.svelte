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
	import { SearchHighlight, searchHighlightKey } from '$lib/SearchHighlight';
	import Image from '@tiptap/extension-image';
	import type { NodeViewRenderer } from '@tiptap/core';

	// Custom NodeView that renders a styled fallback when an image fails to load.
	// Shows the alt text (or decoded filename from the src) so the user knows what
	// content is missing even when the asset URL can't be resolved.
	const imageNodeView: NodeViewRenderer = ({ node }) => {
		const wrapper = document.createElement('span');
		wrapper.className = 'image-nodeview';

		const img = document.createElement('img');
		img.src = node.attrs.src ?? '';
		img.alt = node.attrs.alt ?? '';
		if (node.attrs.title) img.title = node.attrs.title;

		img.addEventListener('error', () => {
			img.style.display = 'none';
			const fb = document.createElement('span');
			fb.className = 'image-fallback';
			// Show alt text; fall back to the filename decoded from the src URL
			const label =
				img.alt ||
				decodeURIComponent((img.src.split('/').pop() ?? 'image').replace(/\?.*$/, ''));
			fb.textContent = `\uD83D\uDDBC\uFE0F ${label}`;
			wrapper.appendChild(fb);
		});

		wrapper.appendChild(img);

		return {
			dom: wrapper,
			update(updatedNode) {
				if (updatedNode.type.name !== 'image') return false;
				img.src = updatedNode.attrs.src ?? '';
				img.alt = updatedNode.attrs.alt ?? '';
				return true;
			}
		};
	};
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
	let pasteHandlerRef: ((e: ClipboardEvent) => Promise<void>) | undefined;

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
				TableCell,
				SearchHighlight,
				Image.extend({ addNodeView: () => imageNodeView })
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
			setSearchTerm(term: string) {
				const { state } = editor.view;
				editor.view.dispatch(state.tr.setMeta(searchHighlightKey, { term }));
			},
			setReplaceTerm(_term: string) {},
			nextMatch() {},
			prevMatch() {},
			replaceOne() {},
			replaceAll() {}
		};
		setRichHandle(handle);
		onReady?.(handle);

		pasteHandlerRef = async (e: ClipboardEvent) => {
			const items = Array.from(e.clipboardData?.items ?? []);
			const imageItem = items.find((i) => i.type.startsWith('image/'));
			if (!imageItem) return;
			e.preventDefault();

			// Only available in Tauri context
			if (!('__TAURI_INTERNALS__' in window)) return;

			const blob = imageItem.getAsFile();
			if (!blob) return;

			const arrayBuffer = await blob.arrayBuffer();
			const bytes = Array.from(new Uint8Array(arrayBuffer));
			const ext = blob.type.split('/')[1] ?? 'png';
			const filename = `pasted-${Date.now()}.${ext}`;

			const { appDataDir } = await import('@tauri-apps/api/path');
			const dir = await appDataDir();
			const path = `${dir}${filename}`;

			const { invoke } = await import('@tauri-apps/api/core');
			const savedPath = await invoke<string>('save_image', { path, bytes });

			// Convert to asset:// URL for loading local files
			const assetUrl = `asset://localhost${savedPath}`;
			editor.chain().focus().setImage({ src: assetUrl }).run();
		};
		editorEl.addEventListener('paste', pasteHandlerRef);

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
		if (pasteHandlerRef) editorEl?.removeEventListener('paste', pasteHandlerRef);
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
	:global(.image-nodeview) {
		display: inline-block;
	}
	:global(.image-fallback) {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.85em;
		color: var(--color-text-muted);
		background: var(--color-bg-sidebar);
		border: 1px dashed var(--color-border);
		border-radius: 4px;
		padding: 4px 8px;
		font-family: 'Menlo', monospace;
	}
	:global(.tiptap mark) {
		background: #ffeb3b;
		color: inherit;
		border-radius: 2px;
		padding: 0 1px;
	}
</style>
