# mdreader — Frontend Architecture

## Guiding Principles

1. **Single owner per concern.** Every piece of state and every UI zone has exactly one owner. Nothing is managed in two places.
2. **Components are dumb.** Components receive props and emit events. They do not call other components' methods, touch `window`, or call Tauri APIs directly.
3. **Single writer per state.** Each piece of shared state exposes named operations — not a raw setter. When something is wrong, you check the operations, not every callsite.
4. **Test at the right layer.** Pure logic with Vitest. Rust I/O with `cargo test` and real files. UI behavior with Playwright against the Vite dev server. Don't test the Tauri `invoke` wiring from the browser — keep it thin enough to be obviously correct.
5. **No mocking.** Mocks duplicate the contract they're supposed to verify. Instead, keep the JS-to-Tauri boundary thin and test each side in its natural environment.
6. **Zones are stable.** The layout grid is owned by one component (`AppShell`) and never touched by anyone else. Adding a new zone means editing one file.
7. **Explicit over implicit.** Prefer props and named function calls over reactive chains. When something breaks, you should be able to follow a call stack, not trace reactive subscriptions.
8. **Reader width is responsive, not full-bleed.** The reading column is centered with a max-width token, but scrolling is owned by the outer editor zone so the scrollbar stays at the far-right edge.

---

## Directory Structure

```
src/
├── app.css                        # Design tokens (CSS vars) + global reset only
├── routes/
│   ├── +layout.svelte             # HTML shell: imports app.css, drives theme via $effect
│   └── +page.svelte               # App entry — state owner, shortcut handler, thin wiring
└── lib/
    ├── components/
    │   ├── AppShell.svelte        # Grid owner — exposes named snippet slots
    │   ├── Sidebar.svelte         # Outline panel — reads document store
    │   ├── Toolbar.svelte         # Formatting strip — empty slot initially
    │   ├── EditorContainer.svelte # Mode coordinator (rich ↔ source)
    │   ├── EditorPane.svelte      # TipTap — dumb, content in / onChange out
    │   ├── SourcePane.svelte      # CodeMirror — dumb, content in / onChange out
    │   └── StatusBar.svelte       # Word count, file info — reads document store
    ├── stores/
    │   └── document.ts            # Document state with named write operations
    └── utils.ts                   # Pure functions (formatWordCount, formatTitle, etc.)
```

---

## Component Hierarchy

```
+layout.svelte
└── +page.svelte              (owns: sidebarVisible, isDistractionFree, shortcut handler)
      └── AppShell            (owns: CSS grid)
            ├── [sidebar]   → Sidebar
            ├── [toolbar]   → Toolbar
            ├── [editor]    → EditorContainer  (owns: editorMode)
            │                     ├── EditorPane   (shown in rich mode)
            │                     └── SourcePane   (shown in source mode)
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

AppShell's `.zone-editor` is also the scroll container (`overflow-y: auto`). Inner editor
content should avoid creating a second vertical scrollbar.

### `+page.svelte`

Owns application-level UI state and the keyboard shortcut handler. Tauri is wired with thin
`invoke` helpers and dialog imports in the same file. **Window close** uses Tauri 2’s
`getCurrentWindow().onCloseRequested()`: if the document is clean, the handler returns
without `preventDefault()` and the runtime closes the window (via `destroy()` internally);
if dirty, the handler calls `preventDefault()`, runs the native **ask** dialog, and calls
`destroy()` only when the user confirms quit. There is **no** Rust `on_window_event` hook
that `prevent_close`s and re-emits a custom event — that pattern was removed to match the
supported JS API and ACL permissions (`core:window:allow-close`, `core:window:allow-destroy`).

```svelte
<script lang="ts">
	let sidebarVisible = $state(true);
	let isDistractionFree = $state(false);

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
				toggleSourceMode();
			}
		}
		if (e.metaKey && e.shiftKey) {
			if (e.key === 's') {
				e.preventDefault();
				saveAs();
			}
			if (e.key === 'f') {
				e.preventDefault();
				isDistractionFree = !isDistractionFree;
			}
			if (e.key === 'l') {
				e.preventDefault();
				sidebarVisible = !sidebarVisible;
			}
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />
```

Every app-level shortcut is visible in one function. No registration, no cleanup, no ghost
listeners. Editor-internal shortcuts (Cmd+B, Cmd+I, Cmd+`) stay inside `EditorPane` — they
are editor concerns, not app concerns.

