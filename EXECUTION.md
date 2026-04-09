# Markdown Editor — Detailed Execution Plan

Every task follows the same pattern:

1. Write a failing test that describes the desired behaviour
2. Run it — confirm it fails
3. Implement the feature
4. Run the test — confirm it passes
5. Commit — CI must stay green

Read [ARCHITECTURE.md](ARCHITECTURE.md) before starting. Every implementation decision
below follows from that design. When in doubt about where state lives or how components
communicate, check the architecture first.

---

## Current implementation (authoritative where it differs from older day steps)

The day-by-day sections below are the original TDD walkthrough. When a snippet conflicts
with the repository, treat this section and [ARCHITECTURE.md](ARCHITECTURE.md) as correct.

### Architecture summary

ProseMirror is the source of truth for document content. The `document` store holds only
file metadata (`filePath`, `isDirty`, `lastSaved`, `saveError`) — no `content` field. All
file I/O lives in `src/lib/fileService.ts`; `+page.svelte` calls named functions from it.

Key files that supersede their day-step equivalents:

| File | Supersedes |
| --- | --- |
| `src/lib/stores/document.ts` | Day 3 store (no `content`, no `update()`) |
| `src/lib/editor.ts` | Day 4 EditorHandle (module singletons, `getActiveContent`) |
| `src/lib/fileService.ts` | Day 5–8 inline `invoke` in `+page.svelte` |
| `src/lib/DirtyState.ts` | Day 6 `emitUpdate: false` / suppress-flag approach |
| `src/lib/WordCount.ts` | Day 6 word count via store content |
| `src/lib/Headings.ts` | Day 10 separate `HeadingId.ts` + heading extraction |
| `src/lib/components/EditorContainer.svelte` | Day 4–8 EditorContainer (no local content state) |
| `src/lib/components/EditorPane.svelte` | Day 4 EditorPane (PM plugins, `onReady` callback) |
| `src/lib/components/SourcePane.svelte` | Day 8 SourcePane (CM Annotation, `onReady` callback) |

### Tauri capabilities

`src-tauri/capabilities/default.json` grants `core:default`, `core:path:default`, dialog
plugins (`dialog:allow-open`, `dialog:allow-save`, `dialog:allow-ask`), `shell:allow-open`,
and **`core:window:allow-close`** plus **`core:window:allow-destroy`**. The destroy permission
matters for Tauri 2’s default close path: `onCloseRequested` finishes by calling `destroy()`
when the user does not cancel.

### Window close (supersedes Day 8 — Step 8.4)

Do **not** use Rust `on_window_event` only to `prevent_close()` and `window.emit("close-requested", …)`.
Instead, in `+page.svelte`, register **`getCurrentWindow().onCloseRequested(...)`**:

- If the document is **clean**, return without `preventDefault()` so the window can close.
- If **dirty**, call **`event.preventDefault()`**, show **`ask`**, then **`getCurrentWindow().destroy()`**
  if the user confirms quitting without saving.

### Document store (supersedes Day 3 Step 3.1)

`DocumentState` has no `content` field and no `update()` operation. The current shape:

```typescript
interface DocumentState {
	filePath: string | null;
	isDirty: boolean;
	lastSaved: Date | null;
	saveError: string | null;
}
```

Named operations: `load(filePath)`, `markDirty(bool)`, `markSaved()`, `setFilePath(path)`,
`markSaveError(msg)`, `reset()`. See ARCHITECTURE.md for the full table.

### File I/O (supersedes Day 5+ inline invoke in +page.svelte)

All Tauri calls live in `src/lib/fileService.ts`. The pattern on file open:

```typescript
getRichHandle()?.setContent(content, { markClean: true });
getSourceHandle()?.setContent(content);
doc.load(selected);
```

Push content to editors **before** updating the store. `markClean: true` resets the DirtyState
PM plugin’s clean baseline. Never pass `markClean` on mode-switch syncs.

### Dirty state (supersedes Day 6 emitUpdate/suppress approach)

Dirty state in rich mode is owned by the `DirtyState` PM plugin (`src/lib/DirtyState.ts`).
It tracks `doc.eq(cleanDoc)` — structural node equality, not string comparison.

- `MARK_CLEAN_KEY` meta on a transaction resets the clean baseline (dispatched on load/save only).
- Dirty state changes call `doc.markDirty(isDirty)` synchronously from `view.update`.
- Both the `setContent` and `MARK_CLEAN_KEY` transactions complete in the same JS turn so the
  DOM never renders an intermediate dirty=true state.

Dirty state in source mode: `EditorContainer.handleChange` calls `doc.markDirty(true)` on
every CodeMirror change.

### Undo stack (supersedes Day 8 mode-switch behaviour)

Both EditorPane and SourcePane are **always mounted**, hidden with `display:none` via CSS.
This preserves each pane’s undo stack across mode switches. Switching modes is a CSS toggle,
not a DOM teardown. Previous behaviour (using `{#if}`) destroyed the undo stack on every
switch — this is fixed.

### Word count (supersedes Day 6 store-derived count)

Word count is derived by the `WordCount` PM plugin and pushed to the `wordCount` store.
`StatusBar` reads the `wordCount` store directly — it does not derive count from content.

### Headings (supersedes Day 10 HeadingId + separate extraction)

`src/lib/Headings.ts` is a single PM plugin that does one doc traversal per transaction and
produces both the heading list (pushed to `headings` store) and the heading ID decorations
(for sidebar anchor links). The old `HeadingId.ts` is deleted.

### Playwright test helper pattern

Tests that need a file loaded use a two-step evaluate mirroring `fileService.openFile()`:

```typescript
async function loadContent(page, markdown, filePath) {
	await page.evaluate(async ({ md, path }) => {
		const { getRichHandle } = await import(‘/src/lib/editor.ts’);
		const { document } = await import(‘/src/lib/stores/document.ts’);
		getRichHandle()?.setContent(md, { markClean: true });
		document.load(path);
	}, { md: markdown, path: filePath });
}
```

**Never** call `document.load(content, path)` — the store no longer accepts a content argument.

### Rich text: blockquotes

`EditorPane.svelte` includes **CSS for `blockquote`** so quotes are visually distinct from
normal paragraphs.

---

## Day 1 — Project Scaffold + CI ✓

**Done.** Tauri + Svelte scaffold, Playwright smoke tests, GitHub Actions CI pipeline.

---

## Day 2 — Test Infrastructure ✓

**Done.** Vitest wired with jsdom, `formatWordCount` utility and tests, Rust `sanity_check`
test, both wired into CI.

---

## Day 3 — App Shell

**Goal:** Document store, AppShell layout, StatusBar, and the central keyboard shortcut
handler. No editor logic yet — just the structural skeleton everything else will plug into.

### Step 3.1 — Create the document store

The `document` store is the only shared state in the app. It exposes named operations — not
a raw setter — so mutations are traceable and debuggable.

Create `src/lib/stores/document.ts`:

```typescript
interface DocumentState {
	content: string;
	filePath: string | null;
	isDirty: boolean;
	lastSaved: Date | null;
}

function createDocumentStore() {
	let state = $state<DocumentState>({
		content: '',
		filePath: null,
		isDirty: false,
		lastSaved: null
	});

	return {
		get: () => state,
		// Called when a file is opened or a new file is created
		load(content: string, filePath: string | null) {
			state = { content, filePath, isDirty: false, lastSaved: null };
		},
		// Called on every keystroke in the editor
		update(content: string) {
			state = { ...state, content, isDirty: true };
		},
		// Called after a successful save
		markSaved() {
			state = { ...state, isDirty: false, lastSaved: new Date() };
		},
		// Called by Cmd+N
		reset() {
			state = { content: '', filePath: null, isDirty: false, lastSaved: null };
		}
	};
}

export const document = createDocumentStore();
```

