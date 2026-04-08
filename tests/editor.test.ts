import { test, expect } from '@playwright/test';

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
