<script lang="ts">
	import { tick } from 'svelte';
	import { headings } from '$lib/stores/headings';
	import RecentFiles from './RecentFiles.svelte';

	interface Props {
		onOpenFile: (path: string) => void;
	}
	let { onOpenFile }: Props = $props();

	let activeSlug = $state('');

	$effect(() => {
		void $headings;
		let cancelled = false;
		let observer: IntersectionObserver | undefined;

		void (async () => {
			await tick();
			await new Promise<void>((r) => requestAnimationFrame(() => r()));
			if (cancelled) return;

			const root = document.querySelector('.zone-editor');
			const editor = document.querySelector('.tiptap');
			if (!root || !editor) return;

			const ratios = new Map<Element, number>();

			function visibleRatioInRoot(el: HTMLElement, scrollRoot: Element): number {
				const er = el.getBoundingClientRect();
				const rr = scrollRoot.getBoundingClientRect();
				const h = er.height;
				if (h <= 0) return 0;
				const top = Math.max(er.top, rr.top);
				const bottom = Math.min(er.bottom, rr.bottom);
				return Math.max(0, bottom - top) / h;
			}

			const applyActive = () => {
				const list = [...editor.querySelectorAll<HTMLElement>('h1,h2,h3')];
				let slug = '';
				for (const h of list) {
					if (!h.id) continue;
					const r = Math.max(ratios.get(h) ?? 0, visibleRatioInRoot(h, root));
					if (r >= 0.5) {
						slug = h.id;
						break;
					}
				}
				activeSlug = slug;
			};

			observer = new IntersectionObserver(
				(entries) => {
					for (const e of entries) ratios.set(e.target, e.intersectionRatio);
					applyActive();
				},
				{ root, threshold: [0, 0.25, 0.5, 0.75, 1] }
			);

			for (const h of editor.querySelectorAll('h1,h2,h3')) observer.observe(h);
			applyActive();
		})();

		return () => {
			cancelled = true;
			observer?.disconnect();
		};
	});
</script>

<div data-testid="sidebar" class="sidebar">
	<RecentFiles {onOpenFile} />

	{#if $headings.length > 0}
		<section class="outline">
			<p class="label">Outline</p>
			{#each $headings as h (h.slug + h.level)}
				<button
					class="heading-item level-{h.level}"
					class:active={h.slug === activeSlug}
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
	.heading-item.active {
		background: var(--color-border);
		font-weight: 600;
	}
	.heading-item.level-2 {
		padding-left: 14px;
	}
	.heading-item.level-3 {
		padding-left: 24px;
	}
</style>
