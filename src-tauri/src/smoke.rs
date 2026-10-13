//! `Cero.exe --smoke-test` (roadmap 2.10), for CI and for a first look on a new machine. Only active with
//! `CERO_SMOKE=1`.
//!
//! Cero starts as usual (so a missing WebView2 runtime fails it too), starts the default shell, types
//! `echo cero-smoke-ok`, waits for the answer, writes `%TEMP%\cero-smoke.json` and exits with 0 (all good) or 1.

use crate::pty::{self, PtySink, Sessions, SpawnRequest};
use crate::smoke_text;
use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const TIMEOUT: Duration = Duration::from_secs(30);

pub fn requested() -> bool {
    let args: Vec<String> = std::env::args().collect();
    smoke_text::requested(&args, std::env::var("CERO_SMOKE").ok().as_deref())
}

#[derive(Serialize, Debug, Default)]
pub struct SmokeResult {
    pub ok: bool,
    pub version: String,
    pub shell: Option<String>,
    pub time_to_first_output_ms: Option<u64>,
    pub time_to_marker_ms: Option<u64>,
    pub engine_binary_found: bool,
    pub error: Option<String>,
}

struct ChannelSink {
    output: Mutex<mpsc::Sender<Vec<u8>>>,
}

impl PtySink for ChannelSink {
    fn output(&self, _session_id: &str, data: &[u8]) {
        if let Ok(tx) = self.output.lock() {
            let _ = tx.send(data.to_vec());
        }
    }
    fn exit(&self, _session_id: &str) {}
}

/// Start the default shell, type the marker command and wait for the answer.
pub fn run_shell_check() -> SmokeResult {
    let mut result = SmokeResult {
        version: env!("CARGO_PKG_VERSION").to_string(),
        engine_binary_found: crate::embedded_server::engine_binary_found(),
        ..SmokeResult::default()
    };
    let sessions: Sessions = Arc::new(Mutex::new(HashMap::new()));
    let (tx, rx) = mpsc::channel();
    let sink = Arc::new(ChannelSink { output: Mutex::new(tx) });
    let request = SpawnRequest { rows: 24, cols: 100, shell: None, cwd: None, args: None, env: None, integration_dir: None };

    let started = Instant::now();
    let session = match pty::start_session(&sessions, sink, &request) {
        Ok(session) => session,
        Err(e) => {
            result.error = Some(format!("the shell did not start: {e}"));
            return result;
        }
    };
    result.shell = Some(pty::get_default_shell());

    if let Err(e) = pty::write_session(&sessions, &session.session_id, &format!("echo {}\r\n", smoke_text::MARKER)) {
        result.error = Some(format!("could not type into the shell: {e}"));
        return result;
    }

    let mut text = String::new();
    while started.elapsed() < TIMEOUT {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(bytes) => {
                if result.time_to_first_output_ms.is_none() {
                    result.time_to_first_output_ms = Some(started.elapsed().as_millis() as u64);
                }
                text.push_str(&String::from_utf8_lossy(&bytes));
                if smoke_text::has_marker_line(&text) {
                    result.time_to_marker_ms = Some(started.elapsed().as_millis() as u64);
                    result.ok = true;
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    if !result.ok {
        result.error = Some(format!("the shell did not answer within {} s", TIMEOUT.as_secs()));
    }
    let _ = pty::kill_session(&sessions, &session.session_id);
    result
}

pub fn result_path() -> std::path::PathBuf {
    std::env::temp_dir().join("cero-smoke.json")
}

pub fn write_result(result: &SmokeResult) -> std::io::Result<()> {
    let json = serde_json::to_string_pretty(result).unwrap_or_else(|_| "{}".to_string());
    let mut file = std::fs::File::create(result_path())?;
    file.write_all(json.as_bytes())
}

/// Run the check on its own thread and end the application with the result (0 or 1).
pub fn spawn(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let result = run_shell_check();
        if let Err(e) = write_result(&result) {
            crate::logger::log_error("SMOKE", &format!("could not write {}: {e}", result_path().display()));
        }
        crate::logger::log_info("SMOKE", &format!("{:?}", result));
        app.exit(if result.ok { 0 } else { 1 });
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_shell_answers_the_marker_command() {
        let result = run_shell_check();
        assert!(result.ok, "{:?}", result);
        assert!(result.time_to_first_output_ms.is_some() && result.time_to_marker_ms.is_some());
        assert!(result.shell.as_deref().map_or(false, |s| !s.is_empty()));
    }

    #[test]
    fn the_result_file_is_valid_json_with_the_documented_fields() {
        let result = SmokeResult { ok: true, version: "1.0.0".into(), shell: Some("pwsh.exe".into()), ..SmokeResult::default() };
        write_result(&result).unwrap();
        let text = std::fs::read_to_string(result_path()).unwrap();
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        for field in ["ok", "version", "shell", "time_to_first_output_ms", "engine_binary_found", "error"] {
            assert!(value.get(field).is_some(), "missing {field}");
        }
        assert_eq!(value["ok"], true);
    }
}