Write unit tests for the store operations in `src/lib/stores/document.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { document } from './document';

describe('document store', () => {
	it('load sets content and clears dirty flag', () => {
		document.load('# Hello', '/path/to/file.md');
		expect(document.get().content).toBe('# Hello');
		expect(document.get().isDirty).toBe(false);
		expect(document.get().filePath).toBe('/path/to/file.md');
	});

	it('update sets content and marks dirty', () => {
		document.load('initial', '/file.md');
		document.update('changed');
		expect(document.get().content).toBe('changed');
		expect(document.get().isDirty).toBe(true);
	});

	it('markSaved clears dirty flag', () => {
		document.update('some content');
		document.markSaved();
		expect(document.get().isDirty).toBe(false);
		expect(document.get().lastSaved).toBeInstanceOf(Date);
	});

	it('reset returns to empty state', () => {
		document.load('# Content', '/file.md');
		document.reset();
		expect(document.get().content).toBe('');
		expect(document.get().filePath).toBeNull();
		expect(document.get().isDirty).toBe(false);
	});
});
```

Run — fail because the module doesn't exist yet:

```bash
npm run test:unit
# Expected: Error — cannot find module './document'
```

Implement the store, then run again:

```bash
npm run test:unit
# Expected: 4 passed
```

> **Note on runes in tests:** Svelte 5 `$state()` runes require the Svelte compiler. If
> Vitest throws a "runes not available outside Svelte" error, configure Vitest to use the
> Svelte plugin: add `plugins: [svelte()]` to the `test` block in `vite.config.ts`.
> Alternatively, implement the store with a plain Svelte `writable` store and expose the
> same named-operation API — both approaches satisfy the architecture.

### Step 3.2 — Add `formatTitle` utility and tests

Add to `src/lib/utils.ts`:

```typescript
export function formatTitle(filePath: string | null, isDirty: boolean): string {
	const base = filePath ? filePath.split('/').pop()! : 'Untitled';
	return isDirty ? `• ${base} — mdreader` : `${base} — mdreader`;
}
```

Add to `src/lib/utils.test.ts`:

```typescript
import { formatTitle } from './utils';

describe('formatTitle', () => {
	it('shows filename when clean', () => {
		expect(formatTitle('/docs/notes.md', false)).toBe('notes.md — mdreader');
	});
	it('shows bullet when dirty', () => {
		expect(formatTitle('/docs/notes.md', true)).toBe('• notes.md — mdreader');
	});
	it('shows Untitled for new file', () => {
		expect(formatTitle(null, false)).toBe('Untitled — mdreader');
	});
});
```

```bash
npm run test:unit
# Expected: all pass
```

### Step 3.3 — Write failing layout tests

Create `tests/layout.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('app has sidebar panel', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
});

test('app has editor panel', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('[data-testid="editor-area"]')).toBeVisible();
});

test('app has status bar', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('[data-testid="status-bar"]')).toBeVisible();
});

test('sidebar is to the left of editor', async ({ page }) => {
	await page.goto('/');
	const sidebar = await page.locator('[data-testid="sidebar"]').boundingBox();
	const editor = await page.locator('[data-testid="editor-area"]').boundingBox();
	expect(sidebar!.x).toBeLessThan(editor!.x);
});

test('status bar is below editor', async ({ page }) => {
	await page.goto('/');
	const editor = await page.locator('[data-testid="editor-area"]').boundingBox();
	const statusBar = await page.locator('[data-testid="status-bar"]').boundingBox();
	expect(editor!.y).toBeLessThan(statusBar!.y);
});
```

```bash
npx playwright test tests/layout.test.ts
# Expected: 5 failed
```

### Step 3.4 — Global CSS: design tokens and reset

Create `src/app.css`. This file owns all design tokens and the global reset. Nothing else
in the codebase hardcodes a colour or dimension value.

```css
:root {
	--sidebar-width: 220px;
	--toolbar-height: 0px; /* empty slot — set non-zero when toolbar is built */
	--status-bar-height: 28px;
	--editor-max-width: 1100px;
	--font-size-editor: 16px;

	--color-border: #e0e0e0;
	--color-bg: #ffffff;
	--color-bg-sidebar: #f5f5f5;
	--color-bg-status: #f8f8f8;
	--color-text: #1a1a1a;
	--color-text-muted: #888888;
	--color-placeholder: #bbbbbb;
}

[data-theme='dark'] {
	--color-border: #3a3a3a;
	--color-bg: #1e1e1e;
	--color-bg-sidebar: #252525;
	--color-bg-status: #2a2a2a;
	--color-text: #d4d4d4;
	--color-text-muted: #888888;
	--color-placeholder: #555555;
}

*,
*::before,
*::after {
	box-sizing: border-box;
	margin: 0;
	padding: 0;
}

body {
	height: 100vh;
	overflow: hidden;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	background: var(--color-bg);
	color: var(--color-text);
}
```

Update `src/routes/+layout.svelte` to import the CSS, drive `<title>` reactively from the
document store, and set the theme from the OS preference:

```svelte
<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { document as doc } from '$lib/stores/document';
	import { formatTitle } from '$lib/utils';

	let { children } = $props();

	// Drive <title> from document store — never set document.title imperatively elsewhere
	$effect(() => {
		const { filePath, isDirty } = doc.get();
		window.document.title = formatTitle(filePath, isDirty);
	});

	// Set data-theme from OS preference — CSS cascade handles the rest
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
```

### Step 3.5 — Build AppShell

Create `src/lib/components/AppShell.svelte`. This component owns the grid and nothing else.

```svelte
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

	/* Distraction-free: hide sidebar and status bar */
	.distraction-free {
		grid-template-columns: 0 1fr;
	}
	.distraction-free .zone-status {
		display: none;
	}

	/* Collapsed sidebar */
	.sidebar-hidden {
		grid-template-columns: 0 1fr;
	}
	.sidebar-hidden .zone-sidebar {
		overflow: hidden;
		border-right: none;
	}
</style>
```

### Step 3.6 — Build shell components

Create placeholder components for zones not yet implemented.

`src/lib/components/Sidebar.svelte`:

```svelte
<div data-testid="sidebar" class="sidebar">
	<p class="placeholder">Outline</p>
</div>

<style>
	.sidebar {
		padding: 12px 8px;
		height: 100%;
	}
	.placeholder {
		font-size: 12px;
		color: var(--color-placeholder);
	}
</style>
```

`src/lib/components/Toolbar.svelte`:

```svelte
<div class="toolbar"><!-- Formatting toolbar — Day 12 --></div>
```

`src/lib/components/StatusBar.svelte`:

```svelte
<script lang="ts">
	import { document as doc } from '$lib/stores/document';
	import { formatWordCount } from '$lib/utils';
</script>

<footer data-testid="status-bar" class="status-bar">
	<span>{formatWordCount(doc.get().content)}</span>
</footer>
```

### Step 3.7 — Wire `+page.svelte`

`+page.svelte` owns application-level UI state and the single keyboard shortcut handler.
It is the only file that wires AppShell slots together.

```svelte
<script lang="ts">
	import AppShell from '$lib/components/AppShell.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';

	// App-level UI state — flows down as props, never in a store
	let sidebarVisible = $state(true);
	let isDistractionFree = $state(false);
	let editorMode = $state<'rich' | 'source'>('rich');
	let fontSize = $state(16);

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
		document.documentElement.style.setProperty('--font-size-editor', `${fontSize}px`);
	}

	// openFile, save, saveAs, newFile — implemented in Day 7
	async function openFile() {}
	async function save() {}
	async function saveAs() {}
	function newFile() {}
</script>

<svelte:window onkeydown={handleKeydown} />

<AppShell {sidebarVisible} {isDistractionFree}>
	{#snippet sidebar()}<Sidebar />{/snippet}
	{#snippet toolbar()}<Toolbar />{/snippet}
	{#snippet editor()}
		<div data-testid="editor-area" class="editor-area">
			<!-- EditorContainer goes here — Day 4 -->
			<p class="placeholder">Editor</p>
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
	.placeholder {
		font-size: 12px;
		color: var(--color-placeholder);
	}
</style>
```

> **Reader sizing note:** Keep `max-width` + centered margins for readability, but let
> scrolling stay on AppShell's `.zone-editor` (`overflow-y: auto`) so the scrollbar remains
> at the far-right edge of the editor pane.

Run layout tests:

```bash
npx playwright test tests/layout.test.ts
# Expected: 5 passed
```

Run all tests:

```bash
npm run test:unit && npx playwright test
```

```bash
git add .
git commit -m "feat: app shell — document store, AppShell layout, StatusBar, shortcut handler"
```

**Day 3 done when:** All 5 layout tests pass, all unit tests pass, CI is green.

