/**
 * File operation tests: open, save, dirty-state guards.
 *
 * Runs against the Vite dev server. Tauri-specific flows (actual invoke calls,
 * native file dialogs) are manual QA items — noted inline where applicable.
 */

import { test, expect } from '@playwright/test';

test('opening a file when dirty prompts for confirmation', async ({ page }) => {
	await page.goto('/');

	// Make the document dirty
	const editor = page.locator('[data-testid="editor-area"] .tiptap');
	await editor.click();
	await page.keyboard.type('unsaved work');
	await expect(page).toHaveTitle('• Untitled — mdreader');

	// Cmd+O while dirty should show a confirm dialog before proceeding.
	// Use page.once so the handler auto-dismisses (unblocking keyboard.press)
	// and we can inspect the dialog after the fact.
	let capturedDialog: import('@playwright/test').Dialog | null = null;
	page.once('dialog', (d) => {
		capturedDialog = d;
		d.dismiss();
	});

	await page.keyboard.press('Meta+o');

	expect(capturedDialog).not.toBeNull();
	expect(capturedDialog!.type()).toBe('confirm');

	// User dismissed — document stays dirty
	await expect(page).toHaveTitle('• Untitled — mdreader');
});

test('save error is shown in status bar', async ({ page }) => {
	await page.goto('/');

	// Inject a save error via the store
	await page.evaluate(async () => {
		// @ts-expect-error Vite browser runtime import path
		const { document } = await import('/src/lib/stores/document.ts');
		document.markSaveError('Disk full');
	});

	await expect(page.locator('[data-testid="status-bar"]')).toContainText('Disk full');
});

test('save error clears after markSaved', async ({ page }) => {
	await page.goto('/');

	await page.evaluate(async () => {
		// @ts-expect-error Vite browser runtime import path
		const { document } = await import('/src/lib/stores/document.ts');
		document.markSaveError('Disk full');
		document.markSaved();
	});

	await expect(page.locator('[data-testid="status-bar"]')).not.toContainText('Disk full');
});

test('sidebar recent list updates when filePath changes', async ({ page }) => {
	await page.goto('/');

	// Initially no recent section
	await expect(page.locator('[data-testid="sidebar"] .recent')).not.toBeVisible();

	// Simulate a file being loaded (as openFile would do in Tauri runtime)
	await page.evaluate(async () => {
		// @ts-expect-error Vite browser runtime import path
		const { document } = await import('/src/lib/stores/document.ts');
		// @ts-expect-error Vite browser runtime import path
		const { recentFiles } = await import('/src/lib/stores/recentFiles.ts');
		document.load('# Hello', '/tmp/notes.md');
		recentFiles.prepend('/tmp/notes.md');
	});

	await expect(page.locator('[data-testid="sidebar"] .recent')).toBeVisible();
	await expect(page.locator('[data-testid="sidebar"] .recent')).toContainText('notes.md');
});

test('opening a file when clean skips confirmation', async ({ page }) => {
	await page.goto('/');

	// Document is clean — Cmd+O should NOT show a confirm dialog
	// (it will silently return because Tauri runtime is not available in Vite)
	let dialogFired = false;
	page.on('dialog', () => {
		dialogFired = true;
	});

	await page.keyboard.press('Meta+o');
	await page.waitForTimeout(500);

	expect(dialogFired).toBe(false);
});
