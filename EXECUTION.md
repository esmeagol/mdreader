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

**Days 3–12** match the repo and carry a **✓** on each day header. **Day 13 onward** may still
describe planned work — implement those days against this section when you reach them. Older
revisions of this file showed superseded snippets (e.g. `content` on the document store);
those have been updated or replaced with pointers here.

When anything still looks ambiguous, treat this section and [ARCHITECTURE.md](ARCHITECTURE.md) as correct.

### Architecture summary

ProseMirror is the source of truth for document content. The `document` store holds only
file metadata (`filePath`, `isDirty`, `lastSaved`, `saveError`) — no `content` field. All
file I/O lives in `src/lib/fileService.ts`; `+page.svelte` calls named functions from it.

Key files that supersede their day-step equivalents:

| File                                        | Supersedes                                                      |
| ------------------------------------------- | --------------------------------------------------------------- |
| `src/lib/stores/document.ts`                | Day 3 store (no `content`, no `update()`)                       |
| `src/lib/editor.ts`                         | Day 4 EditorHandle (module singletons, `getActiveContent`)      |
| `src/lib/fileService.ts`                    | Day 5–8 inline `invoke` in `+page.svelte`                       |
| `src/lib/DirtyState.ts`                     | Day 6 `emitUpdate: false` / suppress-flag approach              |
| `src/lib/WordCount.ts`                      | Day 6 word count via `wordCount` store (not document `content`) |
| `src/lib/Headings.ts`                       | Day 10 separate `HeadingId.ts` + heading extraction             |
| `src/lib/components/EditorContainer.svelte` | Day 4–8 EditorContainer (no local content state)                |
| `src/lib/components/EditorPane.svelte`      | Day 4 EditorPane (PM plugins, `onReady` callback)               |
| `src/lib/components/SourcePane.svelte`      | Day 8 SourcePane (CM Annotation, `onReady` callback)            |

### Tauri capabilities

`src-tauri/capabilities/default.json` grants `core:default`, **`core:menu:default`** (native app menu),
`core:path:default`, dialog plugins (`dialog:allow-open`, `dialog:allow-save`, `dialog:allow-ask`),
`shell:allow-open`, and **`core:window:allow-close`** plus **`core:window:allow-destroy`**. The destroy permission
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
	await page.evaluate(
		async ({ md, path }) => {
			const { getRichHandle } = await import('/src/lib/editor.ts');
			const { document } = await import('/src/lib/stores/document.ts');
			getRichHandle()?.setContent(md, { markClean: true });
			document.load(path);
		},
		{ md: markdown, path: filePath }
	);
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

**Done.** Vitest wired with jsdom, `formatWordCount` / title helpers and tests, Rust tests under
`src-tauri` (`file_ops`, `recent_files`, `save_file` helpers, etc.), all wired into CI.

---

## Day 3 — App Shell ✓

**Goal:** Metadata-only document store, AppShell layout, status bar, global CSS, themed window
title, and the central keyboard shortcut handler. Rich/source editors and file I/O ship in
later days; the shell hosts `EditorContainer` once the editor exists.

