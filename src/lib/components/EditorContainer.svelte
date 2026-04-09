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

	// Push externally-loaded content into the editor when the store changes.
	$effect(() => {
		const storeContent = $doc.content;
		if (handle && handle.getContent() !== storeContent) {
			handle.setContent(storeContent);
		}
	});

	// After a save, reset the DirtyState clean baseline so that undoing back
	// to the saved content correctly shows the document as clean.
	let lastSaved: Date | null = null;
	$effect(() => {
		const saved = $doc.lastSaved;
		if (saved && saved !== lastSaved && handle) {
			lastSaved = saved;
			handle.markSaved();
		}
	});
</script>

{#if editorMode === 'rich'}
	<EditorPane content={doc.get().content} onChange={handleChange} onReady={handleReady} {theme} />
{:else}
	<SourcePane content={$doc.content} onChange={handleChange} {theme} />
{/if}
