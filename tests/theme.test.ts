import { test, expect } from '@playwright/test';

test.describe('dark color scheme', () => {
	test.use({ colorScheme: 'dark' });

	test('dark theme applies dark background', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		const bg = await page
			.locator('body')
			.evaluate((el) => getComputedStyle(el).getPropertyValue('--color-bg').trim());
		expect(bg).toBe('#1e1e1e');
	});
});

test.describe('light color scheme', () => {
	test.use({ colorScheme: 'light' });

	test('light theme applies light background', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		const bg = await page
			.locator('body')
			.evaluate((el) => getComputedStyle(el).getPropertyValue('--color-bg').trim());
		expect(bg).toBe('#ffffff');
	});
});

test.describe('manual theme override', () => {
	test.use({ colorScheme: 'dark' });

	test('Cmd+Shift+T switches from system dark to forced light', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await page.keyboard.press('Meta+Shift+T');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		const bg = await page
			.locator('body')
			.evaluate((el) => getComputedStyle(el).getPropertyValue('--color-bg').trim());
		expect(bg).toBe('#ffffff');
	});
});
