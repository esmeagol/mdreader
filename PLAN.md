# Markdown Editor — Development Plan

## Stack

| Concern       | Choice                                   | Why                                                         |
| ------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Desktop shell | **Tauri 2** (Rust + WKWebView)           | ~8MB binary vs Electron's ~200MB; uses macOS system WebView |
| UI framework  | **Svelte 5**                             | ~20KB runtime, runes for explicit reactivity                |
| Editor core   | **TipTap 2** (ProseMirror)               | Enables seamless mode natively                              |
| Source mode   | **CodeMirror 6**                         | Raw markdown editing with syntax highlighting               |
| Testing       | **Vitest** (unit) + **Playwright** (e2e) |                                                             |
| CI/CD         | **GitHub Actions**                       |                                                             |

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design, component ownership rules,
state management model, and tradeoffs.

**Summary of key decisions:**

- `AppShell.svelte` owns the CSS grid. All other components are dropped into named snippet
  slots. Adding a new zone never touches any other file.
- Reader presentation uses a responsive centered column (`max-width` token in `app.css`)
  so content expands/shrinks with window size while preserving readable line length.
- Vertical scrolling belongs to AppShell's editor zone, keeping the scrollbar on the far
  right edge of the pane rather than inside an inner centered column.
- A single `document` store with named operations (`load`, `update`, `markSaved`, `reset`)
  is the only shared state. UI state (`sidebarVisible`, `isDistractionFree`, `editorMode`)
  lives in `+page.svelte` as `$state()` and flows down as props.
- A single `svelte:window on:keydown` handler in `+page.svelte` owns all app-level shortcuts.
  No registry, no cleanup burden.
- Tauri `invoke` calls are two-line functions directly in `+page.svelte`. No abstraction
  layer, no mocking. The Rust side is tested with `cargo test` using real temp files.
- No mocking anywhere. Pure functions tested with Vitest. Rust I/O tested with `cargo test`.
  UI behavior tested with Playwright against the Vite dev server.

## On Seamless Mode

Build it in from day one. Typora's seamless mode requires a rich document renderer —
headings look like headings, bold looks bold, raw markdown only appears when cursor
enters a block. This is what ProseMirror/TipTap does by default.

Starting with CodeMirror (raw text + preview panel) and adding seamless mode later
means replacing the entire editor core. TipTap from day one avoids that rewrite.

## Feature Hierarchy

```
Markdown Editor
├── File I/O
│   ├── Open file (Cmd+O)
│   ├── Save / Save As (Cmd+S / Cmd+Shift+S)
│   ├── Auto-save (30s interval)
│   └── Recent files (persistent)
├── Editor
│   ├── Seamless rich editing
│   │   ├── Headings, bold, italic render in place
│   │   ├── Fenced code blocks + syntax highlighting
│   │   ├── Tables, task lists, strikethrough (GFM)
│   │   └── Raw markdown visible only on cursor enter
│   ├── Source mode toggle (Cmd+/)
│   ├── Keyboard shortcuts (Cmd+B/I/K/`)
│   └── Word / character count (status bar)
├── Outline Sidebar
│   ├── Extract headings from live document
│   ├── Hierarchical H1 → H2 → H3 display
│   ├── Click to scroll to section
│   └── Highlight active section on scroll
└── UI/UX
    ├── Light / dark theme (follows macOS system)
    ├── Distraction-free mode (Cmd+Shift+F)
    └── Font size control
```

## Component Structure

```
+layout.svelte                 (title $effect, theme $effect)
└── +page.svelte               (state owner, shortcut handler)
      └── AppShell             (CSS grid owner)
            ├── [sidebar]    → Sidebar        (reads document store)
            ├── [toolbar]    → Toolbar        (empty slot initially)
            ├── [editor]     → EditorContainer (owns editorMode)
            │                      ├── EditorPane   (TipTap, dumb)
            │                      └── SourcePane   (CodeMirror, dumb)
            └── [statusbar]  → StatusBar      (reads document store)
```

## Schedule

| Phase                   | Days  | Focus                                                                        |
| ----------------------- | ----- | ---------------------------------------------------------------------------- |
| 0 — Foundation          | 1–2   | Scaffold, CI (+Cargo cache), test infra                                      |
| 1 — App Shell           | 3     | document store, AppShell slots, layout, status bar, shortcut handler         |
| 2 — Core Editor         | 4–6   | EditorContainer + EditorPane (TipTap), extended nodes, source mode toggle    |
| 3 — File System         | 7–9   | Capabilities config, open, new, save, quit dialog, recent files              |
| 4 — Outline Sidebar     | 10–11 | Heading extraction, navigation, active highlight                             |
| 5 — Polish              | 12–14 | macOS menu bar, theme, distraction-free, font size                           |
| 6 — Core gaps           | 15–16 | Find & replace, image paste + asset:// resolution                            |
| 7 — Hardening & Release | 17–19 | Coverage, packaging, memory audit (Rust-side)                                |

## CI/CD Pipeline

```
on: push / pull_request
├── lint (eslint + rustfmt)
├── test:unit (Vitest)
├── test:unit:rust (cargo test)
├── test:e2e (Playwright + Vite dev server)
└── build (tauri build --debug)

on: tag v*
└── release
    ├── tauri build --release
    └── upload .dmg to GitHub Release
```

**Rule:** Every day ends with green CI. No day ships untested functionality.

## Performance Targets

- Binary size: < 20MB
- RAM at idle: < 80MB
- RAM with 10K-line file: < 150MB

## Detailed Execution

See [EXECUTION.md](EXECUTION.md) for day-by-day TDD instructions.
