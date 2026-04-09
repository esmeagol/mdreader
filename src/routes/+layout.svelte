<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { browser } from '$app/environment';
	import { document as doc } from '$lib/stores/document';
	import { themePreference } from '$lib/stores/themePreference';
	import { formatTitle } from '$lib/utils';

	let { children } = $props();

	$effect(() => {
		const { filePath, isDirty } = $doc;
		window.document.title = formatTitle(filePath, isDirty);
	});

	$effect(() => {
		if (!browser) return;
		themePreference.initFromStorage();
		const pref = $themePreference;
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const apply = () => {
			document.documentElement.dataset.theme =
				pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
		};
		apply();
		if (pref !== 'system') {
			return;
		}
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
