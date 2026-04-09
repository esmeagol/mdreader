import { test, expect } from '@playwright/test';

test('sidebar shows headings from document', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('# First Heading');
	await page.keyboard.press('Enter');
	await page.keyboard.type('## Second Heading');

	const sidebar = page.locator('[data-testid="sidebar"]');
	await expect(sidebar).toContainText('First Heading');
	await expect(sidebar).toContainText('Second Heading');
});

test('heading elements have id attributes matching their slug', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('# Hello World');
	await page.keyboard.press('Enter');
	await page.keyboard.type('## Sub Section');

	await expect(page.locator('.tiptap h1')).toHaveAttribute('id', 'hello-world');
	await expect(page.locator('.tiptap h2')).toHaveAttribute('id', 'sub-section');
});

test('heading id updates when text changes', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('# Initial Title');

	await expect(page.locator('.tiptap h1')).toHaveAttribute('id', 'initial-title');

	// Move to end and append text
	await page.keyboard.press('End');
	await page.keyboard.type(' Updated');

	await expect(page.locator('.tiptap h1')).toHaveAttribute('id', 'initial-title-updated');
});
