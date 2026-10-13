//! Diagnostic logging. Everything at INFO and above goes to `%USERPROFILE%\.cero\logs\cero.log` (rotated at 2 MB, three
//! old files kept), because a release build has no console. With `--debug` (or `CERO_DEBUG=1`) the lines are also
//! printed to the console that started Cero, and DEBUG lines are written too.

use crate::log_rotation::RotatingLog;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

static IS_DEBUG: AtomicBool = AtomicBool::new(false);

const LOG_FILE: &str = "cero.log";
const LOG_MAX_BYTES: u64 = 2 * 1024 * 1024;
const LOG_KEEP: usize = 3;

fn file_log() -> Option<&'static Mutex<RotatingLog>> {
    static LOG: OnceLock<Option<Mutex<RotatingLog>>> = OnceLock::new();
    LOG.get_or_init(|| {
        crate::home::home_dir().map(|home| {
            Mutex::new(RotatingLog::new(&home.join(".cero").join("logs"), LOG_FILE, LOG_MAX_BYTES, LOG_KEEP))
        })
    })
    .as_ref()
}

fn write_to_file(line: &str) {
    if let Some(log) = file_log() {
        if let Ok(mut log) = log.lock() {
            let _ = log.write_line(line);
        }
    }
}

/// Initialize the diagnostic logger by inspecting command-line flags and environment variables.
pub fn init() {
    let mut debug_enabled = false;

    // Check environment variable
    if let Ok(val) = std::env::var("CERO_DEBUG") {
        if val == "1" || val.eq_ignore_ascii_case("true") || val.eq_ignore_ascii_case("debug") {
            debug_enabled = true;
        }
    }

    // Check command line arguments
    for arg in std::env::args() {
        if arg == "--debug" || arg == "-d" || arg == "--verbose" || arg == "-v" {
            debug_enabled = true;
            break;
        }
    }

    IS_DEBUG.store(debug_enabled, Ordering::SeqCst);

    if debug_enabled {
        // A release build has no console of its own; print into the one that started it (cmd, PowerShell)
        unsafe {
            windows_sys::Win32::System::Console::AttachConsole(windows_sys::Win32::System::Console::ATTACH_PARENT_PROCESS);
        }
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ");
        eprintln!("================================================================================");
        eprintln!("[{}] [SYSTEM] Cero Diagnostic Logging ACTIVE (PID: {})", now, std::process::id());
        eprintln!("[{}] [SYSTEM] OS: {} | Arch: {} | Release: {}", now, std::env::consts::OS, std::env::consts::ARCH, env!("CARGO_PKG_VERSION"));
        eprintln!("================================================================================");
    }
}

/// Returns whether diagnostic debug mode is currently active.
pub fn is_debug() -> bool {
    IS_DEBUG.load(Ordering::Relaxed)
}

/// Format and write a structured log entry to stdout or stderr.
pub fn log(level: &str, tag: &str, message: &str) {
    let is_err = level.eq_ignore_ascii_case("ERROR");
    let is_debug_line = level.eq_ignore_ascii_case("DEBUG");
    if is_debug_line && !is_debug() {
        return;
    }

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ");
    let line = format!("[{}] [{:<5}] [{}] {}", now, level.to_uppercase(), tag.to_uppercase(), message);
    write_to_file(&line);

    if is_err {
        eprintln!("{}", line);
    } else if is_debug() {
        println!("{}", line);
    }
}

pub fn log_debug(tag: &str, message: &str) {
    log("DEBUG", tag, message);
}

pub fn log_info(tag: &str, message: &str) {
    log("INFO", tag, message);
}

pub fn log_warn(tag: &str, message: &str) {
    log("WARN", tag, message);
}

pub fn log_error(tag: &str, message: &str) {
    log("ERROR", tag, message);
}

/// Tauri command to allow the frontend or plugins to emit structured diagnostic logs.
#[tauri::command]
pub fn log_diagnostic(level: String, tag: String, message: String) {
    log(&level, &tag, &message);
}

/// Tauri command to inform the frontend whether debug logging is active.
#[tauri::command]
pub fn is_debug_active() -> bool {
    is_debug()
}
