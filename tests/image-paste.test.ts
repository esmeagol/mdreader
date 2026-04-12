import { test, expect } from '@playwright/test';

async function loadContent(
	page: import('@playwright/test').Page,
	markdown: string,
	filePath = '/tmp/test.md'
) {
	await page.locator('[data-testid="editor-area"] .tiptap').waitFor();
	await page.evaluate(
		async ({ md, path }) => {
			// @ts-expect-error Vite browser runtime import path
			const { getRichHandle } = await import('/src/lib/editor.ts');
			// @ts-expect-error Vite browser runtime import path
			const { document } = await import('/src/lib/stores/document.ts');
			// Load path FIRST so the NodeView's get(doc).filePath is correct when
			// setContent triggers node rendering.
			document.load(path);
			getRichHandle()?.setContent(md, { markClean: true });
		},
		{ md: markdown, path: filePath }
	);
}

// When an image URL cannot be loaded (404, bad scheme, etc.) the editor must show
// a visible text fallback so the user knows what content is missing and can edit the markdown.
test('broken image shows fallback with alt text', async ({ page }) => {
	await page.goto('/');
	await loadContent(page, '![Cache diagram](https://localhost:0/nonexistent.png)');

	// Wait for the error event — the img should be hidden and fallback shown
	const fallback = page.locator('[data-testid="editor-area"] .tiptap .image-fallback');
	await expect(fallback).toBeVisible({ timeout: 5000 });
	await expect(fallback).toContainText('Cache diagram');
});

test('broken image with no alt text shows filename in fallback', async ({ page }) => {
	await page.goto('/');
	await loadContent(page, '![](https://localhost:0/Redis1.png)');

	const fallback = page.locator('[data-testid="editor-area"] .tiptap .image-fallback');
	await expect(fallback).toBeVisible({ timeout: 5000 });
	await expect(fallback).toContainText('Redis1.png');
});

test('image markdown renders as img element', async ({ page }) => {
	await page.goto('/');
	await loadContent(page, '![alt text](https://example.com/image.png)');
	// Verify Image extension is registered: img node must appear in the editor DOM
	await expect(page.locator('[data-testid="editor-area"] .tiptap img')).toHaveCount(1);
});

// The NodeView resolves relative src to asset:// at render time using the open file path.
// The ProseMirror model keeps the original "Redis1.png" so source mode and saving are clean.
//
// NOTE: these tests run in a plain Chromium browser (no Tauri). They verify that the NodeView
// constructs the correct asset:// URL string. Whether that URL actually serves the image is a
// Tauri runtime concern and is not tested here — that requires a full packaged app.
test('relative image src is resolved to asset:// in the rendered img element', async ({ page }) => {
	await page.goto('/');

	const filePath = '/Users/test/Notes/Redis.md';
	// Raw markdown — no asset:// URL, just a plain relative filename
	await loadContent(page, '# Redis\n\n![Cache diagram](Redis1.png)', filePath);

	const img = page.locator('[data-testid="editor-area"] .tiptap img');
	await expect(img).toHaveCount(1);

	// The NodeView must have resolved the src to an asset:// URL for Tauri to serve it
	const src = await img.getAttribute('src');
	const expected = `asset://localhost/${encodeURIComponent('/Users/test/Notes/Redis1.png')}`;
	expect(src).toBe(expected);
});

// Spaces in directory names must be percent-encoded so the WebView URL is valid.
// Same non-Tauri caveat as above — tests URL string construction only.
test('NodeView encodes spaces in path when resolving to asset:// URL', async ({ page }) => {
	await page.goto('/');

	const filePath = '/Interview Prep/System Design/Redis.md';
	await loadContent(page, '![alt](Redis1.png)', filePath);

	const img = page.locator('[data-testid="editor-area"] .tiptap img');
	await expect(img).toHaveCount(1);

	const src = await img.getAttribute('src');
	const expected = `asset://localhost/${encodeURIComponent('/Interview Prep/System Design/Redis1.png')}`;
	expect(src).toBe(expected);
	expect(src).not.toContain(' ');
});
