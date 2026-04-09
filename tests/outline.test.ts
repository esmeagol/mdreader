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
