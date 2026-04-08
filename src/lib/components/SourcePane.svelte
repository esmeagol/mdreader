<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { markdown } from '@codemirror/lang-markdown';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { EditorState } from '@codemirror/state';

	interface Props {
		content: string;
		onChange: (value: string) => void;
		theme: 'light' | 'dark';
	}

	let { content, onChange, theme }: Props = $props();

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
						if (update.docChanged) onChange(update.state.doc.toString());
					})
				]
			}),
			parent: containerEl
		});
	});

	onDestroy(() => view?.destroy());
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
