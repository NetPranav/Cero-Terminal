//! `.flow` file association status for the Settings screen.
//!
//! On Windows the installer (NSIS hook / MSI) registers the association, so the app only reports
//! it. TODO(2.6): read the real registry state (`HKCU`/`HKLM` `Software\Classes`) and let the user
//! turn the association on or off from Settings.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AssociationStatus {
    pub is_appimage: bool,
    pub registered: bool,
    pub decision: String, // "accepted", "declined", "pending", "system_managed", "not_applicable"
    pub appimage_path: Option<String>,
    pub desktop_file: Option<String>,
}

/// Called once at startup. The installer owns the registration, so there is nothing to do yet.
pub fn ensure_registered(_app: &tauri::AppHandle) {}

#[tauri::command]
pub fn get_association_status() -> AssociationStatus {
    AssociationStatus {
        is_appimage: false,
        registered: true,
        decision: "system_managed".to_string(),
        appimage_path: None,
        desktop_file: None,
    }
}

#[tauri::command]
pub fn set_association_status(enabled: bool) -> Result<AssociationStatus, String> {
    // TODO(2.6): add or remove the registry keys for the current user
    let _ = enabled;
    Ok(get_association_status())
}
