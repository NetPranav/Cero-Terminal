//! Continuous watching of log files and Windows services for the error watcher (`>watch`).
//!
//! Files are tailed by polling their size once a second: cheap for a handful of files, works on
//! every filesystem (including network shares) and handles rotation (the NTFS file index changes) and
//! truncation. Files are opened with all share modes, so Cero never stops another program from writing,
//! renaming or deleting the log it reads. A Windows service is watched through the Event Log. New complete lines are emitted to the webview as `cero-watch-lines` events;
//! the TypeScript side decides what is an error and what to do about it.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::AsRawHandle;
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

/// Which file a path names right now: the volume and the NTFS file index. A log that is rotated (renamed, and a new
/// file created under the old name) has a different identity.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct FileId {
    volume: u32,
    index: u64,
}

/// FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE
const SHARE_ALL: u32 = 0x1 | 0x2 | 0x4;

/// Open a file for reading without locking it against writers, renamers or deleters.
fn open_shared(path: &Path) -> std::io::Result<std::fs::File> {
    std::fs::OpenOptions::new().read(true).share_mode(SHARE_ALL).open(path)
}

fn file_identity(path: &Path) -> Option<FileId> {
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Storage::FileSystem::{GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION};
    let file = open_shared(path).ok()?;
    let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
    let ok = unsafe { GetFileInformationByHandle(file.as_raw_handle() as HANDLE, &mut info) };
    if ok == 0 {
        return None;
    }
    Some(FileId {
        volume: info.dwVolumeSerialNumber,
        index: ((info.nFileIndexHigh as u64) << 32) | info.nFileIndexLow as u64,
    })
}

/// Whether the file now at the path is the one read before. An unreadable identity counts as the same file, so a
/// momentary failure does not restart the read from the top.
pub fn is_same_file(before: Option<FileId>, now: Option<FileId>) -> bool {
    now.is_none() || before == now
}

fn read_from(path: &Path, offset: u64, max: u64) -> std::io::Result<Vec<u8>> {
    let mut file = open_shared(path)?;
    file.seek(SeekFrom::Start(offset))?;
    let mut buf = Vec::new();
    file.take(max).read_to_end(&mut buf)?;
    Ok(buf)
}

fn emit_lines(app: &AppHandle, id: u64, mut lines: Vec<String>) {
    while !lines.is_empty() {
        let rest = if lines.len() > MAX_LINES_PER_EVENT { lines.split_off(MAX_LINES_PER_EVENT) } else { Vec::new() };
        let _ = app.emit("cero-watch-lines", WatchLines { id, lines });
        lines = rest;
    }
}

