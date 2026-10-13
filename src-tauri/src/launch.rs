//! How the app was opened: normally, or to run a .flow file.
//!
//! The main window starts hidden (tauri.conf.json). A normal launch shows it right away. A launch
//! that opens a .flow file leaves it hidden and lets the page decide: a flow that only opens apps
//! and links runs without ever showing the terminal, one that installs or runs commands shows it.
//! Files handed over by a second launch (double-clicking a .flow file while Cero runs) are kept until
//! the page asks for them, so a file opened before the page has loaded is not lost.

use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct OpenedFiles(pub Mutex<Vec<String>>);

pub fn is_flow_path(p: &str) -> bool {
    let lower = p.trim().trim_matches('"').to_lowercase();
    lower.ends_with(".flow") || lower.ends_with(".workflow.json") || lower.ends_with(".cero-workflow.json")
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

/// Files handed to the running app by a second launch; remembered for the page.
pub fn remember_opened(app: &AppHandle, urls: &[String]) {
    if let Some(state) = app.try_state::<OpenedFiles>() {
        state.0.lock().unwrap().extend(urls.iter().cloned());
    }
}

/// Show the window at startup unless the app was opened to run a flow.
pub fn show_unless_flow(app: &AppHandle) {
    if launched_with_flow() {
        return;
    }
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

/// The path a launch argument names: quotes around it are removed and a `file:///C:/...` or
/// `file://server/share/...` URL becomes a Windows path (percent escapes decoded).
pub fn flow_arg_path(arg: &str) -> String {
    let arg = arg.trim().trim_matches('"').trim();
    if arg.len() >= 7 && arg[..7].eq_ignore_ascii_case("file://") {
        if let Some(path) = crate::file_uri::file_uri_to_path(arg) {
            return path;
        }
    }
    arg.to_string()
}

fn resolve_file_path(arg: &str) -> Option<std::path::PathBuf> {
    let path = std::path::PathBuf::from(flow_arg_path(arg));
    path.is_file().then_some(path)
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
            if !is_flow_path(&flow_arg_path(arg)) {
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
    use super::{flow_arg_path, is_flow_path};

    #[test]
    fn recognises_flow_files() {
        assert!(is_flow_path("/Users/me/Downloads/setup.flow"));
        assert!(is_flow_path("C:\\Users\\me\\Setup.FLOW"));
        assert!(is_flow_path("file:///tmp/deploy.workflow.json"));
        assert!(!is_flow_path("/tmp/package.json"));
        assert!(!is_flow_path("cero://open?path=/tmp"));
    }

    #[test]
    fn launch_arguments_become_windows_paths() {
        assert_eq!(flow_arg_path(r"C:\Users\a b\x.flow"), r"C:\Users\a b\x.flow");
        assert_eq!(flow_arg_path(r#""C:\Users\a b\x.flow""#), r"C:\Users\a b\x.flow");
        assert_eq!(flow_arg_path("file:///C:/Users/a%20b/x.flow"), r"C:\Users\a b\x.flow");
        assert_eq!(flow_arg_path("FILE:///c:/x.flow"), r"c:\x.flow");
        assert_eq!(flow_arg_path(r"\\server\share\x.flow"), r"\\server\share\x.flow");
        assert_eq!(flow_arg_path("file://server/share/x.flow"), r"\\server\share\x.flow");
        assert_eq!(flow_arg_path("  setup.flow  "), "setup.flow");
    }

    #[test]
    fn quoted_and_url_arguments_count_as_flow_files() {
        assert!(is_flow_path(r#""C:\Users\a b\x.flow""#));
        assert!(is_flow_path("file:///C:/Users/a%20b/x.flow"));
        assert!(is_flow_path(r"\\server\share\x.flow"));
    }

    #[test]
    fn filter_flow_argv_accepts_url_and_quoted_forms_of_an_existing_file() {
        let dir = std::env::temp_dir().join(format!("cero launch test {}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("my setup.flow");
        std::fs::write(&file, b"{}").unwrap();
        let plain = file.to_string_lossy().to_string();
        let quoted = format!("\"{}\"", plain);
        let url = format!("file:///{}", plain.replace('\\', "/").replace(' ', "%20"));

        let argv = vec!["cero".to_string(), quoted, url, plain.clone()];
        let found = super::filter_flow_argv(&argv);
        assert_eq!(found, vec![plain.clone(), plain.clone(), plain]);
        let _ = std::fs::remove_dir_all(&dir);
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
            "cero-terminal".to_string(),
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
