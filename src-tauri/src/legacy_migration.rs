//! One-time move from the app's old name (Sentinel Terminal) to Cero.
//!
//! `~/.sentinel` becomes `~/.cero` (models, workflows, learned state, secrets file) so nobody has to download
//! the model again or loses a saved workflow. Nothing is deleted: if `~/.cero` already exists, the old folder is
//! left alone.

use std::path::Path;

/// Move `<home>/.sentinel` to `<home>/.cero` when only the old one exists. Returns true when it moved.
pub fn migrate_home(home: &Path) -> std::io::Result<bool> {
    let old = home.join(".sentinel");
    let new = home.join(".cero");
    if !old.is_dir() || new.exists() {
        return Ok(false);
    }
    std::fs::rename(&old, &new)?;
    // files inside that carried the old name
    let models = new.join("models");
    if let Ok(entries) = std::fs::read_dir(&models) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(rest) = name.strip_prefix("sentinel_") {
                let target = models.join(format!("cero_{rest}"));
                if !target.exists() {
                    let _ = std::fs::rename(entry.path(), target);
                }
            }
        }
    }
    Ok(true)
}

/// Copy a folder tree (files and folders only). Used for the app's own data folders, which are named after the
/// bundle id and so change with the rename; the old copy is left in place.
pub fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else if ty.is_file() {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Old bundle ids whose data folders should follow the app to `org.cero.terminal`
const OLD_IDS: [&str; 2] = ["org.sentinel.terminal", "com.pranav.sentinel-terminal"];
const NEW_ID: &str = "org.cero.terminal";

/// The folders an app keeps per bundle id on this OS: the web view's saved settings and the app's own data
fn app_data_roots(home: &Path) -> Vec<std::path::PathBuf> {
    let mut roots = Vec::new();
    if cfg!(target_os = "macos") {
        roots.push(home.join("Library/WebKit"));
        roots.push(home.join("Library/Application Support"));
    } else if cfg!(target_os = "windows") {
        for var in ["LOCALAPPDATA", "APPDATA"] {
            if let Ok(v) = std::env::var(var) {
                roots.push(std::path::PathBuf::from(v));
            }
        }
    } else {
        roots.push(home.join(".local/share"));
        roots.push(home.join(".config"));
    }
    roots
}

/// For each root, copy `<root>/<old id>` to `<root>/org.cero.terminal` when the new one does not exist yet.
/// Returns how many folders were copied.
pub fn migrate_app_data(roots: &[std::path::PathBuf]) -> usize {
    let mut copied = 0;
    for root in roots {
        let new = root.join(NEW_ID);
        if new.exists() {
            continue;
        }
        for old_id in OLD_IDS {
            let old = root.join(old_id);
            if old.is_dir() && copy_dir(&old, &new).is_ok() {
                copied += 1;
                break;
            }
        }
    }
    copied
}

pub fn migrate_legacy_data() {
    let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) else { return };
    // do the moves first and write the log after: logging can create ~/.cero, and the move needs it not to exist yet
    let moved_home = migrate_home(Path::new(&home));
    let copied = migrate_app_data(&app_data_roots(Path::new(&home)));
    match moved_home {
        Ok(true) => crate::logger::log_info("MIGRATE", "Moved ~/.sentinel to ~/.cero"),
        Ok(false) => {}
        Err(e) => crate::logger::log_info("MIGRATE", &format!("Could not move ~/.sentinel to ~/.cero: {e}")),
    }
    if copied > 0 {
        crate::logger::log_info("MIGRATE", &format!("Copied {copied} app data folder(s) from the old bundle id"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_home(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("cero-migrate-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn moves_the_old_folder_and_renames_model_files() {
        let home = temp_home("move");
        fs::create_dir_all(home.join(".sentinel/models")).unwrap();
        fs::write(home.join(".sentinel/models/sentinel_lora.gguf"), "x").unwrap();
        fs::write(home.join(".sentinel/models/qwen.gguf"), "y").unwrap();
        fs::create_dir_all(home.join(".sentinel/workflows")).unwrap();
        fs::write(home.join(".sentinel/workflows/a.flow"), "{}").unwrap();
        assert!(migrate_home(&home).unwrap());
        assert!(!home.join(".sentinel").exists());
        assert!(home.join(".cero/models/cero_lora.gguf").exists());
        assert!(home.join(".cero/models/qwen.gguf").exists());
        assert!(home.join(".cero/workflows/a.flow").exists());
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn leaves_everything_alone_when_the_new_folder_exists_or_there_is_no_old_one() {
        let home = temp_home("keep");
        assert!(!migrate_home(&home).unwrap());
        fs::create_dir_all(home.join(".sentinel")).unwrap();
        fs::create_dir_all(home.join(".cero")).unwrap();
        assert!(!migrate_home(&home).unwrap());
        assert!(home.join(".sentinel").exists());
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn copies_the_old_app_data_folder_once_and_keeps_the_old_one() {
        let root = temp_home("appdata");
        fs::create_dir_all(root.join("org.sentinel.terminal/WebsiteData/LocalStorage")).unwrap();
        fs::write(root.join("org.sentinel.terminal/WebsiteData/LocalStorage/a.sqlite3"), "settings").unwrap();
        assert_eq!(migrate_app_data(&[root.clone()]), 1);
        assert_eq!(fs::read_to_string(root.join("org.cero.terminal/WebsiteData/LocalStorage/a.sqlite3")).unwrap(), "settings");
        assert!(root.join("org.sentinel.terminal").exists());
        // the new folder exists now, so a second run changes nothing
        fs::write(root.join("org.cero.terminal/WebsiteData/LocalStorage/a.sqlite3"), "newer").unwrap();
        assert_eq!(migrate_app_data(&[root.clone()]), 0);
        assert_eq!(fs::read_to_string(root.join("org.cero.terminal/WebsiteData/LocalStorage/a.sqlite3")).unwrap(), "newer");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn running_twice_is_harmless() {
        let home = temp_home("twice");
        fs::create_dir_all(home.join(".sentinel")).unwrap();
        assert!(migrate_home(&home).unwrap());
        assert!(!migrate_home(&home).unwrap());
        let _ = fs::remove_dir_all(&home);
    }
}
