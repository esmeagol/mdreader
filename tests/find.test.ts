import { test, expect } from '@playwright/test';

/** Wait for SvelteKit client-side hydration before issuing keyboard shortcuts. */
async function waitForHydration(page: import('@playwright/test').Page) {
	await page.waitForFunction(() => document.title !== '');
}

test('Cmd+F shows find bar', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);
	await page.keyboard.press('Meta+f');
	await expect(page.locator('[data-testid="find-bar"]')).toBeVisible();
});

test('Cmd+F again hides find bar', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);
	await page.keyboard.press('Meta+f');
	await expect(page.locator('[data-testid="find-bar"]')).toBeVisible();
	await page.keyboard.press('Meta+f');
	await expect(page.locator('[data-testid="find-bar"]')).toBeHidden();
});

test('Cmd+H shows find bar with replace visible', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);
	await page.keyboard.press('Meta+h');
	await expect(page.locator('[data-testid="find-bar"]')).toBeVisible();
	await expect(page.locator('[data-testid="replace-input"]')).toBeVisible();
});

test('find highlights matching text', async ({ page }) => {
	await page.goto('/');
	await page.locator('.tiptap').click();
	await page.keyboard.type('hello world hello');
	await page.keyboard.press('Meta+f');
	await page.locator('[data-testid="find-input"]').fill('hello');
	const marks = page.locator('.tiptap mark');
	await expect(marks).toHaveCount(2);
});
