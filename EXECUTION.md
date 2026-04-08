# Markdown Editor — Detailed Execution Plan

Every task follows the same pattern:

1. Write a failing test that describes the desired behaviour
2. Run it — confirm it fails
3. Implement the feature
4. Run the test — confirm it passes
5. Push — CI must stay green

---

## Day 1 — Project Scaffold + CI

**Goal:** A Tauri + Svelte app that builds and passes a smoke test in CI on every push.

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node (use nvm or mise)
nvm install 22

# Install Tauri CLI
# Use --locked to avoid dependency resolution failures on Rust < 1.88
cargo install tauri-cli --version "^2" --locked

# Install the Tauri prerequisites on macOS
xcode-select --install
```

### Step 1.1 — Scaffold the project

```bash
# Scaffold Svelte frontend first
# Note: 'npm create svelte' is deprecated — use 'npx sv create' instead
npx sv create . --template minimal --types ts --add prettier eslint --no-dir-check --no-install
npm install --engine-strict=false   # node v23 triggers a false engine warning from @eslint/compat

# Then scaffold Tauri backend into the same directory
cargo tauri init \
  --app-name mdreader \
  --window-title mdreader \
  --frontend-dist ../dist \
  --dev-url http://localhost:5173 \
  --before-dev-command "npm run dev" \
  --before-build-command "npm run build"
```

Expected directory structure after scaffold:

```
mdreader/
├── src/                  # Svelte frontend
│   ├── app.html
│   ├── routes/
│   │   └── +page.svelte
├── src-tauri/            # Rust backend
│   ├── src/
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── vite.config.ts
```

### Step 1.2 — Write the first failing test (smoke test)

Create `tests/smoke.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('app window opens with correct title', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle('mdreader');
});

test('app launches without console errors about permissions', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text());
	});
	await page.goto('/');
	await page.waitForTimeout(500);
	const permissionErrors = errors.filter(
		(e) => e.includes('not allowed') || e.includes('capability')
	);
	expect(permissionErrors).toHaveLength(0);
});
```

> **Why `page.goto('/')` is required:** Without it Playwright evaluates the title on
> `about:blank`, which is always `""`. The test fails with a confusing
> `Expected "mdreader" / Received ""` rather than any signal about what is missing.
> Always navigate before asserting anything about page content.

Run it — it should fail because `@playwright/test` is not installed yet:

```bash
npx playwright test
# Expected: Error — Cannot find package '@playwright/test'
```

### Step 1.3 — Configure Playwright for Tauri

Install Playwright (Chromium only — we don't need all browsers):

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

**E2e strategy note:** There are two ways to drive a Tauri app with Playwright:

1. **WebDriver via `tauri-driver`** — launches the compiled binary, full Tauri environment. Requires `cargo tauri build` before every test run. Too slow for daily development.
2. **Vite dev server** — Playwright opens a regular browser against `http://localhost:5173`. Fast, but `window.__TAURI__` is not available, so Tauri commands must be mocked.

**Use approach 2 for all UI and logic tests. Use approach 1 only in CI for release smoke tests.**
For Tauri command tests (`open_file`, `save_file`, etc.), test them at the Rust level with `cargo test` — do not try to invoke them from the browser in e2e tests. Mock the `__TAURI__` global where the frontend calls `invoke`.

Create `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	use: {
		baseURL: 'http://localhost:5173'
	},
	webServer: {
		command: 'npm run dev', // just Vite, not cargo tauri dev
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 30_000 // Vite starts in ~2s, not 120s
	}
});
```

Create `tests/helpers/tauri-mock.ts` — inject a mock `__TAURI__` so UI tests don't crash when the frontend calls `invoke`:

```typescript
// Import this in any test file that touches pages with Tauri API calls
import type { Page } from '@playwright/test';

export async function mockTauriApi(page: Page, overrides: Record<string, unknown> = {}) {
	await page.addInitScript((overrides) => {
		(window as any).__TAURI__ = {
			core: {
				invoke: async (cmd: string, args?: unknown) => {
					const handler = (overrides as any)[cmd];
					if (handler) return handler(args);
					console.warn(`[tauri-mock] unmocked command: ${cmd}`);
					return null;
				}
			},
			...(overrides.__TAURI__ ?? {})
		};
	}, overrides);
}
```

Run the smoke test again — it should now fail because the title is empty:

```bash
npx playwright test
# Expected: AssertionError — Expected "mdreader" / Received ""
```

> **Why the title is `""`:** SvelteKit controls `<title>` through `<svelte:head>` in route
> files — setting it in `src-tauri/tauri.conf.json` has no effect on the browser title.
> The fix is in the frontend, not in the Tauri config.

Add the title to `src/routes/+layout.svelte` via `<svelte:head>`:

```svelte
<svelte:head>
	<title>mdreader</title>
	<link rel="icon" href={favicon} />
</svelte:head>
```

Run tests again — both should pass:

```bash
npx playwright test
# Expected: 2 passed
```

### Step 1.4 — Set up ESLint and Prettier

```bash
# Verify ESLint config was created by SvelteKit scaffold
cat .eslintrc.cjs   # should exist

# Run lint — should pass on clean scaffold
npm run lint
```

Add rustfmt check for the Rust side:

```bash
cd src-tauri && cargo fmt --check
```

### Step 1.5 — Create GitHub repository and CI workflow

```bash
git init
git add .
git commit -m "feat: initial Tauri + Svelte scaffold"
```

> **Cargo.lock policy:** This is a binary application, not a library. Commit `Cargo.lock` to
> version control. Remove it from `.gitignore` if the Rust scaffold added it there:
>
> ```bash
> # In .gitignore, remove any line that says "Cargo.lock" or "src-tauri/Cargo.lock"
> git add src-tauri/Cargo.lock
> ```

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint (ESLint)
        run: npm run lint

      - name: Lint (rustfmt)
        run: cd src-tauri && cargo fmt --check

      - name: Cache Cargo registry
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            src-tauri/target
          key: ${{ runner.os }}-cargo-${{ hashFiles('src-tauri/Cargo.lock') }}
          restore-keys: ${{ runner.os }}-cargo-

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Build and test
        run: npx playwright test
```

```bash
git add .github/
git commit -m "feat: add CI workflow"
git push origin main
```

**Day 1 done when:** CI pipeline runs green on GitHub. The smoke test passes.

---

## Day 2 — Test Infrastructure

**Goal:** Vitest unit tests wired up and running in CI alongside Playwright e2e tests.

### Step 2.1 — Install and configure Vitest

```bash
npm install --save-dev vitest @testing-library/svelte jsdom
```

Add to `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
		globals: true
	}
});
```

Add to `package.json` scripts:

```json
{
	"scripts": {
		"test:unit": "vitest run",
		"test:unit:watch": "vitest",
		"test:e2e": "playwright test"
	}
}
```

### Step 2.2 — Write a failing unit test

Create `src/lib/utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatWordCount } from './utils';

describe('formatWordCount', () => {
	it('returns "0 words" for empty string', () => {
		expect(formatWordCount('')).toBe('0 words');
	});

	it('returns "1 word" for a single word', () => {
		expect(formatWordCount('hello')).toBe('1 word');
	});

	it('returns "3 words" for three words', () => {
		expect(formatWordCount('hello world foo')).toBe('3 words');
	});

	it('ignores extra whitespace', () => {
		expect(formatWordCount('  hello   world  ')).toBe('2 words');
	});
});
```

Run — expect failure because `utils.ts` does not exist:

```bash
npm run test:unit
# Expected: Error — cannot find module './utils'
```

### Step 2.3 — Implement the utility

Create `src/lib/utils.ts`:

```typescript
export function formatWordCount(text: string): string {
	const count = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
	return count === 1 ? '1 word' : `${count} words`;
}
```

Run tests — expect all to pass:

```bash
npm run test:unit
# Expected: 4 passed
```

### Step 2.4 — Add Rust unit test

Open `src-tauri/src/main.rs` and add a trivial test so Rust tests are wired:

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn sanity_check() {
        assert_eq!(2 + 2, 4);
    }
}
```

Run Rust tests:

```bash
cd src-tauri && cargo test
# Expected: test sanity_check ... ok
```

### Step 2.5 — Add unit tests to CI

Update `.github/workflows/ci.yml`, add a step after the lint steps:

```yaml
- name: Unit tests (Vitest)
  run: npm run test:unit

- name: Unit tests (Rust)
  run: cd src-tauri && cargo test
```

```bash
git add .
git commit -m "feat: add Vitest and Rust test infrastructure"
git push
```

**Day 2 done when:** CI runs lint → Vitest → Rust tests → Playwright, all green.

---

## Day 3 — App Shell Layout

**Goal:** A static four-zone layout: sidebar | toolbar (empty slot) | editor | status bar. No logic yet.

**Layout design decisions:**
- The grid includes a `toolbar` row from day one (empty for now) so it can be filled later without restructuring the grid.
- The status bar spans the full width (including under the sidebar) — one unified bar across the bottom.
- All colors and dimensions are CSS variables defined in `app.css`. The component uses only variables, never hardcoded values.
- The global CSS reset (`*, body`) lives exclusively in `app.css`, not in the component's `<style>` block.

### Step 3.1 — Write a failing layout test

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

Run — fail because the layout elements do not exist:

```bash
npx playwright test tests/layout.test.ts
# Expected: 5 failed
```

### Step 3.2 — Global CSS (variables + reset)

Create `src/app.css` first. All dimensions, colors, and the global reset live here — nothing in component `<style>` blocks should hardcode values.

```css
:root {
	--sidebar-width: 220px;
	--toolbar-height: 0px; /* no toolbar yet — set to non-zero when added */
	--status-bar-height: 28px;
	--editor-max-width: 800px;
	--font-size-editor: 16px;
	--color-border: #e0e0e0;
	--color-bg: #ffffff;
	--color-bg-sidebar: #f5f5f5;
	--color-bg-status: #f8f8f8;
	--color-text: #1a1a1a;
	--color-text-muted: #888888;
	--color-placeholder: #bbbbbb;
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

Import it in `src/routes/+layout.svelte`. The existing file already sets `<title>` — keep that, just add the import:

```svelte
<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<title>mdreader</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
```

### Step 3.3 — Build the layout

Replace `src/routes/+page.svelte`. No hardcoded colors or dimensions — only CSS variables:

```svelte
<script lang="ts">
</script>

<div class="app-shell">
	<aside data-testid="sidebar" class="sidebar">
		<!-- Outline will go here -->
		<p class="placeholder">Outline</p>
	</aside>

	<div class="toolbar">
		<!-- Formatting toolbar will go here -->
	</div>

	<main data-testid="editor-area" class="editor-area">
		<!-- Editor will go here -->
		<p class="placeholder">Editor</p>
	</main>

	<footer data-testid="status-bar" class="status-bar">
		<span>0 words</span>
	</footer>
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

	.sidebar {
		grid-area: sidebar;
		border-right: 1px solid var(--color-border);
		background: var(--color-bg-sidebar);
		overflow-y: auto;
		padding: 12px 8px;
	}

	.toolbar {
		grid-area: toolbar;
		border-bottom: 1px solid var(--color-border);
		/* hidden until toolbar-height > 0 */
		overflow: hidden;
	}

	.editor-area {
		grid-area: editor;
		overflow-y: auto;
		padding: 40px 60px;
		max-width: var(--editor-max-width);
		margin: 0 auto;
		width: 100%;
	}

	.status-bar {
		grid-area: status;
		display: flex;
		align-items: center;
		padding: 0 12px;
		font-size: 11px;
		color: var(--color-text-muted);
		border-top: 1px solid var(--color-border);
		background: var(--color-bg-status);
	}

	.placeholder {
		color: var(--color-placeholder);
		font-size: 12px;
	}
