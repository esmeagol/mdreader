import { test, expect } from '@playwright/test';

// Push markdown content into the editor the same way openFile() does in production:
// set content via the EditorHandle singleton, then update the store's metadata.
async function loadContent(
	page: import('@playwright/test').Page,
	markdown: string,
	filePath = '/tmp/test.md'
) {
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

test('editor is visible and focusable', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await expect(editor).toBeVisible();
	await editor.click();
	await expect(editor).toBeFocused();
});

test('heading markdown renders as h1 element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.type('# My Heading');
	await page.keyboard.press('Enter');
	await expect(editor.locator('h1')).toContainText('My Heading');
});

test('bold markdown renders as strong element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.type('**bold text**');
	await page.keyboard.press(' ');
	await expect(editor.locator('strong')).toContainText('bold text');
});

test('typing updates word count in status bar', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('hello world foo');
	await expect(page.locator('[data-testid="status-bar"]')).toContainText('3 words');
});

test('code block renders as pre/code element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.type('```javascript');
	await page.keyboard.press('Enter');
	await page.keyboard.type('const x = 1;');
	await expect(editor.locator('pre code')).toContainText('const x = 1;');
});

test('strikethrough renders as s element', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.type('~~struck~~');
	await page.keyboard.press(' ');
	await expect(editor.locator('s')).toContainText('struck');
});

test('external document store load syncs rich editor content', async ({ page }) => {
	await page.goto('/');
	await loadContent(page, '# Loaded Heading\n\nThis is **loaded** content.', '/tmp/loaded.md');

	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await expect(editor.locator('h1')).toContainText('Loaded Heading');
	await expect(editor.locator('strong')).toContainText('loaded');
});

test('clicking rendered links does not navigate app window', async ({ page }) => {
	await page.goto('/');
	await loadContent(page, '[Example](https://example.com)', '/tmp/link.md');

	const link = page.locator('[data-testid="editor-area"] .tiptap a[href="https://example.com"]');
	await expect(link).toBeVisible();
	await link.click();
	await expect(page).toHaveURL(/\/$/);
});

test('typing marks document dirty and updates title', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle('Untitled — mdreader');

	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('dirty now');

	await expect(page).toHaveTitle('• Untitled — mdreader');
});

test('markdown table renders as table in rich mode', async ({ page }) => {
	await page.goto('/');
	await loadContent(
		page,
		'| Name | Role |\n| --- | --- |\n| Alice | Engineer |',
		'/tmp/table.md'
	);

	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await expect(editor.locator('table')).toBeVisible();
	await expect(editor.locator('th')).toContainText(['Name', 'Role']);
	await expect(editor.locator('td')).toContainText(['Alice', 'Engineer']);
});

test('table cells preserve inline markdown formatting', async ({ page }) => {
	await page.goto('/');
	await loadContent(
		page,
		'| Name | Notes |\n| --- | --- |\n| Alice | **Strong** and *italic* |',
		'/tmp/table-format.md'
	);

	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await expect(editor.locator('table strong')).toContainText('Strong');
	await expect(editor.locator('table em')).toContainText('italic');
});
