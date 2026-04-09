<script lang="ts">
	import { document as doc } from '$lib/stores/document';
	import EditorPane from './EditorPane.svelte';
	import SourcePane from './SourcePane.svelte';
	import { type EditorHandle } from '$lib/editor';

	interface Props {
		editorMode: 'rich' | 'source';
		theme: 'light' | 'dark';
	}

	let { editorMode, theme }: Props = $props();

	let handle: EditorHandle | null = $state(null);

	function handleChange(md: string) {
		doc.update(md);
	}

	function handleReady(h: EditorHandle) {
		handle = h;
	}

	$effect(() => {
		const storeContent = $doc.content;
		if (handle && handle.getContent() !== storeContent) {
			handle.setContent(storeContent);
		}
	});
</script>

{#if editorMode === 'rich'}
	<EditorPane content={doc.get().content} onChange={handleChange} onReady={handleReady} {theme} />
{:else}
	<SourcePane content={$doc.content} onChange={handleChange} {theme} />
{/if}