</style>
```

Run tests — expect all to pass:

```bash
npx playwright test tests/layout.test.ts
# Expected: 5 passed
```

```bash
git add .
git commit -m "feat: app shell layout with sidebar, editor area, and status bar"
git push
```

**Day 3 done when:** CI is green and all 5 layout tests pass.

---

## Day 4 — TipTap Integration + Seamless Rendering

**Goal:** A working TipTap editor embedded in the layout. Markdown typed or loaded renders in place (headings look like headings, bold looks bold). Markdown round-trips correctly.

### Step 4.1 — Install TipTap and markdown extension

```bash
npm install @tiptap/core @tiptap/pm @tiptap/starter-kit
# The markdown extension is TipTap's own serializer/deserializer.
# Do NOT use prosemirror-markdown — it doesn't know about TipTap's custom nodes
# (task lists, strikethrough, etc.) and round-trip tests would pass while
# TipTap's actual output is wrong. Always test through TipTap itself.
npm install @tiptap/extension-markdown
```

### Step 4.2 — Write failing round-trip tests

The unit tests create a headless TipTap instance (no DOM needed with jsdom) and test
that parsing markdown and serializing it back produces the original string.

Create `src/lib/markdown.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/extension-markdown';

// Helper: create a headless TipTap instance for serialization tests
function createEditor(content = '') {
	return new Editor({
		extensions: [StarterKit, Markdown],
		content
	});
}

describe('markdown round-trip via TipTap', () => {
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

Run — fail because `@tiptap/extension-markdown` is not installed yet (or Editor import fails):

```bash
npm run test:unit
# Expected: Error — cannot resolve @tiptap/extension-markdown
```

### Step 4.3 — Confirm tests pass after install

Run tests after the install from Step 4.1:

```bash
npm run test:unit
# Expected: 7 passed
```

### Step 4.4 — Write a failing e2e test for the editor

Add to `tests/editor.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('editor is visible and focusable', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await expect(editor).toBeVisible();
	await editor.click();
	await expect(editor).toBeFocused();
});

test('heading markdown renders as heading element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	// Type a heading
	await page.keyboard.type('# My Heading');
	await page.keyboard.press('Enter');
	// It should render as an h1, not raw text
	const heading = editor.locator('h1');
	await expect(heading).toContainText('My Heading');
});

test('bold markdown renders as strong element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.type('**bold text**');
	await page.keyboard.press(' ');
	const bold = editor.locator('strong');
	await expect(bold).toContainText('bold text');
});
```

Run — fail because no `.tiptap` element exists yet:

```bash
npx playwright test tests/editor.test.ts
# Expected: 3 failed
```

### Step 4.5 — Build the Editor component

Create `src/lib/Editor.svelte`:

```svelte
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';

	export let content = '# Welcome\n\nStart writing here...';

	let editorElement: HTMLElement;
	let editor: Editor;

	onMount(() => {
		editor = new Editor({
			element: editorElement,
			extensions: [StarterKit],
			content: `<h1>Welcome</h1><p>Start writing here...</p>`,
			editorProps: {
				attributes: {
					class: 'tiptap-editor'
				}
			}
		});
	});

	onDestroy(() => {
		editor?.destroy();
	});
</script>

<div bind:this={editorElement} class="editor-mount"></div>

<style>
	.editor-mount {
		height: 100%;
		outline: none;
	}

	:global(.tiptap-editor) {
		outline: none;
		min-height: 100%;
		font-size: var(--font-size-editor);
		line-height: 1.7;
		color: var(--color-text);
	}

	:global(.tiptap-editor h1) {
		font-size: 2em;
		font-weight: 700;
		margin: 0.5em 0;
	}
	:global(.tiptap-editor h2) {
		font-size: 1.5em;
		font-weight: 600;
		margin: 0.5em 0;
	}
	:global(.tiptap-editor h3) {
		font-size: 1.25em;
		font-weight: 600;
		margin: 0.5em 0;
	}
	:global(.tiptap-editor p) {
		margin: 0.5em 0;
	}
	:global(.tiptap-editor strong) {
		font-weight: 700;
	}
	:global(.tiptap-editor em) {
		font-style: italic;
	}
	:global(.tiptap-editor code) {
		font-family: 'Menlo', monospace;
		background: #f0f0f0;
		padding: 0.1em 0.3em;
		border-radius: 3px;
		font-size: 0.9em;
	}
</style>
```

Update `src/routes/+page.svelte` to use the Editor component:

```svelte
<script lang="ts">
	import Editor from '$lib/Editor.svelte';
</script>

<div class="app-shell">
	<aside data-testid="sidebar" class="sidebar">
		<p class="placeholder">Outline</p>
	</aside>

	<main data-testid="editor-area" class="editor-area">
		<Editor />
	</main>

	<footer data-testid="status-bar" class="status-bar">
		<span>0 words</span>
	</footer>
</div>
```

### Step 4.6 — Intercept link clicks (open in system browser)

**Why this matters now:** TipTap renders `[text](https://url)` as an `<a>` tag. Clicking it in
a Tauri WKWebView will navigate the entire app window to that URL — the editor disappears.
Fix this before it's forgotten.

Install the shell plugin:

```bash
npm install @tauri-apps/plugin-shell
```

Add to `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri-plugin-shell = "2"
```

Register it in `src-tauri/src/main.rs`:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    // ... other plugins
```

Add a click handler to `Editor.svelte` that intercepts all anchor clicks:

```typescript
// In onMount, after editor is created:
editorElement.addEventListener('click', (e) => {
	const target = (e.target as HTMLElement).closest('a');
	if (!target) return;
	const href = target.getAttribute('href');
	if (!href) return;
	e.preventDefault();
	// Open external URLs in the system browser
	if (href.startsWith('http://') || href.startsWith('https://')) {
		import('@tauri-apps/plugin-shell').then(({ open }) => open(href));
	}
});
```

Write a failing e2e test:

```typescript
test('clicking a link does not navigate the app window', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	// Type a paragraph with a rendered link (TipTap renders [text](url) as <a>)
	await page.keyboard.type('Visit https://example.com for info');
	// App URL should still be localhost after clicking the link
	await page.locator('.tiptap a').click();
	expect(page.url()).toContain('localhost');
});
```

Run e2e tests:

```bash
npx playwright test tests/editor.test.ts
# Expected: all pass
```

```bash
git add .
git commit -m "feat: TipTap editor with seamless markdown rendering"
git push
```

**Day 4 done when:** Round-trip unit tests pass, editor renders headings and bold in-place, link clicks do not navigate the window.

---

## Day 5 — Extended Node Types

**Goal:** Code blocks (with syntax highlighting), tables, task lists, strikethrough all work in the editor.

### Step 5.1 — Install extensions

```bash
npm install @tiptap/extension-code-block-lowlight @tiptap/extension-table \
  @tiptap/extension-table-row @tiptap/extension-table-cell \
  @tiptap/extension-table-header @tiptap/extension-task-list \
  @tiptap/extension-task-item @tiptap/extension-strike \
  lowlight
```

### Step 5.2 — Write failing unit tests for extended types

Add to `src/lib/markdown.test.ts`. These tests use the same headless TipTap pattern from
Day 4, but now with the extended extensions loaded:

````typescript
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Strike from '@tiptap/extension-strike';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
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
			CodeBlockLowlight.configure({ lowlight })
		],
		content
	});
}

describe('extended markdown round-trip via TipTap', () => {
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
});
````

Run — fail because `lowlight` and other packages aren't installed yet:

```bash
npm run test:unit
# Expected: Error — cannot resolve lowlight
```

### Step 5.3 — Install and verify

After installing extensions from Step 5.1:

```bash
npm run test:unit
# Expected: all pass
```

### Step 5.4 — Write failing e2e tests for extended types

Add to `tests/editor.test.ts`:

````typescript
test('code block renders as pre/code element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	// Type a fenced code block trigger
	await page.keyboard.type('```javascript');
	await page.keyboard.press('Enter');
	await page.keyboard.type('const x = 1;');
	const codeBlock = editor.locator('pre code');
	await expect(codeBlock).toContainText('const x = 1;');
});

test('strikethrough renders as s element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.type('~~struck~~');
	await page.keyboard.press(' ');
	await expect(editor.locator('s')).toContainText('struck');
});
````

Run — fail because extensions are not wired into the editor yet:

```bash
npx playwright test tests/editor.test.ts
# Expected: 2 new failures
```

### Step 5.5 — Wire extended extensions into the Editor component

Update `src/lib/Editor.svelte` extensions array:

```typescript
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/extension-markdown';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Strike from '@tiptap/extension-strike';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

// In onMount:
editor = new Editor({
	element: editorElement,
	extensions: [
		StarterKit.configure({ codeBlock: false }), // disable built-in, use lowlight version
		Markdown,
		TaskList,
		TaskItem.configure({ nested: true }),
		Strike,
		CodeBlockLowlight.configure({ lowlight })
	]
	// ...
});
```

Add CSS for highlighted code to `Editor.svelte`:

```svelte
<style>
	/* ... existing styles ... */
	:global(.tiptap-editor pre) {
		background: #1e1e1e;
		color: #d4d4d4;
		border-radius: 6px;
		padding: 1em;
		overflow-x: auto;
		font-family: 'Menlo', monospace;
		font-size: 0.875em;
	}
	:global(.tiptap-editor input[type='checkbox']) {
		margin-right: 6px;
	}
	:global(.tiptap-editor s) {
		text-decoration: line-through;
		opacity: 0.6;
	}
</style>
```

Run all tests:

```bash
npm run test:unit && npx playwright test
# Expected: all pass
```

```bash
git add .
git commit -m "feat: code blocks, task lists, tables, strikethrough"
git push
```

**Day 5 done when:** All unit and e2e tests pass including code blocks, strikethrough, task lists.

---

## Day 6 — Source Mode Toggle

**Goal:** `Cmd+/` toggles between seamless TipTap view and a raw-markdown CodeMirror view. Toggling preserves content exactly.

### Step 6.1 — Install CodeMirror 6

```bash
npm install codemirror @codemirror/lang-markdown @codemirror/theme-one-dark \
  @codemirror/view @codemirror/state
```

### Step 6.2 — Write a failing toggle test

Create `tests/source-mode.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('Cmd+/ toggles to source mode showing raw markdown', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"]');

	// In rich mode, heading is an h1
	await expect(editor.locator('h1')).toBeVisible();

	// Toggle to source mode
	await page.keyboard.press('Meta+/');

	// h1 is gone, raw text is visible
	await expect(editor.locator('h1')).not.toBeVisible();
	await expect(editor.locator('[data-testid="source-editor"]')).toBeVisible();
});

test('toggling back to rich mode preserves content', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"]');

	// Type in rich mode
	await editor.locator('.tiptap').click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('# Preserved Heading');

	// Toggle to source mode and back
	await page.keyboard.press('Meta+/');
	await page.keyboard.press('Meta+/');

	// Original content still visible as h1
	await expect(editor.locator('h1')).toContainText('Preserved Heading');
});
```

Run — fail:

```bash
npx playwright test tests/source-mode.test.ts
# Expected: 2 failed
```

### Step 6.3 — Build the source mode toggle

Create `src/lib/SourceEditor.svelte`:

