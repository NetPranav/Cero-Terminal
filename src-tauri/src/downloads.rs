//! Native downloads into ~/.sentinel: the built-in model and the llama.cpp engine.
//!
//! The installer used `sh -c "curl ... && mv ..."`, `uname` and `ln -s`, none of which exist on
//! Windows. This module streams the file over HTTPS (resuming a partial download), checks the
//! SHA-256 before moving it into place, reports progress, and unpacks engine archives with the
//! system `tar` (built into macOS, Linux and Windows 10 and later), without symlinks.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Clone, Serialize, Default)]
pub struct DownloadStatus {
    pub active: bool,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub done: bool,
    pub error: Option<String>,
}

#[derive(Default)]
struct Entry {
    status: DownloadStatus,
    cancel: Arc<AtomicBool>,
}

static DOWNLOADS: once_cell::sync::Lazy<Mutex<HashMap<String, Entry>>> = once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

fn update(key: &str, f: impl FnOnce(&mut DownloadStatus)) {
    if let Some(entry) = DOWNLOADS.lock().unwrap().get_mut(key) {
        f(&mut entry.status);
    }
}

/// SHA-256 of a file, hex encoded
pub fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("{}: {}", path.display(), e))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect())
}

/// Download `url` to `dest` (resuming `dest.part`), verify `sha256` when given, then rename.
pub async fn download_to(url: &str, dest: &Path, sha256: Option<&str>, key: &str) -> Result<(), String> {
    use tauri_plugin_http::reqwest;
    let part = PathBuf::from(format!("{}.part", dest.display()));
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let cancel = DOWNLOADS.lock().unwrap().get(key).map(|e| e.cancel.clone()).unwrap_or_default();
    let mut have = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let mut request = client.get(url);
    if have > 0 {
        request = request.header("Range", format!("bytes={}-", have));
    }
    let mut response = request.send().await.map_err(|e| format!("download failed: {}", e))?;
    let status = response.status();
    if status.as_u16() == 416 {
        // The partial file is already complete
    } else if !status.is_success() {
        return Err(format!("download failed: HTTP {}", status));
    } else {
        let resumed = status.as_u16() == 206;
        if !resumed {
            have = 0;
        }
        let total = response.content_length().map(|n| n + have).unwrap_or(0);
        update(key, |s| {
            s.total_bytes = total;
            s.downloaded_bytes = have;
        });
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(resumed)
            .truncate(!resumed)
            .open(&part)
            .map_err(|e| e.to_string())?;
        while let Some(chunk) = response.chunk().await.map_err(|e| format!("download interrupted: {}", e))? {
            if cancel.load(Ordering::Relaxed) {
                return Err("cancelled".into());
            }
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            have += chunk.len() as u64;
            update(key, |s| s.downloaded_bytes = have);
        }
        file.flush().map_err(|e| e.to_string())?;
    }

    if let Some(expected) = sha256 {
        let actual = sha256_file(&part)?;
        if !actual.eq_ignore_ascii_case(expected.trim()) {
            let _ = std::fs::remove_file(&part);
            return Err(format!("SHA-256 mismatch: expected {}, got {}", expected, actual));
        }
    }
    let _ = std::fs::remove_file(dest);
    std::fs::rename(&part, dest).map_err(|e| e.to_string())
}

/// Start (or resume) a download into ~/.sentinel/<relative_path>. Returns when it finishes.
#[tauri::command]
pub async fn download_sentinel_file(url: String, relative_path: String, sha256: Option<String>) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("only https downloads are allowed".into());
    }
    let dest = crate::process_cmds::resolve_in_sentinel(&relative_path)?;
    {
        let mut map = DOWNLOADS.lock().unwrap();
        if map.get(&relative_path).map(|e| e.status.active).unwrap_or(false) {
            return Err("this file is already downloading".into());
        }
        map.insert(relative_path.clone(), Entry { status: DownloadStatus { active: true, ..Default::default() }, cancel: Arc::default() });
    }
    let result = download_to(&url, &dest, sha256.as_deref(), &relative_path).await;
    update(&relative_path, |s| {
        s.active = false;
        s.done = result.is_ok();
        s.error = result.as_ref().err().cloned();
    });
    result.map(|_| dest.display().to_string())
}

#[tauri::command]
pub fn get_sentinel_download_status(relative_path: String) -> DownloadStatus {
    DOWNLOADS.lock().unwrap().get(&relative_path).map(|e| e.status.clone()).unwrap_or_default()
}

/// Stop a running download; `remove_partial` also deletes what was downloaded so far.
#[tauri::command]
pub fn cancel_sentinel_download(relative_path: String, remove_partial: Option<bool>) -> Result<bool, String> {
    let found = DOWNLOADS.lock().unwrap().get(&relative_path).map(|e| e.cancel.store(true, Ordering::Relaxed)).is_some();
    if remove_partial.unwrap_or(false) {
        let dest = crate::process_cmds::resolve_in_sentinel(&relative_path)?;
        let _ = std::fs::remove_file(format!("{}.part", dest.display()));
    }
    Ok(found)
}

