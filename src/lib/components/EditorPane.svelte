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
	import { TextSelection } from '@tiptap/pm/state';
	import { SourceOnFocus } from '$lib/SourceOnFocus';
	import Image from '@tiptap/extension-image';
	import Heading from '@tiptap/extension-heading';
	import type { NodeViewRenderer } from '@tiptap/core';
	import { get } from 'svelte/store';
	import { document as doc } from '$lib/stores/document';
	import { wordCount } from '$lib/stores/wordCount';
	import { headings } from '$lib/stores/headings';

	const lowlight = createLowlight(common);

	/** Heading NodeView: shows `# / ## / ###` prefix only when cursor is inside the block.
	 *  Uses the native h1/h2/h3 element so existing CSS still applies for the inactive state.
	 *  The `block-active` class (added by the SourceOnFocus decoration plugin) triggers CSS
	 *  that shows the prefix and collapses the heading font to body size. */
	function makeHeadingNodeView(level: 1 | 2 | 3): NodeViewRenderer {
		return ({ node }) => {
			const dom = document.createElement(`h${level}`);

			const prefix = document.createElement('span');
			prefix.className = 'md-prefix';
			prefix.setAttribute('contenteditable', 'false');
			prefix.textContent = '#'.repeat(level) + ' ';

			const contentDOM = document.createElement('span');

			dom.appendChild(prefix);
			dom.appendChild(contentDOM);

			return {
				dom,
				contentDOM,
				update(updatedNode) {
					return (
						updatedNode.type.name === 'heading' && updatedNode.attrs.level === level
					);
				}
			};
		};
	}

	/** Convert an image src to an asset:// URL for Tauri rendering.
	 *  - Relative path  → resolved against the open file's directory
	 *  - Absolute path  → used directly (covers pasted images saved to app-data)
	 *  - http/asset/data → returned unchanged
	 *  Runs only in the NodeView (render layer); the ProseMirror model always keeps
	 *  the original src so tiptap-markdown serialises it back to disk unchanged. */
	function toDisplaySrc(src: string): string {
		if (!src || /^(https?|asset|data):/.test(src)) return src;
		if (src.startsWith('/')) {
			// Absolute filesystem path — encode as single token for the asset handler
			return `asset://localhost/${encodeURIComponent(src)}`;
		}
		// Relative path — resolve against the currently open file's directory
		const filePath = get(doc).filePath;
		if (!filePath) return src;
		const dir = filePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
		return `asset://localhost/${encodeURIComponent(`${dir}/${src}`)}`;
	}

	// NodeView renders images via toDisplaySrc but keeps the raw src in the ProseMirror
	// model, so tiptap-markdown serialises back to the original markdown unchanged.
	const imageNodeView: NodeViewRenderer = ({ node }) => {
		const wrapper = document.createElement('span');
		wrapper.className = 'image-nodeview';

		const img = document.createElement('img');
		const rawSrc: string = node.attrs.src ?? '';
		img.src = toDisplaySrc(rawSrc);
		img.alt = node.attrs.alt ?? '';
		if (node.attrs.title) img.title = node.attrs.title;

		img.addEventListener('error', () => {
			img.style.display = 'none';
			const fb = document.createElement('span');
			fb.className = 'image-fallback';
			const label = img.alt || decodeURIComponent(rawSrc.split('/').pop() ?? 'image');
			fb.textContent = `\uD83D\uDDBC\uFE0F ${label}`;
			wrapper.appendChild(fb);
		});

		wrapper.appendChild(img);

		return {
			dom: wrapper,
			update(updatedNode) {
				if (updatedNode.type.name !== 'image') return false;
				const newSrc: string = updatedNode.attrs.src ?? '';
				img.src = toDisplaySrc(newSrc);
				img.alt = updatedNode.attrs.alt ?? '';
				return true;
			}
		};
	};

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
	let replaceTerm = '';

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
				StarterKit.configure({ codeBlock: false, strike: false, heading: false }),
				Heading.configure({ levels: [1, 2, 3] }).extend({
					addNodeView() {
						return (props) => makeHeadingNodeView(props.node.attrs.level as 1 | 2 | 3)(props);
					}
				}),
				SourceOnFocus,
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
				editor.view.dispatch(
					editor.state.tr.setMeta(searchHighlightKey, { term, current: -1 })
				);
			},
			setReplaceTerm(term: string) {
				replaceTerm = term;
			},
			nextMatch() {
				const pluginState = searchHighlightKey.getState(editor.state);
				if (!pluginState || !pluginState.matches.length) return;
				const next = (pluginState.current + 1) % pluginState.matches.length;
				const match = pluginState.matches[next];
				const tr = editor.state.tr
					.setMeta(searchHighlightKey, { current: next })
					.setSelection(TextSelection.create(editor.state.doc, match.from, match.to));
				editor.view.dispatch(tr);
				editor.view.focus();
			},
			prevMatch() {
				const pluginState = searchHighlightKey.getState(editor.state);
				if (!pluginState || !pluginState.matches.length) return;
				const prev =
					(pluginState.current - 1 + pluginState.matches.length) % pluginState.matches.length;
				const match = pluginState.matches[prev];
				const tr = editor.state.tr
					.setMeta(searchHighlightKey, { current: prev })
					.setSelection(TextSelection.create(editor.state.doc, match.from, match.to));
				editor.view.dispatch(tr);
				editor.view.focus();
			},
			replaceOne() {
				const pluginState = searchHighlightKey.getState(editor.state);
				if (!pluginState || pluginState.current < 0 || !pluginState.matches.length) return;
				const match = pluginState.matches[pluginState.current];
				editor.view
					.dispatch(
						editor.state.tr
							.replaceWith(match.from, match.to, editor.state.schema.text(replaceTerm))
							.setMeta(searchHighlightKey, { current: pluginState.current })
					);
			},
			replaceAll() {
				if (!replaceTerm && replaceTerm !== '') return;
				const pluginState = searchHighlightKey.getState(editor.state);
				if (!pluginState || !pluginState.matches.length) return;
				// Replace back-to-front so positions stay valid
				let tr = editor.state.tr;
				for (let i = pluginState.matches.length - 1; i >= 0; i--) {
					const { from, to } = pluginState.matches[i];
					tr = tr.replaceWith(from, to, editor.state.schema.text(replaceTerm));
				}
				editor.view.dispatch(tr);
			}
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

			// Store the absolute filesystem path in the model; the NodeView's
			// toDisplaySrc() handles the asset:// URL conversion for rendering.
			editor.chain().focus().setImage({ src: savedPath }).run();
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
		margin: 1em 0 0.4em;
		padding-bottom: 0.25em;
		border-bottom: 1px solid var(--color-border);
	}
	:global(.tiptap h2) {
		font-size: 1.5em;
		font-weight: 600;
		margin: 0.9em 0 0.35em;
		padding-bottom: 0.2em;
		border-bottom: 1px solid var(--color-border);
	}
	:global(.tiptap h3) {
		font-size: 1.25em;
		font-weight: 600;
		margin: 0.8em 0 0.3em;
	}

	/* Remove the border while in source-on-focus (editing) mode */
	:global(.tiptap h1.block-active),
	:global(.tiptap h2.block-active) {
		border-bottom: none;
		padding-bottom: 0;
	}

	/* Source-on-focus: hide the markdown prefix when cursor is elsewhere */
	:global(.tiptap h1 .md-prefix),
	:global(.tiptap h2 .md-prefix),
	:global(.tiptap h3 .md-prefix) {
		display: none;
		font-size: 1rem;
		font-weight: normal;
		color: var(--color-text-muted);
		user-select: none;
	}

	/* When cursor is inside the heading, collapse to body size and show prefix */
	:global(.tiptap h1.block-active),
	:global(.tiptap h2.block-active),
	:global(.tiptap h3.block-active) {
		font-size: 1rem;
		font-weight: normal;
		margin-top: 0;
		margin-bottom: 0;
	}
	:global(.tiptap h1.block-active .md-prefix),
	:global(.tiptap h2.block-active .md-prefix),
	:global(.tiptap h3.block-active .md-prefix) {
		display: inline;
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