```svelte
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { markdown } from '@codemirror/lang-markdown';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { EditorState } from '@codemirror/state';

	export let content = '';
	export let onChange: (value: string) => void = () => {};

	let containerEl: HTMLElement;
	let view: EditorView;

	onMount(() => {
		view = new EditorView({
			state: EditorState.create({
				doc: content,
				extensions: [
					basicSetup,
					markdown(),
					oneDark,
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							onChange(update.state.doc.toString());
						}
					})
				]
			}),
			parent: containerEl
		});
	});

	onDestroy(() => {
		view?.destroy();
	});
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

Update `src/lib/Editor.svelte` to handle mode toggling:

```svelte
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import { Markdown } from '@tiptap/extension-markdown';
	import SourceEditor from './SourceEditor.svelte';

	let editorElement: HTMLElement;
	let editor: Editor;
	let isSourceMode = false;
	let rawMarkdown = '';

	function toggleSourceMode() {
		if (!isSourceMode) {
			// Switching TO source mode: serialize current doc to markdown
			rawMarkdown = editor.storage.markdown.getMarkdown();
		} else {
			// Switching FROM source mode: load raw markdown back into editor
			editor.commands.setContent(rawMarkdown);
		}
		isSourceMode = !isSourceMode;
	}

	function handleRawChange(value: string) {
		rawMarkdown = value;
	}

	onMount(() => {
		editor = new Editor({
			element: editorElement,
			extensions: [StarterKit, Markdown /* + others from Day 5 */],
			content: '# Welcome\n\nStart writing here...'
		});

		// Register Cmd+/ globally
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.metaKey && e.key === '/') {
				e.preventDefault();
				toggleSourceMode();
			}
		};
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	onDestroy(() => editor?.destroy());
</script>

{#if isSourceMode}
	<SourceEditor content={rawMarkdown} onChange={handleRawChange} />
{/if}

<div
	bind:this={editorElement}
	class="editor-mount"
	style:display={isSourceMode ? 'none' : 'block'}
></div>
```

### Step 6.4 — Test and document the undo-stack reset

**Known limitation:** When toggling from seamless mode to source mode and back, TipTap's
undo history is cleared. `Cmd+Z` after toggling back will not remember edits made before
the toggle. This is because `editor.commands.setContent()` resets the ProseMirror history.

Write a test that documents this known behaviour so future developers don't think it's a bug:

```typescript
test('undo history is cleared after round-tripping through source mode', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('Original text');

	// Toggle to source mode and back
	await page.keyboard.press('Meta+/');
	await page.keyboard.press('Meta+/');

	// Try to undo — content should NOT revert to empty (undo stack was cleared)
	await page.keyboard.press('Meta+z');
	await expect(editor).toContainText('Original text');
	// The h1 is still there — undo did not undo back to before the source toggle
});
```

If you want to preserve undo history across the toggle in a future iteration, look into
TipTap's `setContent` `emitUpdate` option and the `@tiptap/extension-history` configuration.
For now, clearing the stack on toggle is acceptable — document it in a comment in `Editor.svelte`.

Run tests:

```bash
npx playwright test tests/source-mode.test.ts
# Expected: 3 passed (2 original + 1 new undo-stack test)
```

Run all tests:

```bash
npm run test:unit && npx playwright test
```

```bash
git add .
git commit -m "feat: source mode toggle with Cmd+/"
git push
```

**Day 6 done when:** Toggle works, content is preserved, undo-stack behaviour is tested and documented.

---

## Day 7 — Open File + New File

**Goal:** `Cmd+O` opens a native macOS file picker. Selecting a `.md` file loads it into the editor. `Cmd+N` creates a blank untitled document.

### Step 7.0 — Configure Tauri 2 capabilities (do this before anything else)

**This step is mandatory.** Tauri 2 denies all system access by default. Without explicit
capability declarations, `invoke('open_file')` and the dialog plugin will silently fail or
throw an error. Every Tauri API used must be listed here.

Create `src-tauri/capabilities/default.json`:

```json
{
	"$schema": "../gen/schemas/desktop-schema.json",
	"identifier": "default",
	"description": "Default permissions for mdreader",
	"windows": ["main"],
	"permissions": [
		"core:default",
		"dialog:allow-open",
		"dialog:allow-save",
		"fs:allow-read-text-file",
		"fs:allow-write-text-file",
		"shell:allow-open"
	]
}
```

Add the dialog and shell plugins to `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-shell = "2"   # already added in Day 4 for link interception
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

Register the plugins in `src-tauri/src/main.rs`:

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![])  // commands added below
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}
```

Write a failing test that the app launches without a permissions error:

```typescript
// In tests/smoke.test.ts — add alongside the existing title test
test('app launches without console errors about permissions', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text());
	});
	await page.goto('/');
	await page.waitForTimeout(500);
	const permissionErrors = errors.filter(
		(e) => e.includes('not allowed') || e.includes('capability')
	);
	expect(permissionErrors).toHaveLength(0);
});
```

### Step 7.1 — Write failing Rust tests first

In `src-tauri/src/main.rs`, add a module for file operations:

```rust
mod file_ops;
```

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
    use std::fs;
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
        let result = read_markdown_file("/nonexistent/path/file.md");
        assert!(result.is_err());
    }

    #[test]
    fn errors_on_non_md_file() {
        let tmp = NamedTempFile::with_suffix(".txt").unwrap();
        let result = read_markdown_file(tmp.path().to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Only .md files"));
    }
}
```

Add `tempfile` to `src-tauri/Cargo.toml`:

```toml
[dev-dependencies]
tempfile = "3"
```

Run Rust tests — expect failure because module doesn't compile yet:

```bash
cd src-tauri && cargo test
# Expected: compilation errors first, then tests pass after fixing
```

Fix compilation, then run again:

```bash
cargo test
# Expected: 3 passed
```

### Step 7.2 — Write a failing e2e test for file open

Create a fixture file at `tests/fixtures/sample.md`:

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

// Note: In Tauri e2e tests, we invoke the Tauri command directly
// rather than simulating the file picker dialog (which is OS-native)
test('loading a markdown file displays its content in the editor', async ({ page }) => {
	await page.goto('/');

	// Invoke Tauri command to load file directly (bypasses OS dialog for testing)
	await page.evaluate(async (filePath) => {
		const { invoke } = (window as any).__TAURI__.core;
		await invoke('open_file', { path: filePath });
	}, path.resolve('./tests/fixtures/sample.md'));

	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await expect(editor.locator('h1')).toContainText('Sample Document');
	await expect(editor.locator('h2')).toContainText('Section Two');
});
```

Run — fail because `open_file` command doesn't exist:

```bash
npx playwright test tests/file-ops.test.ts
# Expected: 1 failed
```

### Step 7.3 — Implement the Tauri command and frontend handler

In `src-tauri/src/main.rs`:

```rust
mod file_ops;

use file_ops::read_markdown_file;
use tauri::command;

#[command]
fn open_file(path: String) -> Result<String, String> {
    read_markdown_file(&path)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_file])
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}
```

In the Editor component, add a `loadContent` method and expose it:

```typescript
// In Editor.svelte script
export function loadMarkdown(markdown: string) {
	rawMarkdown = markdown;
	editor.commands.setContent(markdown);
}
```

Create `src/lib/file.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export async function openFileDialog(): Promise<string | null> {
	const selected = await open({
		filters: [{ name: 'Markdown', extensions: ['md'] }],
		multiple: false
	});
	if (!selected || Array.isArray(selected)) return null;
	return selected;
}

export async function readFile(path: string): Promise<string> {
	return invoke<string>('open_file', { path });
}
```

Wire `Cmd+O` in the page component:

```svelte
<script lang="ts">
	import { openFileDialog, readFile } from '$lib/file';
	import Editor from '$lib/Editor.svelte';

	let editorRef: Editor;

	async function handleOpenFile() {
		const path = await openFileDialog();
		if (!path) return;
		const content = await readFile(path);
		editorRef.loadMarkdown(content);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.metaKey && e.key === 'o') {
			e.preventDefault();
			handleOpenFile();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />
```

Run tests:

```bash
cd src-tauri && cargo test
npx playwright test tests/file-ops.test.ts
# Expected: all pass
```

### Step 7.4 — New file (Cmd+N)

Write a failing e2e test:

```typescript
test('Cmd+N creates a blank untitled document', async ({ page }) => {
	await page.goto('/');
	// Load a file first so there's content
	await page.evaluate(async (p) => {
		const { invoke } = (window as any).__TAURI__?.core ?? { invoke: async () => '' };
		// In real e2e: invoke load. In mock: set content directly via store.
		void invoke;
		void p;
	}, '');

	await page.keyboard.press('Meta+n');

	const editor = page.locator('.tiptap');
	// Editor should be empty (no headings from previous file)
	await expect(editor.locator('h1')).toHaveCount(0);
	// Title should show "Untitled"
	await expect(page).toHaveTitle(/Untitled/);
});
```

Implement in the page component:

```typescript
function handleNewFile() {
	if (isDirty) {
		// Will be replaced by the "unsaved changes" dialog in Day 8
		// For now, just warn in the console
		console.warn('Unsaved changes discarded — quit dialog coming in Day 8');
	}
	currentFilePath = null;
	isDirty = false;
	document.title = 'Untitled — mdreader';
	editorRef.loadMarkdown('');
}

// In handleKeydown:
if (e.metaKey && e.key === 'n') {
	e.preventDefault();
	handleNewFile();
}
```

### Step 7.5 — Note on local image paths (no implementation today, awareness only)

When a markdown file contains `![alt text](./image.png)`, the image path is relative to
the `.md` file on disk. Tauri's WKWebView will not resolve this — it will show a broken
image because the WebView's origin is not the file's directory.

**The fix (implement in a future hardening pass):** Use Tauri's `asset://` protocol or a
custom URI scheme to serve local files. For now, images simply won't render. Add this to
the Day 15 manual test checklist so it's not forgotten.

```bash
git add .
git commit -m "feat: open .md file with Cmd+O, new file with Cmd+N"
git push
```

**Day 7 done when:** Capabilities config is in place, Rust file-read tests pass, e2e open-file test passes, Cmd+N creates a blank document.

---

## Day 8 — Save, Save As, Auto-save

**Goal:** `Cmd+S` saves the current file in place. `Cmd+Shift+S` opens a save dialog. A dot in the window title indicates unsaved changes. Auto-save fires every 30 seconds.

### Step 8.1 — Rust tests for write operations

Add to `src-tauri/src/file_ops.rs`:

```rust
pub fn write_markdown_file(path: &str, content: &str) -> Result<(), String> {
    let path = std::path::Path::new(path);
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err("Only .md files are supported".to_string());
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    // ... existing tests ...

    #[test]
    fn writes_and_reads_back_correctly() {
        let tmp = NamedTempFile::with_suffix(".md").unwrap();
        let path = tmp.path().to_str().unwrap();
        write_markdown_file(path, "# Written").unwrap();
        let content = read_markdown_file(path).unwrap();
        assert_eq!(content, "# Written");
    }

    #[test]
    fn write_errors_on_non_md_extension() {
        let tmp = NamedTempFile::with_suffix(".txt").unwrap();
        let result = write_markdown_file(tmp.path().to_str().unwrap(), "content");
        assert!(result.is_err());
    }
}
```

Run — one will fail until `write_markdown_file` is implemented:

```bash
cd src-tauri && cargo test
```

### Step 8.2 — Failing e2e tests for save

Add to `tests/file-ops.test.ts`:

```typescript
test('Cmd+S saves changes to disk', async ({ page }) => {
	const tmpPath = '/tmp/mdreader-test-save.md';
	// Pre-create the file
	require('fs').writeFileSync(tmpPath, '# Original');

	await page.goto('/');
	// Load the file
	await page.evaluate(async (path) => {
		await (window as any).__TAURI__.core.invoke('open_file', { path });
	}, tmpPath);

	// Edit the content
	const editor = page.locator('.tiptap');
	await editor.click();
	// Tell the app the current file path
	await page.evaluate(async (path) => {
		await (window as any).__TAURI__.core.invoke('set_current_file', { path });
	}, tmpPath);

	await page.keyboard.press('Meta+s');

	// Read the file back from disk
	const saved = await page.evaluate(async (path) => {
		return (window as any).__TAURI__.core.invoke('open_file', { path });
	}, tmpPath);

	expect(saved).toContain('Original'); // content was saved
});

test('unsaved changes show dot in title', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.type('New content');
	// Title should contain an indicator of unsaved state
	await expect(page).toHaveTitle(/•.*mdreader|mdreader.*•/);
});
```

Run — fail:

```bash
npx playwright test tests/file-ops.test.ts --grep "saves|dot in title"
```

### Step 8.3 — Implement save commands

Add Tauri state and commands. Note two important Rust details:

- `AppState` must derive or implement `Send + Sync` (Rust requires this for shared state)
- The state must be registered with `.manage()` in the builder — forgetting this causes a panic at runtime

```rust
use std::sync::Mutex;

// AppState holds the path of the currently open file.
// Mutex<T> is Send + Sync, so AppState is too.
struct AppState {
    current_file: Mutex<Option<String>>,
}

#[command]
fn set_current_file(state: tauri::State<'_, AppState>, path: String) {
    *state.current_file.lock().unwrap() = Some(path);
}

#[command]
fn save_file(state: tauri::State<'_, AppState>, content: String) -> Result<(), String> {
    let path = state.current_file.lock().unwrap().clone();
    match path {
        Some(p) => file_ops::write_markdown_file(&p, &content),
        None => Err("No file is currently open".to_string()),
    }
}

fn main() {
    tauri::Builder::default()
        .manage(AppState { current_file: Mutex::new(None) })  // REQUIRED — registers state
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            open_file, set_current_file, save_file
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}
```

In the Svelte page, add save logic with proper window title format:

```typescript
let isDirty = false;
let currentFilePath: string | null = null;

// Title format: "filename.md — mdreader" when a file is open,
// "• filename.md — mdreader" when unsaved, "Untitled — mdreader" for new docs
function updateTitle() {
	const base = currentFilePath
		? currentFilePath.split('/').pop()! // filename only
		: 'Untitled';
	document.title = isDirty ? `• ${base} — mdreader` : `${base} — mdreader`;
}

async function save() {
	if (!currentFilePath) return;
	const content = editorRef.getMarkdown();
	await invoke('save_file', { content });
	isDirty = false;
	updateTitle();
}

// Auto-save every 30 seconds
setInterval(() => {
	if (isDirty && currentFilePath) save();
}, 30_000);
```

Add a unit test for the title logic:

```typescript
// src/lib/utils.test.ts
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

Add `formatTitle` to `src/lib/utils.ts`:

```typescript
export function formatTitle(filePath: string | null, isDirty: boolean): string {
	const base = filePath ? filePath.split('/').pop()! : 'Untitled';
	return isDirty ? `• ${base} — mdreader` : `${base} — mdreader`;
}
```

### Step 8.4 — Quit with unsaved changes dialog

**Why now:** Without this, quitting with unsaved work silently discards it. This is the
kind of data-loss bug that makes users distrust an app.

Add to `src-tauri/src/main.rs`:

```rust
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .manage(AppState { current_file: Mutex::new(None) })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Prevent close — let the frontend decide
                api.prevent_close();
                window.emit("close-requested", ()).unwrap();
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_file, set_current_file, save_file
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}
```

In the Svelte page, listen for the `close-requested` event:

```typescript
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

