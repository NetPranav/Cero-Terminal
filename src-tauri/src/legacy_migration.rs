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

pub fn migrate_legacy_data() {
    let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) else { return };
    match migrate_home(Path::new(&home)) {
        Ok(true) => crate::logger::log_info("MIGRATE", "Moved ~/.sentinel to ~/.cero"),
        Ok(false) => {}
        Err(e) => crate::logger::log_info("MIGRATE", &format!("Could not move ~/.sentinel to ~/.cero: {e}")),
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
    fn running_twice_is_harmless() {
        let home = temp_home("twice");
        fs::create_dir_all(home.join(".sentinel")).unwrap();
        assert!(migrate_home(&home).unwrap());
        assert!(!migrate_home(&home).unwrap());
        let _ = fs::remove_dir_all(&home);
    }
}
