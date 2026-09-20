//! Tauri backend for MIDI Player.
//!
//! The webview does all MIDI parsing, synthesis, and editing. The backend only
//! provides the two file operations a webview cannot safely do on its own:
//! reading and writing a MIDI file the user picked through a native dialog.
//! Keeping these as explicit commands avoids granting the frontend blanket
//! filesystem scope.

use std::path::{Path, PathBuf};

/// Extensions we are willing to touch on disk.
const MIDI_EXTENSIONS: [&str; 3] = ["mid", "midi", "rmi"];

fn validate_midi_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "That file has no extension, so it is not a MIDI file.".to_string())?;

    if !MIDI_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!(
            "\"{extension}\" is not a MIDI extension. Expected one of: {}.",
            MIDI_EXTENSIONS.join(", ")
        ));
    }

    Ok(path)
}

fn describe_io_error(path: &Path, error: std::io::Error) -> String {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("the file");

    match error.kind() {
        std::io::ErrorKind::NotFound => format!("{name} no longer exists."),
        std::io::ErrorKind::PermissionDenied => {
            format!("Permission denied while accessing {name}.")
        }
        _ => format!("Could not access {name}: {error}"),
    }
}

/// Reads a MIDI file from disk and hands the raw bytes to the frontend.
#[tauri::command]
fn read_midi_file(path: String) -> Result<Vec<u8>, String> {
    let path = validate_midi_path(&path)?;
    std::fs::read(&path).map_err(|error| describe_io_error(&path, error))
}

/// Writes MIDI bytes produced by the frontend back to disk.
#[tauri::command]
fn write_midi_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    let path = validate_midi_path(&path)?;
    std::fs::write(&path, contents).map_err(|error| describe_io_error(&path, error))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_midi_file, write_midi_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