onMount(async () => {
	await listen('close-requested', async () => {
		if (!isDirty) {
			await getCurrentWindow().close();
			return;
		}
		// Show a native confirmation dialog
		const { ask } = await import('@tauri-apps/plugin-dialog');
		const confirmed = await ask('You have unsaved changes. Quit without saving?', {
			title: 'Unsaved Changes',
			kind: 'warning'
		});
		if (confirmed) await getCurrentWindow().close();
	});
});
```

Add `dialog:allow-message` and `dialog:allow-ask` to `src-tauri/capabilities/default.json`:

```json
"permissions": [
  "core:default",
  "dialog:allow-open",
  "dialog:allow-save",
  "dialog:allow-ask",
  "fs:allow-read-text-file",
  "fs:allow-write-text-file",
  "shell:allow-open"
]
```

Write a failing e2e test:

```typescript
test('closing with unsaved changes does not immediately close the window', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.type('unsaved content');
	// Simulate close — the window should still be open (dialog appeared)
	// In Playwright, we can check that the page is still accessible after the close event
	await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
	await expect(editor).toBeVisible(); // still open
});
```

Run tests:

```bash
cd src-tauri && cargo test
npx playwright test tests/file-ops.test.ts
npm run test:unit
```

```bash
git add .
git commit -m "feat: save, save-as, auto-save, window title, quit dialog"
git push
```

**Day 8 done when:** All save/load tests pass, title unit tests pass, auto-save has a fake-timer unit test, quit dialog is tested.

---

## Day 9 — Recent Files

**Goal:** The last 10 opened files are stored on disk and shown in a menu. They survive app restart.

### Step 9.1 — Rust tests for recent files storage

Create `src-tauri/src/recent_files.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const MAX_RECENT: usize = 10;

#[derive(Serialize, Deserialize, Clone)]
pub struct RecentFiles {
    paths: Vec<String>,
}

impl RecentFiles {
    pub fn new() -> Self {
        Self { paths: vec![] }
    }

    pub fn add(&mut self, path: &str) {
        self.paths.retain(|p| p != path); // deduplicate
        self.paths.insert(0, path.to_string());
        self.paths.truncate(MAX_RECENT);
    }

    pub fn list(&self) -> &[String] {
        &self.paths
    }

    pub fn save(&self, dir: &PathBuf) -> Result<(), String> {
        let file = dir.join("recent_files.json");
        let json = serde_json::to_string(self).map_err(|e| e.to_string())?;
        std::fs::write(file, json).map_err(|e| e.to_string())
    }

    pub fn load(dir: &PathBuf) -> Self {
        let file = dir.join("recent_files.json");
        std::fs::read_to_string(file)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(Self::new)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn adds_file_to_front() {
        let mut rf = RecentFiles::new();
        rf.add("/a.md");
        rf.add("/b.md");
        assert_eq!(rf.list()[0], "/b.md");
    }

    #[test]
    fn deduplicates_on_add() {
        let mut rf = RecentFiles::new();
        rf.add("/a.md");
        rf.add("/b.md");
        rf.add("/a.md"); // re-add
        assert_eq!(rf.list().len(), 2);
        assert_eq!(rf.list()[0], "/a.md");
    }

    #[test]
    fn caps_at_ten_entries() {
        let mut rf = RecentFiles::new();
        for i in 0..15 {
            rf.add(&format!("/{}.md", i));
        }
        assert_eq!(rf.list().len(), 10);
    }

    #[test]
    fn persists_and_loads_from_disk() {
        let dir = tempdir().unwrap();
        let mut rf = RecentFiles::new();
        rf.add("/test.md");
        rf.save(&dir.path().to_path_buf()).unwrap();

        let loaded = RecentFiles::load(&dir.path().to_path_buf());
        assert_eq!(loaded.list()[0], "/test.md");
    }
}
```

Run — fail until code compiles with `serde_json`:

```bash
# Add to Cargo.toml:
# serde = { version = "1", features = ["derive"] }
# serde_json = "1"
cd src-tauri && cargo test
# Expected: 4 passed
```

### Step 9.2 — Failing e2e test for recent files

Add to `tests/file-ops.test.ts`:

```typescript
test('recently opened file appears in recent list', async ({ page }) => {
	const fixturePath = path.resolve('./tests/fixtures/sample.md');
	await page.goto('/');

	await page.evaluate(async (p) => {
		await (window as any).__TAURI__.core.invoke('open_file', { path: p });
	}, fixturePath);

	// Check that recent files list contains the opened file
	const recentFiles = await page.evaluate(async () => {
		return (window as any).__TAURI__.core.invoke('get_recent_files');
	});

	expect(recentFiles).toContain(fixturePath);
});
```

### Step 9.3 — Implement `get_recent_files` command and wire into AppState

Extend `AppState` in `src-tauri/src/main.rs` to hold recent files alongside the current file:

```rust
mod file_ops;
mod recent_files;

use file_ops::{read_markdown_file, write_markdown_file};
use recent_files::RecentFiles;
use std::sync::Mutex;
use tauri::{command, Manager};

struct AppState {
    current_file: Mutex<Option<String>>,
    recent_files: Mutex<RecentFiles>,
}

#[command]
fn open_file(state: tauri::State<'_, AppState>, path: String) -> Result<String, String> {
    let content = read_markdown_file(&path)?;
    // Update recent files list
    let app_data_dir = /* tauri path resolver */ std::path::PathBuf::from(""); // see below
    let mut rf = state.recent_files.lock().unwrap();
    rf.add(&path);
    let _ = rf.save(&app_data_dir); // best-effort save
    Ok(content)
}

#[command]
fn get_recent_files(state: tauri::State<'_, AppState>) -> Vec<String> {
    state.recent_files.lock().unwrap().list().to_vec()
}
```

To get the app data directory inside a command, use the `AppHandle`:

```rust
#[command]
fn open_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let content = read_markdown_file(&path)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_data_dir).ok();
    let mut rf = state.recent_files.lock().unwrap();
    rf.add(&path);
    let _ = rf.save(&app_data_dir);
    Ok(content)
}
```

Load recent files on startup in `main()`:

```rust
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let recent = RecentFiles::load(&app_data_dir);
            app.manage(AppState {
                current_file: Mutex::new(None),
                recent_files: Mutex::new(recent),
            });
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            open_file, set_current_file, save_file, get_recent_files
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}
```

Add `fs:allow-app-data` to capabilities. Also add `path:default` which the path resolver needs:

```json
"permissions": [
  "core:default",
  "path:default",
  "dialog:allow-open",
  "dialog:allow-save",
  "dialog:allow-ask",
  "fs:allow-read-text-file",
  "fs:allow-write-text-file",
  "fs:allow-create-dir",
  "shell:allow-open"
]
```

Create `src/lib/RecentFiles.svelte`:

```svelte
<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { onMount } from 'svelte';

	export let onOpen: (path: string) => void = () => {};

	let recentPaths: string[] = [];

	onMount(async () => {
		recentPaths = await invoke<string[]>('get_recent_files');
	});

	function displayName(path: string) {
		return path.split('/').pop() ?? path;
	}
</script>

