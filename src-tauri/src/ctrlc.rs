//! Graceful stop for console children.
//!
//! auto-editor finishes a `:mic` recording (and `whisper :mic`) when it
//! receives Ctrl-C; killing it would lose the capture. A GUI process can't
//! send Ctrl-C to a child directly, so we re-launch our own executable in a
//! tiny helper mode that attaches to the child's (hidden) console and raises
//! the event there. Doing it in a separate process keeps our own console
//! state (and the dev-mode terminal) untouched.

use std::path::Path;
use std::process::Command;

pub const SEND_CTRL_C_FLAG: &str = "--send-ctrl-c";

/// Make sure children can receive Ctrl-C. The "ignore Ctrl-C" flag is
/// inherited, so if we were launched from a process that set it (some
/// terminals and launchers do), every child would silently ignore our stop
/// request.
pub fn enable_ctrl_c_for_children() {
    #[cfg(windows)]
    unsafe {
        windows_sys::Win32::System::Console::SetConsoleCtrlHandler(None, 0);
    }
}

/// Runs inside the helper process.
#[cfg(windows)]
pub fn send_ctrl_c(pid: u32) -> bool {
    use windows_sys::Win32::System::Console::{
        AttachConsole, CTRL_C_EVENT, FreeConsole, GenerateConsoleCtrlEvent, SetConsoleCtrlHandler,
    };
    unsafe {
        FreeConsole();
        if AttachConsole(pid) == 0 {
            return false;
        }
        // Ignore the event ourselves; it goes to every process on the console.
        SetConsoleCtrlHandler(None, 1);
        let ok = GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0) != 0;
        // Delivery is asynchronous; stay attached briefly so it lands.
        std::thread::sleep(std::time::Duration::from_millis(300));
        FreeConsole();
        ok
    }
}

#[cfg(not(windows))]
pub fn send_ctrl_c(pid: u32) -> bool {
    Command::new("kill")
        .args(["-INT", &pid.to_string()])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Called from the GUI: spawn the helper and wait for it.
pub fn request_ctrl_c(pid: u32) -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    run_helper(&exe, pid)
}

fn run_helper(exe: &Path, pid: u32) -> bool {
    let mut cmd = Command::new(exe);
    cmd.args([SEND_CTRL_C_FLAG, &pid.to_string()]);
    crate::process::hide_window(&mut cmd);
    cmd.status().map(|s| s.success()).unwrap_or(false)
}
