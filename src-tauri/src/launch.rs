//! How the app was opened: normally, or to run a .flow file.
//!
//! The main window starts hidden (tauri.conf.json). A normal launch shows it right away. A launch
//! that opens a .flow file leaves it hidden and lets the page decide: a flow that only opens apps
//! and links runs without ever showing the terminal, one that installs or runs commands shows it.
//! Files macOS hands over (Finder "Open") are kept until the page asks for them, so a file opened
//! before the page has loaded is not lost.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct OpenedFiles(pub Mutex<Vec<String>>);

/// Set when a .flow file was opened before the window was shown
static FLOW_OPENED: AtomicBool = AtomicBool::new(false);

pub fn is_flow_path(p: &str) -> bool {
    let lower = p.to_lowercase();
    lower.ends_with(".flow") || lower.ends_with(".workflow.json") || lower.ends_with(".sentinel-workflow.json")
}

pub fn launched_with_flow() -> bool {
    std::env::args().skip(1).any(|a| is_flow_path(&a))
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Files handed to the running app by the OS (macOS "Open"); remembered for the page.
pub fn remember_opened(app: &AppHandle, urls: &[String]) {
    if urls.iter().any(|u| is_flow_path(u)) {
        FLOW_OPENED.store(true, Ordering::SeqCst);
    }
    if let Some(state) = app.try_state::<OpenedFiles>() {
        state.0.lock().unwrap().extend(urls.iter().cloned());
    }
}

/// Show the window at startup unless the app was opened to run a flow.
pub fn show_unless_flow(app: &AppHandle) {
    if launched_with_flow() {
        return;
    }
    // macOS delivers "open this file" just after launch: wait briefly for it before showing
    #[cfg(target_os = "macos")]
    {
        let handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(700));
            if !FLOW_OPENED.load(Ordering::SeqCst) {
                show_main(&handle);
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    show_main(app);
}

/// The files the OS opened with the app, once (the page takes them at startup)
#[tauri::command]
pub fn take_opened_files(state: State<'_, OpenedFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    show_main(&app);
}

#[tauri::command]
pub fn is_main_window_visible(app: AppHandle) -> bool {
    app.get_webview_window("main").and_then(|w| w.is_visible().ok()).unwrap_or(true)
}

fn resolve_file_path(arg: &str) -> Option<std::path::PathBuf> {
    if let Some(stripped) = arg.strip_prefix("file://") {
        #[cfg(windows)]
        let stripped = stripped.trim_start_matches('/');
        let path = std::path::PathBuf::from(stripped);
        if path.is_file() {
            return Some(path);
        }
    }
    let path = std::path::PathBuf::from(arg);
    if path.is_file() {
        return Some(path);
    }
    None
}

/// Filters command line arguments from a launch or single-instance event:
/// keeps only existing regular files ending in .flow or legacy workflow extensions.
/// Drops flags, non-flow files, missing paths, and directories.
pub fn filter_flow_argv(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter_map(|arg| {
            if arg.starts_with('-') {
                return None;
            }
            if !is_flow_path(arg) {
                return None;
            }
            if let Some(path) = resolve_file_path(arg) {
                Some(path.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::is_flow_path;

    #[test]
    fn recognises_flow_files() {
        assert!(is_flow_path("/Users/me/Downloads/setup.flow"));
        assert!(is_flow_path("C:\\Users\\me\\Setup.FLOW"));
        assert!(is_flow_path("file:///tmp/deploy.workflow.json"));
        assert!(!is_flow_path("/tmp/package.json"));
        assert!(!is_flow_path("sentinel://open?path=/tmp"));
    }

    #[test]
    fn test_filter_flow_argv() {
        use std::fs::File;

        let temp_dir = std::env::temp_dir();
        let flow_file = temp_dir.join("test my flow with spaces.flow");
        let txt_file = temp_dir.join("not_a_flow.txt");
        let non_existent = temp_dir.join("does_not_exist.flow");

        let _ = File::create(&flow_file);
        let _ = File::create(&txt_file);

        let argv = vec![
            "sentinel-terminal".to_string(),
            "--some-flag".to_string(),
            "-f".to_string(),
            flow_file.to_string_lossy().to_string(),
            txt_file.to_string_lossy().to_string(),
            non_existent.to_string_lossy().to_string(),
        ];

        let filtered = super::filter_flow_argv(&argv);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0], flow_file.to_string_lossy().to_string());

        let _ = std::fs::remove_file(flow_file);
        let _ = std::fs::remove_file(txt_file);
    }
}