---

## Day 4 — TipTap Editor

**Goal:** A working TipTap editor in the editor zone. Markdown typed or loaded renders
in place. `EditorContainer` coordinates content; `EditorPane` is a dumb TipTap wrapper.

### Step 4.1 — Install TipTap

```bash
npm install @tiptap/core @tiptap/pm @tiptap/starter-kit tiptap-markdown
```

> Do NOT use `prosemirror-markdown`. It doesn't know about TipTap's custom nodes and will
> produce wrong round-trip output.

### Step 4.2 — Write failing markdown round-trip unit tests

Create `src/lib/markdown.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';

function createEditor(content = '') {
	return new Editor({ extensions: [StarterKit, Markdown], content });
}

describe('markdown round-trip', () => {
	const cases: [string, string][] = [
		['heading 1', '# Hello World'],
		['heading 2', '## Section'],
		['heading 3', '### Subsection'],
		['bold', 'This is **bold** text.'],
		['italic', 'This is *italic* text.'],
		['inline code', 'Use `console.log()` here.'],
		['paragraph', 'Just a plain paragraph.']
	];

	for (const [name, markdown] of cases) {
		it(`round-trips ${name}`, () => {
			const editor = createEditor(markdown);
			const result = editor.storage.markdown.getMarkdown().trim();
			editor.destroy();
			expect(result).toBe(markdown.trim());
		});
	}
});
```

```bash
npm run test:unit
# Expected: Error — cannot resolve tiptap-markdown (install not done yet)
# After install: 7 passed
```

### Step 4.3 — Write failing e2e tests for the editor

Create `tests/editor.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('editor is visible and focusable', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await expect(editor).toBeVisible();
	await editor.click();
	await expect(editor).toBeFocused();
});

test('heading markdown renders as h1 element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.type('# My Heading');
	await page.keyboard.press('Enter');
	await expect(editor.locator('h1')).toContainText('My Heading');
});

test('bold markdown renders as strong element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.type('**bold text**');
	await page.keyboard.press(' ');
	await expect(editor.locator('strong')).toContainText('bold text');
});

test('typing updates word count in status bar', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('hello world foo');
	await expect(page.locator('[data-testid="status-bar"]')).toContainText('3 words');
});
```

```bash
npx playwright test tests/editor.test.ts
# Expected: 4 failed — no .tiptap element yet
```

### Step 4.4 — Build EditorPane

`EditorPane` is a dumb TipTap wrapper. It receives `content` as a prop, calls `onChange`
on every change. It knows nothing about source mode, file I/O, or stores.

Create `src/lib/components/EditorPane.svelte`:

```svelte
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import { Markdown } from 'tiptap-markdown';

	interface Props {
		content: string;
		onChange: (md: string) => void;
		theme: 'light' | 'dark';
	}

	let { content, onChange, theme }: Props = $props();

	let editorEl: HTMLElement;
	let editor: Editor;

	onMount(() => {
		editor = new Editor({
			element: editorEl,
			extensions: [StarterKit, Markdown],
			content,
			editorProps: { attributes: { class: 'tiptap' } },
			onUpdate: ({ editor }) => {
				onChange(editor.storage.markdown.getMarkdown());
			}
		});

		// Intercept link clicks — open in system browser, not in the app window
		editorEl.addEventListener('click', async (e) => {
			const anchor = (e.target as HTMLElement).closest('a');
			if (!anchor) return;
			const href = anchor.getAttribute('href');
			if (!href) return;
			e.preventDefault();
			if (href.startsWith('http://') || href.startsWith('https://')) {
				const { open } = await import('@tauri-apps/plugin-shell');
				open(href);
			}
		});
	});

	// Sync content prop → editor when it changes externally (e.g. file open)
	$effect(() => {
		if (editor && content !== editor.storage.markdown.getMarkdown()) {
			editor.commands.setContent(content);
		}
	});

	onDestroy(() => editor?.destroy());
</script>

<div bind:this={editorEl} class="editor-mount"></div>

<style>
	.editor-mount {
		height: 100%;
	}

	:global(.tiptap) {
		outline: none;
		min-height: 100%;
		font-size: var(--font-size-editor);
		line-height: 1.7;
		color: var(--color-text);
	}
	:global(.tiptap h1) {
		font-size: 2em;
		font-weight: 700;
		margin: 0.5em 0;
	}
	:global(.tiptap h2) {
		font-size: 1.5em;
		font-weight: 600;
		margin: 0.5em 0;
	}
	:global(.tiptap h3) {
		font-size: 1.25em;
		font-weight: 600;
		margin: 0.5em 0;
	}
	:global(.tiptap p) {
		margin: 0.5em 0;
	}
	:global(.tiptap strong) {
		font-weight: 700;
	}
	:global(.tiptap em) {
		font-style: italic;
	}
	:global(.tiptap code) {
		font-family: 'Menlo', monospace;
		background: rgba(0, 0, 0, 0.06);
		padding: 0.1em 0.3em;
		border-radius: 3px;
		font-size: 0.9em;
	}
</style>
```

### Step 4.5 — Build EditorContainer

`EditorContainer` owns `editorMode` (passed from `+page.svelte`) and synchronises content
between the document store and the active pane. It is the only component that reads and
writes the document store.

Create `src/lib/components/EditorContainer.svelte`:

```svelte
<script lang="ts">
	import { document as doc } from '$lib/stores/document';
	import EditorPane from './EditorPane.svelte';

	interface Props {
		editorMode: 'rich' | 'source';
		theme: 'light' | 'dark';
	}

	let { editorMode, theme }: Props = $props();

	// Content is derived from the document store — EditorContainer is the bridge
	let content = $state(doc.get().content);

	function handleChange(md: string) {
		content = md;
		doc.update(md);
	}

	// Sync inbound store changes (e.g. file open) into local content
	$effect(() => {
		const storeContent = doc.get().content;
		if (storeContent !== content) content = storeContent;
	});
</script>

{#if editorMode === 'rich'}
	<EditorPane {content} onChange={handleChange} {theme} />
{/if}
<!-- SourcePane added Day 6 -->
```

### Step 4.6 — Wire EditorContainer into `+page.svelte`

Replace the editor placeholder in `+page.svelte`:

```svelte
<script lang="ts">
	// ... existing imports and state ...
	import EditorContainer from '$lib/components/EditorContainer.svelte';

	// Derive theme from data-theme on <html> for passing to editor components
	let theme = $derived(
		typeof window !== 'undefined' && window.document.documentElement.dataset.theme === 'dark'
			? 'dark'
			: 'light'
	);
</script>

<!-- In the editor snippet: -->
{#snippet editor()}
	<div data-testid="editor-area" class="editor-area">
		<EditorContainer {editorMode} {theme} />
	</div>
{/snippet}
```

Also install the shell plugin for link interception (needed by EditorPane):

```bash
npm install @tauri-apps/plugin-shell
```

Add to `src-tauri/Cargo.toml`:

```toml
tauri-plugin-shell = "2"
```

Register in `src-tauri/src/lib.rs`:

```rust
.plugin(tauri_plugin_shell::init())
```

Run e2e tests:

```bash
npx playwright test tests/editor.test.ts
# Expected: 4 passed
```

Run all tests:

```bash
npm run test:unit && npx playwright test
```

```bash
git add .
git commit -m "feat: TipTap editor with EditorContainer/EditorPane split"
```

**Day 4 done when:** Round-trip unit tests pass, editor renders headings and bold in-place,
word count updates on typing, link clicks do not navigate the app window.

---

## Day 5 — Extended Node Types

**Goal:** Code blocks (with syntax highlighting), tables, task lists, and strikethrough.

### Step 5.1 — Install extensions

```bash
npm install @tiptap/extension-code-block-lowlight \
  @tiptap/extension-table @tiptap/extension-table-row \
  @tiptap/extension-table-cell @tiptap/extension-table-header \
  @tiptap/extension-task-list @tiptap/extension-task-item \
  @tiptap/extension-strike lowlight
```

### Step 5.2 — Write failing round-trip unit tests for extended types

Add to `src/lib/markdown.test.ts`:

````typescript
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Strike from '@tiptap/extension-strike';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

