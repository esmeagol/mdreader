import { describe, it, expect, vi } from 'vitest';
import { APP_MENU, dispatchAppMenuAction, type AppMenuHandlers } from './appMenuDispatch';

function mockHandlers(): AppMenuHandlers {
	return {
		newFile: vi.fn(),
		openFile: vi.fn().mockResolvedValue(undefined),
		save: vi.fn().mockResolvedValue(undefined),
		saveAs: vi.fn().mockResolvedValue(undefined),
		toggleSourceMode: vi.fn(),
		toggleSidebar: vi.fn(),
		toggleDistractionFree: vi.fn()
	};
}

describe('dispatchAppMenuAction', () => {
	it('invokes newFile for FileNew id', () => {
		const h = mockHandlers();
		dispatchAppMenuAction(APP_MENU.FileNew, h);
		expect(h.newFile).toHaveBeenCalledOnce();
		expect(h.openFile).not.toHaveBeenCalled();
	});

	it('invokes openFile for FileOpen id', () => {
		const h = mockHandlers();
		dispatchAppMenuAction(APP_MENU.FileOpen, h);
		expect(h.openFile).toHaveBeenCalledOnce();
	});

	it('invokes save and saveAs for file save ids', () => {
		const h = mockHandlers();
		dispatchAppMenuAction(APP_MENU.FileSave, h);
		dispatchAppMenuAction(APP_MENU.FileSaveAs, h);
		expect(h.save).toHaveBeenCalledOnce();
		expect(h.saveAs).toHaveBeenCalledOnce();
	});

	it('invokes view toggles', () => {
		const h = mockHandlers();
		dispatchAppMenuAction(APP_MENU.ViewToggleSource, h);
		dispatchAppMenuAction(APP_MENU.ViewToggleSidebar, h);
		dispatchAppMenuAction(APP_MENU.ViewToggleDistractionFree, h);
		expect(h.toggleSourceMode).toHaveBeenCalledOnce();
		expect(h.toggleSidebar).toHaveBeenCalledOnce();
		expect(h.toggleDistractionFree).toHaveBeenCalledOnce();
	});

	it('ignores unknown ids', () => {
		const h = mockHandlers();
		dispatchAppMenuAction('unknown:id', h);
		expect(h.newFile).not.toHaveBeenCalled();
		expect(h.openFile).not.toHaveBeenCalled();
	});
});
