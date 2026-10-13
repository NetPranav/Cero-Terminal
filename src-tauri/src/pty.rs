use crate::osc::CwdScanner;
use crate::shell::{self, ResolveEnv};
use portable_pty::{Child, ChildKiller, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

#[derive(Serialize, Clone)]
pub struct PtyOutputEvent {
    pub session_id: String,
    pub data: Vec<u8>,
}

/// Sent when the shell asked for could not be started and another one was used instead.
#[derive(Serialize, Clone, Debug)]
pub struct PtyFallbackEvent {
    pub session_id: String,
    pub requested: String,
    pub used: String,
    pub reason: String,
}

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    /// Ends the shell without the `Child` handle, which the waiter thread holds while it blocks
    killer: Box<dyn ChildKiller + Send + Sync>,
    /// Shell process id (read by the tests)
    #[allow(dead_code)]
    pid: Option<u32>,
    /// Last working directory the shell reported (OSC 9;9 or OSC 7, see `osc.rs`)
    cwd: Arc<Mutex<Option<String>>>,
}

pub type Sessions = Arc<Mutex<HashMap<String, PtySession>>>;

pub struct PtyState {
    pub sessions: Sessions,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // A panic in another thread must not take every terminal down with it
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Where a session sends what the shell prints and the news that it ended. Tauri events in the app, a channel in
/// the tests.
pub trait PtySink: Send + Sync + 'static {
    fn output(&self, session_id: &str, data: &[u8]);
    fn exit(&self, session_id: &str);
}

struct TauriSink {
    app: AppHandle,
}

impl PtySink for TauriSink {
    fn output(&self, session_id: &str, data: &[u8]) {
        let _ = self.app.emit(
            "pty-output",
            PtyOutputEvent {
                session_id: session_id.to_string(),
                data: data.to_vec(),
            },
        );
    }

    fn exit(&self, session_id: &str) {
        let _ = self.app.emit("pty-exit", session_id.to_string());
    }
}

pub struct SpawnRequest {
    pub rows: u16,
    pub cols: u16,
    pub shell: Option<String>,
    pub cwd: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    /// Folder with `cero.ps1` and `cero.cmd` (roadmap 3.3), when the app ships them
    pub integration_dir: Option<PathBuf>,
}

/// What `start_session` tells the caller.
pub struct StartedSession {
    pub session_id: String,
    pub fallback: Option<PtyFallbackEvent>,
}

struct OpenedPty {
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    shell: String,
    fallback: Option<(String, String, String)>,
}

fn real_exists(path: &str) -> bool {
    // symlink_metadata: the Store versions of pwsh.exe and wsl.exe are app-execution aliases (reparse points) that
    // `exists()` can report as missing
    std::fs::symlink_metadata(path).is_ok()
}

fn working_dir(cwd: Option<String>) -> Option<PathBuf> {
    cwd.filter(|d| !d.trim().is_empty())
        .map(|d| crate::process_cmds::expand_tilde(&d))
        .filter(|p| p.is_dir())
        .or_else(|| crate::home::home_dir().filter(|p| p.is_dir()))
}

fn build_command(shell_path: &str, req: &SpawnRequest, target_dir: &Option<PathBuf>) -> CommandBuilder {
    let kind = shell::classify(shell_path);
    let script = req.integration_dir.as_ref().and_then(|dir| {
        let path = dir.join(shell::integration_file(kind)?);
        path.is_file().then(|| path.to_string_lossy().into_owned())
    });
    let extra = req.args.clone().unwrap_or_default();

    let mut cmd = CommandBuilder::new(shell_path);
    for arg in shell::shell_args(kind, script.as_deref(), &extra) {
        cmd.arg(arg);
    }
    if let Some(dir) = target_dir {
        cmd.cwd(dir);
    }
    for (name, value) in shell::SESSION_ENV {
        cmd.env(name, value);
    }
    if let Some(custom_env) = &req.env {
        for (name, value) in custom_env {
            cmd.env(name, value);
        }
    }
    cmd
}

