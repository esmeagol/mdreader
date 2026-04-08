import type { Page } from '@playwright/test';

type TauriOverrides = Record<string, ((args: unknown) => unknown) | unknown>;

export async function mockTauriApi(page: Page, overrides: TauriOverrides = {}) {
	await page.addInitScript((overrides: TauriOverrides) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).__TAURI__ = {
			core: {
				invoke: async (cmd: string, args?: unknown) => {
					const handler = overrides[cmd];
					if (typeof handler === 'function') return handler(args);
					console.warn(`[tauri-mock] unmocked command: ${cmd}`);
					return null;
				}
			},
			...(((overrides as Record<string, unknown>).__TAURI__ as object) ?? {})
		};
	}, overrides);
}
