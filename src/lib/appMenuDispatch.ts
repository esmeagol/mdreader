/** Stable ids shared by native menu items and {@link dispatchAppMenuAction}. */
export const APP_MENU = {
	FileNew: 'mdreader:file_new',
	FileOpen: 'mdreader:file_open',
	FileSave: 'mdreader:file_save',
	FileSaveAs: 'mdreader:file_save_as',
	ViewToggleSource: 'mdreader:view_toggle_source',
	ViewToggleSidebar: 'mdreader:view_toggle_sidebar',
	ViewToggleDistractionFree: 'mdreader:view_distraction_free'
} as const;

export type AppMenuActionId = (typeof APP_MENU)[keyof typeof APP_MENU];

export interface AppMenuHandlers {
	newFile: () => void;
	openFile: () => Promise<void>;
	save: () => Promise<void>;
	saveAs: () => Promise<void>;
	toggleSourceMode: () => void;
	toggleSidebar: () => void;
	toggleDistractionFree: () => void;
}

/** Maps native menu item ids to existing app actions (also used from menu `action` callbacks). */
export function dispatchAppMenuAction(id: string, handlers: AppMenuHandlers): void {
	switch (id) {
		case APP_MENU.FileNew:
			handlers.newFile();
			return;
		case APP_MENU.FileOpen:
			void handlers.openFile();
			return;
		case APP_MENU.FileSave:
			void handlers.save();
			return;
		case APP_MENU.FileSaveAs:
			void handlers.saveAs();
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
		default:
			return;
	}
}
