<script lang="ts">
	import { document as doc } from '$lib/stores/document';
	import EditorPane from './EditorPane.svelte';
	import SourcePane from './SourcePane.svelte';

	interface Props {
		editorMode: 'rich' | 'source';
		theme: 'light' | 'dark';
	}

	let { editorMode, theme }: Props = $props();

	let content = $state(doc.get().content);

	function handleChange(md: string) {
		content = md;
		doc.update(md);
	}

	$effect(() => {
		const storeContent = $doc.content;
		if (storeContent !== content) content = storeContent;
	});
</script>

{#if editorMode === 'rich'}
	<EditorPane {content} onChange={handleChange} />
{:else}
	<SourcePane {content} onChange={handleChange} {theme} />
{/if}
