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
