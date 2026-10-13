//! Where the app keeps its tools and data.
//!
//! Portable by default: everything lives next to the executable
//! (`bin/`, `data/`, `models/`). If that folder isn't writable (e.g. the app
//! was copied into Program Files) we fall back to the per-user app data dir.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub root: PathBuf,
    pub exe_dir: PathBuf,
    pub bin: PathBuf,
    pub data: PathBuf,
    pub models: PathBuf,
    pub portable: bool,
}

impl AppPaths {
    pub fn resolve(app: &AppHandle) -> Self {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| PathBuf::from("."));

        let (root, portable) = if is_writable(&exe_dir) {
            (exe_dir.clone(), true)
        } else {
            let fallback = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| exe_dir.clone());
            (fallback, false)
        };

        let paths = Self {
            bin: root.join("bin"),
            data: root.join("data"),
            models: root.join("models"),
            exe_dir,
            root,
            portable,
        };
        for dir in [&paths.bin, &paths.data, &paths.models] {
            let _ = std::fs::create_dir_all(dir);
        }
        paths
    }
}

fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(".write-test");
    match std::fs::write(&probe, b"") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Find an executable named `name` (without extension) on PATH.
pub fn find_on_path(name: &str) -> Option<PathBuf> {
    let file = exe_name(name);
    std::env::split_paths(&std::env::var_os("PATH")?)
        .map(|dir| dir.join(&file))
        .find(|p| p.is_file())
}

pub fn exe_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}
