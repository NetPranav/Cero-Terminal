use std::sync::atomic::{AtomicBool, Ordering};

static IS_DEBUG: AtomicBool = AtomicBool::new(false);

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
    if !is_debug() && !is_err {
        return;
    }

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ");
    let line = format!("[{}] [{:<5}] [{}] {}", now, level.to_uppercase(), tag.to_uppercase(), message);

    if is_err {
        eprintln!("{}", line);
    } else {
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