async fn tail_file(app: AppHandle, id: u64, path: PathBuf, from_start: bool) {
    let initial = std::fs::metadata(&path).ok();
    let mut identity = file_identity(&path);
    let mut offset = if from_start { 0 } else { initial.map(|m| m.len()).unwrap_or(0) };
    let mut partial: Vec<u8> = Vec::new();

    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        let Ok(meta) = std::fs::metadata(&path) else { continue };
        let current = file_identity(&path);
        let same_file = is_same_file(identity, current);
        if !same_file {
            partial.clear();
        }
        identity = current.or(identity);
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

/// Run a program and emit each line it prints. `env` is passed to the program (data that must not become part of a
/// script, such as a service name).
async fn stream_command(app: AppHandle, id: u64, program: String, args: Vec<String>, env: Vec<(String, String)>) {
    use tokio::io::AsyncBufReadExt;
    let mut command = tokio::process::Command::new(&program);
    command
        .args(&args)
        .envs(env)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    command.creation_flags(crate::embedded_server::CREATE_NO_WINDOW);
    let child = command.spawn();
    let Ok(mut child) = child else {
        let _ = app.emit("cero-watch-lines", WatchLines { id, lines: vec![format!("[cero] could not start {}", program)] });
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
#[allow(unused_variables)] // parameter names are the frontend's argument names; keep them
pub fn watch_service_start(app: AppHandle, state: tauri::State<'_, WatchState>, unit: String, user: Option<bool>) -> Result<u64, String> {
    let name = unit.trim().to_string();
    crate::service_watch::validate_service_name(&name)?;
    let args = vec![
        "-NoProfile".to_string(),
        "-NonInteractive".to_string(),
        "-ExecutionPolicy".to_string(),
        "Bypass".to_string(),
        "-Command".to_string(),
        crate::service_watch::WATCH_SCRIPT.to_string(),
    ];
    let env = vec![(crate::service_watch::SERVICE_ENV.to_string(), name.clone())];
    register(state.inner(), "service", name, |id| {
        tauri::async_runtime::spawn(stream_command(app, id, "powershell.exe".to_string(), args, env))
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
    fn an_unreadable_identity_does_not_restart_the_read() {
        let a = Some(FileId { volume: 1, index: 10 });
        let b = Some(FileId { volume: 1, index: 11 });
        assert!(is_same_file(a, a));
        assert!(!is_same_file(a, b), "a different file index is a rotated log");
        assert!(!is_same_file(Some(FileId { volume: 2, index: 10 }), a), "same index on another volume is another file");
        assert!(!is_same_file(None, a), "a file that appeared after the watch started is read from the top");
        assert!(is_same_file(a, None), "a failed lookup keeps the offset");
    }

    #[test]
    fn restarts_after_rotation_or_truncation_and_skips_ahead_when_far_behind() {
        assert_eq!(next_read_offset(500, 100, true), 100);
        assert_eq!(next_read_offset(50, 100, true), 0); // truncated
        assert_eq!(next_read_offset(500, 100, false), 0); // rotated (new file identity)
        let huge = 10 * MAX_READ_PER_TICK;
        assert_eq!(next_read_offset(huge, 0, true), huge - MAX_READ_PER_TICK);
    }
}

/// Against real files: rotation is noticed, and a tailed log can be renamed, written and deleted while it is read.
#[cfg(test)]
mod windows_tests {
    use super::*;
    use std::io::Write;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cero-watch-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_file_keeps_its_identity_and_a_new_file_under_the_same_name_does_not() {
        let dir = temp_dir("identity");
        let log = dir.join("app.log");
        std::fs::write(&log, b"line one\n").unwrap();
        let before = file_identity(&log).expect("identity of an existing file");
        assert_eq!(file_identity(&log), Some(before));

        // appending does not change it
        let mut file = std::fs::OpenOptions::new().append(true).open(&log).unwrap();
        file.write_all(b"line two\n").unwrap();
        drop(file);
        assert_eq!(file_identity(&log), Some(before));

        // rotation: the old file is renamed and a new one is created under the old name
        std::fs::rename(&log, dir.join("app.log.1")).unwrap();
        std::fs::write(&log, b"fresh\n").unwrap();
        let after = file_identity(&log).expect("identity of the new file");
        assert_ne!(before, after);
        assert!(!is_same_file(Some(before), Some(after)));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_file_has_no_identity() {
        assert_eq!(file_identity(Path::new(r"C:\no\such\folder\x.log")), None);
    }

    #[test]
    fn a_log_that_is_being_read_can_still_be_renamed_deleted_and_written() {
        let dir = temp_dir("share");
        let log = dir.join("busy.log");
        std::fs::write(&log, b"first\n").unwrap();

        let reader = open_shared(&log).expect("shared open");
        // another program appends, rotates and deletes while the handle is open
        let mut writer = std::fs::OpenOptions::new().append(true).open(&log).unwrap();
        writer.write_all(b"second\n").unwrap();
        drop(writer);
        std::fs::rename(&log, dir.join("busy.log.1")).expect("rename while open (needs FILE_SHARE_DELETE)");
        std::fs::remove_file(dir.join("busy.log.1")).expect("delete while open (needs FILE_SHARE_DELETE)");
        drop(reader);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_from_returns_what_was_appended_after_the_offset() {
        let dir = temp_dir("read");
        let log = dir.join("r.log");
        std::fs::write(&log, b"abc\ndef\n").unwrap();
        assert_eq!(read_from(&log, 4, 1024).unwrap(), b"def\n");
        assert_eq!(read_from(&log, 0, 3).unwrap(), b"abc");
        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// The Event Log script, run for real.
#[cfg(test)]
mod service_script_tests {
    use crate::service_watch::{SERVICE_ENV, WATCH_SCRIPT};
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    fn powershell(script: &str, service: &str) -> Command {
        let mut command = Command::new("powershell.exe");
        command
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
            .env(SERVICE_ENV, service)
            .creation_flags(crate::embedded_server::CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command
    }

    #[test]
    fn the_script_is_valid_powershell() {
        let check = "$null = [scriptblock]::Create($env:CERO_SCRIPT); exit 0";
        let status = powershell(check, "x").env("CERO_SCRIPT", WATCH_SCRIPT).status().unwrap();
        assert!(status.success(), "the script does not parse");
    }

    #[test]
    fn an_unknown_service_is_reported_and_the_script_ends() {
        let out = powershell(WATCH_SCRIPT, "CeroNoSuchService12345").output().unwrap();
        assert_eq!(out.status.code(), Some(2));
        assert!(String::from_utf8_lossy(&out.stdout).contains("service not found: CeroNoSuchService12345"));
    }

    #[test]
    fn a_real_service_is_watched_without_errors() {
        // The Windows Event Log service exists on every Windows machine. The script must start and keep running.
        let mut child = powershell(WATCH_SCRIPT, "EventLog").spawn().unwrap();
        let deadline = Instant::now() + Duration::from_secs(6);
        while Instant::now() < deadline {
            if let Some(status) = child.try_wait().unwrap() {
                panic!("the watch script ended early with {:?}", status.code());
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        let _ = child.kill();
        let _ = child.wait();
    }

    #[test]
    fn a_service_name_with_a_quote_never_reaches_the_script() {
        assert!(crate::service_watch::validate_service_name("x' or 1=1 or @Name='").is_err());
    }
}