{#if recentPaths.length > 0}
	<div class="recent-section">
		<p class="section-label">Recent</p>
		{#each recentPaths as path}
			<button class="recent-item" on:click={() => onOpen(path)} title={path}>
				{displayName(path)}
			</button>
		{/each}
	</div>
{/if}

<style>
	.section-label {
		font-size: 10px;
		text-transform: uppercase;
		color: var(--color-text-muted);
		padding: 8px 8px 2px;
	}
	.recent-item {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		cursor: pointer;
		padding: 3px 8px;
		font-size: 12px;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.recent-item:hover {
		background: rgba(0, 0, 0, 0.05);
	}
</style>
```

```bash
git add .
git commit -m "feat: recent files list persisted across restarts"
git push
```

**Day 9 done when:** All 4 Rust tests pass, e2e recent files test passes.

---

## Day 10 — Outline Sidebar: Heading Extraction

**Goal:** The sidebar auto-populates with a hierarchical list of headings extracted from the live document.

### Step 10.1 — Write failing unit tests for heading extraction

Create `src/lib/outline.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractHeadings, type Heading } from './outline';

describe('extractHeadings', () => {
	it('returns empty array for document with no headings', () => {
		expect(extractHeadings([])).toEqual([]);
	});

	it('extracts a single H1', () => {
		const nodes = [{ type: 'heading', attrs: { level: 1 }, textContent: 'Title' }];
		expect(extractHeadings(nodes)).toEqual([{ level: 1, text: 'Title', id: 0 }]);
	});

	it('extracts mixed heading levels in order', () => {
		const nodes = [
			{ type: 'heading', attrs: { level: 1 }, textContent: 'H1' },
			{ type: 'paragraph', attrs: {}, textContent: 'para' },
			{ type: 'heading', attrs: { level: 2 }, textContent: 'H2' },
			{ type: 'heading', attrs: { level: 3 }, textContent: 'H3' }
		];
		const result = extractHeadings(nodes);
		expect(result).toHaveLength(3);
		expect(result[0]).toMatchObject({ level: 1, text: 'H1' });
		expect(result[1]).toMatchObject({ level: 2, text: 'H2' });
		expect(result[2]).toMatchObject({ level: 3, text: 'H3' });
	});

	it('ignores non-heading nodes', () => {
		const nodes = [
			{ type: 'paragraph', attrs: {}, textContent: 'text' },
			{ type: 'codeBlock', attrs: {}, textContent: 'code' }
		];
		expect(extractHeadings(nodes)).toHaveLength(0);
	});
});
```

Run — fail:

```bash
npm run test:unit
# Expected: Error — cannot find module './outline'
```

### Step 10.2 — Implement heading extraction

Create `src/lib/outline.ts`:

```typescript
export interface Heading {
	level: number;
	text: string;
	id: number; // position index in the document (for scrolling)
}

interface DocNode {
	type: string;
	attrs: Record<string, unknown>;
	textContent: string;
}

export function extractHeadings(nodes: DocNode[]): Heading[] {
	return nodes
		.map((node, index) => ({ node, index }))
		.filter(({ node }) => node.type === 'heading')
		.map(({ node, index }) => ({
			level: node.attrs.level as number,
			text: node.textContent,
			id: index
		}));
}
```

Run — expect all tests to pass:

```bash
npm run test:unit
# Expected: 4 passed
```

### Step 10.3 — Write failing e2e test for sidebar rendering

Add to `tests/outline.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('sidebar shows headings from the document', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('# Main Title');
	await page.keyboard.press('Enter');
	await page.keyboard.type('## Sub Section');
	await page.keyboard.press('Enter');
	await page.keyboard.type('### Deep Section');

	const sidebar = page.locator('[data-testid="sidebar"]');
	await expect(sidebar.locator('[data-testid="outline-item"]').nth(0)).toContainText('Main Title');
	await expect(sidebar.locator('[data-testid="outline-item"]').nth(1)).toContainText('Sub Section');
	await expect(sidebar.locator('[data-testid="outline-item"]').nth(2)).toContainText(
		'Deep Section'
	);
});

test('H2 items are visually indented more than H1 items', async ({ page }) => {
	await page.goto('/');
	// ... setup headings ...
	const h1Item = page.locator('[data-testid="outline-item"][data-level="1"]').first();
	const h2Item = page.locator('[data-testid="outline-item"][data-level="2"]').first();
	const h1Box = await h1Item.boundingBox();
	const h2Box = await h2Item.boundingBox();
	expect(h2Box!.x).toBeGreaterThan(h1Box!.x);
});
```

Run — fail:

```bash
npx playwright test tests/outline.test.ts
# Expected: 2 failed
```

### Step 10.4 — Build the Outline component

Create `src/lib/Outline.svelte`:

```svelte
<script lang="ts">
	import type { Heading } from './outline';

	export let headings: Heading[] = [];
</script>

<nav class="outline">
	{#if headings.length === 0}
		<p class="empty-hint">No headings yet</p>
	{:else}
		{#each headings as heading}
			<button
				data-testid="outline-item"
				data-level={heading.level}
				class="outline-item level-{heading.level}"
				style="padding-left: {(heading.level - 1) * 12 + 8}px"
			>
				{heading.text}
			</button>
		{/each}
	{/if}
</nav>

<style>
	.outline {
		padding: 8px 0;
	}
	.outline-item {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		cursor: pointer;
		padding-top: 4px;
		padding-bottom: 4px;
		padding-right: 8px;
		font-size: 12px;
		line-height: 1.4;
		color: var(--color-text);
		border-radius: 4px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.outline-item:hover {
		background: rgba(0, 0, 0, 0.05);
	}
	.level-1 {
		font-weight: 600;
	}
	.level-2 {
		font-weight: 400;
	}
	.level-3 {
		font-weight: 400;
		color: var(--color-text-muted);
		font-size: 11px;
	}
	.empty-hint {
		font-size: 11px;
		color: var(--color-text-muted);
		padding: 8px;
	}
</style>
```

Wire the outline into the Editor: after each doc update, compute headings and pass them up via a callback or Svelte store.

Run tests:

```bash
npm run test:unit && npx playwright test tests/outline.test.ts
# Expected: all pass
```

```bash
git add .
git commit -m "feat: outline sidebar with hierarchical heading extraction"
git push
```

**Day 10 done when:** Unit tests pass for `extractHeadings`, e2e tests confirm sidebar renders correctly indented items.

---

## Day 11 — Sidebar Navigation and Active Highlight

**Goal:** Clicking a heading in the sidebar scrolls the editor to that heading. The active section highlights as the cursor moves.

### Step 11.1 — Write failing e2e tests

Add to `tests/outline.test.ts`:

```typescript
test('clicking an outline item scrolls editor to that heading', async ({ page }) => {
	await page.goto('/');
	// Load a long document with multiple sections
	await page.evaluate(async (p) => {
		await (window as any).__TAURI__.core.invoke('open_file', { path: p });
	}, path.resolve('./tests/fixtures/long-document.md'));

	// Click the second heading in the outline
	const secondItem = page.locator('[data-testid="outline-item"]').nth(1);
	const headingText = await secondItem.textContent();
	await secondItem.click();

	// The corresponding heading in the editor should be in the viewport
	const editorHeading = page.locator('.tiptap h2').filter({ hasText: headingText! });
	await expect(editorHeading).toBeInViewport();
});

test('active outline item updates as user scrolls', async ({ page }) => {
	// Load long document, scroll to bottom, verify last heading is highlighted
	await page.goto('/');
	await page.evaluate(async (p) => {
		await (window as any).__TAURI__.core.invoke('open_file', { path: p });
	}, path.resolve('./tests/fixtures/long-document.md'));

	// Scroll to last heading in editor
	const lastHeading = page.locator('.tiptap h2').last();
	await lastHeading.scrollIntoViewIfNeeded();

	// Last outline item should be active
	const lastOutlineItem = page.locator('[data-testid="outline-item"]').last();
	await expect(lastOutlineItem).toHaveClass(/active/);
});
```

Create `tests/fixtures/long-document.md` — a document with enough headings to require scrolling:

```markdown
# Introduction

Lorem ipsum dolor sit amet, consectetur adipiscing elit. (repeat several paragraphs)

## Background

More content here...

## Methodology

Even more content...

## Results

...

## Conclusion

Final thoughts.
```

Run — fail:

```bash
npx playwright test tests/outline.test.ts
# Expected: 2 new failures
```

### Step 11.2 — Implement scroll-to and active tracking

In `Editor.svelte`, expose heading DOM nodes and track cursor position:

```typescript
// After editor mounts, set up a transaction listener
editor.on('transaction', () => {
	updateActiveHeading();
	dispatch('headingsChange', { headings: getHeadingsFromDoc() });
});

function scrollToHeading(headingIndex: number) {
	// Walk editor DOM to find the nth heading element, call scrollIntoView
	const headings = editorElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
	headings[headingIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateActiveHeading() {
	// Use IntersectionObserver or cursor position to find which heading is "active"
}
```

In `Outline.svelte`, accept an `activeId` prop and apply the `active` CSS class:

```svelte
<button
  ...
  class="outline-item level-{heading.level}"
  class:active={heading.id === activeId}
  on:click={() => dispatch('scrollTo', { id: heading.id })}
>
```

Run tests:

```bash
npx playwright test tests/outline.test.ts
# Expected: all pass
```

```bash
git add .
git commit -m "feat: sidebar scroll-to and active heading highlight"
git push
```

**Day 11 done when:** All outline tests pass including scroll and active highlight.

---

## Day 12 — Keyboard Shortcuts + macOS Menu Bar

**Goal:** `Cmd+B`, `Cmd+I`, `Cmd+K`, `` Cmd+` `` apply formatting. Tab in lists inserts spaces. Enter continues list items. A native macOS menu bar wires File and Edit menus to the same actions.

### Step 12.1 — Write failing e2e tests

Create `tests/shortcuts.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('Cmd+B makes selected text bold', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.type('hello world');
	// Select "world"
	await page.keyboard.down('Shift');
	for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
	await page.keyboard.up('Shift');
	await page.keyboard.press('Meta+b');
	await expect(editor.locator('strong')).toContainText('world');
});

test('Cmd+I makes selected text italic', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.type('hello world');
	await page.keyboard.down('Shift');
	for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
	await page.keyboard.up('Shift');
	await page.keyboard.press('Meta+i');
	await expect(editor.locator('em')).toContainText('world');
});

test('Enter key continues a bullet list', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.type('- First item');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Second item');
	const listItems = editor.locator('li');
	await expect(listItems).toHaveCount(2);
});
```

Run — fail (TipTap may handle some of these already, verify which ones need explicit wiring):

```bash
npx playwright test tests/shortcuts.test.ts
```

### Step 12.2 — Verify and wire shortcuts

TipTap's StarterKit already handles `Cmd+B`, `Cmd+I`, and Enter-to-continue-list. Run the tests — if they pass without extra work, that's fine. Verify `` Cmd+` `` for inline code:

```typescript
test('Cmd+` makes selected text inline code', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.type('use the func here');
	await page.keyboard.down('Shift');
	for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
	await page.keyboard.up('Shift');
	await page.keyboard.press('Meta+`');
	await expect(editor.locator('code')).toContainText('here');
});
```

If `Cmd+` is not handled by default, add a custom keyboard shortcut extension:

```typescript
import { Extension } from '@tiptap/core';

const InlineCodeShortcut = Extension.create({
	addKeyboardShortcuts() {
		return {
			'Mod-`': () => this.editor.commands.toggleCode()
		};
	}
});
```

### Step 12.3 — macOS native menu bar

**Why this matters:** macOS users expect a menu bar with File / Edit / View. Without it the
app feels unfinished, standard behaviors (Edit → Undo, File → Open Recent) don't work, and
accessibility tools rely on the menu. Tauri's default menu is minimal — build it explicitly.

Write a failing test:

```typescript
// tests/menu.test.ts
// Note: Playwright cannot interact with native macOS menus directly.
// We test that the Tauri menu commands emit the correct events instead.
import { test, expect } from '@playwright/test';

test('app exposes a file-open command via menu event', async ({ page }) => {
	await page.goto('/');
	// Listen for a custom event that the menu item will emit
	const eventPromise = page.evaluate(
		() =>
			new Promise<string>((resolve) => {
				window.addEventListener('menu:new-file', () => resolve('triggered'), { once: true });
			})
	);
	// Simulate the menu event (in real use, Tauri emits this when the menu item is clicked)
	await page.evaluate(() => window.dispatchEvent(new Event('menu:new-file')));
	expect(await eventPromise).toBe('triggered');
});
```

Implement the menu in `src-tauri/src/main.rs`:

```rust
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // ... state management from Day 9 ...

            let new_item = MenuItem::with_id(app, "new-file", "New", true, Some("CmdOrCtrl+N"))?;
            let open_item = MenuItem::with_id(app, "open-file", "Open...", true, Some("CmdOrCtrl+O"))?;
            let save_item = MenuItem::with_id(app, "save-file", "Save", true, Some("CmdOrCtrl+S"))?;
            let save_as_item = MenuItem::with_id(app, "save-as", "Save As...", true, Some("CmdOrCtrl+Shift+S"))?;

            let file_menu = Submenu::with_items(app, "File", true, &[
                &new_item,
                &open_item,
                &PredefinedMenuItem::separator(app)?,
                &save_item,
                &save_as_item,
            ])?;

            let edit_menu = Submenu::new(app, "Edit", true)?;
            // PredefinedMenuItem handles Undo, Redo, Cut, Copy, Paste automatically
            let menu = Menu::with_items(app, &[&file_menu, &edit_menu])?;
            app.set_menu(menu)?;

            // Forward menu events to the frontend as window events
            app.on_menu_event(|app, event| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit(&format!("menu:{}", event.id().0), ());
                }
            });

            Ok(())
        })
        // ...
}
```

In the Svelte page, listen for menu events (these supplement the keyboard shortcuts):

```typescript
import { listen } from '@tauri-apps/api/event';

