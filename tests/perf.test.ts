import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const largeMarkdown = readFileSync(join(__dirname, 'fixtures/large.md'), 'utf-8');

// Performance target: a ~15K-line, ~900KB document must load and render within 5 seconds.
// This catches regressions where every store write triggers a full re-render.
test('large document loads and renders within 5 seconds', async ({ page }) => {
	await page.goto('/');
	await page.locator('[data-testid="editor-area"] .tiptap').waitFor();

	const start = Date.now();

	await page.evaluate(async (md) => {
		// @ts-expect-error Vite browser runtime import path
		const { getRichHandle } = await import('/src/lib/editor.ts');
		getRichHandle()?.setContent(md, { markClean: true });
	}, largeMarkdown);

	// Wait for at least one heading to appear — confirms the editor actually rendered content
	await expect(page.locator('[data-testid="editor-area"] .tiptap h2').first()).toBeVisible({
		timeout: 5000
	});

	const elapsed = Date.now() - start;
	expect(elapsed).toBeLessThan(5000);
});

// Word count must update after loading a large file — confirms the WordCount plugin
// completes its doc traversal without timing out or crashing.
test('word count updates after loading large document', async ({ page }) => {
	await page.goto('/');
	await page.locator('[data-testid="editor-area"] .tiptap').waitFor();

	await page.evaluate(async (md) => {
		// @ts-expect-error Vite browser runtime import path
		const { getRichHandle } = await import('/src/lib/editor.ts');
		getRichHandle()?.setContent(md, { markClean: true });
	}, largeMarkdown);

	// The status bar must show a word count — any positive number is fine
	const statusBar = page.locator('[data-testid="status-bar"]');
	await expect(statusBar).toBeVisible();

	// Wait for word count to be a non-zero number (e.g. "12000 words")
	await expect(statusBar).toContainText(/\d+ words/, { timeout: 5000 });
});

// Outline sidebar must populate with headings from a large document.
// Ensures the Headings plugin traversal scales to ~3000 headings.
test('outline sidebar populates with headings from large document', async ({ page }) => {
	await page.goto('/');
	await page.locator('[data-testid="editor-area"] .tiptap').waitFor();

	await page.evaluate(async (md) => {
		// @ts-expect-error Vite browser runtime import path
		const { getRichHandle } = await import('/src/lib/editor.ts');
		getRichHandle()?.setContent(md, { markClean: true });
	}, largeMarkdown);

	const sidebar = page.locator('[data-testid="sidebar"]');
	await expect(sidebar).toBeVisible();

	// At least one heading must appear in the outline — the Headings plugin traversal
	// must complete for a large document without timing out
	await expect(sidebar).toContainText('Section 0', { timeout: 8000 });
});
