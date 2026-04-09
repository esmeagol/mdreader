import { test, expect } from '@playwright/test';

test('clicking a recent file opens that file directly', async ({ page }) => {
	await page.addInitScript(() => {
		type Call = { cmd: string; payload: Record<string, unknown> | undefined };
		(window as Window & { __TAURI_CALLS__?: Call[] }).__TAURI_CALLS__ = [];

		(
			window as Window & {
				__TAURI_INTERNALS__?: {
					metadata?: { currentWindow: { label: string } };
					invoke: (cmd: string, payload?: Record<string, unknown>) => Promise<unknown>;
				};
			}
		).__TAURI_INTERNALS__ = {
			metadata: { currentWindow: { label: 'main' } },
			invoke: async (cmd: string, payload?: Record<string, unknown>) => {
				(window as Window & { __TAURI_CALLS__?: Call[] }).__TAURI_CALLS__?.push({ cmd, payload });

				if (cmd === 'get_recent_files') return ['/tmp/recent.md'];
				if (cmd === 'open_file') return '# Recent Heading';

				// Dialog open/save should not be used by recent-file click path.
				return null;
			}
		};
	});

	await page.goto('/');
	const recentItem = page.getByRole('button', { name: 'recent.md' });
	await expect(recentItem).toBeVisible();

	await recentItem.click();

	// Expected behavior: clicking a recent item calls open_file with that path.
	const calls = await page.evaluate(() => {
		type Call = { cmd: string; payload: Record<string, unknown> | undefined };
		return ((window as Window & { __TAURI_CALLS__?: Call[] }).__TAURI_CALLS__ ?? []).filter(
			(c) => c.cmd === 'open_file'
		);
	});

	expect(calls).toContainEqual({ cmd: 'open_file', payload: { path: '/tmp/recent.md' } });
});
