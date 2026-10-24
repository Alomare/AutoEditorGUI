mod ctrlc;
mod download;
mod paths;
mod process;

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{Manager, RunEvent};

pub use ctrlc::{SEND_CTRL_C_FLAG, send_ctrl_c};
use paths::AppPaths;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: &'static str,
    os: &'static str,
    arch: &'static str,
    paths: AppPaths,
    /// Files passed on the command line (dropped onto the exe, "Open with").
    launch_files: Vec<String>,
}

#[tauri::command]
fn app_info(paths: tauri::State<'_, AppPaths>) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        paths: paths.inner().clone(),
        // args_os: `args()` panics on a file name that isn't valid Unicode.
        launch_files: std::env::args_os()
            .skip(1)
            .map(PathBuf::from)
            .filter(|p| p.is_file())
            .map(|p| p.to_string_lossy().into_owned())
            .collect(),
    }
}

#[derive(Serialize)]
struct ToolInfo {
    path: PathBuf,
    version: Option<String>,
    source: &'static str,
}

/// Locate a tool: an explicit path from settings, then the app's `bin/`,
/// then next to the executable, then PATH.
fn locate(paths: &AppPaths, name: &str, custom: Option<&str>) -> Option<(PathBuf, &'static str)> {
    if let Some(custom) = custom.filter(|c| !c.is_empty()) {
        let p = PathBuf::from(custom);
        return p.is_file().then_some((p, "custom"));
    }
    let file = paths::exe_name(name);
    [(paths.bin.join(&file), "bundled"), (paths.exe_dir.join(&file), "bundled")]
        .into_iter()
        .find(|(p, _)| p.is_file())
        .or_else(|| paths::find_on_path(name).map(|p| (p, "path")))
}

fn tool_version(path: &Path) -> Option<String> {
    let mut cmd = std::process::Command::new(path);
    cmd.arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    process::hide_window(&mut cmd);
    let mut child = cmd.spawn().ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stdout.read_to_end(&mut bytes);
        bytes
    });
    // A wrong custom path (say, some GUI program) may never exit; startup
    // waits on this, so give up instead of hanging.
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    let bytes = reader.join().ok()?;
    let text = String::from_utf8_lossy(&bytes);
    text.lines().map(str::trim).find(|l| !l.is_empty()).map(String::from)
}

#[tauri::command]
async fn locate_tool(
    paths: tauri::State<'_, AppPaths>,
    allowed: tauri::State<'_, process::AllowedPrograms>,
    name: String,
    custom: Option<String>,
) -> Result<Option<ToolInfo>, String> {
    let paths = paths.inner().clone();
    let found = tauri::async_runtime::spawn_blocking(move || {
        locate(&paths, &name, custom.as_deref()).map(|(path, source)| ToolInfo {
            version: tool_version(&path),
            path,
            source,
        })
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Some(tool) = &found {
        allowed.allow(tool.path.clone());
    }
    Ok(found)
}

// --- Small filesystem helpers for settings, presets, models and previews ---

#[derive(Serialize)]
struct FileEntry {
    name: String,
    path: PathBuf,
    size: u64,
}

#[tauri::command]
fn read_text(path: String) -> Result<Option<String>, String> {
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read {path}: {e}")),
    }
}

#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Write-then-rename so a crash never leaves a half-written settings file.
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, contents).map_err(|e| format!("Could not write {path}: {e}"))?;
    std::fs::rename(&tmp, p).map_err(|e| format!("Could not write {path}: {e}"))
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Could not delete {path}: {e}")),
    }
}

#[tauri::command]
fn list_files(dir: String, extensions: Vec<String>) -> Vec<FileEntry> {
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return vec![];
    };
    let mut files: Vec<FileEntry> = entries
        .filter_map(Result::ok)
        .filter(|e| e.path().is_file())
        .filter(|e| {
            let ext = e.path().extension().map(|x| x.to_string_lossy().to_lowercase());
            extensions.is_empty() || ext.is_some_and(|x| extensions.iter().any(|w| w.eq_ignore_ascii_case(&x)))
        })
        .map(|e| FileEntry {
            name: e.file_name().to_string_lossy().into_owned(),
            size: e.metadata().map(|m| m.len()).unwrap_or(0),
            path: e.path(),
        })
        .collect();
    files.sort_by_key(|f| f.name.to_lowercase());
    files
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ctrlc::enable_ctrl_c_for_children();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(process::Jobs::default())
        .manage(process::AllowedPrograms::default())
        .manage(download::Downloads::default())
        .setup(|app| {
            let paths = AppPaths::resolve(app.handle());
            app.manage(paths);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            locate_tool,
            read_text,
            write_text,
            remove_file,
            list_files,
            path_exists,
            process::run_capture,
            process::start_job,
            process::stop_job,
            download::latest_release,
            download::download_file,
            download::cancel_download,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            // Don't leave renders running in the background after closing.
            handle.state::<process::Jobs>().kill_all();
        }
    });
}