/// Open the pseudo console and start the first shell of the fallback list that runs.
fn open_pty(req: &SpawnRequest) -> Result<OpenedPty, String> {
    let pair = NativePtySystem::default()
        .openpty(PtySize {
            rows: req.rows,
            cols: req.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let env = ResolveEnv::from_process();
    let requested = req.shell.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let candidates = shell::shell_candidates(requested, &env, &real_exists);
    let target_dir = working_dir(req.cwd.clone());

    let mut errors: Vec<String> = Vec::new();
    for candidate in &candidates {
        let cmd = build_command(candidate, req, &target_dir);
        match pair.slave.spawn_command(cmd) {
            Ok(child) => {
                // Only the first candidate is the shell that was asked for; Settings may also have named none
                let fallback = match requested {
                    Some(wanted) if !candidate.eq_ignore_ascii_case(wanted) => {
                        let reason = if errors.is_empty() {
                            "it was not found".to_string()
                        } else {
                            errors.join("; ")
                        };
                        Some((wanted.to_string(), candidate.clone(), reason))
                    }
                    _ => None,
                };
                if !errors.is_empty() || fallback.is_some() {
                    crate::logger::log_warn(
                        "PTY",
                        &format!("Started {} instead of {:?} ({})", candidate, requested, errors.join("; ")),
                    );
                }
                return Ok(OpenedPty {
                    master: pair.master,
                    child,
                    shell: candidate.clone(),
                    fallback,
                });
            }
            Err(e) => {
                crate::logger::log_error("PTY", &format!("Could not start {}: {}", candidate, e));
                errors.push(format!("{}: {}", candidate, e));
            }
        }
    }
    Err(format!("No shell could be started. {}", errors.join("; ")))
}

/// Ends a session once, from whichever thread notices first: drops the pseudo console (which ends everything still
/// attached to it) and tells the sink.
fn finish(session_id: &str, sessions: &Sessions, done: &AtomicBool, sink: &dyn PtySink) {
    if done.swap(true, Ordering::SeqCst) {
        return;
    }
    let removed = lock(sessions).remove(session_id);
    drop(removed);
    sink.exit(session_id);
}

/// Start a shell and the two threads that watch it.
///
/// - The reader forwards output and stops at end of file or on a read error.
/// - The waiter blocks on the shell process. ConPTY does not always close its output pipe when the shell exits, so
///   the reader alone could wait forever; the waiter gives it a moment to deliver the last output and then ends the
///   session.
pub fn start_session(sessions: &Sessions, sink: Arc<dyn PtySink>, req: &SpawnRequest) -> Result<StartedSession, String> {
    let opened = open_pty(req)?;
    let session_id = Uuid::new_v4().to_string();

    let mut reader = opened.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = opened.master.take_writer().map_err(|e| e.to_string())?;
    let mut child = opened.child;
    let pid = child.process_id();

    let cwd: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(working_dir(req.cwd.clone()).map(|p| p.to_string_lossy().into_owned())));
    lock(sessions).insert(
        session_id.clone(),
        PtySession {
            master: opened.master,
            writer,
            killer: child.clone_killer(),
            pid,
            cwd: cwd.clone(),
        },
    );

    let done = Arc::new(AtomicBool::new(false));
    let (reader_done_tx, reader_done_rx) = mpsc::channel::<()>();

    {
        let (sessions, sink, done, id, cwd) = (sessions.clone(), sink.clone(), done.clone(), session_id.clone(), cwd);
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut scanner = CwdScanner::default();
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if let Some(path) = scanner.feed(&buf[..n]) {
                            *lock(&cwd) = Some(path);
                        }
                        sink.output(&id, &buf[..n]);
                    }
                }
            }
            let _ = reader_done_tx.send(());
            finish(&id, &sessions, &done, sink.as_ref());
        });
    }
    {
        let (sessions, sink, done, id) = (sessions.clone(), sink, done, session_id.clone());
        std::thread::spawn(move || {
            let status = child.wait();
            crate::logger::log_info("PTY", &format!("Shell of session {} ended: {:?}", id, status));
            // The reader may still be handing over the shell's last words
            let _ = reader_done_rx.recv_timeout(Duration::from_millis(500));
            finish(&id, &sessions, &done, sink.as_ref());
        });
    }

    crate::logger::log_info(
        "PTY",
        &format!("Spawned PTY session {} (rows: {}, cols: {}, shell: {})", session_id, req.rows, req.cols, opened.shell),
    );

    let fallback = opened.fallback.map(|(requested, used, reason)| PtyFallbackEvent {
        session_id: session_id.clone(),
        requested,
        used,
        reason,
    });
    Ok(StartedSession {
        session_id,
        fallback,
    })
}

