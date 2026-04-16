# mdreader — Frontend Architecture

## Guiding Principles

1. **ProseMirror is the source of truth for document content.** Content lives in the editor; the document store holds only file metadata (path, dirty flag, save state). Nothing reads content from the store.
2. **Single owner per concern.** Every piece of state and every UI zone has exactly one owner. Nothing is managed in two places.
3. **Components are dumb.** Components receive props and emit events or call `onReady` callbacks. They do not call other components' methods, touch `window`, or call Tauri APIs directly.
4. **Single writer per state.** Each piece of shared state exposes named operations — not a raw setter. When something is wrong, you check the operations, not every callsite.
5. **Test at the right layer.** Pure logic with Vitest. Rust I/O with `cargo test` and real files. UI behaviour with Playwright against the Vite dev server. Don't test the Tauri `invoke` wiring from the browser — keep it thin enough to be obviously correct.
6. **No mocking.** Mocks duplicate the contract they're supposed to verify. Instead, keep the JS-to-Tauri boundary thin and test each side in its natural environment.
7. **Zones are stable.** The layout grid is owned by one component (`AppShell`) and never touched by anyone else. Adding a new zone means editing one file.
8. **Explicit over implicit.** Prefer props and named function calls over reactive chains. When something breaks, you should be able to follow a call stack, not trace reactive subscriptions.
9. **Reader width is responsive, not full-bleed.** The reading column is centered with a max-width token, but scrolling is owned by the outer editor zone so the scrollbar stays at the far-right edge.

---

## Directory Structure

```
src/
├── app.css                        # Design tokens (CSS vars) + global reset only
├── routes/
│   ├── +layout.svelte             # HTML shell: imports app.css, drives theme via $effect
│   └── +page.svelte               # App entry — UI state owner, shortcut handler, thin wiring
└── lib/
    ├── components/
    │   ├── AppShell.svelte        # Grid owner — exposes named snippet slots
    │   ├── Sidebar.svelte         # Outline panel — reads headings store
    │   ├── RecentFiles.svelte     # Recent-file list rendered inside Sidebar
    │   ├── Toolbar.svelte         # Formatting strip — empty slot initially
    │   ├── EditorContainer.svelte # Mode coordinator (rich ↔ source); owns handle refs
    │   ├── EditorPane.svelte      # TipTap — mounts PM plugins, exposes EditorHandle
    │   ├── FindBar.svelte         # Find / replace UI bar; shown/hidden by EditorContainer
    │   ├── SourcePane.svelte      # CodeMirror — exposes EditorHandle
    │   └── StatusBar.svelte       # Word count, file info — reads stores
    ├── stores/
    │   ├── document.ts            # File metadata only: filePath, isDirty, lastSaved, saveError
    │   ├── headings.ts            # Heading list derived by PM plugin; read by Sidebar
    │   ├── wordCount.ts           # Word count derived by PM plugin; read by StatusBar
    │   ├── recentFiles.ts         # Recent paths; hydrated from Tauri on mount
    │   └── themePreference.ts     # light/dark/system preference; persisted to localStorage
    ├── editor.ts                  # EditorHandle interface + module-level singletons
    ├── fileService.ts             # All Tauri file I/O (open, save, saveAs, newFile)
    ├── tauriAppMenu.ts            # Native menu (Tauri 2 Menu API); installTauriAppMenu
    ├── appMenuDispatch.ts         # Stable menu item ids → app actions (shared with tests)
    ├── markdown.ts                # getMarkdown(editor) — shared serializer for app + tests
    ├── DirtyState.ts              # TipTap extension: tracks dirty via PM doc.eq()
    ├── Headings.ts                # TipTap extension: extracts headings + stamps heading IDs
    ├── SearchHighlight.ts         # TipTap extension: find/replace highlights + navigation
    ├── SourceOnFocus.ts           # TipTap extension: marks active block with block-active class
    ├── WordCount.ts               # TipTap extension: counts words from PM doc
    └── utils.ts                   # Pure functions (formatWordCount, formatTitle, etc.)
```

---

## Component Hierarchy

```
+layout.svelte
└── +page.svelte              (owns: sidebarVisible, isDistractionFree, editorMode, fontSize)
      └── AppShell            (owns: CSS grid)
            ├── [sidebar]   → Sidebar
            ├── [toolbar]   → Toolbar
            ├── [editor]    → EditorContainer  (owns: richHandle, sourceHandle refs)
            │                     ├── FindBar      (shown when showFindBar=true)
            │                     ├── EditorPane   (always mounted; hidden in source mode)
            │                     └── SourcePane   (always mounted; hidden in rich mode)
            └── [statusbar] → StatusBar
```

