<script lang="ts">
	interface Props {
		sidebar: import('svelte').Snippet;
		toolbar: import('svelte').Snippet;
		editor: import('svelte').Snippet;
		statusbar: import('svelte').Snippet;
		sidebarVisible: boolean;
		isDistractionFree: boolean;
	}

	let { sidebar, toolbar, editor, statusbar, sidebarVisible, isDistractionFree }: Props = $props();
</script>

<div
	class="app-shell"
	class:sidebar-hidden={!sidebarVisible}
	class:distraction-free={isDistractionFree}
>
	<aside class="zone-sidebar">{@render sidebar()}</aside>
	<div class="zone-toolbar">{@render toolbar()}</div>
	<main class="zone-editor">{@render editor()}</main>
	<footer class="zone-status">{@render statusbar()}</footer>
</div>

<style>
	.app-shell {
		display: grid;
		grid-template-columns: var(--sidebar-width) 1fr;
		grid-template-rows: var(--toolbar-height) 1fr var(--status-bar-height);
		grid-template-areas:
			'sidebar toolbar'
			'sidebar editor'
			'status  status';
		height: 100vh;
	}

	.zone-sidebar {
		grid-area: sidebar;
		border-right: 1px solid var(--color-border);
		background: var(--color-bg-sidebar);
		overflow-y: auto;
	}
	.zone-toolbar {
		grid-area: toolbar;
		border-bottom: 1px solid var(--color-border);
		overflow: hidden;
	}
	.zone-editor {
		grid-area: editor;
		overflow-y: auto;
	}
	.zone-status {
		grid-area: status;
		display: flex;
		align-items: center;
		padding: 0 12px;
		font-size: 11px;
		border-top: 1px solid var(--color-border);
		background: var(--color-bg-status);
		color: var(--color-text-muted);
	}

	.distraction-free {
		grid-template-columns: 0 1fr;
	}
	.distraction-free .zone-status {
		display: none;
	}

	.sidebar-hidden {
		grid-template-columns: 0 1fr;
	}
	.sidebar-hidden .zone-sidebar {
		overflow: hidden;
		border-right: none;
	}
</style>