/// Kill the shell and drop the pseudo console. The waiter thread reports the end of the session.
pub fn kill_session(sessions: &Sessions, session_id: &str) -> Result<(), String> {
    let removed = lock(sessions).remove(session_id);
    match removed {
        Some(mut session) => {
            let _ = session.killer.kill();
            drop(session);
            crate::logger::log_info("PTY", &format!("Terminated PTY session {}", session_id));
            Ok(())
        }
        None => Err("Session not found".to_string()),
    }
}

#[tauri::command]
pub fn spawn_pty(
    app_handle: AppHandle,
    state: State<'_, PtyState>,
    rows: u16,
    cols: u16,
    shell: Option<String>,
    cwd: Option<String>,
    // Windows shells have no login mode; the argument stays so the frontend call does not change
    #[allow(unused_variables)] login_shell: Option<bool>,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
) -> Result<String, String> {
    let integration_dir = app_handle
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("shell-integration"))
        .filter(|dir| dir.is_dir());

    let request = SpawnRequest {
        rows,
        cols,
        shell,
        cwd,
        args,
        env,
        integration_dir,
    };
    let sink = Arc::new(TauriSink { app: app_handle.clone() });
    let started = start_session(&state.sessions, sink, &request)?;
    if let Some(fallback) = started.fallback {
        let _ = app_handle.emit("pty-fallback", fallback);
    }
    Ok(started.session_id)
}

