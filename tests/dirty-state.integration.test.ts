/**
 * Integration coverage for document dirty state: store → editors → layout title.
 *
 * Runs against the Vite dev server (same as other Playwright tests). This exercises the
 * fixes for false dirty flags (TipTap emitUpdate, CodeMirror suppress, handleChange guard).
 *
 * Not covered here (requires the Tauri binary + native APIs):
 * - `invoke('save_file')` / `invoke('open_file')`
 * - `getCurrentWindow().onCloseRequested()` / quit confirmation
 * Use manual QA or a WebDriver-driven Tauri build for those.
 */

import { test, expect } from '@playwright/test';

async function loadViaStore(
	page: import('@playwright/test').Page,
	markdown: string,
	filePath: string
) {
	await page.evaluate(
		async ({ md, path }) => {
			// @ts-expect-error Vite browser runtime import path
			const { document } = await import('/src/lib/stores/document.ts');
			// @ts-expect-error Vite browser runtime import path
			const { getRichHandle } = await import('/src/lib/editor.ts');
			getRichHandle()?.setContent(md, { markClean: true });
			document.load(path);
		},
		{ md: markdown, path: filePath }
	);
}

test('loaded file shows clean title (no dirty bullet) without user edits', async ({ page }) => {
	await page.goto('/');
	await loadViaStore(page, '# Hello\n\nBody text.', '/Users/example/Documents/Chapter.md');
	await expect(page).toHaveTitle('Chapter.md — mdreader');
});

test('loaded file shows dirty title after user types', async ({ page }) => {
	await page.goto('/');
	await loadViaStore(page, '# Hello', '/tmp/notes.md');

	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.type('!');

	await expect(page).toHaveTitle('• notes.md — mdreader');
});

test('rich editor programmatic sync does not flip dirty until real edit', async ({ page }) => {
	await page.goto('/');
	await loadViaStore(page, 'First', '/var/project/readme.md');
	await expect(page).toHaveTitle('readme.md — mdreader');

	await loadViaStore(page, 'Replaced body', '/var/project/readme.md');
	await expect(page).toHaveTitle('readme.md — mdreader');

	await page.locator('[data-testid="editor-area"] .tiptap').click();
	await page.keyboard.type('X');
	await expect(page).toHaveTitle('• readme.md — mdreader');
});