**✓ Done.** Canonical details: [Current implementation](#current-implementation-authoritative-where-it-differs-from-older-day-steps).

### Step 3.1 — Document store (metadata only)

`src/lib/stores/document.ts` — writable store, **no** `content` / `update()`. Shape:
`filePath`, `isDirty`, `lastSaved`, `saveError`. Operations: `load`, `markDirty`, `markSaved`,
`setFilePath`, `markSaveError`, `reset`. Tests: `document.test.ts` with `beforeEach` → `reset()`.

### Step 3.2 — Title helpers and status bar

`utils.ts`: `documentDisplayName`, `formatTitle`, `formatWordCount`, `countWords` + tests.
`+layout.svelte`: `$doc` → `formatTitle`; OS `data-theme`. `StatusBar.svelte`: basename, dirty
bullet, `saveError`, **`$wordCount`** (from `WordCount` PM plugin once the editor exists).

### Step 3.3 — Layout tests

`tests/layout.test.ts` — sidebar, editor, status bar, **Untitled** (`data-testid="document-title"`),
geometry. **6 tests** when complete.

```bash
npx playwright test tests/layout.test.ts
# Expected: 6 passed
```

### Step 3.4 — Global CSS

`src/app.css` — tokens, light/dark, reset. Scrollbar stays on `.zone-editor`.

### Step 3.5 — AppShell

`AppShell.svelte` — grid (sidebar | toolbar + editor, full-width status); `sidebar-hidden`,
`distraction-free`.

### Step 3.6 — Zone components

Live **Sidebar** includes recent files + outline (Days 9–11). **Toolbar** remains an optional
placeholder. **StatusBar** — see Step 3.2.

### Step 3.7 — `+page.svelte`

Shortcuts → `$lib/fileService` (`openFile`, `save`, `saveAs`, `newFile`). Editor area →
`EditorContainer`. `onMount`: `loadRecentFiles()`, auto-save interval, native menu + close
dialog when running inside Tauri.

### Verification

```bash
npm run test:unit && npx playwright test tests/layout.test.ts
```

**Day 3 done when:** All layout tests pass, document store unit tests pass, CI is green.

---

## Day 4 — TipTap Editor ✓

**Goal:** A working TipTap editor in the editor zone. Markdown typed or loaded renders
in place. `EditorPane` owns the PM instance + plugins; `EditorContainer` syncs panes and
dirty state (see [Current implementation](#current-implementation-authoritative-where-it-differs-from-older-day-steps)).

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
import { getMarkdown } from './markdown';

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
			const result = getMarkdown(editor).trim();
			editor.destroy();
			expect(result).toBe(markdown.trim());
		});
	}
});
```

Import `getMarkdown` from `$lib/markdown` (shared serializer for app + tests).

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

`EditorPane` wraps TipTap, registers **`Headings`**, **`DirtyState`**, **`WordCount`**, link
handling, and `onReady` → `EditorHandle`. It calls `onChange(getMarkdown(editor))` on update.
It does not own file I/O (see `fileService.ts`).

> The scaffold below is the original minimal TipTap shell; the **repository file** adds the
> plugins above, `buildEditorProps` / `handleKeyDown`, and extended node types (**Day 5**).

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

`EditorContainer` receives `editorMode` and keeps **both** `EditorPane` and `SourcePane` mounted,
toggling visibility with CSS (`display: none`) so undo stacks survive mode switches (see
**Undo stack** in [Current implementation](#current-implementation-authoritative-where-it-differs-from-older-day-steps)).
It syncs markdown between handles on mode change; **no** `document` store `content` field.
Rich-mode dirty tracking is the `DirtyState` PM plugin; source mode calls `doc.markDirty(true)`
on change. See live `EditorContainer.svelte`.

### Step 4.6 — Wire EditorContainer into `+page.svelte`

Mount `EditorContainer` inside the editor snippet; derive `theme` from `<html data-theme>`.
File open/save flows push/pull markdown via `EditorHandle` in `fileService.ts`, not via the store.

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

## Day 5 — Extended Node Types ✓

**Goal:** Code blocks (with syntax highlighting), tables, task lists, and strikethrough.

**Live note:** `StarterKit.configure({ codeBlock: false, strike: false })` so lowlight + `Strike`
extensions own those nodes; round-trip tests use `getMarkdown()` from `$lib/markdown`.

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
import { getMarkdown } from './markdown';

const lowlight = createLowlight(common);

function createExtendedEditor(content = '') {
	return new Editor({
		extensions: [
			StarterKit.configure({ codeBlock: false, strike: false }),
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
		const result = getMarkdown(editor).trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a fenced code block', () => {
		const md = '```javascript\nconsole.log("hello");\n```';
		const editor = createExtendedEditor(md);
		const result = getMarkdown(editor).trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips an unchecked task list item', () => {
		const md = '- [ ] Unchecked task';
		const editor = createExtendedEditor(md);
		const result = getMarkdown(editor).trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a checked task list item', () => {
		const md = '- [x] Checked task';
		const editor = createExtendedEditor(md);
		const result = getMarkdown(editor).trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a basic markdown table', () => {
		const md = '| Name | Role |\n| --- | --- |\n| Alice | Engineer |';
		const editor = createExtendedEditor(md);
		const result = getMarkdown(editor).trim();
		editor.destroy();
		expect(result).toBe(md);
	});

	it('round-trips a markdown table with inline formatting', () => {
		const md = '| Name | Notes |\n| --- | --- |\n| Alice | **Strong** and *italic* |';
		const editor = createExtendedEditor(md);
		const result = getMarkdown(editor).trim();
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

## Day 6 — Source Mode Toggle ✓

**Goal:** `Cmd+/` toggles between TipTap and CodeMirror. `editorMode` lives in `+page.svelte`.
**Live:** both panes stay mounted (CSS hide/show) so undo survives toggles; see **Undo stack**
in [Current implementation](#current-implementation-authoritative-where-it-differs-from-older-day-steps).

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

test('undo history is preserved after round-trip through source mode without edits', async ({
	page
}) => {
	// Both panes stay mounted (CSS hidden), so TipTap's undo stack survives a no-op toggle.
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('Original text');

	await page.keyboard.press('Meta+/');
	await page.keyboard.press('Meta+/');

	await page.keyboard.press('Meta+z');
	await expect(editor).not.toContainText('Original text');
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
	await expect(editorArea.locator('[data-testid="source-editor"]')).not.toBeVisible();
	await expect(editorArea.locator('h1')).toContainText('Updated Heading');
});
```