### `EditorContainer.svelte`

Owns the rich ↔ source mode switch and content synchronisation between modes.

Reads `document` store for initial content on mount. Writes to `document` via named
operations on every change. Holds `editorMode` as local `$state()` — nothing outside
`EditorContainer` needs to know which mode is active.

Does **not** call `EditorPane` or `SourcePane` methods via a ref. It passes `content` as a
prop and receives `onChange` callbacks. **`handleChange` must not call `document.update`
when the markdown is unchanged** (same string as the store) so spurious editor callbacks do
not set `isDirty` after a file load or prop-driven sync.

```svelte
<script lang="ts">
	import { document } from '$lib/stores/document';

	let editorMode = $state<'rich' | 'source'>('rich');
	let content = $state(document.get().content);

	function handleChange(md: string) {
		content = md;
		if (md === document.get().content) return;
		document.update(md);
	}

	function toggleMode() {
		editorMode = editorMode === 'rich' ? 'source' : 'rich';
	}
</script>

{#if editorMode === 'rich'}
	<EditorPane {content} onChange={handleChange} />
{:else}
	<SourcePane {content} onChange={handleChange} />
{/if}
```

### `EditorPane.svelte`

Owns the TipTap instance. Handles editor-internal shortcuts (bold, italic, etc.).

Props: `content: string`, `onChange: (md: string) => void`, `theme: 'light' | 'dark'`.

When the `content` prop changes from outside (e.g. `document.load` after **Cmd+O**), the
`$effect` that calls `setContent` uses **`{ emitUpdate: false }`** so TipTap does not fire
`onUpdate` for that replacement — otherwise the store would immediately receive `update()`
and mark the file dirty even though the user did not edit.

Blockquotes and other rich nodes have **explicit `:global(.tiptap …)` styles** here (e.g.
`blockquote` with border and muted text) so they read as structured content, not plain
paragraphs.

Does not know about: source mode, file I/O, stores, Tauri.

### `SourcePane.svelte`

Owns the CodeMirror instance.

Props: `content: string`, `onChange: (md: string) => void`, `theme: 'light' | 'dark'`.

When the `$effect` replaces the full document to match a new `content` prop, it sets a
**suppress flag** so the `updateListener` does not call `onChange` for that programmatic
transaction — otherwise an external load would mark the document dirty.

Does not know about: rich mode, file I/O, stores, Tauri.

### `Sidebar.svelte`

Reads `document.get().content` to derive the heading list. Emits a `navigate` event with a
heading ID. `EditorContainer` listens and scrolls.

Does not hold any content state of its own.

### `StatusBar.svelte`

Reads `document` store: content (word count), filePath, isDirty. Renders only. Emits nothing.

### `+layout.svelte`

Owns the `<title>` tag and the theme. Both are driven by `$effect` — they are reactive
consequences of store state, never set with imperative `document.title = ...` calls scattered
through the codebase.

```svelte
<script lang="ts">
	import { document } from '$lib/stores/document';
	import { formatTitle } from '$lib/utils';

	$effect(() => {
		const { filePath, isDirty } = document.get();
		window.document.title = formatTitle(filePath, isDirty);
	});

	$effect(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const apply = () => {
			document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
		};
		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	});
</script>
```

---

## State Management

### `document` store — single writer rule

The `document` store exposes named operations, not a raw setter. Every mutation has a name
that describes its intent. When a bug causes `isDirty` to be wrong, there are four functions
to check — not every `store.update()` callsite in the codebase.

```typescript
// src/lib/stores/document.ts
interface DocumentState {
	content: string;
	filePath: string | null;
	isDirty: boolean;
	lastSaved: Date | null;
}

export const document = (() => {
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
		// Called on every keystroke
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
})();
```

Use `$inspect(document.get())` anywhere during development for a live console view of
document state without adding any permanent logging.

### UI state — co-located, not centralised

There is no `ui` store. Each piece of UI state lives as close to its owner as possible and
is only lifted when genuinely shared across distant components.

