import { test, expect } from '@playwright/test';

test('Cmd+Shift+F hides sidebar and status bar', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
	await page.keyboard.press('Meta+Shift+F');
	await expect(page.locator('[data-testid="sidebar"]')).toBeHidden();
	await expect(page.locator('[data-testid="status-bar"]')).toBeHidden();
});

test('Cmd+Shift+F again restores layout', async ({ page }) => {
	await page.goto('/');
	await page.keyboard.press('Meta+Shift+F');
	await page.keyboard.press('Meta+Shift+F');
	await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
	await expect(page.locator('[data-testid="status-bar"]')).toBeVisible();
});

test('Cmd+= increases editor font size', async ({ page }) => {
	await page.goto('/');
	await page.keyboard.press('Meta+=');
	const size = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--font-size-editor').trim()
	);
	expect(size).toBe('17px');
});
