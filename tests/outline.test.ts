import { test, expect } from '@playwright/test';

async function loadContent(
	page: import('@playwright/test').Page,
	markdown: string,
	filePath = '/tmp/test.md'
) {
	await page.evaluate(
		async ({ md, path }) => {
			// @ts-expect-error Vite browser runtime import path
			const { getRichHandle } = await import('/src/lib/editor.ts');
			// @ts-expect-error Vite browser runtime import path
			const { document } = await import('/src/lib/stores/document.ts');
			getRichHandle()?.setContent(md, { markClean: true });
			document.load(path);
		},
		{ md: markdown, path: filePath }
	);
}

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

test('clicking a heading in sidebar scrolls to its own instance, not the first text match', async ({
	page
}) => {
	// An h1 and an h2 share the same text "Overview". The text-match approach
	// (querySelectorAll + find by textContent) always returns the first DOM match (the h1),
	// so clicking the h2 sidebar button incorrectly scrolls to the h1.
	// The id-based approach uses the unique slugified id stamped by the Headings PM plugin,
	// so clicking the h2 button correctly scrolls to the h2.
	const filler = ('word '.repeat(60) + '\n\n').repeat(8); // push h2 below the fold
	const md = `# Overview\n\n${filler}## Overview\n\nThis is the subsection.`;

	await page.goto('/');
	await page.locator('.tiptap').waitFor();
	await loadContent(page, md, '/tmp/duplicate-headings.md');

	// Sidebar must show two buttons: one for h1, one for h2 (different levels → different keys)
	const sidebarButtons = page.locator('[data-testid="sidebar"] .outline button');
	await expect(sidebarButtons).toHaveCount(2);

	// Start at top — h1 is visible, h2 is below the fold
	await page.evaluate(() => {
		document.querySelector<HTMLElement>('.zone-editor')?.scrollTo({ top: 0 });
	});
	await expect(page.locator('.tiptap h2')).not.toBeInViewport();

	// Click the second sidebar button (the h2 "Overview")
	await sidebarButtons.nth(1).click();

	// The h2 should now be in the viewport
	await expect(page.locator('.tiptap h2')).toBeInViewport();
});

test('active heading is highlighted in sidebar on scroll', async ({ page }) => {
	await page.goto('/');
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('# First\n\n' + 'paragraph\n\n'.repeat(20) + '## Second');

	const secondItem = page.locator('[data-testid="sidebar"]').getByText('Second');
	await expect(secondItem).not.toHaveClass(/active/);

	await page.locator('.zone-editor').evaluate((el) => {
		el.scrollTop = el.scrollHeight;
	});

	await expect(secondItem).toHaveClass(/active/);
});
