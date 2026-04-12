import { Menu, MenuItem, CheckMenuItem, Submenu, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { APP_MENU, dispatchAppMenuAction, type AppMenuHandlers } from './appMenuDispatch';

/**
 * Installs the desktop app menu (macOS menu bar / Win+Linux window menu).
 * Call only inside Tauri; no-ops are handled by the caller.
 *
 * Keyboard shortcuts defined here (accelerator strings) must stay in sync
 * with the handleKeydown() function in src/routes/+page.svelte, which handles
 * the same shortcuts for the browser/web context.
 */
export async function installTauriAppMenu(handlers: AppMenuHandlers): Promise<void> {
	const onAction = (id: string) => dispatchAppMenuAction(id, handlers);

	const appSubmenu = await Submenu.new({
		id: 'sub_app',
		text: 'mdreader',
		items: [
			await PredefinedMenuItem.new({
				item: { About: { name: 'mdreader' } }
			}),
			await PredefinedMenuItem.new({ item: 'Separator' }),
			await PredefinedMenuItem.new({ item: 'Hide', text: 'Hide mdreader' }),
			await PredefinedMenuItem.new({ item: 'HideOthers' }),
			await PredefinedMenuItem.new({ item: 'ShowAll' }),
			await PredefinedMenuItem.new({ item: 'Separator' }),
			await PredefinedMenuItem.new({ item: 'Quit' })
		]
	});

	const fileSubmenu = await Submenu.new({
		id: 'sub_file',
		text: 'File',
		items: [
			await MenuItem.new({
				id: APP_MENU.FileNew,
				text: 'New',
				accelerator: 'CmdOrCtrl+N',
				action: onAction
			}),
			await MenuItem.new({
				id: APP_MENU.FileOpen,
				text: 'Open…',
				accelerator: 'CmdOrCtrl+O',
				action: onAction
			}),
			await PredefinedMenuItem.new({ item: 'Separator' }),
			await MenuItem.new({
				id: APP_MENU.FileSave,
				text: 'Save',
				accelerator: 'CmdOrCtrl+S',
				action: onAction
			}),
			await MenuItem.new({
				id: APP_MENU.FileSaveAs,
				text: 'Save As…',
				accelerator: 'CmdOrCtrl+Shift+S',
				action: onAction
			}),
			await PredefinedMenuItem.new({ item: 'Separator' }),
			await CheckMenuItem.new({
				id: APP_MENU.FileToggleAutoSave,
				text: 'Auto Save',
				checked: false,
				action: onAction
			})
		]
	});

	const editSubmenu = await Submenu.new({
		id: 'sub_edit',
		text: 'Edit',
		items: [
			await PredefinedMenuItem.new({ item: 'Undo' }),
			await PredefinedMenuItem.new({ item: 'Redo' }),
			await PredefinedMenuItem.new({ item: 'Separator' }),
			await PredefinedMenuItem.new({ item: 'Cut' }),
			await PredefinedMenuItem.new({ item: 'Copy' }),
			await PredefinedMenuItem.new({ item: 'Paste' }),
			await PredefinedMenuItem.new({ item: 'SelectAll' })
		]
	});

	const viewSubmenu = await Submenu.new({
		id: 'sub_view',
		text: 'View',
		items: [
			await MenuItem.new({
				id: APP_MENU.ViewToggleSource,
				text: 'Toggle Source Mode',
				accelerator: 'CmdOrCtrl+/',
				action: onAction
			}),
			await MenuItem.new({
				id: APP_MENU.ViewToggleSidebar,
				text: 'Toggle Sidebar',
				accelerator: 'CmdOrCtrl+Shift+L',
				action: onAction
			}),
			await MenuItem.new({
				id: APP_MENU.ViewToggleDistractionFree,
				text: 'Toggle Distraction-Free',
				accelerator: 'CmdOrCtrl+Shift+F',
				action: onAction
			}),
			await MenuItem.new({
				id: APP_MENU.ViewCycleTheme,
				text: 'Cycle Theme',
				accelerator: 'CmdOrCtrl+Shift+T',
				action: onAction
			})
		]
	});

	const menu = await Menu.new({
		items: [appSubmenu, fileSubmenu, editSubmenu, viewSubmenu]
	});

	await menu.setAsAppMenu();
}
