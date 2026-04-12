mod file_ops;
mod recent_files;

use file_ops::{read_markdown_file, write_markdown_file};
use recent_files::RecentFiles;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub current_file: Mutex<Option<String>>,
    pub recent_files: Mutex<RecentFiles>,
}

fn save_image_impl(path: &str, bytes: Vec<u8>) -> Result<String, String> {
    std::fs::write(path, &bytes).map_err(|e| format!("Failed to write image to {path}: {e}"))?;
    Ok(path.to_string())
}

#[tauri::command]
fn save_image(path: String, bytes: Vec<u8>) -> Result<String, String> {
    save_image_impl(&path, bytes)
}

fn save_file_impl(state: &AppState, content: String) -> Result<(), String> {
    let path = state.current_file.lock().unwrap_or_else(|e| e.into_inner()).clone();
    match path {
        Some(path) => write_markdown_file(&path, &content),
        None => Err("No file is currently open".to_string()),
    }
}

#[tauri::command]
fn open_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let content = read_markdown_file(&path)?;
    *state.current_file.lock().unwrap_or_else(|e| e.into_inner()) = Some(path.clone());
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;
    std::fs::create_dir_all(&app_data_dir).ok();
    let mut rf = state.recent_files.lock().unwrap_or_else(|e| e.into_inner());
    rf.add(&path);
    let _ = rf.save(&app_data_dir);
    // Grant asset protocol access to the directory containing this file so
    // relative image references (e.g. Redis1.png) can be served.
    // Canonicalize so the stored pattern matches after Tauri's own canonicalize
    // call in is_allowed() — without this, symlink components (e.g. inside
    // ~/Library/CloudStorage) cause a pattern mismatch and a 403/404.
    if let Some(dir) = std::path::Path::new(&path).parent() {
        let canonical = std::fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf());
        let _ = app
            .asset_protocol_scope()
            .allow_directory(&canonical, false);
    }
    Ok(content)
}

#[tauri::command]
fn save_file(state: tauri::State<'_, AppState>, content: String) -> Result<(), String> {
    save_file_impl(&state, content)
}

#[tauri::command]
fn set_current_file(state: tauri::State<'_, AppState>, path: String) {
    *state.current_file.lock().unwrap_or_else(|e| e.into_inner()) = Some(path);
}

#[tauri::command]
fn get_recent_files(state: tauri::State<'_, AppState>) -> Vec<String> {
    state.recent_files.lock().unwrap_or_else(|e| e.into_inner()).list().to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    // ── save_image_impl ───────────────────────────────────────────────────────

    #[test]
    fn save_image_writes_bytes_to_path() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("image.png").to_str().unwrap().to_string();
        let bytes = vec![1u8, 2, 3, 4, 5];
        save_image_impl(&path, bytes.clone()).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }

    #[test]
    fn save_image_returns_the_path_on_success() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("img.png").to_str().unwrap().to_string();
        let returned = save_image_impl(&path, vec![0u8]).unwrap();
        assert_eq!(returned, path);
    }

    #[test]
    fn save_image_errors_on_nonexistent_directory() {
        let result = save_image_impl("/nonexistent/dir/image.png", vec![1, 2, 3]);
        assert!(result.is_err());
    }

    // ── save_file_impl ────────────────────────────────────────────────────────

    #[test]
    fn save_file_impl_errors_when_no_file_open() {
        let state = AppState {
            current_file: Mutex::new(None),
            recent_files: Mutex::new(RecentFiles::default()),
        };
        assert_eq!(
            save_file_impl(&state, "x".into()).unwrap_err(),
            "No file is currently open"
        );
    }

    #[test]
    fn save_file_impl_writes_to_current_path() {
        let mut tmp = NamedTempFile::with_suffix(".md").unwrap();
        writeln!(tmp, "old").unwrap();
        let path = tmp.path().to_str().unwrap().to_string();
        let state = AppState {
            current_file: Mutex::new(Some(path)),
            recent_files: Mutex::new(RecentFiles::default()),
        };
        save_file_impl(&state, "new content".into()).unwrap();
        assert_eq!(std::fs::read_to_string(tmp.path()).unwrap(), "new content");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir).ok();
            let recent = RecentFiles::load(&app_data_dir);
            app.manage(AppState {
                current_file: Mutex::new(None),
                recent_files: Mutex::new(recent),
            });
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            open_file,
            save_file,
            save_image,
            set_current_file,
            get_recent_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
