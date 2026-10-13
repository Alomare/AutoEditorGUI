//! Downloading tools (auto-editor, yt-dlp) and Whisper models with progress.

use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

const USER_AGENT: &str = concat!("AutoEditorGUI/", env!("CARGO_PKG_VERSION"));

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(20))
        // Error out on a stalled connection instead of hanging forever.
        .read_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Release {
    pub tag_name: String,
    pub published_at: Option<String>,
    pub html_url: String,
    pub assets: Vec<ReleaseAsset>,
}

/// Latest release of a GitHub repo, e.g. `WyattBlue/auto-editor`.
#[tauri::command]
pub async fn latest_release(repo: String) -> Result<Release, String> {
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let resp = client()?
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Could not reach GitHub: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub returned {}", resp.status()));
    }
    resp.json::<Release>().await.map_err(|e| e.to_string())
}

#[derive(Default)]
pub struct Downloads {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Clone, Serialize)]
struct DownloadProgress<'a> {
    id: &'a str,
    received: u64,
    total: Option<u64>,
}

/// Download `url` to `dest`, writing to `dest.part` first so a failed or
/// cancelled download never leaves a broken file behind.
#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    downloads: tauri::State<'_, Downloads>,
    id: String,
    url: String,
    dest: String,
) -> Result<(), String> {
    let cancel = Arc::new(AtomicBool::new(false));
    downloads.active.lock().unwrap().insert(id.clone(), cancel.clone());
    // Retry transient failures (dropped connections, CDN hiccups).
    let mut result = Err(String::new());
    for attempt in 1..=3u64 {
        result = download_inner(&app, &id, &url, PathBuf::from(&dest), &cancel).await;
        if result.is_ok() || cancel.load(Ordering::SeqCst) {
            break;
        }
        if attempt < 3 {
            let wait = Duration::from_secs(2 * attempt);
            // tauri's async runtime is tokio; sleep off the async threads.
            let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(wait)).await;
        }
    }
    downloads.active.lock().unwrap().remove(&id);
    result
}

async fn download_inner(
    app: &AppHandle,
    id: &str,
    url: &str,
    dest: PathBuf,
    cancel: &AtomicBool,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let resp = client()?
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download failed: server returned {}", resp.status()));
    }
    let total = resp.content_length();
    let part = dest.with_extension(match dest.extension() {
        Some(ext) => format!("{}.part", ext.to_string_lossy()),
        None => "part".into(),
    });
    let mut file = std::fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut received = 0u64;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut stream = resp.bytes_stream();

    let outcome: Result<(), String> = async {
        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::SeqCst) {
                return Err("Download cancelled".into());
            }
            let chunk = chunk.map_err(|e| format!("Download interrupted: {e}"))?;
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            received += chunk.len() as u64;
            if last_emit.elapsed() >= Duration::from_millis(150) {
                last_emit = Instant::now();
                let _ = app.emit("download-progress", DownloadProgress { id, received, total });
            }
        }
        Ok(())
    }
    .await;

    drop(file);
    if let Err(e) = outcome {
        let _ = std::fs::remove_file(&part);
        return Err(e);
    }
    if let Some(total) = total.filter(|&t| t != received) {
        let _ = std::fs::remove_file(&part);
        return Err(format!("Download incomplete ({received} of {total} bytes)"));
    }
    let _ = app.emit("download-progress", DownloadProgress { id, received, total: Some(received) });
    if dest.exists() {
        std::fs::remove_file(&dest)
            .map_err(|e| format!("Could not replace {}: {e}", dest.display()))?;
    }
    std::fs::rename(&part, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cancel_download(downloads: tauri::State<'_, Downloads>, id: String) {
    if let Some(flag) = downloads.active.lock().unwrap().get(&id) {
        flag.store(true, Ordering::SeqCst);
    }
}
