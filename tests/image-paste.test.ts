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
			getRichHandle()?.setContent(md, { markClean: true });
			document.load(path);
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

// Simulates the exact flow that happens when fileService.openFile() loads a file:
// resolveImages rewrites relative src → asset:// URL, setContent loads it into TipTap.
// This test verifies that the asset:// src survives the full parse→render round-trip.
test('resolveImages output sets correct asset:// src on img element', async ({ page }) => {
	await page.goto('/');

	const filePath = '/Users/test/Notes/Redis.md';
	const rawMarkdown = '# Redis\n\n![Cache diagram](Redis1.png)\n\nSome text';

	// Apply resolveImages exactly as fileService does, then load into editor
	const resolvedMarkdown = await page.evaluate(
		async ({ md, fp }) => {
			// @ts-expect-error Vite browser runtime import path
			const { resolveImages } = await import('/src/lib/utils.ts');
			return resolveImages(md, fp);
		},
		{ md: rawMarkdown, fp: filePath }
	);

	// Tauri asset handler strips the leading "/" from the URL path then decodes.
	// So the full absolute path must be encodeURIComponent'd as one token.
	const expectedEncoded = encodeURIComponent('/Users/test/Notes/Redis1.png');
	expect(resolvedMarkdown).toContain(`asset://localhost/${expectedEncoded}`);

	await loadContent(page, resolvedMarkdown, filePath);

	const img = page.locator('[data-testid="editor-area"] .tiptap img');
	await expect(img).toHaveCount(1);

	// The src attribute must contain the asset:// URL — this is what Tauri will serve
	const src = await img.getAttribute('src');
	expect(src).toContain('asset://localhost');
	expect(src).toContain('Redis1.png');
});

// Verify that paths with spaces survive the full encode→TipTap→src round-trip
test('resolveImages encodes full path so spaces become %20 in img src', async ({ page }) => {
	await page.goto('/');

	const filePath = '/Interview Prep/System Design/Redis.md';
	const rawMarkdown = '![alt](Redis1.png)';

	const resolvedMarkdown = await page.evaluate(
		async ({ md, fp }) => {
			// @ts-expect-error Vite browser runtime import path
			const { resolveImages } = await import('/src/lib/utils.ts');
			return resolveImages(md, fp);
		},
		{ md: rawMarkdown, fp: filePath }
	);

	// Full absolute path encoded as one token — slashes become %2F, spaces %20
	const expected = `asset://localhost/${encodeURIComponent('/Interview Prep/System Design/Redis1.png')}`;
	expect(resolvedMarkdown).toBe(`![alt](${expected})`);

	await loadContent(page, resolvedMarkdown, filePath);

	const img = page.locator('[data-testid="editor-area"] .tiptap img');
	await expect(img).toHaveCount(1);

	const src = await img.getAttribute('src');
	// src must not contain bare spaces — Tauri's URL parser would reject them
	expect(src).not.toContain(' ');
});
