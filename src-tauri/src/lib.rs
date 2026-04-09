mod file_ops;

use file_ops::{read_markdown_file, write_markdown_file};
use std::sync::Mutex;

pub struct AppState {
    pub current_file: Mutex<Option<String>>,
}

fn save_file_impl(state: &AppState, content: String) -> Result<(), String> {
    let path = state.current_file.lock().unwrap().clone();
    match path {
        Some(path) => write_markdown_file(&path, &content),
        None => Err("No file is currently open".to_string()),
    }
}

#[tauri::command]
fn open_file(state: tauri::State<'_, AppState>, path: String) -> Result<String, String> {
    let content = read_markdown_file(&path)?;
    *state.current_file.lock().unwrap() = Some(path);
    Ok(content)
}

#[tauri::command]
fn save_file(state: tauri::State<'_, AppState>, content: String) -> Result<(), String> {
    save_file_impl(&state, content)
}

#[tauri::command]
fn set_current_file(state: tauri::State<'_, AppState>, path: String) {
    *state.current_file.lock().unwrap() = Some(path);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn save_file_impl_errors_when_no_file_open() {
        let state = AppState {
            current_file: Mutex::new(None),
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
        };
        save_file_impl(&state, "new content".into()).unwrap();
        assert_eq!(std::fs::read_to_string(tmp.path()).unwrap(), "new content");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            current_file: Mutex::new(None),
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_file,
            save_file,
            set_current_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
