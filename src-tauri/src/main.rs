// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Helper mode: deliver a console Ctrl-C to another process (see ctrlc.rs).
    // args_os: `args()` panics on a non-Unicode argument (e.g. a dropped file).
    let args: Vec<std::ffi::OsString> = std::env::args_os().collect();
    if args.len() == 3 && args[1] == autoeditorgui_lib::SEND_CTRL_C_FLAG {
        let ok = args[2]
            .to_str()
            .and_then(|s| s.parse::<u32>().ok())
            .map(autoeditorgui_lib::send_ctrl_c)
            .unwrap_or(false);
        std::process::exit(if ok { 0 } else { 1 });
    }

    autoeditorgui_lib::run()
}