function createExtendedEditor(content = '') {
	return new Editor({
		extensions: [
			StarterKit.configure({ codeBlock: false }),
			Markdown,
			TaskList,
			TaskItem,
			Strike,
			CodeBlockLowlight.configure({ lowlight }),
			Table.configure({ resizable: false }),
			TableRow,
			TableHeader,
			TableCell
		],
		content
	});
}

describe('extended markdown round-trip', () => {
	it('round-trips strikethrough', () => {
		const md = 'This is ~~struck~~ text.';
		const editor = createExtendedEditor(md);
		const result = editor.storage.markdown.getMarkdown().trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a fenced code block', () => {
		const md = '```javascript\nconsole.log("hello");\n```';
		const editor = createExtendedEditor(md);
		const result = editor.storage.markdown.getMarkdown().trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips an unchecked task list item', () => {
		const md = '- [ ] Unchecked task';
		const editor = createExtendedEditor(md);
		const result = editor.storage.markdown.getMarkdown().trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a checked task list item', () => {
		const md = '- [x] Checked task';
		const editor = createExtendedEditor(md);
		const result = editor.storage.markdown.getMarkdown().trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a basic markdown table', () => {
		const md = '| Name | Role |\n| --- | --- |\n| Alice | Engineer |';
		const editor = createExtendedEditor(md);
		const result = editor.storage.markdown.getMarkdown().trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a markdown table with inline formatting', () => {
		const md = '| Name | Notes |\n| --- | --- |\n| Alice | **Strong** and *italic* |';
		const editor = createExtendedEditor(md);
		const result = editor.storage.markdown.getMarkdown().trim();
		editor.destroy();
		expect(result).toBe(md);
	});
});
````

```bash
npm run test:unit
# Expected: 6 new failures — extensions not wired yet
```

### Step 5.3 — Write failing e2e tests for extended types

Add to `tests/editor.test.ts`:

````typescript
test('code block renders as pre/code element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.type('```javascript');
	await page.keyboard.press('Enter');
	await page.keyboard.type('const x = 1;');
	await expect(editor.locator('pre code')).toContainText('const x = 1;');
});

test('strikethrough renders as s element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.type('~~struck~~');
	await page.keyboard.press(' ');
	await expect(editor.locator('s')).toContainText('struck');
});

test('markdown table renders as table in rich mode', async ({ page }) => {
	await page.goto('/');
	await page.evaluate(async () => {
		// @ts-expect-error Vite browser runtime import path
		const { document } = await import('/src/lib/stores/document.ts');
		document.load('| Name | Role |\n| --- | --- |\n| Alice | Engineer |', '/tmp/table.md');
	});
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await expect(editor.locator('table')).toBeVisible();
	await expect(editor.locator('th')).toContainText(['Name', 'Role']);
	await expect(editor.locator('td')).toContainText(['Alice', 'Engineer']);
});

test('table cells preserve inline markdown formatting', async ({ page }) => {
	await page.goto('/');
	await page.evaluate(async () => {
		// @ts-expect-error Vite browser runtime import path
		const { document } = await import('/src/lib/stores/document.ts');
		document.load(
			'| Name | Notes |\n| --- | --- |\n| Alice | **Strong** and *italic* |',
			'/tmp/table-format.md'
		);
	});
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await expect(editor.locator('table strong')).toContainText('Strong');
	await expect(editor.locator('table em')).toContainText('italic');
});
````

```bash
npx playwright test tests/editor.test.ts
# Expected: 4 new failures
```

### Step 5.4 — Wire extended extensions into EditorPane

Update the extensions array in `EditorPane.svelte`:

```typescript
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Strike from '@tiptap/extension-strike';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

// In onMount:
editor = new Editor({
	element: editorEl,
	extensions: [
		StarterKit.configure({ codeBlock: false }),
		Markdown,
		TaskList,
		TaskItem.configure({ nested: true }),
		Strike,
		CodeBlockLowlight.configure({ lowlight }),
		Table.configure({ resizable: false }),
		TableRow,
		TableHeader,
		TableCell
	]
	// ...
});
```

Add styles to `EditorPane.svelte`:

```css
:global(.tiptap pre) {
	background: var(--color-bg-sidebar);
	border-radius: 6px;
	padding: 1em;
	overflow-x: auto;
	font-family: 'Menlo', monospace;
	font-size: 0.875em;
}
:global(.tiptap input[type='checkbox']) {
	margin-right: 6px;
}
:global(.tiptap s) {
	text-decoration: line-through;
	opacity: 0.6;
}
```

```bash
npm run test:unit && npx playwright test
# Expected: all pass
```

```bash
git add .
git commit -m "feat: add code blocks, task lists, strikethrough, and tables"
```

**Day 5 done when:** All unit and e2e tests pass including extended node types.

---

## Day 6 — Source Mode Toggle

**Goal:** `Cmd+/` toggles between seamless TipTap view and a raw CodeMirror view. `editorMode`
is owned by `+page.svelte` and passed as a prop — the single shortcut handler already handles
the toggle. `EditorContainer` just renders the right pane based on the prop.

### Step 6.1 — Install CodeMirror 6

```bash
npm install codemirror @codemirror/lang-markdown @codemirror/theme-one-dark \
  @codemirror/view @codemirror/state
```

### Step 6.2 — Write failing toggle tests

Create `tests/source-mode.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('Cmd+/ toggles to source mode showing raw markdown', async ({ page }) => {
	await page.goto('/');
	const editorArea = page.locator('[data-testid="editor-area"]');

	// Type a heading in rich mode
	await editorArea.locator('.tiptap').click();
	await page.keyboard.type('# My Heading');
	await expect(editorArea.locator('h1')).toBeVisible();

	// Toggle to source mode
	await page.keyboard.press('Meta+/');

	// h1 is gone, source editor is visible
	await expect(editorArea.locator('h1')).not.toBeVisible();
	await expect(editorArea.locator('[data-testid="source-editor"]')).toBeVisible();
});

test('toggling back to rich mode preserves content', async ({ page }) => {
	await page.goto('/');
	const editorArea = page.locator('[data-testid="editor-area"]');

	await editorArea.locator('.tiptap').click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('# Preserved Heading');

	// Round-trip through source mode
	await page.keyboard.press('Meta+/');
	await page.keyboard.press('Meta+/');

	await expect(editorArea.locator('h1')).toContainText('Preserved Heading');
});

test('undo history is cleared after round-trip through source mode', async ({ page }) => {
	// This is a known limitation — document it here so it is not mistaken for a bug.
	// editor.commands.setContent() resets the ProseMirror history.
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('Original text');

	await page.keyboard.press('Meta+/');
	await page.keyboard.press('Meta+/');

	// Undo should NOT revert to empty — undo stack was cleared by the toggle
	await page.keyboard.press('Meta+z');
	await expect(editor).toContainText('Original text');
});

test('editing in source mode updates rich mode rendering after toggle back', async ({ page }) => {
	await page.goto('/');
	const editorArea = page.locator('[data-testid="editor-area"]');
	await editorArea.locator('.tiptap').click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('# Initial Heading');

	await page.keyboard.press('Meta+/');
	const sourceContent = editorArea.locator('[data-testid="source-editor"] .cm-content');
	await expect(sourceContent).toBeVisible();
	await sourceContent.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.insertText('# Updated Heading\n');
	await expect(sourceContent).toContainText('Updated Heading');

	await page.keyboard.press('Meta+/');
	await expect(editorArea.locator('h1')).toContainText('Updated Heading');
});
```

```bash
npx playwright test tests/source-mode.test.ts
# Expected: 4 failed
```

### Step 6.3 — Build SourcePane

`SourcePane` is a dumb CodeMirror wrapper. Same prop shape as `EditorPane`.

Create `src/lib/components/SourcePane.svelte`:

```svelte
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { markdown } from '@codemirror/lang-markdown';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { EditorState } from '@codemirror/state';

	interface Props {
		content: string;
		onChange: (value: string) => void;
		theme: 'light' | 'dark';
	}

	let { content, onChange, theme }: Props = $props();

	let containerEl: HTMLElement;
	let view: EditorView;

	onMount(() => {
		view = new EditorView({
			state: EditorState.create({
				doc: content,
				extensions: [
					basicSetup,
					markdown(),
					...(theme === 'dark' ? [oneDark] : []),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) onChange(update.state.doc.toString());
					})
				]
			}),
			parent: containerEl
		});
	});

	$effect(() => {
		if (!view) return;
		const current = view.state.doc.toString();
		if (current === content) return;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: content }
		});
	});

	onDestroy(() => view?.destroy());