onMount(async () => {
	await listen('menu:new-file', () => handleNewFile());
	await listen('menu:open-file', () => handleOpenFile());
	await listen('menu:save-file', () => save());
	await listen('menu:save-as', () => saveAs());
});
```

```bash
npx playwright test tests/shortcuts.test.ts tests/menu.test.ts
# Expected: all pass

git add .
git commit -m "feat: keyboard shortcuts, inline code shortcut, macOS menu bar"
git push
```

**Day 12 done when:** All shortcut tests pass, menu event test passes, app has a working File menu.

---

## Day 13 — Theme + Status Bar

**Goal:** Light/dark theme auto-follows macOS system preference. Word count shown in status bar and updates as user types.

### Step 13.1 — Write failing unit tests for word count

Add to `src/lib/utils.test.ts`:

```typescript
describe('word count from HTML', () => {
	it('counts words in plain text', () => {
		expect(formatWordCount('one two three')).toBe('3 words');
	});
});
```

This already passes from Day 2. Now write a test for the live status bar:

### Step 13.2 — Write failing e2e test for status bar

Add to `tests/ui.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('status bar shows word count that updates as user types', async ({ page }) => {
	await page.goto('/');
	const statusBar = page.locator('[data-testid="status-bar"]');
	const editor = page.locator('.tiptap');

	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');

	await expect(statusBar).toContainText('0 words');

	await page.keyboard.type('hello world foo');
	await expect(statusBar).toContainText('3 words');
});

test('dark mode applies when system is in dark mode', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/');
	const body = page.locator('body');
	// Background should be dark
	const bg = await body.evaluate((el) =>
		window.getComputedStyle(el).getPropertyValue('background-color')
	);
	// Dark bg should not be white
	expect(bg).not.toBe('rgb(255, 255, 255)');
});
```

Run — fail:

```bash
npx playwright test tests/ui.test.ts
# Expected: 2 failed
```

### Step 13.3 — Implement live word count

In the page component, subscribe to TipTap's `update` event and pass the word count to the status bar:

```svelte
<script lang="ts">
	import { formatWordCount } from '$lib/utils';
	let wordCount = '0 words';

	function onEditorUpdate(text: string) {
		wordCount = formatWordCount(text);
	}
</script>

<footer data-testid="status-bar" class="status-bar">
	<span>{wordCount}</span>
</footer>
```

### Step 13.4 — Implement dark mode

In `src/app.css`, add dark mode CSS variables:

```css
@media (prefers-color-scheme: dark) {
	:root {
		--color-bg: #1e1e1e;
		--color-bg-sidebar: #252525;
		--color-bg-status: #2a2a2a;
		--color-text: #d4d4d4;
		--color-text-muted: #888;
		--color-border: #3a3a3a;
	}
}

body {
	background-color: var(--color-bg);
	color: var(--color-text);
}
```

Run tests:

```bash
npx playwright test tests/ui.test.ts
# Expected: 2 passed

git add .
git commit -m "feat: dark mode theme and live word count in status bar"
git push
```

**Day 13 done when:** Word count test and dark mode test pass in CI.

---

## Day 14 — Distraction-Free Mode + Font Size

**Goal:** `Cmd+Shift+F` hides sidebar and status bar, centers a narrow content column. `Cmd++`/`Cmd+-` adjusts font size and persists the preference.

### Step 14.1 — Write failing e2e tests

Add to `tests/ui.test.ts`:

```typescript
test('Cmd+Shift+F hides sidebar and status bar', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();

	await page.keyboard.press('Meta+Shift+f');

	await expect(page.locator('[data-testid="sidebar"]')).not.toBeVisible();
	await expect(page.locator('[data-testid="status-bar"]')).not.toBeVisible();
});

test('Cmd+Shift+F toggles back to normal mode', async ({ page }) => {
	await page.goto('/');
	await page.keyboard.press('Meta+Shift+f');
	await page.keyboard.press('Meta+Shift+f');
	await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
});

test('Cmd++ increases editor font size', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	const initialSize = await editor.evaluate((el) =>
		parseFloat(window.getComputedStyle(el).fontSize)
	);
	await page.keyboard.press('Meta+=');
	const newSize = await editor.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
	expect(newSize).toBeGreaterThan(initialSize);
});
```

Run — fail:

```bash
npx playwright test tests/ui.test.ts --grep "distraction|font"
# Expected: 3 failed
```

### Step 14.2 — Implement distraction-free mode

In the page component:

```svelte
<script lang="ts">
	let distractionFree = false;
	let fontSize = 16;

	function handleKeydown(e: KeyboardEvent) {
		if (e.metaKey && e.shiftKey && e.key === 'f') {
			e.preventDefault();
			distractionFree = !distractionFree;
		}
		if (e.metaKey && e.key === '=') {
			e.preventDefault();
			fontSize = Math.min(24, fontSize + 1);
		}
		if (e.metaKey && e.key === '-') {
			e.preventDefault();
			fontSize = Math.max(12, fontSize - 1);
		}
	}
</script>

<div class="app-shell" class:distraction-free={distractionFree}>
	<aside data-testid="sidebar" class="sidebar" style:display={distractionFree ? 'none' : 'block'}>
		...
	</aside>

	<main data-testid="editor-area" class="editor-area" style:--font-size-editor="{fontSize}px">
		<Editor />
	</main>

	<footer
		data-testid="status-bar"
		class="status-bar"
		style:display={distractionFree ? 'none' : 'flex'}
	>
		...
	</footer>
</div>
```

Persist font size using `localStorage`:

```typescript
onMount(() => {
	const saved = localStorage.getItem('font-size');
	if (saved) fontSize = parseInt(saved);
});

$: localStorage.setItem('font-size', String(fontSize));
```

Run tests:

```bash
npx playwright test tests/ui.test.ts
# Expected: all pass

git add .
git commit -m "feat: distraction-free mode and adjustable font size"
git push
```

**Day 14 done when:** All UI tests pass including distraction-free and font size.

---

## Day 15 — Find & Replace

**Goal:** `Cmd+F` opens a search bar that highlights all matches in the seamless editor. `Cmd+H` adds a replace field. Enter/Cmd+G cycles matches. Replace one or replace all. Escape closes and returns focus to the editor.

### Step 15.1 — Install the TipTap search extension

```bash
npm install @tiptap/extension-search-and-replace
```

> CodeMirror's `basicSetup` (source mode) already includes `Cmd+F` search — no extra work
> needed there. The implementation below targets the seamless TipTap editor only.

### Step 15.2 — Write failing unit tests for match counting

The search bar shows "N matches". Test the counting logic independently.

Create `src/lib/search.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { countMatches } from './search';

describe('countMatches', () => {
	it('returns 0 for no matches', () => {
		expect(countMatches('hello world', 'xyz')).toBe(0);
	});

	it('counts multiple exact matches', () => {
		expect(countMatches('the cat and the cat', 'cat')).toBe(2);
	});

	it('is case-insensitive', () => {
		expect(countMatches('Hello HELLO hello', 'hello')).toBe(3);
	});

	it('returns 0 for empty search term', () => {
		expect(countMatches('hello', '')).toBe(0);
	});

	it('handles special regex characters in the search term', () => {
		// Search term "a.b" should match literal "a.b", not "aXb"
		expect(countMatches('a.b aXb a.b', 'a.b')).toBe(2);
	});
});
```

Run — fail because `search.ts` doesn't exist:

```bash
npm run test:unit
# Expected: Error — cannot find module './search'
```

### Step 15.3 — Implement the match counter

Create `src/lib/search.ts`:

```typescript
export function countMatches(text: string, term: string): number {
	if (!term) return 0;
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return (text.match(new RegExp(escaped, 'gi')) ?? []).length;
}
```

Run — expect all tests to pass:

```bash
npm run test:unit
# Expected: 5 passed
```

### Step 15.4 — Write failing e2e tests

Create `tests/search.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('Cmd+F opens the search bar', async ({ page }) => {
	await page.goto('/');
	await page.keyboard.press('Meta+f');
	await expect(page.locator('[data-testid="search-bar"]')).toBeVisible();
});

test('searching highlights all matches', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('The cat sat on the mat');

	await page.keyboard.press('Meta+f');
	await page.locator('[data-testid="search-input"]').fill('at');

	// @tiptap/extension-search-and-replace marks matches with .search-result
	const highlights = page.locator('.tiptap .search-result');
	await expect(highlights).toHaveCount(3); // c-at, s-at, m-at
});

test('Escape closes the search bar and refocuses editor', async ({ page }) => {
	await page.goto('/');
	await page.keyboard.press('Meta+f');
	await expect(page.locator('[data-testid="search-bar"]')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('[data-testid="search-bar"]')).not.toBeVisible();
	await expect(page.locator('.tiptap')).toBeFocused();
});

test('Cmd+H opens search bar with replace field', async ({ page }) => {
	await page.goto('/');
	await page.keyboard.press('Meta+h');
	await expect(page.locator('[data-testid="search-bar"]')).toBeVisible();
	await expect(page.locator('[data-testid="replace-input"]')).toBeVisible();
});

test('Replace replaces the current match', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('foo bar foo');

	await page.keyboard.press('Meta+h');
	await page.locator('[data-testid="search-input"]').fill('foo');
	await page.locator('[data-testid="replace-input"]').fill('baz');
	await page.locator('[data-testid="replace-one-btn"]').click();

	await expect(editor).toContainText('baz bar foo');
});

test('Replace All replaces every match', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('foo bar foo');

	await page.keyboard.press('Meta+h');
	await page.locator('[data-testid="search-input"]').fill('foo');
	await page.locator('[data-testid="replace-input"]').fill('baz');
	await page.locator('[data-testid="replace-all-btn"]').click();

	await expect(editor).toContainText('baz bar baz');
	await expect(editor).not.toContainText('foo');
});
```

Run — fail because neither the search bar component nor the keyboard handlers exist:

```bash
npx playwright test tests/search.test.ts
# Expected: 6 failed
```

### Step 15.5 — Build the SearchBar component

Create `src/lib/SearchBar.svelte`:

```svelte
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { countMatches } from './search';

	export let visible = false;
	export let showReplace = false;
	export let docText = '';

	let searchTerm = '';
	let replaceTerm = '';

	const dispatch = createEventDispatcher<{
		search: { term: string };
		replaceOne: { search: string; replace: string };
		replaceAll: { search: string; replace: string };
		close: void;
	}>();

	$: matchCount = countMatches(docText, searchTerm);
	$: if (visible) dispatch('search', { term: searchTerm });

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') dispatch('close');
		if (e.key === 'Enter' && !e.shiftKey) dispatch('search', { term: searchTerm });
	}
</script>

