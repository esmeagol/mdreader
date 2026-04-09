<script lang="ts">
	import RecentFiles from './RecentFiles.svelte';

	interface Props {
		onOpen: (path: string) => void;
	}
	let { onOpen }: Props = $props();
</script>

<div data-testid="sidebar" class="sidebar">
	<RecentFiles {onOpen} />
</div>

<style>
	.sidebar {
		padding: 12px 8px;
		height: 100%;
		overflow-y: auto;
	}
</style>
