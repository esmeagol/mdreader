<script lang="ts">
	import AppShell from '$lib/components/AppShell.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import EditorContainer from '$lib/components/EditorContainer.svelte';
	import { document as doc } from '$lib/stores/document';

	let sidebarVisible = $state(true);
	let isDistractionFree = $state(false);
	let editorMode = $state<'rich' | 'source'>('rich');
	let fontSize = $state(16);

	let theme = $derived(
		(typeof window !== 'undefined' && window.document.documentElement.dataset.theme === 'dark'
			? 'dark'
			: 'light') as 'light' | 'dark'
	);

	function handleKeydown(e: KeyboardEvent) {
		if (e.metaKey && !e.shiftKey) {
			if (e.key === 'o') {
				e.preventDefault();
				openFile();
			}
			if (e.key === 's') {
				e.preventDefault();
				save();
			}
			if (e.key === 'n') {
				e.preventDefault();
				newFile();
			}
			if (e.key === '/') {
				e.preventDefault();
				editorMode = editorMode === 'rich' ? 'source' : 'rich';
			}
			if (e.key === '=') {
				e.preventDefault();
				setFontSize(fontSize + 1);
			}
			if (e.key === '-') {
				e.preventDefault();
				setFontSize(fontSize - 1);
			}
		}
		if (e.metaKey && e.shiftKey) {
			if (e.key === 'S') {
				e.preventDefault();
				saveAs();
			}
			if (e.key === 'F') {
				e.preventDefault();
				isDistractionFree = !isDistractionFree;
			}
			if (e.key === 'L') {
				e.preventDefault();
				sidebarVisible = !sidebarVisible;
			}
		}
	}

	function setFontSize(size: number) {
		fontSize = Math.max(10, Math.min(32, size));
		window.document.documentElement.style.setProperty('--font-size-editor', `${fontSize}px`);
	}

	function isTauriRuntime() {
		return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
	}

	async function openFile() {
		if (!isTauriRuntime()) return;
		const [{ open }, { invoke }] = await Promise.all([
			import('@tauri-apps/plugin-dialog'),
			import('@tauri-apps/api/core')
		]);
		const selected = await open({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
		if (!selected || Array.isArray(selected)) return;
		const content = await invoke<string>('open_file', { path: selected });
		doc.load(content, selected);
	}

	async function save() {}
	async function saveAs() {}
	function newFile() {
		doc.reset();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<AppShell {sidebarVisible} {isDistractionFree}>
	{#snippet sidebar()}<Sidebar />{/snippet}
	{#snippet toolbar()}<Toolbar />{/snippet}
	{#snippet editor()}
		<div data-testid="editor-area" class="editor-area">
			<EditorContainer {editorMode} {theme} />
		</div>
	{/snippet}
	{#snippet statusbar()}<StatusBar />{/snippet}
</AppShell>

<style>
	.editor-area {
		padding: clamp(16px, 5vw, 60px);
		max-width: var(--editor-max-width);
		margin: 0 auto;
		width: 100%;
		height: 100%;
		overflow-y: auto;
	}
</style>
