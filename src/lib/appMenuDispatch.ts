/** Stable ids shared by native menu items and {@link dispatchAppMenuAction}. */
export const APP_MENU = {
	FileNew: 'mdreader:file_new',
	FileOpen: 'mdreader:file_open',
	FileSave: 'mdreader:file_save',
	FileSaveAs: 'mdreader:file_save_as',
	FileToggleAutoSave: 'mdreader:file_toggle_auto_save',
	ViewToggleSource: 'mdreader:view_toggle_source',
	ViewToggleSidebar: 'mdreader:view_toggle_sidebar',
	ViewToggleDistractionFree: 'mdreader:view_distraction_free',
	ViewCycleTheme: 'mdreader:view_cycle_theme'
} as const;

export type AppMenuActionId = (typeof APP_MENU)[keyof typeof APP_MENU];

// All handlers are fire-and-forget from the menu's perspective — the native menu
// callback cannot await, so async handlers must be wrapped in void at the call site.
// Typed as () => void so the interface honestly reflects how they are consumed here.
export interface AppMenuHandlers {
	newFile: () => void;
	openFile: () => void;
	save: () => void;
	saveAs: () => void;
	toggleAutoSave: () => void;
	toggleSourceMode: () => void;
	toggleSidebar: () => void;
	toggleDistractionFree: () => void;
	cycleTheme: () => void;
}

/** Maps native menu item ids to existing app actions (also used from menu `action` callbacks). */
export function dispatchAppMenuAction(id: string, handlers: AppMenuHandlers): void {
	switch (id) {
		case APP_MENU.FileNew:
			handlers.newFile();
			return;
		case APP_MENU.FileOpen:
			handlers.openFile();
			return;
		case APP_MENU.FileSave:
			handlers.save();
			return;
		case APP_MENU.FileSaveAs:
			handlers.saveAs();
			return;
		case APP_MENU.FileToggleAutoSave:
			handlers.toggleAutoSave();
			return;
		case APP_MENU.ViewToggleSource:
			handlers.toggleSourceMode();
			return;
		case APP_MENU.ViewToggleSidebar:
			handlers.toggleSidebar();
			return;
		case APP_MENU.ViewToggleDistractionFree:
			handlers.toggleDistractionFree();
			return;
		case APP_MENU.ViewCycleTheme:
			handlers.cycleTheme();
			return;
		default:
			return;
	}
}