/// The directory holding `binary` below `root` (at most three levels down)
fn find_dir_with(root: &Path, binary: &str, depth: u32) -> Option<PathBuf> {
    if root.join(binary).is_file() {
        return Some(root.to_path_buf());
    }
    if depth == 0 {
        return None;
    }
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(root).ok()?.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
    dirs.sort();
    dirs.into_iter().find_map(|d| find_dir_with(&d, binary, depth - 1))
}

/// Unpack an archive into `engine_dir`/current: extract to a scratch folder with the system tar,
/// then move the folder that contains `binary` into place (replacing an older engine).
pub fn install_engine_archive(archive: &Path, engine_dir: &Path, binary: &str) -> Result<PathBuf, String> {
    let scratch = engine_dir.join(".extract");
    let _ = std::fs::remove_dir_all(&scratch);
    std::fs::create_dir_all(&scratch).map_err(|e| e.to_string())?;
    let mut tar = std::process::Command::new("tar");
    tar.arg("-xf").arg(archive).arg("-C").arg(&scratch);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        tar.creation_flags(crate::embedded_server::CREATE_NO_WINDOW);
    }
    let out = tar.output().map_err(|e| format!("could not run tar: {}", e))?;
    if !out.status.success() {
        return Err(format!("tar failed: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    let found = find_dir_with(&scratch, binary, 3).ok_or_else(|| format!("{} not found in the archive", binary))?;
    let current = engine_dir.join("current");
    // An older install may be a symlink (macOS/Linux installer) or a directory
    if let Ok(meta) = std::fs::symlink_metadata(&current) {
        if meta.file_type().is_symlink() || meta.is_file() {
            std::fs::remove_file(&current).map_err(|e| e.to_string())?;
        } else {
            std::fs::remove_dir_all(&current).map_err(|e| e.to_string())?;
        }
    }
    std::fs::rename(&found, &current).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&scratch);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let bin = current.join(binary);
        if let Ok(meta) = std::fs::metadata(&bin) {
            let mut perms = meta.permissions();
            perms.set_mode(perms.mode() | 0o755);
            let _ = std::fs::set_permissions(&bin, perms);
        }
    }
    Ok(current.join(binary))
}

/// Unpack ~/.sentinel/<relative_archive> as the engine and delete the archive.
#[tauri::command]
pub fn install_sentinel_engine(relative_archive: String) -> Result<String, String> {
    let archive = crate::process_cmds::resolve_in_sentinel(&relative_archive)?;
    let engine_dir = crate::process_cmds::resolve_in_sentinel("engine")?;
    let binary = if cfg!(windows) { "llama-server.exe" } else { "llama-server" };
    let installed = install_engine_archive(&archive, &engine_dir, binary)?;
    let _ = std::fs::remove_file(&archive);
    Ok(installed.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sentinel-dl-test-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn hashes_files() {
        let dir = temp_dir("hash");
        let f = dir.join("a.txt");
        std::fs::write(&f, b"abc").unwrap();
        assert_eq!(sha256_file(&f).unwrap(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn installs_an_archive_without_symlinks() {
        let dir = temp_dir("install");
        let src = dir.join("pkg").join("llama-b1");
        std::fs::create_dir_all(&src).unwrap();
        let binary = if cfg!(windows) { "llama-server.exe" } else { "llama-server" };
        std::fs::write(src.join(binary), b"bin").unwrap();
        std::fs::write(src.join("libggml.so"), b"lib").unwrap();
        let archive = dir.join("engine.tar");
        let status = std::process::Command::new("tar")
            .arg("-cf").arg(&archive).arg("-C").arg(dir.join("pkg")).arg("llama-b1")
            .status().unwrap();
        assert!(status.success());
        let engine = dir.join("engine");
        std::fs::create_dir_all(engine.join("current")).unwrap();
        std::fs::write(engine.join("current").join("old"), b"old").unwrap();

        let installed = install_engine_archive(&archive, &engine, binary).unwrap();
        assert_eq!(installed, engine.join("current").join(binary));
        assert!(engine.join("current").join("libggml.so").is_file());
        assert!(!engine.join("current").join("old").exists());
        assert!(!engine.join(".extract").exists());
    }

    #[tokio::test]
    async fn downloads_verify_the_checksum() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            for _ in 0..2 {
                let (mut sock, _) = listener.accept().await.unwrap();
                let mut buf = [0u8; 1024];
                let _ = sock.read(&mut buf).await;
                let _ = sock.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nabc").await;
            }
        });
        let dir = temp_dir("download");
        let dest = dir.join("m.bin");
        let url = format!("http://{}/m.bin", addr);
        download_to(&url, &dest, Some("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"), "t1").await.unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), b"abc");
        let bad = download_to(&url, &dir.join("n.bin"), Some("00"), "t2").await;
        assert!(bad.unwrap_err().contains("SHA-256 mismatch"));
        assert!(!dir.join("n.bin").exists());
        assert!(!dir.join("n.bin.part").exists());
    }
}