</script>

<div bind:this={containerEl} data-testid="source-editor" class="source-editor"></div>

<style>
	.source-editor {
		height: 100%;
		overflow-y: auto;
	}
	:global(.source-editor .cm-editor) {
		height: 100%;
		font-size: 14px;
	}
</style>
```

### Step 6.4 — Update EditorContainer to render SourcePane

```svelte
<script lang="ts">
	import EditorPane from './EditorPane.svelte';
	import SourcePane from './SourcePane.svelte';
	import { document as doc } from '$lib/stores/document';

	interface Props {
		editorMode: 'rich' | 'source';
		theme: 'light' | 'dark';
	}

	let { editorMode, theme }: Props = $props();
	let content = $state(doc.get().content);

	function handleChange(md: string) {
		content = md;
		doc.update(md);
	}

	$effect(() => {
		const storeContent = doc.get().content;
		if (storeContent !== content) content = storeContent;
	});
</script>

{#if editorMode === 'rich'}
	<EditorPane {content} onChange={handleChange} {theme} />
{:else}
	<SourcePane {content} onChange={handleChange} {theme} />
{/if}
```

The toggle itself is already in `+page.svelte`'s `handleKeydown` from Day 3:

```typescript
if (e.key === '/') {
	e.preventDefault();
	editorMode = editorMode === 'rich' ? 'source' : 'rich';
}
```

No new shortcut wiring needed.

```bash
npx playwright test tests/source-mode.test.ts
# Expected: 4 passed
```

```bash
npm run test:unit && npx playwright test
```

```bash
git add .
git commit -m "feat: source mode toggle with Cmd+/"
```

**Day 6 done when:** Toggle works, content is preserved, source edits are reflected back in
rich mode after toggling, and undo-stack limitation is tested and documented.

---

## Day 7 — Open File + New File

**Goal:** `Cmd+O` opens a native file picker. Selecting a `.md` file loads it via
`document.load()`. `Cmd+N` calls `document.reset()`. Both shortcuts are already in the
`handleKeydown` stub from Day 3 — today they get their implementations.

### Step 7.0 — Configure Tauri capabilities

Tauri 2 denies all system access by default. Do this before implementing anything — without
it, `invoke` calls silently fail.

Create `src-tauri/capabilities/default.json`:

```json
{
	"$schema": "../gen/schemas/desktop-schema.json",
	"identifier": "default",
	"description": "Default permissions for mdreader",
	"windows": ["main"],
	"permissions": [
		"core:default",
		"core:window:allow-close",
		"core:window:allow-destroy",
		"core:path:default",
		"dialog:allow-open",
		"dialog:allow-save",
		"dialog:allow-ask",
		"shell:allow-open"
	]
}
```

> **Note:** The live project uses `core:path:default` and the window ACLs above. File read/write
> are implemented via custom commands and `std::fs` in Rust, not the `fs` plugin — adjust if you
> add the `fs` plugin later.

Add plugins to `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri-plugin-dialog = "2"
tauri-plugin-shell  = "2"
serde     = { version = "1", features = ["derive"] }
serde_json = "1"
```

Register in `src-tauri/src/lib.rs`:

```rust
.plugin(tauri_plugin_dialog::init())
.plugin(tauri_plugin_shell::init())
```

### Step 7.1 — Rust tests for file read

Create `src-tauri/src/file_ops.rs`:

```rust
use std::fs;
use std::path::Path;

pub fn read_markdown_file(path: &str) -> Result<String, String> {
    let path = Path::new(path);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err("Only .md files are supported".to_string());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn reads_valid_md_file() {
        let mut tmp = NamedTempFile::with_suffix(".md").unwrap();
        write!(tmp, "# Hello\n\nWorld").unwrap();
        let content = read_markdown_file(tmp.path().to_str().unwrap()).unwrap();
        assert_eq!(content, "# Hello\n\nWorld");
    }

    #[test]
    fn errors_on_missing_file() {
        assert!(read_markdown_file("/nonexistent/path/file.md").is_err());
    }

    #[test]
    fn errors_on_non_md_file() {
        let tmp = NamedTempFile::with_suffix(".txt").unwrap();
        let result = read_markdown_file(tmp.path().to_str().unwrap());
        assert!(result.unwrap_err().contains("Only .md files"));
    }
}
```

Add `tempfile` to `[dev-dependencies]` in `Cargo.toml`.

```bash
cd src-tauri && cargo test
# Expected: 3 passed
```

### Step 7.2 — Tauri command and AppState

In `src-tauri/src/lib.rs`:

```rust
mod file_ops;

use file_ops::read_markdown_file;
use std::sync::Mutex;

pub struct AppState {
    pub current_file: Mutex<Option<String>>,
}

#[tauri::command]
fn open_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let content = read_markdown_file(&path)?;
    *state.current_file.lock().unwrap() = Some(path);
    Ok(content)
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState { current_file: Mutex::new(None) })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![open_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Step 7.3 — Write failing e2e test for file open

Create a fixture `tests/fixtures/sample.md`:

```markdown
# Sample Document

This is a **test** fixture.

## Section Two

Some content here.
```

Add to `tests/file-ops.test.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

test('loading a markdown file displays its content', async ({ page }) => {
	await page.goto('/');
	const fixturePath = path.resolve('./tests/fixtures/sample.md');

	await page.evaluate(async (p) => {
		await (window as any).__TAURI__.core.invoke('open_file', { path: p });
	}, fixturePath);

	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await expect(editor.locator('h1')).toContainText('Sample Document');
	await expect(editor.locator('h2')).toContainText('Section Two');
});
```

> This test runs against the Vite dev server. `window.__TAURI__` is not available there —
> this test will only pass in an integration run against the real Tauri binary. For the
> automated suite, test file loading at the Rust level with `cargo test`. The e2e test
> serves as a manual integration checklist item.

### Step 7.4 — Implement `openFile` and `newFile` in `+page.svelte`

Fill in the stubs from Day 3:

```typescript
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { document as doc } from '$lib/stores/document';

async function openFile() {
	const selected = await open({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
	if (!selected || Array.isArray(selected)) return;
	const content = await invoke<string>('open_file', { path: selected });
	doc.load(content, selected as string);
}

function newFile() {
	doc.reset();
}
```

The `document.load()` call updates the store → `EditorContainer` reacts via `$effect` →
`EditorPane` receives new content prop → editor re-renders. No ref calls, no method calls.

```bash
git add .
git commit -m "feat: open .md file with Cmd+O, new file with Cmd+N"
```

**Day 7 done when:** Rust file-read tests pass, capabilities configured, `openFile` and
`newFile` stubs are wired, integration run shows file content in editor.

---

## Day 8 — Save, Auto-save, Quit Dialog

**Goal:** `Cmd+S` saves in place. `Cmd+Shift+S` opens a save dialog. Title reflects dirty
state. Auto-save fires every 30 seconds. Quitting with unsaved changes shows a native dialog.

### Step 8.1 — Rust tests for file write

Add to `src-tauri/src/file_ops.rs`:

```rust
pub fn write_markdown_file(path: &str, content: &str) -> Result<(), String> {
    let path = std::path::Path::new(path);
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err("Only .md files are supported".to_string());
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}

// Add to #[cfg(test)] mod tests:
#[test]
fn writes_and_reads_back_correctly() {
    let tmp = NamedTempFile::with_suffix(".md").unwrap();
    write_markdown_file(tmp.path().to_str().unwrap(), "# Written").unwrap();
    let content = read_markdown_file(tmp.path().to_str().unwrap()).unwrap();
    assert_eq!(content, "# Written");
}

#[test]
fn write_errors_on_non_md_extension() {
    let tmp = NamedTempFile::with_suffix(".txt").unwrap();
    assert!(write_markdown_file(tmp.path().to_str().unwrap(), "content").is_err());
}
```

```bash
cd src-tauri && cargo test
# Expected: 5 passed (3 existing + 2 new)
```

### Step 8.2 — Tauri save command

Add to `src-tauri/src/lib.rs`:

```rust
use file_ops::{read_markdown_file, write_markdown_file};

#[tauri::command]
fn save_file(state: tauri::State<'_, AppState>, content: String) -> Result<(), String> {
    let path = state.current_file.lock().unwrap().clone();
    match path {
        Some(p) => write_markdown_file(&p, &content),
        None    => Err("No file is currently open".to_string()),
    }
}

#[tauri::command]
fn set_current_file(state: tauri::State<'_, AppState>, path: String) {
    *state.current_file.lock().unwrap() = Some(path);
}
```

Register new commands in `generate_handler!`.

### Step 8.3 — Implement `save` and `saveAs` in `+page.svelte`

```typescript
import { save as saveDialog } from '@tauri-apps/plugin-dialog';

async function save() {
	const { content, filePath } = doc.get();
	if (!filePath) {
		await saveAs();
		return;
	}
	await invoke('save_file', { content });
	doc.markSaved();
}

async function saveAs() {
	const { content } = doc.get();
	const path = await saveDialog({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
	if (!path) return;
	await invoke('set_current_file', { path });
	await invoke('save_file', { content });
	doc.load(content, path);
	doc.markSaved();
}
```

Auto-save — start the interval once on mount:

```typescript
import { onMount } from 'svelte';

onMount(() => {
	const id = setInterval(() => {
		const { isDirty, filePath } = doc.get();
		if (isDirty && filePath) save();
	}, 30_000);
	return () => clearInterval(id);
});
```

### Step 8.4 — Quit with unsaved changes

**Superseded — see [Current implementation](#current-implementation-authoritative-where-it-differs-from-older-day-steps)** (window close + ACLs).

Use **`getCurrentWindow().onCloseRequested`** in `+page.svelte` (not Rust `prevent_close` + `listen('close-requested')`). Rough shape:

```typescript
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';

onMount(() => {
	let unlisten: (() => void) | undefined;
	void (async () => {
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
	})();
	return () => unlisten?.();
});
```

Capabilities must allow **`core:window:allow-destroy`** (and typically **`core:window:allow-close`**) for the built-in close path.

Write a unit test for title formatting (already done in Day 3). Write an e2e test for
the dirty indicator:

```typescript
test('unsaved changes show bullet in title', async ({ page }) => {
	await page.goto('/');
	await page.locator('.tiptap').click();
	await page.keyboard.type('New content');
	await expect(page).toHaveTitle(/•.*mdreader|mdreader.*•/);
});
```

```bash
npm run test:unit && npx playwright test
```

```bash
git add .
git commit -m "feat: save, save-as, auto-save, quit dialog"
```

**Day 8 done when:** Rust write tests pass, title shows dirty indicator, auto-save interval
is set, quit dialog fires when dirty.

---

## Day 9 — Recent Files

**Goal:** Last 10 opened files stored on disk, shown in the sidebar, surviving app restart.

### Step 9.1 — Rust tests for recent files

Create `src-tauri/src/recent_files.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const MAX_RECENT: usize = 10;

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct RecentFiles {
    paths: Vec<String>,
}

impl RecentFiles {
    pub fn add(&mut self, path: &str) {
        self.paths.retain(|p| p != path);
        self.paths.insert(0, path.to_string());
        self.paths.truncate(MAX_RECENT);
    }

    pub fn list(&self) -> &[String] { &self.paths }

    pub fn save(&self, dir: &PathBuf) -> Result<(), String> {
        let json = serde_json::to_string(self).map_err(|e| e.to_string())?;
        std::fs::write(dir.join("recent_files.json"), json).map_err(|e| e.to_string())
    }

    pub fn load(dir: &PathBuf) -> Self {
        std::fs::read_to_string(dir.join("recent_files.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn adds_to_front() {
        let mut rf = RecentFiles::default();
        rf.add("/a.md"); rf.add("/b.md");
        assert_eq!(rf.list()[0], "/b.md");
    }

    #[test]
    fn deduplicates() {
        let mut rf = RecentFiles::default();
        rf.add("/a.md"); rf.add("/b.md"); rf.add("/a.md");
        assert_eq!(rf.list().len(), 2);
        assert_eq!(rf.list()[0], "/a.md");
    }

    #[test]
    fn caps_at_ten() {
        let mut rf = RecentFiles::default();
        for i in 0..15 { rf.add(&format!("/{i}.md")); }
        assert_eq!(rf.list().len(), 10);
    }

    #[test]
    fn persists_across_load() {
        let dir = tempdir().unwrap();
        let mut rf = RecentFiles::default();
        rf.add("/test.md");
        rf.save(&dir.path().to_path_buf()).unwrap();
        let loaded = RecentFiles::load(&dir.path().to_path_buf());
        assert_eq!(loaded.list()[0], "/test.md");
    }
}
```

```bash
cd src-tauri && cargo test
# Expected: 4 new tests pass
```

### Step 9.2 — Wire recent files into AppState and `open_file` command

Extend `AppState` and update `open_file` to record the opened path:

```rust
mod recent_files;
use recent_files::RecentFiles;

pub struct AppState {
    pub current_file:  Mutex<Option<String>>,
    pub recent_files:  Mutex<RecentFiles>,
}

#[tauri::command]
fn open_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let content = read_markdown_file(&path)?;
    *state.current_file.lock().unwrap() = Some(path.clone());
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_data_dir).ok();
    let mut rf = state.recent_files.lock().unwrap();
    rf.add(&path);
    let _ = rf.save(&app_data_dir);
    Ok(content)
}

#[tauri::command]
fn get_recent_files(state: tauri::State<'_, AppState>) -> Vec<String> {
    state.recent_files.lock().unwrap().list().to_vec()
}
```

Load recent files on startup in `run()`:

```rust
.setup(|app| {
    let app_data_dir = app.path().app_data_dir()?;
    let recent = RecentFiles::load(&app_data_dir);
    app.manage(AppState {
        current_file:  Mutex::new(None),
        recent_files:  Mutex::new(recent),
    });
    Ok(())
})
```

### Step 9.3 — Sidebar recent files component

Create `src/lib/components/RecentFiles.svelte` and compose it into `Sidebar.svelte`.
`Sidebar` reads the document store for the active path and calls `invoke` to get the list.
Clicking a recent file calls `openFile` — pass it down as a prop:

```svelte
<!-- RecentFiles.svelte -->
<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { onMount } from 'svelte';

	interface Props {
		onOpen: (path: string) => void;
	}
	let { onOpen }: Props = $props();

	let paths: string[] = $state([]);
	onMount(async () => {
		paths = await invoke<string[]>('get_recent_files');
	});

	const displayName = (p: string) => p.split('/').pop() ?? p;
</script>

{#if paths.length > 0}
	<section class="recent">
		<p class="label">Recent</p>
		{#each paths as path}
			<button class="item" onclick={() => onOpen(path)} title={path}>
				{displayName(path)}
			</button>
		{/each}
	</section>
{/if}
```

```bash
git add .
git commit -m "feat: recent files persisted across restarts"
```

**Day 9 done when:** 4 Rust recent-files tests pass, `get_recent_files` command works,
recent files appear in sidebar after opening a file.

---

## Day 10 — Outline Sidebar: Heading Extraction

**Goal:** Sidebar auto-populates with a hierarchical heading list from the live document.

### Step 10.1 — Write failing unit tests for heading extraction

`extractHeadings` is a pure function — no DOM, no editor instance needed.

Create `src/lib/outline.test.ts`:

````typescript
import { describe, it, expect } from 'vitest';
import { extractHeadings } from './outline';

describe('extractHeadings', () => {
	it('returns empty array for no headings', () => {
		expect(extractHeadings('Just a paragraph.')).toEqual([]);
	});

	it('extracts a single H1', () => {
		const result = extractHeadings('# Title');
		expect(result).toEqual([{ level: 1, text: 'Title', slug: 'title' }]);
	});

	it('extracts mixed levels in order', () => {
		const md = '# H1\n\nparagraph\n\n## H2\n\n### H3';
		const result = extractHeadings(md);
		expect(result).toHaveLength(3);
		expect(result[0]).toMatchObject({ level: 1, text: 'H1' });
		expect(result[1]).toMatchObject({ level: 2, text: 'H2' });
		expect(result[2]).toMatchObject({ level: 3, text: 'H3' });
	});

	it('ignores headings inside code blocks', () => {
		const md = '```\n# not a heading\n```';
		expect(extractHeadings(md)).toHaveLength(0);
	});
});
````

```bash
npm run test:unit
# Expected: Error — cannot find module './outline'
```

### Step 10.2 — Implement heading extraction

Create `src/lib/outline.ts`:

````typescript
export interface Heading {
	level: number;
	text: string;
	slug: string; // used to scroll-to via element id
}

export function extractHeadings(markdown: string): Heading[] {
	const headings: Heading[] = [];
	let inCodeBlock = false;

	for (const line of markdown.split('\n')) {
		if (line.startsWith('```')) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) continue;

		const match = line.match(/^(#{1,3})\s+(.+)/);
		if (match) {
			const text = match[2].trim();
			headings.push({
				level: match[1].length,
				text,
				slug: text
					.toLowerCase()
					.replace(/[^\w\s-]/g, '')
					.replace(/\s+/g, '-')
			});
		}
	}

	return headings;
}
````

```bash
npm run test:unit
# Expected: all pass
```

### Step 10.3 — Write failing e2e test for outline

Add to `tests/outline.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('sidebar shows headings from document', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('# First Heading');
	await page.keyboard.press('Enter');
	await page.keyboard.type('## Second Heading');

	const sidebar = page.locator('[data-testid="sidebar"]');
	await expect(sidebar).toContainText('First Heading');
	await expect(sidebar).toContainText('Second Heading');
});
```

```bash
npx playwright test tests/outline.test.ts
# Expected: 1 failed
```

### Step 10.4 — Wire outline into Sidebar

Update `Sidebar.svelte` to read the document store and derive headings:

```svelte
<script lang="ts">
	import { document as doc } from '$lib/stores/document';
	import { extractHeadings } from '$lib/outline';
	import RecentFiles from './RecentFiles.svelte';

	interface Props {
		onOpenFile: (path: string) => void;
	}
	let { onOpenFile }: Props = $props();

	// Debounce heading extraction — don't re-derive on every keystroke
	let headings = $derived.by(() => {
		const content = doc.get().content;
		return extractHeadings(content);
	});
</script>

<div data-testid="sidebar" class="sidebar">
	<RecentFiles onOpen={onOpenFile} />

	{#if headings.length > 0}
		<section class="outline">
			<p class="label">Outline</p>
			{#each headings as h}
				<button
					class="heading-item level-{h.level}"
					onclick={() => document.getElementById(h.slug)?.scrollIntoView({ behavior: 'smooth' })}
				>
					{h.text}
				</button>
			{/each}
		</section>
	{/if}
</div>
```

Pass `onOpenFile` from `+page.svelte` (which owns `openFile`):

```svelte
{#snippet sidebar()}<Sidebar onOpenFile={openFile} />{/snippet}
```

```bash
npx playwright test tests/outline.test.ts
# Expected: 1 passed
```

```bash
git add .
git commit -m "feat: outline sidebar with heading extraction"
```

**Day 10 done when:** Heading extraction unit tests pass, outline appears in sidebar as
the user types.

---

## Day 11 — Outline Navigation + Active Section Highlight

**Goal:** Clicking a heading in the sidebar scrolls to that section. The active heading
is highlighted as the user scrolls.

### Step 11.1 — Add heading IDs to TipTap output

TipTap headings need `id` attributes matching the slugs for `scrollIntoView` to work.
Add a TipTap extension or a post-render pass that sets heading IDs.

### Step 11.2 — Write failing e2e tests

Add to `tests/outline.test.ts`:

```typescript
test('clicking a sidebar heading scrolls the editor', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	// Type enough content to create a scrollable document
	await page.keyboard.type('# First\n\n' + 'paragraph\n\n'.repeat(20) + '## Deep Section');

	await page.locator('[data-testid="sidebar"]').getByText('Deep Section').click();
	// The heading should now be in view
	const heading = editor.locator('h2');
	await expect(heading).toBeInViewport();
});

test('active heading is highlighted in sidebar on scroll', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.type('# First\n\n' + 'paragraph\n\n'.repeat(20) + '## Second');

	// Scroll to bottom
	await page
		.locator('[data-testid="editor-area"]')
		.evaluate((el) => (el.scrollTop = el.scrollHeight));

	const secondItem = page.locator('[data-testid="sidebar"]').getByText('Second');
	await expect(secondItem).toHaveClass(/active/);
});
```

### Step 11.3 — Implement active section tracking

Use an `IntersectionObserver` in `Sidebar.svelte` to track which heading is visible:

```typescript
let activeSlug = $state('');

$effect(() => {
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) activeSlug = entry.target.id;
			}
		},
		{ threshold: 0.5 }
	);

	document.querySelectorAll('.tiptap h1, .tiptap h2, .tiptap h3').forEach((el) => {
		observer.observe(el);
	});

	return () => observer.disconnect();
});
```

```bash
npx playwright test tests/outline.test.ts
# Expected: all pass
```

```bash
git add .
git commit -m "feat: outline navigation and active section highlight"
```

**Day 11 done when:** Clicking sidebar headings scrolls to section, active section is
highlighted during scroll.

---

## Day 12 — macOS Menu Bar + Editor Shortcuts

**Goal:** Native macOS menu bar with File/Edit/View menus. Editor formatting shortcuts
(Cmd+B, Cmd+I, Cmd+K, Cmd+`) work.

### Step 12.1 — Editor-internal formatting shortcuts

These shortcuts are editor concerns, not app concerns — they live in `EditorPane.svelte`
via a `svelte:window` handler scoped to when the editor is focused:

```typescript
function handleEditorKeydown(e: KeyboardEvent) {
	if (!editor?.isFocused) return;
	if (e.metaKey) {
		if (e.key === 'b') {
			e.preventDefault();
			editor.chain().focus().toggleBold().run();
		}
		if (e.key === 'i') {
			e.preventDefault();
			editor.chain().focus().toggleItalic().run();
		}
		if (e.key === 'k') {
			e.preventDefault(); /* open link dialog — Day 15 */
		}
		if (e.key === '`') {
			e.preventDefault();
			editor.chain().focus().toggleCode().run();
		}
	}
}
```

### Step 12.2 — macOS native menu

Configure the menu in `tauri.conf.json` or via Tauri's menu builder API. Wire menu items
to emit events that `+page.svelte` listens for:

```rust
// File > Open
.menu(tauri::menu::Menu::new(app)?)
```

Listen for menu events in `+page.svelte` via `listen('tauri://menu', ...)` and dispatch
to the existing handler functions (`openFile`, `save`, etc.) — no new logic, just wiring
existing functions to a new trigger.

```bash
git add .
git commit -m "feat: macOS menu bar and editor formatting shortcuts"
```

---

## Day 13 — Light / Dark Theme

**Goal:** App follows macOS system light/dark preference. Theme already cascades via
`data-theme` on `<html>` (set in `+layout.svelte` since Day 3). Today: verify it works
across all components, add a manual override option.

### Step 13.1 — Write failing e2e tests

```typescript
test('dark theme applies dark background', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/');
	const bg = await page
		.locator('body')
		.evaluate((el) => getComputedStyle(el).getPropertyValue('--color-bg').trim());
	expect(bg).toBe('#1e1e1e');
});

test('light theme applies light background', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.goto('/');
	const bg = await page
		.locator('body')
		.evaluate((el) => getComputedStyle(el).getPropertyValue('--color-bg').trim());
	expect(bg).toBe('#ffffff');
});
```

The `+layout.svelte` `$effect` from Day 3 already handles this. If tests fail, check that
the `data-theme` attribute is being set correctly.

```bash
npx playwright test tests/theme.test.ts
# Expected: 2 passed
```

```bash
git add .
git commit -m "feat: light/dark theme following macOS system preference"
```

---

## Day 14 — Distraction-Free Mode + Font Size

**Goal:** `Cmd+Shift+F` hides sidebar and status bar. Font size is adjustable. Both are
already wired in the Day 3 shortcut handler — today: CSS and tests.

### Step 14.1 — Distraction-free CSS

`AppShell` already applies `.distraction-free` class when `isDistractionFree` is true
(wired in Day 3). The CSS in `AppShell.svelte` collapses the sidebar column and hides the
status bar. Verify with an e2e test:

```typescript
test('Cmd+Shift+F hides sidebar and status bar', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
	await page.keyboard.press('Meta+Shift+F');
	await expect(page.locator('[data-testid="sidebar"]')).not.toBeVisible();
	await expect(page.locator('[data-testid="status-bar"]')).not.toBeVisible();
});

test('Cmd+Shift+F again restores layout', async ({ page }) => {
	await page.goto('/');
	await page.keyboard.press('Meta+Shift+F');
	await page.keyboard.press('Meta+Shift+F');
	await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
});
```

### Step 14.2 — Font size controls

`Cmd+=` / `Cmd+-` already call `setFontSize` from Day 3, which sets `--font-size-editor`
on `<html>`. Verify with an e2e test:

```typescript
test('Cmd+= increases editor font size', async ({ page }) => {
	await page.goto('/');
	await page.keyboard.press('Meta+=');
	const size = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--font-size-editor').trim()
	);
	expect(size).toBe('17px');
});
```

```bash
git add .
git commit -m "feat: distraction-free mode and font size controls"
```

---

## Day 15 — Find & Replace

**Goal:** `Cmd+F` opens a find bar. `Cmd+H` adds replace. Uses TipTap's search extension.

### Step 15.1 — Install TipTap search extension

```bash
npm install @tiptap/extension-search-and-replace
```

### Step 15.2 — Build FindBar component

Create `src/lib/components/FindBar.svelte`. It is a self-contained component — it reads
nothing from the document store and holds its own `query`/`replacement` state.

`EditorContainer` renders it conditionally based on a `showFindBar` prop (passed from
`+page.svelte`, toggled by `Cmd+F` in the existing shortcut handler).

Wire `Cmd+F` and `Cmd+H` into the existing handler in `+page.svelte`:

```typescript
let showFindBar = $state(false);
let showReplace = $state(false);

