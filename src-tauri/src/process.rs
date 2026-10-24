//! Running auto-editor (and friends) as child processes.
//!
//! Two flavours:
//! - `run_capture`: short commands (info, preview, levels...) whose output we
//!   need in full.
//! - jobs: long renders/transcriptions that stream output and progress to the
//!   UI as events and can be stopped (Ctrl-C) or killed.

use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Don't flash a console window for each child on Windows.
pub fn hide_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = cmd;
}

fn build_command(
    program: &str,
    args: &[String],
    cwd: Option<&str>,
    env: Option<&HashMap<String, String>>,
) -> Command {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .env("NO_COLOR", "1")
        .envs(env.into_iter().flatten())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = cwd.filter(|d| !d.is_empty()) {
        cmd.current_dir(dir);
    }
    hide_window(&mut cmd);
    cmd
}

/// Remove ANSI CSI sequences (colors, cursor show/hide) and OSC sequences
/// (terminal hyperlinks) from a line of terminal output.
pub fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.peek() {
            Some('[') => {
                chars.next();
                // Parameters/intermediates, then one final byte in @..~
                for c in chars.by_ref() {
                    if ('@'..='~').contains(&c) {
                        break;
                    }
                }
            }
            Some(']') => {
                chars.next();
                // Ends with BEL or ESC \
                while let Some(c) = chars.next() {
                    if c == '\u{7}' {
                        break;
                    }
                    if c == '\u{1b}' && chars.peek() == Some(&'\\') {
                        chars.next();
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Progress {
    pub title: String,
    pub current: f64,
    pub total: f64,
    pub eta: f64,
}

/// Parse a `--progress machine` line: `title~current~total~eta`.
pub fn parse_progress(line: &str) -> Option<Progress> {
    let mut parts = line.rsplitn(4, '~');
    let eta = parts.next()?.trim().parse::<f64>().ok()?;
    let total = parts.next()?.trim().parse::<f64>().ok()?;
    let current = parts.next()?.trim().parse::<f64>().ok()?;
    let title = parts.next()?.trim().to_string();
    Some(Progress { title, current, total, eta })
}

/// Read a stream, splitting on both `\r` and `\n` (progress bars redraw with
/// `\r`), and hand each non-empty, ANSI-stripped line to `f`.
fn for_each_line(mut reader: impl Read, mut f: impl FnMut(String)) {
    let mut buf = [0u8; 8192];
    let mut pending: Vec<u8> = Vec::new();
    let flush = |bytes: &mut Vec<u8>, f: &mut dyn FnMut(String)| {
        if !bytes.is_empty() {
            let line = strip_ansi(&String::from_utf8_lossy(bytes));
            let line = line.trim_end();
            if !line.trim().is_empty() {
                f(line.to_string());
            }
            bytes.clear();
        }
    };
    loop {
        match reader.read(&mut buf) {
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Ok(0) | Err(_) => break,
            Ok(n) => {
                for &b in &buf[..n] {
                    if b == b'\r' || b == b'\n' {
                        flush(&mut pending, &mut f);
                    } else {
                        pending.push(b);
                    }
                }
            }
        }
    }
    flush(&mut pending, &mut f);
}

// ---------------------------------------------------------------------------
// Which programs the UI may run

/// Only executables that `locate_tool` found (auto-editor, yt-dlp) can be
/// started from the webview — least privilege for the run commands.
#[derive(Default)]
pub struct AllowedPrograms(Mutex<HashSet<PathBuf>>);

impl AllowedPrograms {
    pub fn allow(&self, path: PathBuf) {
        self.0.lock().unwrap().insert(path);
    }

    fn check(&self, program: &str) -> Result<(), String> {
        if self.0.lock().unwrap().contains(&PathBuf::from(program)) {
            Ok(())
        } else {
            Err(format!("Refusing to run {program}: not a tool this app located"))
        }
    }
}

// ---------------------------------------------------------------------------
// Short commands

#[derive(Debug, Serialize)]
pub struct CaptureResult {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[tauri::command]
pub async fn run_capture(
    allowed: tauri::State<'_, AllowedPrograms>,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<CaptureResult, String> {
    allowed.check(&program)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = build_command(&program, &args, cwd.as_deref(), env.as_ref())
            .output()
            .map_err(|e| format!("Could not start {program}: {e}"))?;
        let stderr = String::from_utf8_lossy(&output.stderr)
            .split(['\r', '\n'])
            .map(strip_ansi)
            .filter(|l| !l.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        Ok(CaptureResult {
            code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Jobs

#[derive(Default)]
pub struct Jobs {
    running: Mutex<HashMap<String, RunningJob>>,
}

struct RunningJob {
    pid: u32,
    cancelled: Arc<AtomicBool>,
}

impl Jobs {
    pub fn kill_all(&self) {
        let running = self.running.lock().unwrap();
        for job in running.values() {
            job.cancelled.store(true, Ordering::SeqCst);
            kill_tree(job.pid);
        }
    }
}

#[derive(Clone, Serialize)]
struct OutputEvent<'a> {
    id: &'a str,
    stream: &'static str,
    line: String,
}

#[derive(Clone, Serialize)]
struct ProgressEvent<'a> {
    id: &'a str,
    #[serde(flatten)]
    progress: Progress,
}

#[derive(Clone, Serialize)]
struct ExitEvent {
    id: String,
    code: Option<i32>,
    cancelled: bool,
    error: Option<String>,
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri injects state + IPC args
pub fn start_job(
    app: AppHandle,
    jobs: tauri::State<'_, Jobs>,
    allowed: tauri::State<'_, AllowedPrograms>,
    id: String,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<u32, String> {
    allowed.check(&program)?;
    let mut child: Child = build_command(&program, &args, cwd.as_deref(), env.as_ref())
        .spawn()
        .map_err(|e| format!("Could not start {program}: {e}"))?;
    let pid = child.id();
    let cancelled = Arc::new(AtomicBool::new(false));
    jobs.running.lock().unwrap().insert(
        id.clone(),
        RunningJob { pid, cancelled: cancelled.clone() },
    );

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_thread = stdout.map(|out| {
        let (app, id) = (app.clone(), id.clone());
        std::thread::spawn(move || {
            // Decode lossily: stopping at a non-UTF-8 line would leave the pipe
            // undrained, and the child would block once it fills up.
            let mut reader = BufReader::new(out);
            let mut buf = Vec::new();
            while reader.read_until(b'\n', &mut buf).is_ok_and(|n| n > 0) {
                let text = String::from_utf8_lossy(&buf);
                let line = strip_ansi(text.trim_end_matches(['\r', '\n']));
                let _ = app.emit("job-output", OutputEvent { id: &id, stream: "stdout", line });
                buf.clear();
            }
        })
    });
    let stderr_thread = stderr.map(|err| {
        let (app, id) = (app.clone(), id.clone());
        std::thread::spawn(move || {
            for_each_line(err, |line| match parse_progress(&line) {
                Some(progress) => {
                    let _ = app.emit("job-progress", ProgressEvent { id: &id, progress });
                }
                None => {
                    let _ = app.emit("job-output", OutputEvent { id: &id, stream: "stderr", line });
                }
            });
        })
    });

    std::thread::spawn(move || {
        let status = child.wait();
        // Drain remaining output before reporting the exit.
        for t in [stdout_thread, stderr_thread].into_iter().flatten() {
            let _ = t.join();
        }
        let jobs = app.state::<Jobs>();
        jobs.running.lock().unwrap().remove(&id);
        let event = match status {
            Ok(s) => ExitEvent {
                id,
                code: s.code(),
                cancelled: cancelled.load(Ordering::SeqCst),
                error: None,
            },
            Err(e) => ExitEvent {
                id,
                code: None,
                cancelled: cancelled.load(Ordering::SeqCst),
                error: Some(e.to_string()),
            },
        };
        let _ = app.emit("job-exit", event);
    });

    Ok(pid)
}

/// `graceful`: send Ctrl-C (finishes mic captures; aborts renders cleanly).
/// Otherwise kill the whole process tree.
#[tauri::command]
pub async fn stop_job(
    jobs: tauri::State<'_, Jobs>,
    id: String,
    graceful: bool,
) -> Result<bool, String> {
    let (pid, cancelled) = {
        let running = jobs.running.lock().unwrap();
        let Some(job) = running.get(&id) else {
            return Ok(false);
        };
        (job.pid, job.cancelled.clone())
    };
    if !graceful {
        cancelled.store(true, Ordering::SeqCst);
    }
    tauri::async_runtime::spawn_blocking(move || {
        if graceful {
            crate::ctrlc::request_ctrl_c(pid)
        } else {
            kill_tree(pid)
        }
    })
    .await
    .map_err(|e| e.to_string())
}

fn kill_tree(pid: u32) -> bool {
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("taskkill");
        c.args(["/PID", &pid.to_string(), "/T", "/F"]);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("kill");
        c.args(["-9", &pid.to_string()]);
        c
    };
    hide_window(&mut cmd);
    cmd.stdout(Stdio::null()).stderr(Stdio::null());
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_colors_and_links() {
        let raw = "\u{1b}[?25l(mp4) \u{1b}[95mh264\u{1b}[0m+aac \u{1b}]8;;https://x.y\u{1b}\\link\u{1b}]8;;\u{1b}\\";
        assert_eq!(strip_ansi(raw), "(mp4) h264+aac link");
    }

    #[test]
    fn parses_machine_progress() {
        assert_eq!(
            parse_progress("(mp4) h264+aac~77.0~133.0~0.06"),
            Some(Progress { title: "(mp4) h264+aac".into(), current: 77.0, total: 133.0, eta: 0.06 })
        );
        assert_eq!(parse_progress("Finished. took 0.22 seconds"), None);
        assert_eq!(parse_progress("a~b~c~d"), None);
    }

    #[test]
    fn splits_carriage_returns() {
        let input = b"Starting   \r\x1b[?25la~1~2~3\rb~2~2~0\n\nFinished.\n";
        let mut lines = vec![];
        for_each_line(&input[..], |l| lines.push(l));
        assert_eq!(lines, vec!["Starting", "a~1~2~3", "b~2~2~0", "Finished."]);
    }
}