#[tauri::command]
pub fn write_pty(state: State<'_, PtyState>, session_id: String, data: String) -> Result<(), String> {
    let mut sessions = lock(&state.sessions);
    if let Some(session) = sessions.get_mut(&session_id) {
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
pub fn resize_pty(state: State<'_, PtyState>, session_id: String, rows: u16, cols: u16) -> Result<(), String> {
    let sessions = lock(&state.sessions);
    if let Some(session) = sessions.get(&session_id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
pub fn kill_pty(state: State<'_, PtyState>, session_id: String) -> Result<(), String> {
    kill_session(&state.sessions, &session_id)
}

/// The shell a new terminal starts with when Settings names none: the first of `pwsh.exe`, Windows PowerShell and
/// `cmd.exe` that exists.
#[tauri::command]
pub fn get_default_shell() -> String {
    shell::shell_candidates(None, &ResolveEnv::from_process(), &real_exists)
        .into_iter()
        .next()
        .unwrap_or_else(|| "powershell.exe".to_string())
}

/// Current working directory of the session's shell: the last folder the shell reported through OSC 9;9 or OSC 7
/// (shell integration, roadmap 3.3), or the folder the session was started in until the first report. `None` for
/// an unknown session.
#[tauri::command]
pub fn get_pty_cwd(state: State<'_, PtyState>, session_id: String) -> Result<Option<String>, String> {
    let sessions = lock(&state.sessions);
    Ok(sessions.get(&session_id).and_then(|s| lock(&s.cwd).clone()))
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::time::Instant;

    /// Collects output and signals the end of a session.
    struct TestSink {
        output: Mutex<Vec<u8>>,
        exit_tx: Mutex<mpsc::Sender<String>>,
    }

    impl PtySink for TestSink {
        fn output(&self, _session_id: &str, data: &[u8]) {
            lock(&self.output).extend_from_slice(data);
        }
        fn exit(&self, session_id: &str) {
            let _ = lock(&self.exit_tx).send(session_id.to_string());
        }
    }

    struct Harness {
        sessions: Sessions,
        sink: Arc<TestSink>,
        exit_rx: mpsc::Receiver<String>,
    }

    fn strip_ansi(input: &str) -> String {
        let mut out = String::new();
        let mut chars = input.chars().peekable();
        while let Some(c) = chars.next() {
            if c != '\u{1b}' {
                out.push(c);
                continue;
            }
            match chars.next() {
                // CSI: parameters, then a final byte in @..~
                Some('[') => {
                    for n in chars.by_ref() {
                        if ('@'..='~').contains(&n) {
                            break;
                        }
                    }
                }
                // OSC: ends with BEL or ESC \
                Some(']') => {
                    while let Some(n) = chars.next() {
                        if n == '\u{7}' {
                            break;
                        }
                        if n == '\u{1b}' {
                            chars.next();
                            break;
                        }
                    }
                }
                _ => {}
            }
        }
        out
    }

    fn harness() -> Harness {
        let (exit_tx, exit_rx) = mpsc::channel();
        Harness {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            sink: Arc::new(TestSink {
                output: Mutex::new(Vec::new()),
                exit_tx: Mutex::new(exit_tx),
            }),
            exit_rx,
        }
    }

    fn request(shell: Option<&str>) -> SpawnRequest {
        SpawnRequest {
            rows: 24,
            cols: 80,
            shell: shell.map(str::to_string),
            cwd: None,
            args: None,
            env: None,
            integration_dir: None,
        }
    }

    impl Harness {
        fn start(&self, shell: Option<&str>) -> StartedSession {
            start_session(&self.sessions, self.sink.clone(), &request(shell)).expect("shell starts")
        }

        fn write(&self, id: &str, text: &str) {
            let mut sessions = lock(&self.sessions);
            let session = sessions.get_mut(id).expect("session");
            session.writer.write_all(text.as_bytes()).unwrap();
        }

        /// Everything printed so far, without escape sequences: ConPTY draws runs of spaces and repaints with cursor
        /// movements, which would break up the text the tests look for.
        fn text(&self) -> String {
            strip_ansi(&String::from_utf8_lossy(&lock(&self.sink.output)))
        }

        /// Wait until the output contains `needle`, up to `secs` seconds.
        fn wait_for(&self, needle: &str, secs: u64) -> bool {
            let deadline = Instant::now() + Duration::from_secs(secs);
            while Instant::now() < deadline {
                if self.text().contains(needle) {
                    return true;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            false
        }
    }

    // Typed text and printed text must differ, or the echo of the keys would satisfy the check: `cero-%OS%` is typed,
    // `cero-Windows_NT` is printed.

    #[test]
    fn cmd_round_trip() {
        let h = harness();
        let s = h.start(Some("cmd.exe"));
        h.write(&s.session_id, "echo cero-%OS%\r\n");
        assert!(h.wait_for("cero-Windows_NT", 15), "output: {}", h.text());
        h.write(&s.session_id, "exit\r\n");
    }

    #[test]
    fn windows_powershell_round_trip() {
        let h = harness();
        let s = h.start(Some("powershell.exe"));
        h.write(&s.session_id, "Write-Output ('cero-' + 'ok')\r\n");
        assert!(h.wait_for("cero-ok", 30), "output: {}", h.text());
        h.write(&s.session_id, "exit\r\n");
    }

    #[test]
    fn pwsh_round_trip_when_installed() {
        let env = ResolveEnv::from_process();
        let Some(pwsh) = shell::find_on_path("pwsh", &env, &real_exists) else {
            eprintln!("pwsh is not installed here; skipped");
            return;
        };
        let h = harness();
        let s = h.start(Some(&pwsh));
        h.write(&s.session_id, "Write-Output ('cero-' + 'pwsh')\r\n");
        assert!(h.wait_for("cero-pwsh", 30), "output: {}", h.text());
        h.write(&s.session_id, "exit\r\n");
    }

    #[test]
    fn git_bash_round_trip_when_installed() {
        let bash = r"C:\Program Files\Git\bin\bash.exe";
        if !real_exists(bash) {
            eprintln!("Git Bash is not installed here; skipped");
            return;
        }
        let h = harness();
        let s = h.start(Some(bash));
        h.write(&s.session_id, "echo cero-$((40+2))\n");
        assert!(h.wait_for("cero-42", 30), "output: {}", h.text());
        h.write(&s.session_id, "exit\n");
    }

    #[test]
    fn utf8_comes_back_intact() {
        let h = harness();
        let s = h.start(Some("cmd.exe"));
        h.write(&s.session_id, "chcp 65001>nul\r\n");
        h.write(&s.session_id, "echo h\u{e9}llo\u{2713}%OS%\r\n");
        assert!(h.wait_for("h\u{e9}llo\u{2713}Windows_NT", 15), "output: {}", h.text());
        h.write(&s.session_id, "exit\r\n");
    }

    #[test]
    fn pty_exit_arrives_within_two_seconds_of_exit() {
        let h = harness();
        let s = h.start(Some("cmd.exe"));
        h.write(&s.session_id, "echo cero-%OS%\r\n");
        assert!(h.wait_for("cero-Windows_NT", 15), "shell never became ready: {}", h.text());
        h.write(&s.session_id, "exit\r\n");
        let id = h.exit_rx.recv_timeout(Duration::from_secs(2)).expect("pty-exit within 2 s");
        assert_eq!(id, s.session_id);
        assert!(lock(&h.sessions).is_empty(), "the session is removed once the shell is gone");
    }

    #[test]
    fn pty_exit_is_sent_once() {
        let h = harness();
        let s = h.start(Some("cmd.exe"));
        h.write(&s.session_id, "exit\r\n");
        h.exit_rx.recv_timeout(Duration::from_secs(10)).expect("first pty-exit");
        assert!(h.exit_rx.recv_timeout(Duration::from_millis(1500)).is_err(), "pty-exit arrived twice");
    }

    #[test]
    fn kill_ends_the_shell_process() {
        let h = harness();
        let s = h.start(Some("cmd.exe"));
        h.write(&s.session_id, "echo cero-%OS%\r\n");
        assert!(h.wait_for("cero-Windows_NT", 15));
        let pid = lock(&h.sessions).get(&s.session_id).and_then(|x| x.pid).expect("pid");

        kill_session(&h.sessions, &s.session_id).unwrap();
        h.exit_rx.recv_timeout(Duration::from_secs(3)).expect("pty-exit after kill");

        let mut sys = sysinfo::System::new();
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            if sys.process(sysinfo::Pid::from_u32(pid)).is_none() {
                break;
            }
            assert!(Instant::now() < deadline, "shell process {} still running after kill", pid);
            std::thread::sleep(Duration::from_millis(100));
        }
        assert!(kill_session(&h.sessions, &s.session_id).is_err(), "a second kill finds no session");
    }

    #[test]
    fn resize_reaches_the_shell() {
        let h = harness();
        let s = h.start(Some("cmd.exe"));
        h.write(&s.session_id, "echo cero-%OS%\r\n");
        assert!(h.wait_for("cero-Windows_NT", 15));
        lock(&h.sessions)
            .get(&s.session_id)
            .unwrap()
            .master
            .resize(PtySize { rows: 30, cols: 100, pixel_width: 0, pixel_height: 0 })
            .unwrap();
        h.write(&s.session_id, "mode con\r\n");
        assert!(h.wait_for("100", 10), "output: {}", h.text());
        let text = h.text();
        let at = text.rfind("Columns:").expect("mode con prints Columns");
        assert!(text[at..].split_whitespace().nth(1) == Some("100"), "output: {}", &text[at..]);
        h.write(&s.session_id, "exit\r\n");
    }

    #[test]
    fn the_folder_the_shell_reports_becomes_the_session_folder() {
        let h = harness();
        let s = h.start(Some("cmd.exe"));
        let cwd_of = |id: &str| lock(&h.sessions).get(id).and_then(|x| lock(&x.cwd).clone());
        // Before any report: the folder the session started in
        assert_eq!(cwd_of(&s.session_id).map(|p| p.to_ascii_lowercase()), crate::home::home_dir_string().map(|p| p.to_ascii_lowercase()));

        // cmd reports through its prompt: ESC ] 9;9; $P ESC \
        h.write(&s.session_id, "prompt $e]9;9;$P$e\\$P$G\r\n");
        h.write(&s.session_id, "cd /d C:\\Windows\r\n");
        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            if cwd_of(&s.session_id).as_deref().map(|p| p.eq_ignore_ascii_case("C:\\Windows")) == Some(true) {
                break;
            }
            assert!(Instant::now() < deadline, "folder never reported; now {:?}; output {}", cwd_of(&s.session_id), h.text());
            std::thread::sleep(Duration::from_millis(50));
        }
        h.write(&s.session_id, "exit\r\n");
    }

    #[test]
    fn missing_shell_falls_back_and_says_so() {
        let h = harness();
        let s = h.start(Some(r"Z:\no\such\shell.exe"));
        let fallback = s.fallback.expect("fallback reported");
        assert_eq!(fallback.requested, r"Z:\no\such\shell.exe");
        assert!(!fallback.used.eq_ignore_ascii_case(&fallback.requested));
        h.write(&s.session_id, "exit\r\n");
    }

    #[test]
    fn the_session_starts_in_the_home_folder_with_session_variables() {
        let h = harness();
        let s = h.start(Some("cmd.exe"));
        h.write(&s.session_id, "echo cero:%CD%:%CERO_TERMINAL%:%TERM_PROGRAM%\r\n");
        let home = crate::home::home_dir_string().unwrap();
        let expected = format!("cero:{}:1:Cero", home);
        assert!(h.wait_for(&expected, 15), "expected {} in: {}", expected, h.text());
        h.write(&s.session_id, "exit\r\n");
    }
}