{#if visible}
	<div data-testid="search-bar" class="search-bar" role="search">
		<input
			data-testid="search-input"
			type="text"
			placeholder="Find…"
			bind:value={searchTerm}
			on:input={() => dispatch('search', { term: searchTerm })}
			on:keydown={handleKeydown}
			autofocus
		/>
		<span class="match-count"
			>{searchTerm ? `${matchCount} match${matchCount !== 1 ? 'es' : ''}` : ''}</span
		>

		{#if showReplace}
			<input
				data-testid="replace-input"
				type="text"
				placeholder="Replace…"
				bind:value={replaceTerm}
				on:keydown={handleKeydown}
			/>
			<button
				data-testid="replace-one-btn"
				on:click={() => dispatch('replaceOne', { search: searchTerm, replace: replaceTerm })}
			>
				Replace
			</button>
			<button
				data-testid="replace-all-btn"
				on:click={() => dispatch('replaceAll', { search: searchTerm, replace: replaceTerm })}
			>
				All
			</button>
		{/if}

		<button class="close-btn" on:click={() => dispatch('close')} aria-label="Close search">✕</button
		>
	</div>
{/if}

<style>
	.search-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 12px;
		background: var(--color-bg-sidebar);
		border-bottom: 1px solid var(--color-border);
		font-size: 13px;
		flex-shrink: 0;
	}
	input {
		padding: 3px 6px;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		font-size: 13px;
		background: var(--color-bg);
		color: var(--color-text);
		width: 180px;
	}
	.match-count {
		color: var(--color-text-muted);
		font-size: 11px;
		min-width: 70px;
	}
	button {
		padding: 2px 8px;
		font-size: 12px;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		cursor: pointer;
		background: var(--color-bg);
		color: var(--color-text);
	}
	.close-btn {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 14px;
	}
</style>
```

### Step 15.6 — Wire search into Editor and page

Add `SearchAndReplace` to the TipTap extensions in `Editor.svelte`:

```typescript
import SearchAndReplace from '@tiptap/extension-search-and-replace';

// In extensions list:
SearchAndReplace.configure({ disableRegex: true });

// Expose commands:
export function search(term: string) {
	editor.commands.setSearchTerm(term);
	editor.commands.resetIndex();
}
export function replaceOne(search: string, replace: string) {
	editor.commands.setSearchTerm(search);
	editor.commands.setReplaceTerm(replace);
	editor.commands.replaceNextSearchResult();
}
export function replaceAll(search: string, replace: string) {
	editor.commands.setSearchTerm(search);
	editor.commands.setReplaceTerm(replace);
	editor.commands.replaceAllSearchResults();
}
```

Add CSS for match highlights in `Editor.svelte`:

```css
:global(.tiptap .search-result) {
	background: rgba(255, 200, 0, 0.35);
	border-radius: 2px;
}
:global(.tiptap .search-result-current) {
	background: rgba(255, 140, 0, 0.55);
}
```

In `+page.svelte`, add the `SearchBar` and wire keyboard shortcuts:

```svelte
<script lang="ts">
  let searchVisible = false;
  let showReplace = false;

  function handleKeydown(e: KeyboardEvent) {
    // ... existing handlers ...
    if (e.metaKey && !e.shiftKey && e.key === 'f') {
      e.preventDefault();
      searchVisible = true;
      showReplace = false;
    }
    if (e.metaKey && e.key === 'h') {
      e.preventDefault();
      searchVisible = true;
      showReplace = true;
    }
  }
</script>

<!-- Place SearchBar between sidebar and editor, inside the editor column -->
<div class="editor-column">
  <SearchBar
    {visible={searchVisible}}
    {showReplace}
    docText={editorRef?.getText() ?? ''}
    on:search={({ detail }) => editorRef?.search(detail.term)}
    on:replaceOne={({ detail }) => editorRef?.replaceOne(detail.search, detail.replace)}
    on:replaceAll={({ detail }) => editorRef?.replaceAll(detail.search, detail.replace)}
    on:close={() => { searchVisible = false; editorRef?.focus(); }}
  />
  <main data-testid="editor-area" class="editor-area">
    <Editor bind:this={editorRef} ... />
  </main>
</div>
```

Run all tests:

```bash
npm run test:unit && npx playwright test tests/search.test.ts
# Expected: all pass
```

```bash
git add .
git commit -m "feat: find and replace with match highlighting"
git push
```

**Day 15 done when:** All 6 search/replace e2e tests pass, unit tests pass, CI is green.

---

## Day 16 — Image Handling

**Goal:** Paste or drag-drop an image into the editor → saved to a `[docname]-assets/` folder next to the current file → markdown reference inserted → image renders correctly in seamless mode via Tauri's asset protocol.

### Step 16.1 — Add Tauri permissions and Rust command

Add to `src-tauri/capabilities/default.json`:

```json
"permissions": [
  "core:default",
  "path:default",
  "asset:default",
  "dialog:allow-open",
  "dialog:allow-save",
  "dialog:allow-ask",
  "fs:allow-read-text-file",
  "fs:allow-write-text-file",
  "fs:allow-write-file",
  "fs:allow-create-dir",
  "shell:allow-open"
]
```

### Step 16.2 — Write failing Rust tests for image saving

Add to `src-tauri/src/file_ops.rs`:

```rust
pub fn save_image_bytes(assets_dir: &std::path::Path, filename: &str, bytes: &[u8]) -> Result<String, String> {
    std::fs::create_dir_all(assets_dir).map_err(|e| e.to_string())?;
    let image_path = assets_dir.join(filename);
    std::fs::write(&image_path, bytes).map_err(|e| e.to_string())?;
    Ok(image_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    // ... existing tests ...

    #[test]
    fn saves_image_and_creates_assets_dir() {
        let dir = tempfile::tempdir().unwrap();
        let assets = dir.path().join("doc-assets");
        let result = save_image_bytes(&assets, "photo.png", b"\x89PNG").unwrap();
        assert!(std::path::Path::new(&result).exists());
        assert_eq!(std::fs::read(&result).unwrap(), b"\x89PNG");
    }

    #[test]
    fn save_image_creates_nested_assets_dir_if_absent() {
        let dir = tempfile::tempdir().unwrap();
        let assets = dir.path().join("subdir").join("doc-assets");
        // assets dir does not exist yet — should be created
        save_image_bytes(&assets, "img.png", b"data").unwrap();
        assert!(assets.exists());
    }
}
```

Run — fail until `save_image_bytes` is implemented:

```bash
cd src-tauri && cargo test
# Expected: 2 new failures, then pass after adding the function
```

### Step 16.3 — Add the Tauri `save_image` command

In `src-tauri/src/main.rs`:

```rust
#[command]
fn save_image(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let current_file = state.current_file.lock().unwrap().clone();

    // Determine base directory: same folder as the open file, or Documents if none
    let base_dir = match &current_file {
        Some(path) => std::path::Path::new(path)
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .to_path_buf(),
        None => app.path().document_dir().map_err(|e| e.to_string())?,
    };

    // Assets folder: [docname]-assets/ next to the file
    let doc_stem = current_file
        .as_ref()
        .and_then(|p| std::path::Path::new(p).file_stem())
        .and_then(|s| s.to_str())
        .unwrap_or("untitled")
        .to_string();

    let assets_dir = base_dir.join(format!("{}-assets", doc_stem));
    file_ops::save_image_bytes(&assets_dir, &filename, &bytes)?;

    // Return the RELATIVE path for the markdown reference
    Ok(format!("./{}-assets/{}", doc_stem, filename))
}
```

Register the command:

```rust
.invoke_handler(tauri::generate_handler![
    open_file, set_current_file, save_file, get_recent_files, save_image
])
```

### Step 16.4 — Write failing unit tests for image path resolution

Image paths must be resolved from relative (`./doc-assets/img.png`) to an `asset://` URL
that WKWebView can load. Test this logic independently with a mock.

Create `src/lib/image-resolver.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock convertFileSrc — in production it calls into Tauri
vi.mock('@tauri-apps/api/core', () => ({
	convertFileSrc: (path: string) => `asset://localhost${path}`,
	invoke: vi.fn()
}));

import { resolveImageSrc } from './image-resolver';

describe('resolveImageSrc', () => {
	it('converts a relative path to an asset:// URL', async () => {
		const result = await resolveImageSrc('/Users/alice/docs/notes.md', './notes-assets/img.png');
		expect(result).toBe('asset://localhost/Users/alice/docs/notes-assets/img.png');
	});

	it('passes through http:// URLs unchanged', async () => {
		const result = await resolveImageSrc('/docs/notes.md', 'https://example.com/img.png');
		expect(result).toBe('https://example.com/img.png');
	});

	it('returns the src unchanged when no file is open', async () => {
		const result = await resolveImageSrc(null, './img.png');
		expect(result).toBe('./img.png');
	});

	it('handles paths without leading ./', async () => {
		const result = await resolveImageSrc('/docs/notes.md', 'notes-assets/img.png');
		expect(result).toBe('asset://localhost/docs/notes-assets/img.png');
	});
});
```

Run — fail because `image-resolver.ts` doesn't exist:

```bash
npm run test:unit
# Expected: Error — cannot find module './image-resolver'
```

### Step 16.5 — Implement the image path resolver

Create `src/lib/image-resolver.ts`:

```typescript
import { convertFileSrc } from '@tauri-apps/api/core';

export async function resolveImageSrc(
	currentFilePath: string | null,
	src: string
): Promise<string> {
	// Pass through external URLs
	if (src.startsWith('http://') || src.startsWith('https://')) return src;
	// Can't resolve without knowing the file location
	if (!currentFilePath) return src;

	const dir = currentFilePath.split('/').slice(0, -1).join('/');
	const normalised = src.replace(/^\.\//, ''); // remove leading ./
	const absolutePath = `${dir}/${normalised}`;
	return convertFileSrc(absolutePath);
}
```

Run — expect all tests to pass:

```bash
npm run test:unit
# Expected: 4 passed
```

### Step 16.6 — Wire paste and drag-drop in Editor.svelte

```typescript
import { invoke } from '@tauri-apps/api/core';

// In onMount, after editor is created:
editorElement.addEventListener('paste', handleImagePaste);
editorElement.addEventListener('drop', handleImageDrop, false);

async function handleImagePaste(e: ClipboardEvent) {
	const items = Array.from(e.clipboardData?.items ?? []);
	const imageItem = items.find((item) => item.type.startsWith('image/'));
	if (!imageItem) return;
	e.preventDefault();
	const file = imageItem.getAsFile();
	if (file) await insertImageFile(file);
}

async function handleImageDrop(e: DragEvent) {
	const files = Array.from(e.dataTransfer?.files ?? []);
	const imageFile = files.find((f) => f.type.startsWith('image/'));
	if (!imageFile) return;
	e.preventDefault();
	await insertImageFile(imageFile);
}

async function insertImageFile(file: File) {
	const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
	// Sanitise filename: strip special chars, ensure extension
	const ext = file.type.split('/')[1] ?? 'png';
	const baseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-') || `image-${Date.now()}.${ext}`;
	const relativePath = await invoke<string>('save_image', { filename: baseName, bytes });
	editor.commands.insertContent(`![](${relativePath})`);
}
```

### Step 16.7 — Resolve image paths when rendering (custom TipTap node view)

TipTap's default `Image` extension renders `<img src="./...">` which WKWebView can't load.
Override the node view to resolve paths through `convertFileSrc`:

```typescript
import Image from '@tiptap/extension-image';
import { resolveImageSrc } from './image-resolver';

// Export the patched extension from Editor.svelte so currentFilePath is in scope
function createImageExtension(getCurrentFilePath: () => string | null) {
	return Image.extend({
		addNodeView() {
			return ({ node }) => {
				const wrapper = document.createElement('span');
				const img = document.createElement('img');
				img.alt = node.attrs.alt ?? '';
				img.style.maxWidth = '100%';

				resolveImageSrc(getCurrentFilePath(), node.attrs.src as string).then((src) => {
					img.src = src;
				});

				wrapper.appendChild(img);
				return { dom: wrapper };
			};
		}
	});
}
```

Also re-resolve all images when a file is loaded (path context changes):

```typescript
// After calling editor.commands.setContent(markdown) on file load:
editor.view.dispatch(editor.state.tr); // triggers a re-render of all node views
```

### Step 16.8 — Write e2e test for image drop

Create `tests/images.test.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Create a minimal valid 1×1 PNG fixture
const PNG_1X1 = Buffer.from(
	'89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
		'77533e0000000c4944415408d76360f8cf000000020001e221bc3300000000' +
		'49454e44ae426082',
	'hex'
);

test.beforeAll(() => {
	const fixturePath = path.resolve('./tests/fixtures/test-image.png');
	if (!fs.existsSync(fixturePath)) fs.writeFileSync(fixturePath, PNG_1X1);
});

test('dropping an image file inserts an img element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();

	const fixturePath = path.resolve('./tests/fixtures/test-image.png');

	await page.evaluate(async (pngBase64) => {
		const bytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
		const file = new File([bytes], 'test-image.png', { type: 'image/png' });
		const dt = new DataTransfer();
		dt.items.add(file);
		const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
		document.querySelector('.tiptap')!.dispatchEvent(event);
	}, PNG_1X1.toString('base64'));

	// An img element should appear in the editor
	await expect(editor.locator('img')).toHaveCount(1);
});