| State               | Owner                      | Shared via                              |
| ------------------- | -------------------------- | --------------------------------------- |
| `sidebarVisible`    | `+page.svelte`             | Prop to AppShell                        |
| `isDistractionFree` | `+page.svelte`             | Prop to AppShell                        |
| `editorMode`        | `EditorContainer`          | Internal `$state()`                     |
| `theme`             | `+layout.svelte` `$effect` | `data-theme` on `<html>` — CSS cascades |
| `fontSize`          | `+page.svelte` handler     | CSS variable on `<html>` — CSS cascades |

CSS-cascaded values (theme, font size) do not need a store at all. Components inherit them
automatically through custom properties.

---

## File I/O — thin and direct

There is no `FileService` interface. Tauri `invoke` calls live directly in `+page.svelte`
as plain async functions. The layer is thin enough to be obviously correct without testing.

```typescript
// In +page.svelte
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

async function openFile() {
	const selected = await open({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
	if (!selected || Array.isArray(selected)) return;
	const content = await invoke<string>('open_file', { path: selected });
	document.load(content, selected);
}

async function save() {
	const { content, filePath } = document.get();
	if (!filePath) return saveAs();
	await invoke('save_file', { path: filePath, content });
	document.markSaved();
}

async function saveAs() {
	const { content } = document.get();
	const path = await save({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
	if (!path) return;
	await invoke('save_file', { path, content });
	document.load(content, path);
	document.markSaved();
}
```

The Rust side of `open_file` and `save_file` is tested thoroughly with `cargo test` using
real temporary files. The JS side has two lines per operation — there is nothing to mock and
nothing to test separately.

---

## Testing Strategy

No mocks. Each layer is tested in its natural environment.

| Layer                 | Tool                          | What is tested                                                                                              |
| --------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Pure functions        | Vitest                        | `formatWordCount`, `formatTitle`, heading extraction, markdown round-trips                                  |
| Rust file I/O         | `cargo test` + real tempfiles | `read_markdown_file`, `write_markdown_file`, validation                                                     |
| UI behaviour          | Playwright + Vite dev server  | Rendering, editing, mode toggle, layout, shortcuts, multi-section fixture (`tests/sections-render.test.ts`) |
| Tauri `invoke` wiring | Not unit tested — kept thin   | Reviewed, tested via manual/integration run                                                                 |

Playwright tests run against the Vite dev server (no Tauri binary). This means `invoke` is
not available in those tests. The solution is not to mock it — it is to structure tests so
they test UI behaviour that does not depend on file I/O (rendering, editing, mode toggle,
word count, layout), and accept that the open/save flow is verified at the Rust level and
through infrequent integration runs.

---

## Theme System

Themes are CSS custom property sets keyed on a `data-theme` attribute, not class toggles.
This means every component inherits theme values automatically without subscribing to anything.

```css
/* app.css */
:root {
	--color-bg: #ffffff;
	--color-text: #1a1a1a;
	--color-border: #e0e0e0;
}
[data-theme='dark'] {
	--color-bg: #1e1e1e;
	--color-text: #d4d4d4;
	--color-border: #3a3a3a;
}
```

`+layout.svelte` sets `document.documentElement.dataset.theme` in a single `$effect`.
Nothing else ever sets the theme attribute.

`EditorPane` and `SourcePane` receive `theme` as a plain `'light' | 'dark'` prop so their
internal instances (TipTap, CodeMirror) can adapt their own themes without reading the DOM.

---

## Data Flow

```
── File open ──────────────────────────────────────────────────────────────
Cmd+O → handleKeydown → openFile()
  → Tauri dialog plugin → user picks file
  → invoke('open_file', { path })   [Rust reads file, tested with cargo test]
  → document.load(content, path)
  → EditorContainer reacts to document.get().content → passes content prop to EditorPane
  → EditorPane setContent(..., { emitUpdate: false }) / SourcePane suppressed dispatch
    so the initial sync does not call document.update — isDirty stays false
  → StatusBar reacts → word count updates
  → +layout.svelte $effect → <title> updates

── User types ─────────────────────────────────────────────────────────────
EditorPane onChange(md)
  → EditorContainer.handleChange(md)
  → document.update(md)   (skipped when md === store content)
  → StatusBar reacts → word count updates
  → Sidebar reacts → heading list re-derived
  → +layout.svelte $effect → <title> gains dirty indicator

── Save ───────────────────────────────────────────────────────────────────
Cmd+S → handleKeydown → save()
  → reads document.get().{ content, filePath }
  → invoke('save_file', { path, content })   [Rust writes file]
  → document.markSaved()
  → +layout.svelte $effect → dirty indicator removed from <title>

── Distraction-free ───────────────────────────────────────────────────────
Cmd+Shift+F → handleKeydown
  → isDistractionFree = !isDistractionFree   (local $state in +page.svelte)
  → prop flows to AppShell → CSS class toggles → sidebar + status bar hidden
```

