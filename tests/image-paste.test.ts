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

test('image markdown renders as img element', async ({ page }) => {
	await page.goto('/');
	await loadContent(page, '![alt text](https://example.com/image.png)');
	// Verify Image extension is registered: img node must appear in the editor DOM
	await expect(page.locator('[data-testid="editor-area"] .tiptap img')).toHaveCount(1);
});
