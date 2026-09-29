//! Continuous watching of log files and systemd units for the error watcher (`>watch`).
//!
//! Files are tailed by polling their size once a second: cheap for a handful of files, works on
//! every filesystem (including network mounts where inotify does not), and handles rotation and
//! truncation. New complete lines are emitted to the webview as `sentinel-watch-lines` events;
//! the TypeScript side decides what is an error and what to do about it.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Newest bytes read per poll; a file growing faster than this skips ahead to the newest data.
const MAX_READ_PER_TICK: u64 = 256 * 1024;
/// A line longer than this without a newline is flushed as-is.
const MAX_PARTIAL_LINE: usize = 16 * 1024;
const MAX_LINES_PER_EVENT: usize = 500;
const POLL_INTERVAL: Duration = Duration::from_millis(1000);

#[derive(Serialize, Clone)]
pub struct WatchLines {
    pub id: u64,
    pub lines: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct WatchInfo {
    pub id: u64,
    pub kind: String,
    pub target: String,
}

struct WatchEntry {
    info: WatchInfo,
    task: tauri::async_runtime::JoinHandle<()>,
}

#[derive(Default)]
pub struct WatchState {
    next_id: AtomicU64,
    watches: Mutex<HashMap<u64, WatchEntry>>,
}

/// Where reading continues after a stat: from the same offset, from the start (rotated or
/// truncated), or from the newest MAX_READ_PER_TICK bytes (fell too far behind).
pub fn next_read_offset(len: u64, offset: u64, same_file: bool) -> u64 {
    let start = if !same_file || len < offset { 0 } else { offset };
    if len.saturating_sub(start) > MAX_READ_PER_TICK {
        len - MAX_READ_PER_TICK
    } else {
        start
    }
}

/// Split newly read bytes into complete lines, carrying an unterminated tail over to the next
/// read. Works on bytes so a multi-byte UTF-8 character split across reads stays intact.
pub fn split_lines(partial: &mut Vec<u8>, chunk: &[u8]) -> Vec<String> {
    partial.extend_from_slice(chunk);
    let mut lines = Vec::new();
    while let Some(pos) = partial.iter().position(|b| *b == b'\n') {
        let line: Vec<u8> = partial.drain(..=pos).collect();
        let text = String::from_utf8_lossy(&line[..line.len() - 1]).trim_end_matches('\r').to_string();
        if !text.is_empty() {
            lines.push(text);
        }
    }
    if partial.len() > MAX_PARTIAL_LINE {
        lines.push(String::from_utf8_lossy(partial).to_string());
        partial.clear();
    }
    lines
}

#[cfg(unix)]
fn file_identity(meta: &std::fs::Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    meta.ino()
}

#[cfg(not(unix))]
fn file_identity(_meta: &std::fs::Metadata) -> u64 {
    0
}

fn read_from(path: &Path, offset: u64, max: u64) -> std::io::Result<Vec<u8>> {
    let mut file = std::fs::File::open(path)?;
    file.seek(SeekFrom::Start(offset))?;
    let mut buf = Vec::new();
    file.take(max).read_to_end(&mut buf)?;
    Ok(buf)
}

fn emit_lines(app: &AppHandle, id: u64, mut lines: Vec<String>) {
    while !lines.is_empty() {
        let rest = if lines.len() > MAX_LINES_PER_EVENT { lines.split_off(MAX_LINES_PER_EVENT) } else { Vec::new() };
        let _ = app.emit("sentinel-watch-lines", WatchLines { id, lines });
        lines = rest;
    }
}

async fn tail_file(app: AppHandle, id: u64, path: PathBuf, from_start: bool) {
    let initial = std::fs::metadata(&path).ok();
    let mut identity = initial.as_ref().map(file_identity);
    let mut offset = if from_start { 0 } else { initial.map(|m| m.len()).unwrap_or(0) };
    let mut partial: Vec<u8> = Vec::new();

    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        let Ok(meta) = std::fs::metadata(&path) else { continue };
        let current = file_identity(&meta);
        let same_file = identity == Some(current);
        if !same_file {
            partial.clear();
        }
        identity = Some(current);
        let start = next_read_offset(meta.len(), offset, same_file);
        if start != offset {
            partial.clear();
        }
        if meta.len() <= start {
            offset = meta.len();
            continue;
        }
        match read_from(&path, start, MAX_READ_PER_TICK) {
            Ok(bytes) => {
                offset = start + bytes.len() as u64;
                let lines = split_lines(&mut partial, &bytes);
                if !lines.is_empty() {
                    emit_lines(&app, id, lines);
                }
            }
            Err(_) => offset = start,
        }
    }
}

