#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

static MIME_XML: &str = include_str!("../../packaging/linux/sentinel-terminal-mime.xml");
static FLOW_16: &[u8] = include_bytes!("../icons/flow/flow-16.png");
static FLOW_24: &[u8] = include_bytes!("../icons/flow/flow-24.png");
static FLOW_32: &[u8] = include_bytes!("../icons/flow/flow-32.png");
static FLOW_48: &[u8] = include_bytes!("../icons/flow/flow-48.png");
static FLOW_64: &[u8] = include_bytes!("../icons/flow/flow-64.png");
static FLOW_128: &[u8] = include_bytes!("../icons/flow/flow-128.png");
static FLOW_256: &[u8] = include_bytes!("../icons/flow/flow-256.png");
static FLOW_512: &[u8] = include_bytes!("../icons/flow/flow-512.png");
static FLOW_SVG: &str = include_str!("../icons/flow/application-x-sentinel-workflow.svg");

static APP_ICON_512: &[u8] = include_bytes!("../icons/icon.png");
static APP_ICON_128: &[u8] = include_bytes!("../icons/128x128.png");
static APP_ICON_32: &[u8] = include_bytes!("../icons/32x32.png");

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AssociationStatus {
    pub is_appimage: bool,
    pub registered: bool,
    pub decision: String, // "accepted", "declined", "pending", "system_managed", "not_applicable"
    pub appimage_path: Option<String>,
    pub desktop_file: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AssociationStore {
    pub registered: bool,
    pub appimage_path: Option<String>,
    pub decision: Option<String>, // "accepted" | "declined"
}

#[derive(Debug, PartialEq, Eq)]
pub enum DecisionState {
    Accepted,
    Declined,
    Pending,
}

pub fn evaluate_decision_state(stored_decision: Option<&str>, user_choice: Option<bool>) -> DecisionState {
    match user_choice {
        Some(true) => DecisionState::Accepted,
        Some(false) => DecisionState::Declined,
        None => match stored_decision {
            Some("accepted") => DecisionState::Accepted,
            Some("declined") => DecisionState::Declined,
            _ => DecisionState::Pending,
        },
    }
}

pub fn build_desktop_entry(appimage_path: &str) -> String {
    format!(
r#"[Desktop Entry]
Name=Sentinel Terminal
Comment=Autonomous AI-Native Linux Terminal Copilot
Exec="{}" %F
Icon=sentinel-terminal
Terminal=false
Type=Application
Categories=Development;System;TerminalEmulator;
StartupWMClass=sentinel-terminal
Keywords=terminal;shell;copilot;prompt;pty;ai;workflow;flow;
MimeType=application/x-sentinel-workflow;
"#,
        appimage_path
    )
}

pub fn get_user_home() -> Option<PathBuf> {
    #[allow(deprecated)]
    std::env::home_dir()
}

pub fn association_store_path(home_dir: &Path) -> PathBuf {
    home_dir.join(".sentinel").join("association.json")
}

pub fn load_association_store(home_dir: &Path) -> AssociationStore {
    let p = association_store_path(home_dir);
    if let Ok(data) = fs::read_to_string(&p) {
        if let Ok(store) = serde_json::from_str::<AssociationStore>(&data) {
            return store;
        }
    }
    AssociationStore::default()
}

pub fn save_association_store(home_dir: &Path, store: &AssociationStore) -> std::io::Result<()> {
    let p = association_store_path(home_dir);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_string_pretty(store)?;
    fs::write(p, data)
}

pub fn write_association_files(home_dir: &Path, appimage_path: &str) -> std::io::Result<Vec<PathBuf>> {
    let mut written = Vec::new();

    // 1. MIME package
    let mime_dir = home_dir.join(".local/share/mime/packages");
    fs::create_dir_all(&mime_dir)?;
    let mime_file = mime_dir.join("sentinel-terminal.xml");
    fs::write(&mime_file, MIME_XML)?;
    written.push(mime_file);

    // 2. Desktop launcher
    let app_dir = home_dir.join(".local/share/applications");
    fs::create_dir_all(&app_dir)?;
    let desktop_file = app_dir.join("sentinel-terminal.desktop");
    fs::write(&desktop_file, build_desktop_entry(appimage_path))?;
    written.push(desktop_file);

    // 3. App icons
    let icons_base = home_dir.join(".local/share/icons/hicolor");
    let app_sizes: &[(usize, &[u8])] = &[
        (512, APP_ICON_512),
        (128, APP_ICON_128),
        (32, APP_ICON_32),
    ];
    for (size, data) in app_sizes {
        let dir = icons_base.join(format!("{}x{}/apps", size, size));
        fs::create_dir_all(&dir)?;
        let path = dir.join("sentinel-terminal.png");
        fs::write(&path, data)?;
        written.push(path);
    }

    // 4. Mimetype icons
    let mime_sizes: &[(usize, &[u8])] = &[
        (16, FLOW_16),
        (24, FLOW_24),
        (32, FLOW_32),
        (48, FLOW_48),
        (64, FLOW_64),
        (128, FLOW_128),
        (256, FLOW_256),
        (512, FLOW_512),
    ];
    for (size, data) in mime_sizes {
        let dir = icons_base.join(format!("{}x{}/mimetypes", size, size));
        fs::create_dir_all(&dir)?;
        let path = dir.join("application-x-sentinel-workflow.png");
        fs::write(&path, data)?;
        written.push(path);
    }

    // Scalable SVG
    let scalable_dir = icons_base.join("scalable/mimetypes");
    fs::create_dir_all(&scalable_dir)?;
    let svg_path = scalable_dir.join("application-x-sentinel-workflow.svg");
    fs::write(&svg_path, FLOW_SVG)?;
    written.push(svg_path);

    Ok(written)
}

pub fn remove_association_files(home_dir: &Path) -> std::io::Result<()> {
    // 1. Remove mime xml
    let mime_file = home_dir.join(".local/share/mime/packages/sentinel-terminal.xml");
    if mime_file.exists() {
        let _ = fs::remove_file(mime_file);
    }

    // 2. Remove desktop file
    let desktop_file = home_dir.join(".local/share/applications/sentinel-terminal.desktop");
    if desktop_file.exists() {
        let _ = fs::remove_file(desktop_file);
    }

    // 3. Remove icons
    let icons_base = home_dir.join(".local/share/icons/hicolor");
    for size in &[512, 128, 32] {
        let p = icons_base.join(format!("{}x{}/apps/sentinel-terminal.png", size, size));
        if p.exists() {
            let _ = fs::remove_file(p);
        }
    }

    for size in &[16, 24, 32, 48, 64, 128, 256, 512] {
        let p = icons_base.join(format!("{}x{}/mimetypes/application-x-sentinel-workflow.png", size, size));
        if p.exists() {
            let _ = fs::remove_file(p);
        }
    }

    let svg_path = icons_base.join("scalable/mimetypes/application-x-sentinel-workflow.svg");
    if svg_path.exists() {
        let _ = fs::remove_file(svg_path);
    }

    Ok(())
}

pub fn update_linux_caches(home_dir: &Path) {
    let mime_dir = home_dir.join(".local/share/mime");
    let app_dir = home_dir.join(".local/share/applications");
    let icon_dir = home_dir.join(".local/share/icons/hicolor");

    let _ = std::process::Command::new("update-mime-database")
        .arg(&mime_dir)
        .status();
    let _ = std::process::Command::new("update-desktop-database")
        .arg(&app_dir)
        .status();
    let _ = std::process::Command::new("gtk-update-icon-cache")
        .args(&["-t", "-f"])
        .arg(&icon_dir)
        .status();
}

pub fn ensure_registered(_app: &tauri::AppHandle) {
    #[cfg(target_os = "linux")]
    {
        let appimage_env = match std::env::var("APPIMAGE") {
            Ok(val) if !val.trim().is_empty() => val,
            _ => return,
        };

        // If system copy exists, no AppImage self-registration needed
        if Path::new("/usr/share/mime/packages/sentinel-terminal.xml").exists() {
            return;
        }

        let home_dir = match get_user_home() {
            Some(h) => h,
            None => return,
        };

        let mut store = load_association_store(&home_dir);
        if store.decision.as_deref() == Some("accepted") {
            let desktop_path = home_dir.join(".local/share/applications/sentinel-terminal.desktop");
            let path_changed = store.appimage_path.as_deref() != Some(&appimage_env);
            if path_changed || !desktop_path.exists() {
                if write_association_files(&home_dir, &appimage_env).is_ok() {
                    update_linux_caches(&home_dir);
                    store.appimage_path = Some(appimage_env);
                    store.registered = true;
                    let _ = save_association_store(&home_dir, &store);
                }
            }
        }
    }
}

#[tauri::command]
pub fn get_association_status() -> AssociationStatus {
    #[cfg(target_os = "linux")]
    {
        let is_appimage = std::env::var("APPIMAGE").map(|s| !s.trim().is_empty()).unwrap_or(false);
        let system_managed = Path::new("/usr/share/mime/packages/sentinel-terminal.xml").exists();

        if system_managed {
            return AssociationStatus {
                is_appimage,
                registered: true,
                decision: "system_managed".to_string(),
                appimage_path: None,
                desktop_file: Some("/usr/share/applications/sentinel-terminal.desktop".to_string()),
            };
        }

        let home_dir = get_user_home().unwrap_or_else(|| PathBuf::from("/tmp"));
        let store = load_association_store(&home_dir);
        let desktop_file = home_dir.join(".local/share/applications/sentinel-terminal.desktop");
        let registered = store.registered && desktop_file.exists();

        let decision = if is_appimage {
            store.decision.unwrap_or_else(|| "pending".to_string())
        } else {
            "not_applicable".to_string()
        };

        AssociationStatus {
            is_appimage,
            registered,
            decision,
            appimage_path: std::env::var("APPIMAGE").ok().or(store.appimage_path),
            desktop_file: if registered { Some(desktop_file.to_string_lossy().to_string()) } else { None },
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        AssociationStatus {
            is_appimage: false,
            registered: true,
            decision: "system_managed".to_string(),
            appimage_path: None,
            desktop_file: None,
        }
    }
}

#[tauri::command]
pub fn set_association_status(enabled: bool) -> Result<AssociationStatus, String> {
    #[cfg(target_os = "linux")]
    {
        let home_dir = get_user_home().ok_or_else(|| "Failed to determine user home directory".to_string())?;
        let appimage_path = std::env::var("APPIMAGE").unwrap_or_else(|_| {
            std::env::current_exe()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| "sentinel-terminal".to_string())
        });

        let mut store = load_association_store(&home_dir);
        if enabled {
            write_association_files(&home_dir, &appimage_path).map_err(|e| e.to_string())?;
            update_linux_caches(&home_dir);
            store.registered = true;
            store.appimage_path = Some(appimage_path.clone());
            store.decision = Some("accepted".to_string());
            save_association_store(&home_dir, &store).map_err(|e| e.to_string())?;

            let desktop_path = home_dir.join(".local/share/applications/sentinel-terminal.desktop");
            Ok(AssociationStatus {
                is_appimage: std::env::var("APPIMAGE").is_ok(),
                registered: true,
                decision: "accepted".to_string(),
                appimage_path: Some(appimage_path),
                desktop_file: Some(desktop_path.to_string_lossy().to_string()),
            })
        } else {
            remove_association_files(&home_dir).map_err(|e| e.to_string())?;
            update_linux_caches(&home_dir);
            store.registered = false;
            store.decision = Some("declined".to_string());
            save_association_store(&home_dir, &store).map_err(|e| e.to_string())?;

            Ok(AssociationStatus {
                is_appimage: std::env::var("APPIMAGE").is_ok(),
                registered: false,
                decision: "declined".to_string(),
                appimage_path: None,
                desktop_file: None,
            })
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = enabled;
        Ok(get_association_status())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_desktop_entry_quotes_spaces() {
        let path = "/home/user/App Images/Sentinel Terminal-2.1.0.AppImage";
        let content = build_desktop_entry(path);
        assert!(content.contains(&format!("Exec=\"{}\" %F", path)));
        assert!(content.contains("MimeType=application/x-sentinel-workflow;"));
        assert!(content.contains("StartupWMClass=sentinel-terminal"));
    }

    #[test]
    fn test_decision_state_machine() {
        // Initial state with no prior record
        assert_eq!(evaluate_decision_state(None, None), DecisionState::Pending);

        // User accepts
        assert_eq!(evaluate_decision_state(None, Some(true)), DecisionState::Accepted);
        assert_eq!(evaluate_decision_state(Some("pending"), Some(true)), DecisionState::Accepted);

        // User declines
        assert_eq!(evaluate_decision_state(None, Some(false)), DecisionState::Declined);
        assert_eq!(evaluate_decision_state(Some("pending"), Some(false)), DecisionState::Declined);

        // Existing accepted record preserved when no prompt
        assert_eq!(evaluate_decision_state(Some("accepted"), None), DecisionState::Accepted);

        // Existing declined record preserved when no prompt
        assert_eq!(evaluate_decision_state(Some("declined"), None), DecisionState::Declined);
    }

    #[test]
    fn test_write_and_remove_association_files() {
        let temp_dir = std::env::temp_dir().join(format!("sentinel_assoc_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);

        let appimage_path = "/tmp/test apps/Sentinel.AppImage";
        let written = write_association_files(&temp_dir, appimage_path).expect("write files failed");
        assert!(!written.is_empty());

        let desktop_file = temp_dir.join(".local/share/applications/sentinel-terminal.desktop");
        let mime_file = temp_dir.join(".local/share/mime/packages/sentinel-terminal.xml");
        let icon_file = temp_dir.join(".local/share/icons/hicolor/16x16/mimetypes/application-x-sentinel-workflow.png");

        assert!(desktop_file.exists());
        assert!(mime_file.exists());
        assert!(icon_file.exists());

        let desktop_content = fs::read_to_string(&desktop_file).unwrap();
        assert!(desktop_content.contains("Exec=\"/tmp/test apps/Sentinel.AppImage\" %F"));

        // Now test removal
        remove_association_files(&temp_dir).expect("remove files failed");
        assert!(!desktop_file.exists());
        assert!(!mime_file.exists());
        assert!(!icon_file.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
