<script lang="ts">
	import { document as doc } from '$lib/stores/document';
	import { formatWordCount } from '$lib/utils';
</script>

<footer data-testid="status-bar" class="status-bar">
	{#if $doc.saveError}
		<span class="save-error" title={$doc.saveError}>⚠ {$doc.saveError}</span>
	{:else}
		<span>{formatWordCount($doc.content)}</span>
	{/if}
</footer>

<style>
	.save-error {
		color: #c0392b;
		font-weight: 500;
	}
</style>