// In handleKeydown:
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
```

Pass `showFindBar` and `showReplace` to `EditorContainer`:

```svelte
{#snippet editor()}
	<div data-testid="editor-area" class="editor-area">
		<EditorContainer {editorMode} {theme} {showFindBar} {showReplace} />
	</div>
{/snippet}
```

### Step 15.3 — Tests

```typescript
test('Cmd+F shows find bar', async ({ page }) => {
	await page.goto('/');
	await page.keyboard.press('Meta+f');
	await expect(page.locator('[data-testid="find-bar"]')).toBeVisible();
});

test('find highlights matching text', async ({ page }) => {
	await page.goto('/');
	await page.locator('.tiptap').click();
	await page.keyboard.type('hello world hello');
	await page.keyboard.press('Meta+f');
	await page.locator('[data-testid="find-input"]').fill('hello');
	const marks = page.locator('.tiptap mark');
	await expect(marks).toHaveCount(2);
});
```

```bash
git add .
git commit -m "feat: find and replace"
```

---

## Day 16 — Image Paste + Asset Protocol

**Goal:** Pasted or dropped images are saved alongside the document and displayed via
Tauri's `asset://` protocol so the WebView can load local files.

### Step 16.1 — Rust command for saving image bytes

```rust
#[tauri::command]
fn save_image(path: String, bytes: Vec<u8>) -> Result<String, String> {
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path)
}
```

### Step 16.2 — EditorPane paste handler

Intercept `paste` events in `EditorPane.svelte`. When the clipboard contains an image file,
write it to disk alongside the current document, insert an `![](asset://...)` markdown node.

```typescript
editorEl.addEventListener('paste', async (e) => {
	const file = e.clipboardData?.files[0];
	if (!file || !file.type.startsWith('image/')) return;
	e.preventDefault();
	const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
	const { filePath } = doc.get();
	if (!filePath) return; // require a saved document before inserting images
	const dir = filePath.split('/').slice(0, -1).join('/');
	const name = `${Date.now()}-${file.name}`;
	const saved = await invoke<string>('save_image', { path: `${dir}/${name}`, bytes });
	editor.chain().focus().insertContent(`![](asset://${saved})`).run();
});
```

Configure `asset://` in `tauri.conf.json`:

