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

	let richHandle: EditorHandle | null = $state(null);
	let sourceHandle: EditorHandle | null = $state(null);

	function handleChange(md: string) {
		doc.update(md);
	}

	// Push external content changes (file loads) and mode-switch syncs to
	// the active pane only. The inactive pane retains its undo stack and is
	// synced once when it becomes active again.
	$effect(() => {
		const storeContent = $doc.content;
		if (editorMode === 'rich' && richHandle && richHandle.getContent() !== storeContent) {
			richHandle.setContent(storeContent);
		}
		if (editorMode === 'source' && sourceHandle && sourceHandle.getContent() !== storeContent) {
			sourceHandle.setContent(storeContent);
		}
	});

	// After a save, reset the DirtyState clean baseline in the rich editor.
	let lastSaved: Date | null = null;
	$effect(() => {
		const saved = $doc.lastSaved;
		if (saved && saved !== lastSaved && richHandle) {
			lastSaved = saved;
			richHandle.markSaved();
		}
	});
</script>

<div class:hidden={editorMode !== 'rich'} class="pane-wrap">
	<EditorPane
		content={doc.get().content}
		onChange={handleChange}
		onReady={(h) => (richHandle = h)}
		{theme}
	/>
</div>
<div class:hidden={editorMode !== 'source'} class="pane-wrap">
	<SourcePane
		content={doc.get().content}
		onChange={handleChange}
		onReady={(h) => (sourceHandle = h)}
		{theme}
	/>
</div>

<style>
	.pane-wrap {
		height: 100%;
	}
	.pane-wrap.hidden {
		display: none;
	}
</style>
