<script lang="ts">
	import { onMount } from 'svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import EditorContainer from '$lib/components/EditorContainer.svelte';
	import { document as doc } from '$lib/stores/document';
	import { themePreference } from '$lib/stores/themePreference';
	import {
		isTauriRuntime,
		loadRecentFiles,
		openFile,
		save,
		saveAs,
		newFile
	} from '$lib/fileService';

	let sidebarVisible = $state(true);
	let isDistractionFree = $state(false);
	let editorMode = $state<'rich' | 'source'>('rich');
	let fontSize = $state(16);
	let showFindBar = $state(false);
	let showReplace = $state(false);
	let autoSave = $state(false);

	let theme = $derived(
		(typeof window !== 'undefined' && window.document.documentElement.dataset.theme === 'dark'
			? 'dark'
			: 'light') as 'light' | 'dark'
	);

	// Shortcuts defined here must stay in sync with the accelerator strings in
	// src/lib/tauriAppMenu.ts, which registers the same shortcuts in the native menu.
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
			if (e.key === 'f') {
				e.preventDefault();
				showFindBar = !showFindBar;
				showReplace = false;
			}
			if (e.key === 'h') {
				e.preventDefault();
				showFindBar = true;
				showReplace = true;
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
			if (e.key === 'T') {
				e.preventDefault();
				themePreference.cycle();
			}
		}
	}

	function setFontSize(size: number) {
		fontSize = Math.max(10, Math.min(32, size));
		window.document.documentElement.style.setProperty('--font-size-editor', `${fontSize}px`);
	}

	onMount(() => {
		loadRecentFiles().catch((err) => console.warn('[mdreader] Failed to load recent files:', err));

		let isSaving = false;
		const intervalId = window.setInterval(() => {
			if (!autoSave || isSaving) return;
			const { isDirty, filePath } = doc.get();
			if (!isDirty || !filePath) return;
			isSaving = true;
			save().finally(() => {
				isSaving = false;
			});
		}, 30_000);

		let unlisten: (() => void) | undefined;
		if (isTauriRuntime()) {
			void (async () => {
				let ask: (typeof import('@tauri-apps/plugin-dialog'))['ask'];
				let getCurrentWindow: (typeof import('@tauri-apps/api/window'))['getCurrentWindow'];
				let installTauriAppMenu: (typeof import('$lib/tauriAppMenu'))['installTauriAppMenu'];
				try {
					[{ ask }, { getCurrentWindow }, { installTauriAppMenu }] = await Promise.all([
						import('@tauri-apps/plugin-dialog'),
						import('@tauri-apps/api/window'),
						import('$lib/tauriAppMenu')
					]);
				} catch {
					/* Dynamic imports failed — likely running outside full Tauri context. */
					return;
				}
				try {
					await installTauriAppMenu({
						newFile: () => newFile(),
						openFile: () => openFile(),
						save: () => save(),
						saveAs: () => saveAs(),
						toggleAutoSave: () => {
							autoSave = !autoSave;
						},
						toggleSourceMode: () => {
							editorMode = editorMode === 'rich' ? 'source' : 'rich';
						},
						toggleSidebar: () => {
							sidebarVisible = !sidebarVisible;
						},
						toggleDistractionFree: () => {
							isDistractionFree = !isDistractionFree;
						},
						cycleTheme: () => themePreference.cycle()
					});
				} catch {
					/* Native menu needs a full Tauri webview; partial mocks (e2e) skip quietly. */
				}
				try {
					const appWindow = getCurrentWindow();
					unlisten = await appWindow.onCloseRequested(async (event) => {
						if (!doc.get().isDirty) return;
						event.preventDefault();
						const confirmed = await ask('You have unsaved changes. Quit without saving?', {
							title: 'Unsaved Changes',
							kind: 'warning'
						});
						if (confirmed) await appWindow.destroy();
					});
				} catch {
					/* Close hook needs full Tauri IPC; partial mocks (e2e) skip. */
				}
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
	{#snippet sidebar()}<Sidebar onOpenFile={openFile} />{/snippet}
	{#snippet toolbar()}<Toolbar />{/snippet}
	{#snippet editor()}
		<div data-testid="editor-area" class="editor-area">
			<EditorContainer
				{editorMode}
				{theme}
				{showFindBar}
				{showReplace}
				onCloseFindBar={() => {
					showFindBar = false;
					showReplace = false;
				}}
			/>
		</div>
	{/snippet}
	{#snippet statusbar()}<StatusBar />{/snippet}
</AppShell>

<style>
	.editor-area {
		padding: clamp(16px, 3vw, 32px);
		max-width: var(--editor-max-width);
		margin: 0 auto;
		width: 100%;
		min-height: 100%;
	}
</style>