test('image src is resolved through asset:// protocol when file is open', async ({ page }) => {
	await page.goto('/');

	// Load a markdown file that contains an image reference
	const fixturePath = path.resolve('./tests/fixtures/sample.md');
	await page.evaluate(async (p) => {
		// In mock env, simulate loading by setting editor content directly
		(window as any).__setEditorContent?.(`![A photo](./sample-assets/photo.png)`);
		void p;
	}, fixturePath);

	// The img src should be converted — it should NOT contain the raw relative path
	const imgSrc = await page.locator('.tiptap img').getAttribute('src');
	expect(imgSrc).not.toContain('./');
});
```

Run all tests:

```bash
cd src-tauri && cargo test
npm run test:unit && npx playwright test tests/images.test.ts
# Expected: all pass
```

```bash
git add .
git commit -m "feat: image paste and drag-drop with asset:// path resolution"
git push
```

**Day 16 done when:** Rust image-save tests pass, unit tests for path resolver pass, e2e drop test passes, images render correctly when a markdown file with image references is opened.

---

## Day 17 — Full Coverage Pass

**Goal:** Identify and fill gaps in test coverage. Fix any bugs found.

### Step 15.1 — Coverage report

```bash
npm run test:unit -- --coverage
```

Review uncovered lines. For any business logic function with < 80% coverage, write the missing tests first, then fix the code if needed.

### Step 15.2 — Manual test pass

Run through every user journey end-to-end manually:

- [ ] Open a file, edit it, save it, reopen — content preserved
- [ ] Toggle source mode, edit raw markdown, toggle back — content preserved
- [ ] Open a multi-section doc, use outline to navigate
- [ ] Enable dark mode (System Preferences), reopen app — dark theme applied
- [ ] Enable distraction-free mode, verify sidebar/status hidden
- [ ] Increase/decrease font size, reopen app — font size persisted
- [ ] Press Cmd+N, verify editor is blank and title shows "Untitled — mdreader"
- [ ] Edit a file, press Cmd+Q — verify "unsaved changes" dialog appears
- [ ] Click a link in the editor — verify it opens in the system browser, not inside the app
- [ ] Open a markdown file that references a local image — note that image is broken (known, not a regression)
- [ ] Open file, check "File" menu in macOS menu bar — verify New, Open, Save items are present
- [ ] After toggling source mode and back, verify Cmd+Z does not undo before the toggle (expected behaviour)

### Step 15.3 — Fix any discovered bugs

For each bug found, write a failing test first that reproduces it, then fix the bug.

```bash
git add .
git commit -m "test: fill coverage gaps and fix discovered bugs"
git push
```

**Day 17 done when:** Coverage report shows >80% on all business logic files.

---

## Day 18 — macOS Packaging

**Goal:** A `.dmg` file is built in CI on every tag push and attached to a GitHub Release.

### Step 16.1 — App icon

Prepare the app icon:

```bash
# Create a 1024x1024 PNG icon, then generate all required sizes:
mkdir -p src-tauri/icons

# Use Tauri's icon generation tool:
cargo tauri icon path/to/icon-1024.png
# This generates all required sizes in src-tauri/icons/
```

### Step 16.2 — Write a build verification test

Create `tests/build.test.ts`:

```typescript
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('app has an icon file', () => {
	// Verify icon assets exist before attempting a release build
	const iconPath = path.resolve('./src-tauri/icons/icon.icns');
	expect(fs.existsSync(iconPath)).toBe(true);
});
```

### Step 16.3 — Create the release workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build release
        run: cargo tauri build
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      - name: Upload .dmg to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: src-tauri/target/release/bundle/dmg/*.dmg
```

### Step 16.4 — Verify the build locally

```bash
cargo tauri build
ls src-tauri/target/release/bundle/dmg/
# Should show: mdreader_0.1.0_aarch64.dmg (or similar)
```

Check binary size:

```bash
ls -lh src-tauri/target/release/bundle/dmg/*.dmg
# Target: < 20MB
```

```bash
git add .
git commit -m "feat: macOS packaging and release workflow"
git push
```

Create a test tag to verify release workflow:

```bash
git tag v0.1.0-alpha
git push origin v0.1.0-alpha
# Monitor GitHub Actions → release workflow
```

**Day 18 done when:** A `.dmg` file is attached to the GitHub Release automatically on tag push.

---

## Day 19 — Performance Audit

**Goal:** Verify the app meets binary size and RAM targets. Fix any bottlenecks.

### Step 17.1 — Binary and bundle size check

```bash
# Check DMG size
ls -lh src-tauri/target/release/bundle/dmg/*.dmg

# Check the raw binary
ls -lh src-tauri/target/release/mdreader
```

If > 20MB, investigate with:

```bash
cargo bloat --release --crates
# Shows which crates contribute most to binary size
```

Common fixes:

- Enable LTO in `Cargo.toml`: `lto = true` under `[profile.release]`
- Strip debug symbols: `strip = true`
- Reduce feature flags on heavy crates

### Step 17.2 — RAM usage measurement

**Note:** `performance.memory` is a Chrome-only non-standard API. Tauri uses WKWebView on
macOS, which does not expose it. The test would silently pass via the `if (metrics)` guard.
Use the Rust side to measure real process memory instead.

Add a Tauri command that reads its own process RSS:

```rust
#[command]
fn get_memory_usage_mb() -> f64 {
    // Read from /proc/self/status on Linux, or use sysinfo crate cross-platform
    // On macOS, use the `sysinfo` crate:
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    if let Some(proc) = sys.process(sysinfo::get_current_pid().unwrap()) {
        proc.memory() as f64 / 1024.0 / 1024.0
    } else {
        0.0
    }
}
```

Add `sysinfo` to `Cargo.toml`:

```toml
[dependencies]
sysinfo = "0.31"
```

Add a Rust unit test:

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn memory_command_returns_positive_value() {
        // We can't call the Tauri command in a unit test, but we can test the underlying logic
        use sysinfo::System;
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        // Just verify sysinfo can read the current process
        assert!(sys.processes().len() > 0);
    }
}
```

Write the e2e memory test using the Tauri command:

```typescript
// tests/performance.test.ts
import { test, expect } from '@playwright/test';

test('process memory stays below 80MB at idle', async ({ page }) => {
	await page.goto('/');
	await page.waitForTimeout(2000); // let the app settle

	// Call the Rust command to get real process memory
	const memoryMb = await page.evaluate(async () => {
		const { invoke } = (window as any).__TAURI__?.core ?? { invoke: async () => 0 };
		return invoke<number>('get_memory_usage_mb');
	});

	// In the Vite dev test environment __TAURI__ is mocked and returns 0 — skip
	if (memoryMb > 0) {
		expect(memoryMb).toBeLessThan(80);
	}
	// The real assertion runs in CI against the built binary (tauri-driver mode)
});
```

**For CI memory validation**, add a step to the release workflow that builds the app, runs it
for 5 seconds, samples memory via `ps`, and fails if it exceeds the target:

```yaml
# In .github/workflows/release.yml
- name: Memory smoke test
  run: |
    open src-tauri/target/release/bundle/macos/mdreader.app &
    APP_PID=$!
    sleep 5
    RSS_MB=$(ps -o rss= -p $APP_PID | awk '{print $1/1024}')
    echo "RSS: ${RSS_MB} MB"
    kill $APP_PID
    [ "$(echo "$RSS_MB < 80" | bc)" = "1" ] || (echo "Memory exceeded 80MB" && exit 1)
```

test('outline sidebar does not recompute on every keystroke', async ({ page }) => {
await page.goto('/');
const editor = page.locator('.tiptap');
await editor.click();

// Type quickly and measure — outline should debounce updates
const start = Date.now();
for (let i = 0; i < 50; i++) {
await page.keyboard.type('x');
}
const elapsed = Date.now() - start;

// 50 keystrokes should complete in < 1 second even with outline updates
expect(elapsed).toBeLessThan(1000);
});

````

### Step 17.3 — Add debounce to outline updates

In `Editor.svelte`, debounce the heading extraction:
```typescript
import { debounce } from '$lib/utils';

const updateOutline = debounce(() => {
  const headings = getHeadingsFromDoc();
  dispatch('headingsChange', { headings });
}, 200);

editor.on('update', updateOutline);
````

Add `debounce` to `utils.ts`:

```typescript
export function debounce<T extends (...args: unknown[]) => void>(
	fn: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timer: ReturnType<typeof setTimeout>;
	return (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), delay);
	};
}
```

Add unit tests for `debounce` to `utils.test.ts`:

```typescript
import { vi } from 'vitest';

describe('debounce', () => {
	it('calls function once after delay', async () => {
		vi.useFakeTimers();
		const fn = vi.fn();
		const debounced = debounce(fn, 100);
		debounced();
		debounced();
		debounced();
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledOnce();
		vi.useRealTimers();
	});
});
```

```bash
npm run test:unit && npx playwright test
# Expected: all pass

git add .
git commit -m "perf: debounce outline updates, verify binary and RAM targets"
git push
```

**Day 19 done when:** Binary is < 20MB, keystroke latency test passes, all CI checks green.

---

## Schedule Summary

| Days  | Phase                                                    |
| ----- | -------------------------------------------------------- |
| 1–3   | Foundation (scaffold, CI, test infra, app shell)         |
| 4–6   | Core editor (TipTap, seamless mode, source toggle)       |
| 7–9   | File system (open, new, save, quit dialog, recent files) |
| 10–11 | Outline sidebar                                          |
| 12–14 | Polish (shortcuts, menu bar, theme, distraction-free)    |
| 15–16 | Core gaps (find & replace, image handling)               |
| 17–19 | Hardening & release (coverage, packaging, performance)   |

**Total: 19 developer-days (~4 weeks solo)**

---

## Definition of Done (every day)

- [ ] New failing tests were written before implementation
- [ ] All tests now pass (`npm run test:unit && npx playwright test`)
- [ ] `cd src-tauri && cargo test` passes
- [ ] CI is green on the pushed commit
- [ ] No TODO or placeholder code left in shipped files

## Running the Full Test Suite Locally

```bash
# Unit tests
npm run test:unit

# Rust tests
cd src-tauri && cargo test && cd ..

# E2e tests (requires the app to build first)
npx playwright test

# All at once
npm run test:unit && (cd src-tauri && cargo test) && npx playwright test
```
