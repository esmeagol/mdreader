# Markdown Editor — Development Plan

## Stack

| Concern | Choice | Why |
|---|---|---|
| Desktop shell | **Tauri 2** (Rust + WKWebView) | ~8MB binary vs Electron's ~200MB; uses macOS system WebView |
| UI framework | **Svelte 5** | ~20KB runtime, no virtual DOM overhead |
| Editor core | **TipTap 2** (ProseMirror) | Enables seamless mode natively |
| Testing | **Vitest** (unit) + **Playwright** (e2e) | |
| CI/CD | **GitHub Actions** | |

## On Seamless Mode

Build it in from day 1. Typora's seamless mode requires a rich document renderer —
headings look like headings, bold looks bold, raw markdown only appears when cursor
enters a block. This is what ProseMirror/TipTap does by default.

Starting with CodeMirror (raw text + preview panel) and adding seamless mode later
means replacing the entire editor core. TipTap from day 1 avoids that rewrite.

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

## Schedule

| Phase | Days | Focus |
|---|---|---|
| 0 — Foundation | 1–3 | Scaffold, CI (+Cargo cache), test infra, app shell |
| 1 — Core Editor | 4–6 | TipTap (+link interception), seamless rendering, source toggle (+undo note) |
| 2 — File System | 7–9 | Capabilities config, open, new file, save, quit dialog, recent files |
| 3 — Outline Sidebar | 10–11 | Heading extraction, navigation, active highlight |
| 4 — Polish | 12–14 | Shortcuts, macOS menu bar, theme, distraction-free, font size |
| 5 — Core gaps | 15–16 | Find & replace, image paste/drop + asset:// resolution |
| 6 — Hardening & Release | 17–19 | Coverage, packaging, memory audit (Rust-side) |

## CI/CD Pipeline

```
on: push / pull_request
├── lint (eslint + rustfmt)
├── test:unit (Vitest)
├── test:e2e (Playwright + headless Tauri)
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
