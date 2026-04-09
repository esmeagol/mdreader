import { test, expect } from '@playwright/test';

test('app has sidebar panel', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
});

test('app has editor panel', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('[data-testid="editor-area"]')).toBeVisible();
});

test('app has status bar', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('[data-testid="status-bar"]')).toBeVisible();
});

test('status bar shows Untitled when no file is open', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('[data-testid="document-title"]')).toContainText('Untitled');
});

test('sidebar is to the left of editor', async ({ page }) => {
	await page.goto('/');
	const sidebar = await page.locator('[data-testid="sidebar"]').boundingBox();
	const editor = await page.locator('[data-testid="editor-area"]').boundingBox();
	expect(sidebar!.x).toBeLessThan(editor!.x);
});

test('status bar is below editor', async ({ page }) => {
	await page.goto('/');
	const editor = await page.locator('[data-testid="editor-area"]').boundingBox();
	const statusBar = await page.locator('[data-testid="status-bar"]').boundingBox();
	expect(editor!.y).toBeLessThan(statusBar!.y);
});