---

## Component Ownership

### `AppShell.svelte`

Owns the CSS grid. Column widths, row heights, zone names. Nothing else.

Props: four named Svelte 5 snippets — `sidebar`, `toolbar`, `editor`, `statusbar` — plus
`sidebarVisible` and `isDistractionFree` booleans that drive CSS classes.

```svelte
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
```

Adding a future zone (e.g. a breadcrumb bar): add one row to the grid in AppShell, add one
snippet prop. Nothing else changes.

AppShell's `.zone-editor` is the scroll container (`overflow-y: auto`). Inner editor content
should avoid creating a second vertical scrollbar.

### `+page.svelte`

Owns application-level UI state and the keyboard shortcut handler. Delegates all file I/O to
`fileService.ts`. The `editorMode` prop is owned here and passed down to `EditorContainer` so
app-level shortcuts (Cmd+/) can toggle it.

```svelte
<script lang="ts">
	import { openFile, save, saveAs, newFile } from '$lib/fileService';

	let sidebarVisible = $state(true);
	let isDistractionFree = $state(false);
	let editorMode = $state<'rich' | 'source'>('rich');

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
</script>
```

Every app-level shortcut is visible in one function. Editor-internal shortcuts (Cmd+B, Cmd+I,
Cmd+`) stay inside `EditorPane` — they are editor concerns, not app concerns.

**Window close** uses Tauri 2's `getCurrentWindow().onCloseRequested()`. If the document is
clean, the handler returns without `preventDefault()` and the runtime closes. If dirty, it
calls `preventDefault()`, shows a native `ask` dialog, and calls `destroy()` only when the
user confirms.

### `EditorContainer.svelte`

Owns the rich ↔ source mode switch and content synchronisation between modes. Holds
`EditorHandle` refs for both panes (`richHandle`, `sourceHandle`).

**Both panes are always mounted** — hidden with `display:none` (CSS class `hidden`) rather
than `{#if}`. This preserves each pane's undo stack across mode switches.

On mode switch, `EditorContainer` syncs content from the leaving pane to the entering pane
by calling `handle.setContent(content)` **without** `{ markClean: true }`. Omitting that flag
preserves the DirtyState clean baseline — switching modes does not reset dirty state.

After a save (`$doc.lastSaved` changes), calls `richHandle.markSaved()` to reset the PM
dirty baseline to the saved document.

Source mode dirty tracking is simple: the `handleChange` callback calls `doc.markDirty(true)`
on every CodeMirror change. Rich mode dirty tracking is owned by the `DirtyState` PM plugin.

```svelte
<div class:hidden={editorMode !== 'rich'}>
	<EditorPane content="" onChange={handleChange} onReady={(h) => (richHandle = h)} {theme} />
</div>
<div class:hidden={editorMode !== 'source'}>
	<SourcePane content="" onChange={handleChange} onReady={(h) => (sourceHandle = h)} {theme} />
</div>
```

### `EditorPane.svelte`

Owns the TipTap instance. Handles editor-internal shortcuts (bold, italic, etc.). Mounts the
three PM-layer extensions: `DirtyState`, `WordCount`, `Headings`.

On mount, creates an `EditorHandle` and calls both `setRichHandle(handle)` (module singleton
for `fileService`) and `onReady?.(handle)` (prop callback for `EditorContainer`). On destroy,
calls `setRichHandle(null)`.

`setContent` calls TipTap's `setContent` with `{ emitUpdate: false }` to avoid triggering
`onUpdate`. It dispatches a `MARK_CLEAN_KEY` transaction only when `opts?.markClean` is
explicitly true — this resets the DirtyState plugin's clean baseline. Mode-switch syncs call
`setContent` without `markClean` so they do not reset dirty state.

```typescript
const handle: EditorHandle = {
	setContent(markdown, opts) {
		editor.commands.setContent(markdown, { emitUpdate: false });
		if (opts?.markClean) {
			editor.view.dispatch(editor.state.tr.setMeta(MARK_CLEAN_KEY, true));
		}
	},
	getContent(): string {
		return getMarkdown(editor);
	},
	markSaved() {
		editor.view.dispatch(editor.state.tr.setMeta(MARK_CLEAN_KEY, true));
	}
};
```

Does not know about: source mode, file I/O, the document store's content, Tauri.

### `SourcePane.svelte`

Owns the CodeMirror instance. Uses a CM `Annotation` to distinguish externally-dispatched
transactions from user edits so that programmatic syncs do not call `onChange` (which would
mark the document dirty).

On mount, creates an `EditorHandle` and calls `setSourceHandle(handle)` and `onReady?.(handle)`.

`setContent` options are accepted but ignored — there is no PM dirty plugin in the source pane.
Dirty state in source mode is tracked by `EditorContainer.handleChange`.

Does not know about: rich mode, file I/O, stores, Tauri.

### `Sidebar.svelte`

Reads the `headings` store (populated by the `Headings` PM plugin in `EditorPane`). Renders
the outline list. Clicking a heading scrolls the editor to the matching element by `id`
(the ID is stamped by the same `Headings` plugin via ProseMirror decorations).

Does not hold any content state of its own.

### `StatusBar.svelte`

Reads the `wordCount` store (populated by the `WordCount` PM plugin) and the `document` store
(filePath, isDirty, saveError). Renders only. Emits nothing.

### `+layout.svelte`

Owns the `<title>` tag and the theme. Both are driven by `$effect` — they are reactive
consequences of store state, never set imperatively scattered through the codebase.

```svelte
<script lang="ts">
	import { document as doc } from '$lib/stores/document';
	import { formatTitle } from '$lib/utils';

	$effect(() => {
		const { filePath, isDirty } = doc.get();
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
```

---

## State Management

### Document content — ProseMirror only

Document content lives exclusively in ProseMirror (or CodeMirror in source mode). No store
holds a copy. `fileService` reads content via `getActiveContent()` from the module-level
handle singletons at save time. This means:

- No store-triggered re-renders on every keystroke
- Word count, headings, and dirty state are derived by PM plugins from the actual doc node
- Content is not duplicated between store and editor

### `document` store — file metadata only

```typescript
interface DocumentState {
	filePath: string | null;
	isDirty: boolean;
	lastSaved: Date | null;
	saveError: string | null;
}
```

Named operations:

| Operation            | When called                                       | Effect                                        |
| -------------------- | ------------------------------------------------- | --------------------------------------------- |
| `load(filePath)`     | After a file is opened                            | Sets path, clears dirty/error                 |
| `markDirty(bool)`    | DirtyState plugin (rich) or handleChange (source) | Sets isDirty                                  |
| `markSaved()`        | After successful save                             | Clears dirty, records timestamp, clears error |
| `setFilePath(path)`  | After saveAs picks a new path                     | Updates path without touching isDirty         |
| `markSaveError(msg)` | After failed save                                 | Sets saveError                                |
| `reset()`            | Cmd+N                                             | Returns to empty state                        |

### `headings` and `wordCount` stores

Simple writable stores set by PM plugins (`Headings`, `WordCount`) during `view.update`.
Read by `Sidebar` and `StatusBar`. They are updated synchronously during the PM transaction
cycle — no debouncing, no `$effect` chains.

### `EditorHandle` singletons (`src/lib/editor.ts`)

Module-level refs set by EditorPane/SourcePane on mount, cleared on destroy. Used by
`fileService` to push content to editors on file open, and to read content at save time.

```typescript
export interface EditorHandle {
	setContent(markdown: string, opts?: { markClean?: boolean }): void;
	getContent(): string;
	markSaved(): void;
}
// getRichHandle(), getSourceHandle(), getActiveContent(), setActiveMode()
```

`setActiveMode` is called by `EditorContainer` on every mode switch so `getActiveContent()`
always returns content from the visible pane.

### UI state — co-located, not centralised

There is no `ui` store. Each piece of UI state lives as close to its owner as possible.

| State               | Owner                | Shared via                                               |
| ------------------- | -------------------- | -------------------------------------------------------- |
| `sidebarVisible`    | `+page.svelte`       | Prop to AppShell                                         |
| `isDistractionFree` | `+page.svelte`       | Prop to AppShell                                         |
| `editorMode`        | `+page.svelte`       | Prop to EditorContainer                                  |
| `showFindBar`       | `+page.svelte`       | Prop to EditorContainer                                  |
| `autoSave`          | `+page.svelte`       | Checked inside the 30s interval closure                  |
| `themePreference`   | `themePreference.ts` | Store; `+layout.svelte` applies `data-theme` to `<html>` |
| `fontSize`          | `+page.svelte`       | CSS variable on `<html>` — CSS cascades                  |

---

## File I/O — `fileService.ts`

All Tauri `invoke` calls live in `src/lib/fileService.ts`. `+page.svelte` imports named
functions and calls them directly — no arguments needed because file content is always read
from the active editor handle.

```typescript
// Open: update store metadata FIRST, then push content to editors.
// The image NodeView reads doc.filePath at render time to resolve relative src
// paths to asset:// URLs. doc.load() must run before setContent() or the NodeView
// fires before the path is set and images 404.
export async function openFile(path?: string): Promise<void> {
	const content = await invoke<string>('open_file', { path: selected });
	doc.load(selected);
	getRichHandle()?.setContent(content, { markClean: true });
	getSourceHandle()?.setContent(content);
}

// Save: read from active handle, write to Rust
export async function save(): Promise<void> {
	const content = getActiveContent();
	await invoke<void>('save_file', { content });
	doc.markSaved();
}

// New file: clear both handles, reset store
export function newFile(): void {
	getRichHandle()?.setContent('', { markClean: true });
	getSourceHandle()?.setContent('');
	doc.reset();
}
```

**Invariant:** on file open, `doc.load(path)` runs **before** `setContent()`. The image
NodeView reads `doc.filePath` at node-render time — if the store update comes after, relative
image `src` attributes cannot be resolved to `asset://` URLs and images 404.

`markClean: true` is passed only on genuine file loads and saves — not on mode-switch syncs.
This distinction is critical: it tells the `DirtyState` plugin to reset its clean baseline.

---

## PM Plugins

### `DirtyState` (`src/lib/DirtyState.ts`)

Tracks whether the PM document differs from the last clean version using `doc.eq(cleanDoc)`
(structural node equality, not string comparison).

- `cleanDoc` is initialised to the doc at editor creation.
- Any transaction carrying `MARK_CLEAN_KEY` meta resets `cleanDoc` to the current doc.
- When dirty state changes, calls `onDirtyChange(isDirty)` from `view.update` (synchronous,
  outside transactions — safe to call Svelte stores).

Because `setContent` and `MARK_CLEAN_KEY` dispatch are batched in the same JS turn on file
load, the DOM never renders an intermediate dirty=true state.

### `WordCount` (`src/lib/WordCount.ts`)

On `tr.docChanged`, counts words from `tr.doc.textContent` and updates the `wordCount` store.

### `Headings` (`src/lib/Headings.ts`)

Single doc traversal per transaction. Produces two outputs:

1. **Heading list** — calls `onHeadingsChange(headings)` to update the `headings` store (read
   by Sidebar).
2. **Heading ID decorations** — stamps `id` attributes on heading nodes so sidebar anchor links
   work without manually querying the DOM.

`headingsEqual()` prevents redundant store updates when the heading list is unchanged.

---

## Data Flow

```
── File open ──────────────────────────────────────────────────────────────
Cmd+O → handleKeydown → fileService.openFile()
  → Tauri dialog → user picks file
  → invoke('open_file', { path })   [Rust reads file]
  → getRichHandle().setContent(content, { markClean: true })
      → TipTap setContent({ emitUpdate: false })
      → dispatch tr with MARK_CLEAN_KEY → DirtyState resets cleanDoc
  → getSourceHandle().setContent(content)
  → doc.load(path)
  → WordCount plugin → wordCount store → StatusBar updates
  → Headings plugin → headings store → Sidebar updates
  → +layout.svelte $effect → <title> updates (filename, clean)

── User types ─────────────────────────────────────────────────────────────
PM transaction (rich mode)
  → DirtyState plugin: doc.eq(cleanDoc) → false → onDirtyChange(true)
  → doc.markDirty(true)
  → WordCount plugin → wordCount store → StatusBar updates
  → Headings plugin → headings store → Sidebar updates (if heading changed)
  → +layout.svelte $effect → <title> gains dirty indicator

── Save ───────────────────────────────────────────────────────────────────
Cmd+S → handleKeydown → fileService.save()
  → getActiveContent()   [reads from active handle — no store involved]
  → invoke('save_file', { content })   [Rust writes file]
  → doc.markSaved()
  → EditorContainer $effect: richHandle.markSaved()
      → dispatch tr with MARK_CLEAN_KEY → DirtyState resets cleanDoc
  → +layout.svelte $effect → dirty indicator removed from <title>

── Mode switch ────────────────────────────────────────────────────────────
Cmd+/ → editorMode toggles in +page.svelte → prop to EditorContainer
  → EditorContainer $effect: setActiveMode(mode)
  → sync: sourceHandle.setContent(richHandle.getContent())  [no markClean]
  → CSS class swap: rich pane hidden, source pane visible
  → undo stacks preserved (both panes always mounted)

── Distraction-free ───────────────────────────────────────────────────────
Cmd+Shift+F → isDistractionFree toggles → prop to AppShell → CSS class
```

---

## Testing Strategy

No mocks. Each layer is tested in its natural environment.

| Layer                 | Tool                          | What is tested                                                             |
| --------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| Pure functions        | Vitest                        | `formatWordCount`, `formatTitle`, heading extraction, markdown round-trips |
| Document store        | Vitest                        | All named operations and state transitions                                 |
| Rust file I/O         | `cargo test` + real tempfiles | `read_markdown_file`, `write_markdown_file`, validation                    |
| UI behaviour          | Playwright + Vite dev server  | Rendering, editing, mode toggle, dirty state, layout, shortcuts            |
| Tauri `invoke` wiring | Not unit tested — kept thin   | Reviewed; tested via manual/integration run                                |

**Test helper pattern** — Playwright tests that need a file loaded use a two-step evaluate:

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

This mirrors exactly what `fileService.openFile()` does: push content to editor first, then
update store metadata. The `markClean: true` flag prevents a false dirty state.

---

## Adding a New Feature

### Adding a new PM-driven signal (e.g. spell-check, diagram rendering)

1. Create `src/lib/YourPlugin.ts` — a TipTap `Extension.create()` wrapping a PM `Plugin`
2. The plugin's `view.update` or `apply` computes the signal and calls a callback
3. If the result is needed by other components, write a small Svelte store and update it from
   the callback
4. Wire the extension into `EditorPane.svelte`'s `extensions` array with the callback

No changes to `document` store, `fileService`, or `EditorContainer`.

### Adding a new layout zone (e.g. breadcrumb bar)

1. Add one row to the CSS grid in `AppShell.svelte`
2. Add one snippet prop to AppShell
3. Create the component and drop it into the new slot in `+page.svelte`

### Adding tabs

Each tab needs: an `EditorHandle` (from a mounted EditorPane/SourcePane), and a `DocumentState`
instance. The current single-document shape already supports this — the handles are plain
objects and the store is a thin bag. The refactor needed is: make both pane components
accept a `tabId` to register separate handles, and swap the active handle pair on tab switch.
`fileService` functions already read content via `getActiveContent()` and write metadata via
`doc.load()` — they would work unchanged if you swap what "active" means.

---

## Tradeoffs

### ProseMirror plugins for derived state

**Gained:** Word count, headings, and dirty state update from a single PM doc traversal per
transaction. No `$effect` chains, no store-triggered re-parses, no string diffs. Correct
structural equality (`doc.eq`) instead of string comparison for dirty detection.

**Cost:** PM plugin code is more verbose than a Svelte `$derived`. The `apply` / `view.update`
split and the `PluginKey` pattern require familiarity with ProseMirror internals.

### Module-level handle singletons

**Gained:** `fileService` can read/write editor content without routing through the store. No
prop-drilling or context threading needed for I/O operations.

**Cost:** The singletons are harder to test in isolation than injected dependencies. A unit
test of `fileService` cannot easily supply a fake handle without importing the module and
calling `setRichHandle` with a mock.

### Both panes always mounted

**Gained:** Undo stacks are preserved across mode switches — a direct user-visible improvement.
The mode switch is a CSS toggle, not a DOM teardown.

**Cost:** Both TipTap and CodeMirror instances are alive simultaneously, consuming memory and
CPU even when hidden. For typical document sizes this is immaterial.

### `editorMode` owned by `+page.svelte`

**Gained:** The Cmd+/ shortcut and the mode prop live in the same component. No event bus or
store is needed to communicate mode.

**Cost:** `editorMode` is threaded as a prop through `+page.svelte` → `EditorContainer`. If a
deeply nested component ever needs to toggle mode, prop-drilling becomes awkward.

### No `content` in the document store

**Gained:** Components that read the store (StatusBar, layout) do not re-render on every
keystroke. Content changes are invisible to the store subscription graph.

**Cost:** Content is only accessible via the editor handles. Code that needs the current
content (e.g. a hypothetical export feature) must call `getActiveContent()` rather than
reading a store field — which requires a handle to be mounted.

### Co-located UI state (no `ui` store)

**Gained:** Each piece of state is where you'd expect to find it.

**Cost:** State that needs to be accessible from both a component and a shortcut handler
(e.g. `sidebarVisible`) must live in `+page.svelte` and be threaded as a prop. As the feature
list grows, `+page.svelte` accumulates state variables.