```bash
npx playwright test tests/source-mode.test.ts
# Expected: 4 failed
```

### Step 6.3 — Build SourcePane

Live `SourcePane.svelte`: CodeMirror 6, `EditorState` + `Annotation` so programmatic
`setContent` does not echo through `onChange`; exposes `EditorHandle` via `onReady` and
`setSourceHandle` (see `editor.ts`).

### Step 6.4 — EditorContainer

Live `EditorContainer.svelte`: two `.pane-wrap` divs (rich + source), `.hidden` when inactive;
`setActiveMode`; syncs markdown between `richHandle` and `sourceHandle` on mode switch;
`handleChange` marks dirty in source mode only.

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

**Day 6 done when:** Toggle works, content is preserved, source edits round-trip to rich mode,
and undo behaviour matches the dual-mount architecture (see source-mode e2e tests).

---

## Day 7 — Open File + New File ✓

**Goal:** `Cmd+O` / picker opens a `.md` file; `Cmd+N` starts a new doc. **Live:** all
invokes and dialog flow live in `src/lib/fileService.ts`. After read, push markdown into
both editor handles with `markClean: true` on rich, then `document.load(path)` (metadata only).

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
		"core:menu:default",
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

> **Note:** File read/write use custom commands + `std::fs`, not the `fs` plugin. **`core:menu:default`**
> is required for the Day 12 native menu (`installTauriAppMenu`).

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

> **Live:** `AppState` also includes `recent_files` (Day 9); `open_file` updates recents on disk;
> `run()` uses `.setup()` to load persisted recents. See current `src-tauri/src/lib.rs`.

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

### Step 7.4 — `openFile` and `newFile`

Implement in **`src/lib/fileService.ts`** and import into `+page.svelte`:

- **`openFile(path?)`** — optional path (recent-file click); else dialog; if dirty, confirm;
  `invoke('open_file')`; `getRichHandle()?.setContent(content, { markClean: true })`;
  `getSourceHandle()?.setContent(content)`; `doc.load(selected)`; `recentFiles.prepend(selected)`.
- **`newFile()`** — `setContent('')` on both handles with `markClean` on rich; `doc.reset()`.

```bash
git add .
git commit -m "feat: open .md file with Cmd+O, new file with Cmd+N"
```

**Day 7 done when:** Rust file-read tests pass, capabilities configured, `openFile` and
`newFile` stubs are wired, integration run shows file content in editor.

---

## Day 8 — Save, Auto-save, Quit Dialog ✓

**Goal:** `Cmd+S` saves in place. `Cmd+Shift+S` opens a save dialog. Title / status reflect dirty
state. Auto-save every 30s when dirty + path set. Quit with unsaved changes → native confirm.

**Live:** `save` / `saveAs` in `fileService.ts` using `getActiveContent()`; `doc.markSaveError` on
failure; `+page.svelte` `onMount` interval calls `save()`; `onCloseRequested` + `destroy()` when
confirmed (see Step 8.4).

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

### Step 8.3 — `save`, `saveAs`, auto-save

**`fileService.ts`:** `save()` — if no `filePath`, delegate to `saveAs()`; else
`invoke('save_file', { content: getActiveContent() })`, `doc.markSaved()` or `markSaveError`.
`saveAs()` — dialog, `set_current_file`, write, `doc.setFilePath` + `markSaved()`.

**`+page.svelte` `onMount`:** `setInterval` 30s → if `isDirty && filePath` call `save()` from
`fileService`.

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

## Day 9 — Recent Files ✓

**Goal:** Last 10 opened files on disk, listed in the sidebar, survive restart.

