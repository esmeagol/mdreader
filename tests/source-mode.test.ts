import { test, expect } from '@playwright/test';

test('Cmd+/ toggles to source mode showing raw markdown', async ({ page }) => {
	await page.goto('/');
	const editorArea = page.locator('[data-testid="editor-area"]');

	await editorArea.locator('.tiptap').click();
	await page.keyboard.type('# My Heading');
	await expect(editorArea.locator('h1')).toBeVisible();

	await page.keyboard.press('Meta+/');

	await expect(editorArea.locator('h1')).not.toBeVisible();
	await expect(editorArea.locator('[data-testid="source-editor"]')).toBeVisible();
});

test('toggling back to rich mode preserves content', async ({ page }) => {
	await page.goto('/');
	const editorArea = page.locator('[data-testid="editor-area"]');

	await editorArea.locator('.tiptap').click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('# Preserved Heading');

	await page.keyboard.press('Meta+/');
	await page.keyboard.press('Meta+/');

	await expect(editorArea.locator('h1')).toContainText('Preserved Heading');
});

test('undo history is preserved after round-trip through source mode without edits', async ({
	page
}) => {
	// Both panes stay mounted (CSS hidden), so TipTap's undo stack survives
	// a mode toggle that doesn't change content.
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('Original text');

	await page.keyboard.press('Meta+/');
	await page.keyboard.press('Meta+/');

	// Undo should work — the typing is still in the undo stack
	await page.keyboard.press('Meta+z');
	await expect(editor).not.toContainText('Original text');
});

test('editing in source mode updates rich mode rendering after toggle back', async ({ page }) => {
	await page.goto('/');
	const editorArea = page.locator('[data-testid="editor-area"]');

	await editorArea.locator('.tiptap').click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('# Initial Heading');
	await expect(editorArea.locator('h1')).toContainText('Initial Heading');

	await page.keyboard.press('Meta+/');
	const sourceContent = editorArea.locator('[data-testid="source-editor"] .cm-content');
	await expect(sourceContent).toBeVisible();
	await sourceContent.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.insertText('# Updated Heading\n');
	await expect(sourceContent).toContainText('Updated Heading');

	await page.keyboard.press('Meta+/');
	await expect(editorArea.locator('[data-testid="source-editor"]')).not.toBeVisible();
	await expect(editorArea.locator('h1')).toContainText('Updated Heading');
});
