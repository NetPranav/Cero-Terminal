#![allow(dead_code)]
//! Secrets (API keys): the operating system keychain where there is one, a private file where there is not.
//!
//! macOS: Keychain. Windows: Credential Manager. Linux: `~/.cero/secrets.json` with mode 0600, because
//! the Secret Service needs system libraries a bare window manager may not have. Every command returns an
//! error rather than pretending: the caller keeps the old copy of a key until a write has been read back.

use std::collections::BTreeMap;
use std::path::PathBuf;

const FILE_NAME: &str = "secrets.json";

fn secrets_file() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).map_err(|e| e.to_string())?;
    Ok(PathBuf::from(home).join(".cero").join(FILE_NAME))
}

fn read_map(path: &PathBuf) -> BTreeMap<String, String> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn write_map(path: &PathBuf, map: &BTreeMap<String, String>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    // write next to the target and rename, so a crash never leaves half a file
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn entry_name(service: &str, key: &str) -> String {
    format!("{service}:{key}")
}

// ---- file backend (Linux, and the unit tests) ---------------------------------------------------

pub fn file_set(path: &PathBuf, service: &str, key: &str, value: &str) -> Result<(), String> {
    let mut map = read_map(path);
    map.insert(entry_name(service, key), value.to_string());
    write_map(path, &map)
}

pub fn file_get(path: &PathBuf, service: &str, key: &str) -> Option<String> {
    read_map(path).get(&entry_name(service, key)).cloned()
}

pub fn file_delete(path: &PathBuf, service: &str, key: &str) -> Result<(), String> {
    let mut map = read_map(path);
    if map.remove(&entry_name(service, key)).is_some() {
        write_map(path, &map)?;
    }
    Ok(())
}

// ---- keychain backend (macOS, Windows) ----------------------------------------------------------

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod native {
    pub fn set(service: &str, key: &str, value: &str) -> Result<(), String> {
        keyring::Entry::new(service, key).map_err(|e| e.to_string())?.set_password(value).map_err(|e| e.to_string())
    }
    pub fn get(service: &str, key: &str) -> Result<Option<String>, String> {
        match keyring::Entry::new(service, key).map_err(|e| e.to_string())?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn delete(service: &str, key: &str) -> Result<(), String> {
        match keyring::Entry::new(service, key).map_err(|e| e.to_string())?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

/// "keychain" or "file": what Settings tells the person
#[tauri::command]
pub fn secret_backend() -> String {
    if cfg!(any(target_os = "macos", target_os = "windows")) { "keychain".into() } else { "file".into() }
}

#[tauri::command]
pub fn secret_set(service: String, key: String, value: String) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        return native::set(&service, &key, &value);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        file_set(&secrets_file()?, &service, &key, &value)
    }
}

#[tauri::command]
pub fn secret_get(service: String, key: String) -> Result<Option<String>, String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        return native::get(&service, &key);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(file_get(&secrets_file()?, &service, &key))
    }
}

#[tauri::command]
pub fn secret_delete(service: String, key: String) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        return native::delete(&service, &key);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        file_delete(&secrets_file()?, &service, &key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cero-secrets-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("secrets.json")
    }

    #[test]
    fn file_backend_round_trips_and_deletes() {
        let f = temp_file("rt");
        assert_eq!(file_get(&f, "cloud_api", "openai"), None);
        file_set(&f, "cloud_api", "openai", "sk-test").unwrap();
        file_set(&f, "cloud_api", "groq", "gsk-test").unwrap();
        assert_eq!(file_get(&f, "cloud_api", "openai").as_deref(), Some("sk-test"));
        file_delete(&f, "cloud_api", "openai").unwrap();
        assert_eq!(file_get(&f, "cloud_api", "openai"), None);
        assert_eq!(file_get(&f, "cloud_api", "groq").as_deref(), Some("gsk-test"));
        let _ = std::fs::remove_dir_all(f.parent().unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn file_is_private_to_the_owner() {
        use std::os::unix::fs::PermissionsExt;
        let f = temp_file("mode");
        file_set(&f, "s", "k", "v").unwrap();
        let mode = std::fs::metadata(&f).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        let _ = std::fs::remove_dir_all(f.parent().unwrap());
    }

    #[test]
    fn a_damaged_file_reads_as_empty_and_is_replaced() {
        let f = temp_file("bad");
        std::fs::create_dir_all(f.parent().unwrap()).unwrap();
        std::fs::write(&f, "{not json").unwrap();
        assert_eq!(file_get(&f, "s", "k"), None);
        file_set(&f, "s", "k", "v").unwrap();
        assert_eq!(file_get(&f, "s", "k").as_deref(), Some("v"));
        let _ = std::fs::remove_dir_all(f.parent().unwrap());
    }
}
