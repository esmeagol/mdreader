import { test, expect } from '@playwright/test';

test('app window opens with correct title', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle('Untitled — mdreader');
});

test('app launches without console errors about permissions', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text());
	});
	await page.goto('/');
	await page.waitForTimeout(500);
	const permissionErrors = errors.filter(
		(e) => e.includes('not allowed') || e.includes('capability')
	);
	expect(permissionErrors).toHaveLength(0);
});
