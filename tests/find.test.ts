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

// Navigation: ↓ (Next) must move the cursor to the next match, cycling through all.
test('Next button moves cursor to next match', async ({ page }) => {
	await page.goto('/');
	await page.locator('.tiptap').click();
	await page.keyboard.type('foo bar foo baz foo');
	await page.keyboard.press('Meta+f');
	await page.locator('[data-testid="find-input"]').fill('foo');
	await expect(page.locator('.tiptap mark')).toHaveCount(3);

	// Move to first match
	await page.locator('[title="Next match"]').click();
	// Cursor should be inside a mark — ProseMirror selection is at first match
	const sel1 = await page.evaluate(() => window.getSelection()?.toString());
	expect(sel1).toBe('foo');

	// Move to second match
	await page.locator('[title="Next match"]').click();
	const sel2 = await page.evaluate(() => window.getSelection()?.toString());
	expect(sel2).toBe('foo');
});

// Previous button navigates backwards through matches.
test('Prev button moves cursor to previous match', async ({ page }) => {
	await page.goto('/');
	await page.locator('.tiptap').click();
	await page.keyboard.type('cat dog cat');
	await page.keyboard.press('Meta+f');
	await page.locator('[data-testid="find-input"]').fill('cat');
	await expect(page.locator('.tiptap mark')).toHaveCount(2);

	// Jump to last match via Prev (wraps from start to end)
	await page.locator('[title="Previous match"]').click();
	const sel = await page.evaluate(() => window.getSelection()?.toString());
	expect(sel).toBe('cat');
});

// Replace one: replaces the current match and moves to next.
test('Replace button replaces current match', async ({ page }) => {
	await page.goto('/');
	await page.locator('.tiptap').click();
	await page.keyboard.type('alpha beta alpha');
	await page.keyboard.press('Meta+h');
	await page.locator('[data-testid="find-input"]').fill('alpha');
	await page.locator('[data-testid="replace-input"]').fill('gamma');

	// Navigate to first match
	await page.locator('[title="Next match"]').click();
	// Replace it
	await page.locator('button', { hasText: 'Replace' }).click();

	await expect(page.locator('.tiptap')).toContainText('gamma');
	// One match remains (the second 'alpha')
	await expect(page.locator('.tiptap mark')).toHaveCount(1);
});

// Replace all: replaces every match in the document at once.
test('Replace All replaces every match', async ({ page }) => {
	await page.goto('/');
	await page.locator('.tiptap').click();
	await page.keyboard.type('one two one two one');
	await page.keyboard.press('Meta+h');
	await page.locator('[data-testid="find-input"]').fill('one');
	await page.locator('[data-testid="replace-input"]').fill('three');

	await page.locator('button', { hasText: 'All' }).click();

	// All 'one' replaced, no marks left
	await expect(page.locator('.tiptap mark')).toHaveCount(0);
	await expect(page.locator('.tiptap')).not.toContainText('one');
	await expect(page.locator('.tiptap')).toContainText('three');
});
