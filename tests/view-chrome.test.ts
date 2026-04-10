import { test, expect } from '@playwright/test';

/**
 * SvelteKit SSR renders the DOM before Svelte hydrates on the client.
 * The <svelte:window onkeydown> handler is not registered until hydration runs.
 * Waiting for document.title to be non-empty is a reliable proxy: it's set
 * by a $effect that only runs after client-side hydration completes.
 */
async function waitForHydration(page: import('@playwright/test').Page) {
	await page.waitForFunction(() => document.title !== '');
}

test('Cmd+Shift+F hides sidebar and status bar', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);
	await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
	await page.keyboard.press('Meta+Shift+F');
	await expect(page.locator('[data-testid="sidebar"]')).toBeHidden();
	await expect(page.locator('[data-testid="status-bar"]')).toBeHidden();
});

test('Cmd+Shift+F again restores layout', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);
	await page.keyboard.press('Meta+Shift+F');
	await page.keyboard.press('Meta+Shift+F');
	await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
	await expect(page.locator('[data-testid="status-bar"]')).toBeVisible();
});

test('Cmd+= increases editor font size', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);
	await page.keyboard.press('Meta+=');
	const size = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--font-size-editor').trim()
	);
	expect(size).toBe('17px');
});
