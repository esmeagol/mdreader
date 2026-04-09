<script lang="ts">
	import { document as doc } from '$lib/stores/document';
	import { wordCount } from '$lib/stores/wordCount';
	import { documentDisplayName, formatWordCount } from '$lib/utils';
</script>

<footer data-testid="status-bar" class="status-bar">
	<span class="doc-label" data-testid="document-title" title={$doc.filePath ?? 'Untitled'}>
		{#if $doc.isDirty}<span class="dirty" aria-hidden="true">•</span>{/if}
		{documentDisplayName($doc.filePath)}
	</span>
	<span class="status-right">
		{#if $doc.saveError}
			<span class="save-error" title={$doc.saveError}>⚠ {$doc.saveError}</span>
		{:else}
			<span>{formatWordCount($wordCount)}</span>
		{/if}
	</span>
</footer>

<style>
	.status-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex: 1;
		width: 100%;
		min-width: 0;
	}
	.doc-label {
		font-weight: 500;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dirty {
		color: var(--color-text-muted);
		margin-right: 4px;
	}
	.status-right {
		flex-shrink: 0;
	}
	.save-error {
		color: #c0392b;
		font-weight: 500;
	}
</style>
