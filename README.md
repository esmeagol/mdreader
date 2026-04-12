# mdreader

A native macOS markdown editor built with Tauri 2, Svelte 5, and TipTap. Edits render in place as you type — no preview pane needed.

## Features

- **Rich editing** — headings, bold, italic, strikethrough, inline code, blockquotes, task lists, tables, and fenced code blocks with syntax highlighting
- **Source mode** — toggle to raw markdown with `Cmd+/`; edits sync back to rich mode
- **File I/O** — open `.md` files with `Cmd+O`, save with `Cmd+S`, save to a new path with `Cmd+Shift+S`
- **Auto-save** — opt-in via File › Auto Save (default off); saves every 30 seconds when enabled
- **Quit protection** — native dialog prompts when closing with unsaved changes
- **Dark mode** — follows system by default; cycle with `Cmd+Shift+T` (light → dark → system); preference persists across restarts
- **Distraction-free mode** — `Cmd+Shift+F` hides the sidebar and status bar
- **Find & Replace** — `Cmd+F` to find, `Cmd+H` to find and replace
- **Font size** — `Cmd+=` / `Cmd+-` to scale editor text
- **Word count** — live count in the status bar
- **External links** — clicked links open in the default browser, not the app window

## Keyboard Shortcuts

| Shortcut          | Action                        |
| ----------------- | ----------------------------- |
| `Cmd+O`           | Open file                     |
| `Cmd+S`           | Save                          |
| `Cmd+Shift+S`     | Save as                       |
| `Cmd+N`           | New file                      |
| `Cmd+/`           | Toggle source mode            |
| `Cmd+Shift+F`     | Toggle distraction-free mode  |
| `Cmd+Shift+L`     | Toggle sidebar                |
| `Cmd+Shift+T`     | Cycle theme (light/dark/system) |
| `Cmd+=` / `Cmd+-` | Increase / decrease font size |
| `Cmd+F`           | Find                          |
| `Cmd+H`           | Find and replace              |

## Tech Stack

- [Tauri 2](https://tauri.app) — native shell, file I/O in Rust
- [Svelte 5](https://svelte.dev) — UI with runes reactivity
- [TipTap 2](https://tiptap.dev) — rich text editor (ProseMirror)
- [CodeMirror 6](https://codemirror.net) — source mode editor
- [tiptap-markdown](https://github.com/aguingand/tiptap-markdown) — markdown round-trip serialization

## Development

```sh
npm install
npm run dev        # Vite dev server (browser, no Tauri)
npm run tauri dev  # full Tauri app
```

## Testing

```sh
npm run test:unit          # Vitest unit tests
npx playwright test        # e2e tests against Vite dev server
cd src-tauri && cargo test # Rust unit tests
```

## Building

```sh
npm run tauri build
```