---

## Adding a New Component

The pattern is always the same:

1. Create the component in `src/lib/components/`
2. Read from `document` store if it needs document state; receive props for everything else
3. Call named operations on `document` if it mutates state — never set raw fields
4. If it has editor-internal shortcuts, register them with `svelte:window` inside itself, not through any central registry
5. Drop it into the appropriate AppShell snippet slot in `+page.svelte`

No registration, no interface to implement, no DI container. The grid never changes.

---

## Tradeoffs

### Stores as the communication channel

**Gained:** Components don't know about each other. StatusBar updating on every keystroke
is a reactive consequence of `document.update()`, not a method call chain.

**Cost:** Reactivity is implicit. When the status bar shows the wrong count, the cause could
be any of the four named operations — or a bug in the derived word count logic. With direct
refs the call site is the bug site; with stores you trace subscribers. `$inspect()` mitigates
this but does not eliminate it.

**Cost:** Svelte store subscriptions are synchronous. `Sidebar` re-deriving headings on every
keystroke in a 10K-line document is expensive. Debouncing the `document.update()` call or
deriving headings lazily adds complexity not currently in the plan.

### Single writer rule

**Gained:** Four named operations to check when `isDirty` is wrong, not an unbounded number
of `update()` callsites.

**Cost:** Named operations are rigid. When a new feature needs a mutation that doesn't fit
an existing operation (e.g. updating `filePath` without touching `content`), the temptation
is to reach around the API with a raw state write. Discipline is required to keep the
operations clean.

### Co-located UI state (no `ui` store)

**Gained:** Each piece of state is where you'd expect to find it. Less reactive coupling
between unrelated concerns — a font size change doesn't trigger layout subscribers.

**Cost:** State that needs to be accessible from both a component and a shortcut handler
(e.g. `sidebarVisible`) must live in `+page.svelte` and be threaded as a prop. As the
feature list grows, `+page.svelte` accumulates state variables. This is manageable at the
current scale but could become a coordination point as the app grows.

### Single `svelte:window` shortcut handler

**Gained:** All app-level shortcuts visible in one function. No registration lifecycle, no
cleanup burden, no ghost listeners.

**Cost:** Shortcut conflicts are runtime errors, not compile-time errors. If a future
component registers an editor-internal shortcut that collides with an app-level one, the
conflict is only discovered at runtime. There is no static analysis that catches it.

### Thin `invoke` layer with no abstraction

**Gained:** No interface to maintain, no mock to keep in sync, no DI boilerplate. The wiring
is obviously correct.

**Cost:** The JS-to-Tauri boundary is not independently testable. If a Tauri plugin API
changes (e.g. the `open` dialog returns a different shape), the only signal is a runtime
failure. This is acceptable because the boundary is thin and Tauri plugin APIs are stable,
but it means the integration is not covered by the automated test suite.

### No mocking

**Gained:** Tests exercise real behaviour. A passing test suite means real things work.

**Cost:** Playwright tests against the Vite dev server cannot exercise file open/save flows,
because `invoke` is not available without the Tauri runtime. These flows are tested at the
Rust level and through manual runs. If the JS glue code around a file operation has a bug
(wrong argument name, wrong error handling), the automated suite will not catch it.

### `AppShell` named snippets

**Gained:** Layout is owned in one place. Any day's implementation can freely replace the
content of a zone without touching the grid.

**Cost:** Svelte 5 snippets-as-props are not typed at the boundary. TypeScript cannot enforce
that AppShell receives a snippet of the right shape. If a snippet is renamed or its expected
structure changes, the error is a runtime rendering failure, not a compile-time type error.
