<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { markdown } from '@codemirror/lang-markdown';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { EditorState, Annotation } from '@codemirror/state';
	import { type EditorHandle, setSourceHandle } from '$lib/editor';

	// Marks transactions dispatched by setContent so the updateListener
	// doesn't echo them back through onChange.
	const externalChange = Annotation.define<boolean>();

	interface Props {
		content: string;
		onChange: (value: string) => void;
		onReady?: (handle: EditorHandle) => void;
		theme: 'light' | 'dark';
	}

	let { content, onChange, onReady, theme }: Props = $props();

	let containerEl: HTMLElement;
	let view: EditorView;

	onMount(() => {
		view = new EditorView({
			state: EditorState.create({
				doc: content,
				extensions: [
					basicSetup,
					markdown(),
					...(theme === 'dark' ? [oneDark] : []),
					EditorView.updateListener.of((update) => {
						if (
							update.docChanged &&
							!update.transactions.some((tr) => tr.annotation(externalChange))
						) {
							onChange(update.state.doc.toString());
						}
					})
				]
			}),
			parent: containerEl
		});

		const handle: EditorHandle = {
			// opts.markClean is a no-op for SourcePane (no PM dirty tracking)
			setContent(text: string, _opts?: { markClean?: boolean }) {
				const current = view.state.doc.toString();
				if (current === text) return;
				view.dispatch({
					changes: { from: 0, to: view.state.doc.length, insert: text },
					annotations: [externalChange.of(true)]
				});
			},
			getContent(): string {
				return view.state.doc.toString();
			},
			markSaved() {
				// no-op: SourcePane has no clean-baseline concept
			},
			setSearchTerm() {},
			setReplaceTerm() {},
			nextMatch() {},
			prevMatch() {},
			replaceOne() {},
			replaceAll() {}
		};
		setSourceHandle(handle);
		onReady?.(handle);
	});

	onDestroy(() => {
		setSourceHandle(null);
		view?.destroy();
	});
</script>

<div bind:this={containerEl} data-testid="source-editor" class="source-editor"></div>

<style>
	.source-editor {
		height: 100%;
		overflow-y: auto;
	}
	:global(.source-editor .cm-editor) {
		height: 100%;
		font-size: 14px;
	}
</style>
