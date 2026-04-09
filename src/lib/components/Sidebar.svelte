<script lang="ts">
	import { headings } from '$lib/stores/headings';
	import RecentFiles from './RecentFiles.svelte';

	interface Props {
		onOpenFile: (path: string) => void;
	}
	let { onOpenFile }: Props = $props();
</script>

<div data-testid="sidebar" class="sidebar">
	<RecentFiles {onOpenFile} />

	{#if $headings.length > 0}
		<section class="outline">
			<p class="label">Outline</p>
			{#each $headings as h (h.slug + h.level)}
				<button
					class="heading-item level-{h.level}"
					onclick={() => {
						document.getElementById(h.slug)?.scrollIntoView({ behavior: 'smooth' });
					}}
				>
					{h.text}
				</button>
			{/each}
		</section>
	{/if}
</div>

<style>
	.sidebar {
		padding: 12px 8px;
		height: 100%;
		overflow-y: auto;
	}
	.label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		padding: 0 4px;
		margin-bottom: 4px;
	}
	.outline {
		margin-top: 8px;
	}
	.heading-item {
		display: block;
		width: 100%;
		text-align: left;
		font-size: 12px;
		color: var(--color-text);
		background: none;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 3px 4px;
	}
	.heading-item:hover {
		background: var(--color-border);
	}
	.heading-item.level-2 {
		padding-left: 14px;
	}
	.heading-item.level-3 {
		padding-left: 24px;
	}
</style>