async fn stream_command(app: AppHandle, id: u64, program: String, args: Vec<String>) {
    use tokio::io::AsyncBufReadExt;
    let mut command = tokio::process::Command::new(&program);
    command
        .args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(crate::embedded_server::CREATE_NO_WINDOW);
    let child = command.spawn();
    let Ok(mut child) = child else {
        let _ = app.emit("sentinel-watch-lines", WatchLines { id, lines: vec![format!("[sentinel] could not start {}", program)] });
        return;
    };
    let Some(stdout) = child.stdout.take() else { return };
    let mut reader = tokio::io::BufReader::new(stdout).lines();
    let mut batch = Vec::new();
    loop {
        match tokio::time::timeout(Duration::from_millis(500), reader.next_line()).await {
            Ok(Ok(Some(line))) => {
                batch.push(line);
                if batch.len() >= MAX_LINES_PER_EVENT {
                    emit_lines(&app, id, std::mem::take(&mut batch));
                }
            }
            Ok(Ok(None)) | Ok(Err(_)) => break,
            Err(_) => {
                if !batch.is_empty() {
                    emit_lines(&app, id, std::mem::take(&mut batch));
                }
            }
        }
    }
    if !batch.is_empty() {
        emit_lines(&app, id, batch);
    }
    let _ = child.wait().await;
}

/// systemd unit names: letters, digits and :_.@- only (never passed through a shell anyway)
pub fn is_valid_unit_name(unit: &str) -> bool {
    !unit.is_empty() && unit.len() <= 256 && unit.chars().all(|c| c.is_ascii_alphanumeric() || ":_.@-".contains(c))
}

fn register(state: &WatchState, kind: &str, target: String, spawn: impl FnOnce(u64) -> tauri::async_runtime::JoinHandle<()>) -> Result<u64, String> {
    let id = state.next_id.fetch_add(1, Ordering::SeqCst) + 1;
    let task = spawn(id);
    let mut watches = state.watches.lock().map_err(|e| e.to_string())?;
    watches.insert(id, WatchEntry { info: WatchInfo { id, kind: kind.to_string(), target }, task });
    Ok(id)
}

#[tauri::command]
pub fn watch_file_start(app: AppHandle, state: tauri::State<'_, WatchState>, path: String, from_start: Option<bool>) -> Result<u64, String> {
    let resolved = crate::process_cmds::expand_tilde(&path);
    if resolved.is_dir() {
        return Err(format!("{} is a directory; watch a log file inside it", resolved.display()));
    }
    let target = resolved.to_string_lossy().to_string();
    register(state.inner(), "file", target, |id| {
        tauri::async_runtime::spawn(tail_file(app, id, resolved, from_start.unwrap_or(false)))
    })
}

#[tauri::command]
pub fn watch_service_start(app: AppHandle, state: tauri::State<'_, WatchState>, unit: String, user: Option<bool>) -> Result<u64, String> {
    if !is_valid_unit_name(&unit) {
        return Err(format!("Invalid systemd unit name: {}", unit));
    }
    let scope = if user.unwrap_or(false) { "--user-unit" } else { "-u" };
    let args = vec![scope.to_string(), unit.clone(), "-f".into(), "-n".into(), "0".into(), "-o".into(), "cat".into(), "--no-pager".into()];
    register(state.inner(), "service", unit, |id| {
        tauri::async_runtime::spawn(stream_command(app, id, "journalctl".to_string(), args))
    })
}

#[tauri::command]
pub fn watch_stop(state: tauri::State<'_, WatchState>, id: u64) -> Result<bool, String> {
    let mut watches = state.watches.lock().map_err(|e| e.to_string())?;
    Ok(match watches.remove(&id) {
        Some(entry) => {
            entry.task.abort();
            true
        }
        None => false,
    })
}

#[tauri::command]
pub fn watch_list(state: tauri::State<'_, WatchState>) -> Result<Vec<WatchInfo>, String> {
    let watches = state.watches.lock().map_err(|e| e.to_string())?;
    let mut list: Vec<WatchInfo> = watches.values().map(|w| w.info.clone()).collect();
    list.sort_by_key(|w| w.id);
    Ok(list)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_lines_and_keeps_partial_tail() {
        let mut partial = Vec::new();
        assert_eq!(split_lines(&mut partial, b"one\ntwo\nthr"), vec!["one", "two"]);
        assert_eq!(split_lines(&mut partial, b"ee\r\n\nfour\n"), vec!["three", "four"]);
        assert!(partial.is_empty());
    }

    #[test]
    fn keeps_multibyte_characters_split_across_reads() {
        let text = "Fehler: Datei nicht gefunden ✗\n".as_bytes();
        let (a, b) = text.split_at(text.len() - 3);
        let mut partial = Vec::new();
        assert!(split_lines(&mut partial, a).is_empty());
        assert_eq!(split_lines(&mut partial, b), vec!["Fehler: Datei nicht gefunden ✗"]);
    }

    #[test]
    fn restarts_after_rotation_or_truncation_and_skips_ahead_when_far_behind() {
        assert_eq!(next_read_offset(500, 100, true), 100);
        assert_eq!(next_read_offset(50, 100, true), 0); // truncated
        assert_eq!(next_read_offset(500, 100, false), 0); // rotated (new inode)
        let huge = 10 * MAX_READ_PER_TICK;
        assert_eq!(next_read_offset(huge, 0, true), huge - MAX_READ_PER_TICK);
    }

    #[test]
    fn validates_unit_names() {
        assert!(is_valid_unit_name("nginx.service"));
        assert!(is_valid_unit_name("getty@tty1.service"));
        assert!(!is_valid_unit_name("nginx; rm -rf ~"));
        assert!(!is_valid_unit_name(""));
    }
}