**Live:** Rust persists in app data dir; frontend **`recentFiles` store** (`src/lib/stores/recentFiles.ts`)
hydrated by `loadRecentFiles()`; `openFile` / `recentFiles.prepend` keep the UI in sync without
per-snippet `invoke` in `RecentFiles.svelte`.

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

`RecentFiles.svelte` subscribes to **`recentFiles`** (`src/lib/stores/recentFiles.ts`). Populate
the store from `loadRecentFiles()` → `get_recent_files` on app mount (`+page.svelte`); update
with `recentFiles.prepend(path)` when opening files (`fileService.openFile`).

```svelte
<script lang="ts">
	import { recentFiles } from '$lib/stores/recentFiles';

	interface Props {
		onOpenFile: (path: string) => void;
	}
	let { onOpenFile }: Props = $props();

	const displayName = (p: string) => p.split('/').pop() ?? p;
</script>

{#if $recentFiles.length > 0}
	<section class="recent">
		<p class="label">Recent</p>
		{#each $recentFiles as path (path)}
			<button class="item" onclick={() => onOpenFile(path)} title={path}>
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

## Day 10 — Outline Sidebar: Heading Extraction ✓

**Goal:** Sidebar shows a live hierarchical heading list.

**Live:** `Headings` PM plugin (`src/lib/Headings.ts`) traverses the TipTap doc, pushes to
`headings` store, and applies heading `id` decorations (duplicate titles → `-0`, `-1`, … via
`slugify` from `outline.ts`). **`extractHeadings` in `outline.ts`** remains for fast unit tests
on markdown strings (not the sidebar data path).

### Step 10.1 — Write failing unit tests for heading extraction

`extractHeadings` — pure markdown-line parser tests (`outline.test.ts`).

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

`Sidebar.svelte`: `RecentFiles` + `$headings` from `src/lib/stores/headings.ts` (filled by
`Headings` in `EditorPane`). Outline buttons call `document.getElementById(h.slug)?.scrollIntoView({ behavior: 'smooth' })`.

`+page.svelte`: `{#snippet sidebar()}<Sidebar onOpenFile={openFile} />{/snippet}` (`openFile` from
`fileService`).

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

## Day 11 — Outline Navigation + Active Section Highlight ✓

**Goal:** Sidebar click scrolls to the correct heading; active heading highlights while scrolling.

### Step 11.1 — Heading IDs

Implemented by the **`Headings` PM plugin** (node decorations with `id` = slug, including
deduplication). E2E: heading `id` matches slugified text; duplicate-title scroll test uses
`loadContent()` helper (see [Playwright test helper pattern](#playwright-test-helper-pattern)).

### Step 11.2 — E2e tests

Live `tests/outline.test.ts` includes: ids on headings, id updates when title changes,
duplicate-heading sidebar click (scrolls to **h2**, not first text match), active class on
scroll. Scroll the **`.zone-editor`** root (not only the inner editor area) so behaviour
matches `Sidebar.svelte`.

### Step 11.3 — Active section tracking

`Sidebar.svelte`: `IntersectionObserver` with **`root: .zone-editor`**, multiple thresholds,
ratio map + “first heading with ≥0.5 visible height in root” (see live file). Outline buttons
use `class:active={h.slug === activeSlug}`.

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

## Day 12 — macOS Menu Bar + Editor Shortcuts ✓

**Goal:** Native menu (File / Edit / View) + editor formatting keys.

### Step 12.1 — Editor formatting shortcuts

- **Cmd+B / Cmd+I** — ProseMirror / StarterKit default keymap when the rich editor is focused
  (covered by `tests/editor.test.ts`).
- **Cmd+`** — `editorProps.handleKeyDown` in `EditorPane.svelte` → `toggleCode()` (handles `` ` `` and `Backquote`).
- **Cmd+K** — `preventDefault` only until link UI lands (**Day 15**).

### Step 12.2 — Native app menu

**`src/lib/tauriAppMenu.ts`** — `@tauri-apps/api/menu` (`Menu`, `Submenu`, `MenuItem`,
`PredefinedMenuItem`). **`installTauriAppMenu(handlers)`** maps item ids via
`src/lib/appMenuDispatch.ts` → same `openFile` / `save` / `newFile` / view toggles as keyboard
shortcuts. Called from `+page.svelte` `onMount` when `isTauriRuntime()` (try/catch for dev /
Playwright). Requires **`core:menu:default`** in `capabilities/default.json`.

**Toolbar:** `Toolbar.svelte` remains an optional placeholder; formatting is keyboard-driven
unless you add buttons later.

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
