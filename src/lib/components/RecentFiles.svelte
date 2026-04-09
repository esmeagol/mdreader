<script lang="ts">
	import { recentFiles } from '$lib/stores/recentFiles';

	interface Props {
		onOpen: (path: string) => void;
	}
	let { onOpen }: Props = $props();

	const displayName = (p: string) => p.split('/').pop() ?? p;
</script>

{#if $recentFiles.length > 0}
	<section class="recent">
		<p class="label">Recent</p>
		{#each $recentFiles as path (path)}
			<button class="item" onclick={() => onOpen(path)} title={path}>
				{displayName(path)}
			</button>
		{/each}
	</section>
{/if}

<style>
	.recent {
		margin-top: 8px;
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
	.item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 4px 4px;
		font-size: 12px;
		color: var(--color-text);
		background: none;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item:hover {
		background: var(--color-border);
	}
</style>
