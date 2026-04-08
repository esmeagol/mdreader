<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { document as doc } from '$lib/stores/document';
	import { formatTitle } from '$lib/utils';

	let { children } = $props();

	$effect(() => {
		const { filePath, isDirty } = $doc;
		window.document.title = formatTitle(filePath, isDirty);
	});

	$effect(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const apply = () => {
			window.document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
		};
		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
