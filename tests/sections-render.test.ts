import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

const fixturePath = join(process.cwd(), 'tests/fixtures/multi-section.md');

function extractHeadings(
	md: string
): { tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'; text: string }[] {
	const out: { tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'; text: string }[] = [];
	let inFence = false;
	for (const raw of md.split('\n')) {
		const line = raw.trimEnd();
		if (line.trimStart().startsWith('```')) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const m = /^(#{1,6})\s+(.+)$/.exec(line);
		if (!m) continue;
		const level = m[1].length as 1 | 2 | 3 | 4 | 5 | 6;
		out.push({ tag: `h${level}`, text: m[2].trim() });
	}
	return out;
}

async function loadFixture(page: import('@playwright/test').Page, markdown: string) {
	await page.locator('[data-testid="editor-area"] .tiptap').waitFor();
	await page.evaluate(async ({ md, path }) => {
		// @ts-expect-error Vite browser runtime import path
		const { getRichHandle } = await import('/src/lib/editor.ts');
		// @ts-expect-error Vite browser runtime import path
		const { document } = await import('/src/lib/stores/document.ts');
		getRichHandle()?.setContent(md, { markClean: true });
		document.load(path);
	}, { md: markdown, path: '/tmp/multi-section.md' });
}

test('multi-section markdown file renders every heading in order', async ({ page }) => {
	const md = readFileSync(fixturePath, 'utf8');
	const expected = extractHeadings(md);
	expect(expected.length).toBeGreaterThan(0);

	await page.goto('/');
	await loadFixture(page, md);

	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	const headings = editor.locator('h1, h2, h3, h4, h5, h6');
	await expect(headings).toHaveCount(expected.length);

	for (let i = 0; i < expected.length; i++) {
		const { tag, text } = expected[i];
		const el = headings.nth(i);
		await expect(el).toHaveJSProperty('tagName', tag.toUpperCase());
		await expect(el).toContainText(text);
	}
});

test('multi-section fixture renders body content for each major section', async ({ page }) => {
	const md = readFileSync(fixturePath, 'utf8');
	await page.goto('/');
	await loadFixture(page, md);

	const editor = page.locator('[data-testid="editor-area"] .tiptap');

	await expect(editor.locator('strong')).toContainText('bold words');
	await expect(editor.locator('a[href="https://example.org"]')).toContainText('link');

	await expect(editor.locator('ul li')).toHaveCount(2);
	await expect(editor.locator('ul li').nth(0)).toContainText('First bullet');
	await expect(editor.locator('ul li').nth(1)).toContainText('Second bullet');

	await expect(editor.locator('blockquote')).toContainText('A blockquote in gamma.');
	await expect(editor.locator('pre code')).toContainText('const fenced = true;');
});
