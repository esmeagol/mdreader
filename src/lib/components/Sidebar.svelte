<script lang="ts">
	import { document as doc } from '$lib/stores/document';
	import { extractHeadings } from '$lib/outline';
	import RecentFiles from './RecentFiles.svelte';

	interface Props {
		onOpen: (path: string) => void;
	}
	let { onOpen }: Props = $props();

	let headings = $derived(extractHeadings($doc.content));
</script>

<div data-testid="sidebar" class="sidebar">
	<RecentFiles {onOpen} />

	{#if headings.length > 0}
		<section class="outline">
			<p class="label">Outline</p>
			{#each headings as h (h.slug + h.level)}
				<button
					class="heading-item level-{h.level}"
					onclick={() => {
						const el = Array.from(
							document.querySelectorAll<HTMLElement>('.tiptap h1, .tiptap h2, .tiptap h3')
						).find((n) => n.textContent?.trim() === h.text);
						el?.scrollIntoView({ behavior: 'smooth' });
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