```json
{ "security": { "assetProtocol": { "enable": true, "scope": ["**"] } } }
```

```bash
git add .
git commit -m "feat: image paste and asset:// protocol"
```

---

## Day 17 — Test Coverage Audit

**Goal:** Identify untested paths. Reach meaningful coverage on pure functions and Rust
modules. Do not add mocks to reach coverage numbers.

```bash
# Vitest coverage
npm run test:unit -- --coverage

# Rust coverage (requires cargo-llvm-cov)
cargo llvm-cov --html
```

Add tests for any pure function or Rust function with less than 80% branch coverage.
Do not add coverage for the `invoke` wiring — it is intentionally untested at the unit level.

```bash
git add .
git commit -m "test: coverage audit and gap-filling"
```

---

## Day 18 — Packaging + Release Pipeline

**Goal:** A signed `.dmg` that passes macOS Gatekeeper. GitHub Release workflow fires on
`v*` tags.

### Step 18.1 — Bundle identifier and icons

Set `bundle.identifier` in `tauri.conf.json`. Generate icon set:

```bash
cargo tauri icon src/assets/icon.png
```

### Step 18.2 — CI release workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: Build release
        run: cargo tauri build
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
      - name: Upload .dmg
        uses: softprops/action-gh-release@v2
        with:
          files: src-tauri/target/release/bundle/dmg/*.dmg
```

```bash
git add .
git commit -m "feat: packaging and release pipeline"
```

---

## Day 19 — Memory Audit

**Goal:** Verify the app stays within performance targets at idle and with a 10K-line file.

**Targets:** Binary < 20MB, idle RAM < 80MB, 10K-line file < 150MB.

### Step 19.1 — Measure baseline

```bash
# Binary size
ls -lh src-tauri/target/release/mdreader

# Runtime memory — use macOS Activity Monitor or:
/usr/bin/time -l cargo tauri dev 2>&1 | grep "maximum resident"
```

### Step 19.2 — 10K-line file test

Generate a large fixture:

```bash
python3 -c "
for i in range(500):
    print(f'## Section {i}')
    print('word ' * 20)
    print()
" > tests/fixtures/large.md
```

Open it in the app, observe RSS in Activity Monitor. If over target, profile with
`cargo flamegraph` on the Rust side and Chrome DevTools memory profiler on the frontend.

Common culprits: TipTap re-rendering on every store write, `extractHeadings` running on
every keystroke. Fix: debounce `document.update()` calls that trigger derived computations.

```bash
git add .
git commit -m "perf: memory audit and fixes"
```

---

## Definition of Done

| Day | Gate                                                       |
| --- | ---------------------------------------------------------- |
| 1–2 | CI green: lint → Vitest → cargo test → Playwright          |
| 3   | 5 layout tests pass, document store tests pass             |
| 4   | 7 round-trip unit tests pass, 4 editor e2e tests pass      |
| 5   | 4 extended round-trip tests pass, 2 new e2e tests pass     |
| 6   | 3 source mode e2e tests pass                               |
| 7   | 3 Rust file-read tests pass, capabilities configured       |
| 8   | 5 Rust file-write tests pass, dirty indicator e2e passes   |
| 9   | 4 Rust recent-files tests pass                             |
| 10  | 4 heading extraction unit tests pass, outline e2e passes   |
| 11  | Scroll navigation and active highlight e2e pass            |
| 12  | Editor shortcuts work, menu items trigger correct handlers |
| 13  | Theme e2e tests pass in both light and dark                |
| 14  | Distraction-free and font size e2e tests pass              |
| 15  | Find bar visible, highlight e2e test passes                |
| 16  | Image paste integration verified manually                  |
| 17  | No pure function below 80% branch coverage                 |
| 18  | `.dmg` produced by CI on `v*` tag                          |
| 19  | Idle < 80MB, 10K-line file < 150MB                         |

**Beyond the original gates:** multi-section Playwright tests (`tests/sections-render.test.ts`),
Tauri 2 quit flow (`onCloseRequested`, `allow-destroy`), and editor sync that avoids a false
dirty flag after open — see [Current implementation](#current-implementation-authoritative-where-it-differs-from-older-day-steps).
