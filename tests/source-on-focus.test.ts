import { test, expect } from '@playwright/test';

async function loadContent(page: import('@playwright/test').Page, markdown: string) {
	await page.locator('[data-testid="editor-area"] .tiptap').waitFor();
	await page.evaluate(async (md) => {
		// @ts-expect-error Vite browser runtime import path
		const { getRichHandle } = await import('/src/lib/editor.ts');
		getRichHandle()?.setContent(md, { markClean: true });
	}, markdown);
}

// When cursor enters a heading, the markdown prefix (# / ## / ###) must become visible
// so the user can see and edit the raw syntax — Typora-style source-on-focus.
test('h1 shows # prefix when cursor is inside, hides when cursor leaves', async ({ page }) => {
	await page.goto('/');
	await loadContent(page, '# My Heading\n\nA paragraph below.');

	const tiptap = page.locator('[data-testid="editor-area"] .tiptap');
	const heading = tiptap.locator('h1');
	const prefix = heading.locator('.md-prefix');

	// Cursor in paragraph — prefix must be invisible
	await tiptap.locator('p').click();
	await expect(prefix).toBeHidden();

	// Cursor moves into heading — prefix must appear
	await heading.click();
	await expect(prefix).toBeVisible();

	// Cursor back to paragraph — prefix must disappear again
	await tiptap.locator('p').click();
	await expect(prefix).toBeHidden();
});

test('h2 shows ## prefix and h3 shows ### prefix when focused', async ({ page }) => {
	await page.goto('/');
	await loadContent(page, '## Section\n\n### Subsection\n\nParagraph.');

	const tiptap = page.locator('[data-testid="editor-area"] .tiptap');

	const h2 = tiptap.locator('h2');
	const h3 = tiptap.locator('h3');

	await tiptap.locator('p').click();

	// h2 prefix hidden while cursor is in paragraph
	await expect(h2.locator('.md-prefix')).toBeHidden();

	// Move into h2
	await h2.click();
	await expect(h2.locator('.md-prefix')).toBeVisible();
	await expect(h2.locator('.md-prefix')).toContainText('##');

	// Move into h3
	await h3.click();
	await expect(h3.locator('.md-prefix')).toBeVisible();
	await expect(h3.locator('.md-prefix')).toContainText('###');

	// h2 prefix hidden again
	await expect(h2.locator('.md-prefix')).toBeHidden();
});

// Typing inside the active heading must not corrupt the content.
// After moving away and back, the prefix count must still be correct.
test('editing inside focused heading keeps content correct', async ({ page }) => {
	await page.goto('/');
	await loadContent(page, '# Original\n\nParagraph.');

	const tiptap = page.locator('[data-testid="editor-area"] .tiptap');
	const heading = tiptap.locator('h1');

	await heading.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' Edited');

	// Still an h1 with prefix visible while cursor remains inside
	await expect(heading.locator('.md-prefix')).toBeVisible();

	// Move out — heading still rendered as h1 with updated text
	await tiptap.locator('p').click();
	await expect(heading).toContainText('Original Edited');
	await expect(heading.locator('.md-prefix')).toBeHidden();
});
