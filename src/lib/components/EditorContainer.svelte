<script lang="ts">
	import { document as doc } from '$lib/stores/document';
	import EditorPane from './EditorPane.svelte';
	import SourcePane from './SourcePane.svelte';
	import FindBar from './FindBar.svelte';
	import { type EditorHandle, setActiveMode } from '$lib/editor';

	interface Props {
		editorMode: 'rich' | 'source';
		theme: 'light' | 'dark';
		showFindBar?: boolean;
		showReplace?: boolean;
		onCloseFindBar?: () => void;
	}

	let { editorMode, theme, showFindBar = false, showReplace = false, onCloseFindBar }: Props =
		$props();

	let richHandle: EditorHandle | null = $state(null);
	let sourceHandle: EditorHandle | null = $state(null);

	function handleChange(_md: string) {
		// Rich mode: DirtyState PM plugin owns dirty tracking.
		// Source mode: mark dirty on every change (no PM plugin there).
		if (editorMode === 'source') doc.markDirty(true);
	}

	// On mode switch: sync content from the pane we're leaving to the one we're
	// entering. setContent without { markClean } preserves the DirtyState baseline,
	// so the plugin correctly reports dirty if content differs from the saved file.
	$effect(() => {
		const mode = editorMode;
		setActiveMode(mode);
		if (mode === 'source' && richHandle && sourceHandle) {
			const c = richHandle.getContent();
			if (sourceHandle.getContent() !== c) sourceHandle.setContent(c);
		}
		if (mode === 'rich' && sourceHandle && richHandle) {
			const c = sourceHandle.getContent();
			if (richHandle.getContent() !== c) richHandle.setContent(c);
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

{#if showFindBar}
	<FindBar
		{showReplace}
		onQuery={(q) => richHandle?.setSearchTerm(q)}
		onReplace={(r) => richHandle?.setReplaceTerm(r)}
		onNext={() => richHandle?.nextMatch()}
		onPrev={() => richHandle?.prevMatch()}
		onReplaceOne={() => richHandle?.replaceOne()}
		onReplaceAll={() => richHandle?.replaceAll()}
		onClose={() => onCloseFindBar?.()}
	/>
{/if}

<div class:hidden={editorMode !== 'rich'} class="pane-wrap">
	<EditorPane content="" onChange={handleChange} onReady={(h) => (richHandle = h)} {theme} />
</div>
<div class:hidden={editorMode !== 'source'} class="pane-wrap">
	<SourcePane content="" onChange={handleChange} onReady={(h) => (sourceHandle = h)} {theme} />
</div>

<style>
	.pane-wrap {
		height: 100%;
	}
	.pane-wrap.hidden {
		display: none;
	}
</style>
