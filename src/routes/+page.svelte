<script lang="ts">
	import { onMount } from 'svelte';
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

	async function invokeTauri<T>(command: string, payload: Record<string, unknown>) {
		const { invoke } = await import('@tauri-apps/api/core');
		return invoke<T>(command, payload);
	}

	async function openFile() {
		if (!isTauriRuntime()) return;
		const { open } = await import('@tauri-apps/plugin-dialog');
		const selected = await open({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
		if (!selected || Array.isArray(selected)) return;
		const content = await invokeTauri<string>('open_file', { path: selected });
		doc.load(content, selected);
	}

	async function save() {
		if (!isTauriRuntime()) return;
		const { content, filePath } = doc.get();
		if (!filePath) {
			await saveAs();
			return;
		}
		await invokeTauri<void>('save_file', { content });
		doc.markSaved();
	}

	async function saveAs() {
		if (!isTauriRuntime()) return;
		const { content } = doc.get();
		const { save } = await import('@tauri-apps/plugin-dialog');
		const path = await save({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
		if (!path || Array.isArray(path)) return;
		await invokeTauri<void>('set_current_file', { path });
		await invokeTauri<void>('save_file', { content });
		doc.load(content, path);
		doc.markSaved();
	}

	function newFile() {
		doc.reset();
	}

	onMount(() => {
		const intervalId = window.setInterval(() => {
			const { isDirty, filePath } = doc.get();
			if (isDirty && filePath) void save();
		}, 30_000);

		let unlisten: (() => void) | undefined;
		if (isTauriRuntime()) {
			void (async () => {
				const [{ listen }, { ask }, { getCurrentWindow }] = await Promise.all([
					import('@tauri-apps/api/event'),
					import('@tauri-apps/plugin-dialog'),
					import('@tauri-apps/api/window')
				]);
				unlisten = await listen('close-requested', async () => {
					if (!doc.get().isDirty) {
						await getCurrentWindow().close();
						return;
					}
					const confirmed = await ask('You have unsaved changes. Quit without saving?', {
						title: 'Unsaved Changes',
						kind: 'warning'
					});
					if (confirmed) await getCurrentWindow().close();
				});
			})();
		}

		return () => {
			window.clearInterval(intervalId);
			unlisten?.();
		};
	});
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
