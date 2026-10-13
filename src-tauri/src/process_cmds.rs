use sysinfo::{System, Signal, ProcessesToUpdate};
use serde::Serialize;
use std::sync::{Arc, Mutex, OnceLock};
use std::collections::{HashMap, HashSet};
use crate::job::Job;

pub struct SystemState(pub Mutex<System>);

/// A command that is running: its process and the job that holds its whole process tree.
#[derive(Clone)]
struct RunningCommand {
    pid: u32,
    job: Option<Arc<Job>>,
}

static RUNNING: OnceLock<Mutex<HashMap<String, RunningCommand>>> = OnceLock::new();
static CANCELLED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

struct RunningGuard {
    run_id: Option<String>,
}

impl RunningGuard {
    fn new(run_id: Option<String>, pid: Option<u32>, job: Option<Arc<Job>>) -> Self {
        if let (Some(ref id), Some(pid)) = (&run_id, pid) {
            if let Ok(mut map) = RUNNING.get_or_init(Default::default).lock() {
                map.insert(id.clone(), RunningCommand { pid, job });
            }
        }
        Self { run_id }
    }
}

impl Drop for RunningGuard {
    fn drop(&mut self) {
        if let Some(ref id) = self.run_id {
            if let Ok(mut map) = RUNNING.get_or_init(Default::default).lock() {
                map.remove(id);
            }
            if let Ok(mut set) = CANCELLED.get_or_init(Default::default).lock() {
                set.remove(id);
            }
        }
    }
}

/// End a command and everything it started: the job when there is one, `taskkill /T /F` when the process could not
/// be put in a job (or the job could not be ended).
fn kill_group(run: &RunningCommand) {
    if let Some(job) = &run.job {
        if job.terminate().is_ok() {
            return;
        }
    }
    taskkill_tree(run.pid);
}

fn taskkill_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(crate::embedded_server::CREATE_NO_WINDOW)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
}

#[tauri::command]
pub async fn cancel_command(run_id: String) -> Result<bool, String> {
    if run_id == "*" {
        let runs: Vec<(String, RunningCommand)> = RUNNING
            .get_or_init(Default::default)
            .lock()
            .map_err(|e| e.to_string())?
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        if let Ok(mut set) = CANCELLED.get_or_init(Default::default).lock() {
            for (k, _) in &runs {
                set.insert(k.clone());
            }
        }
        for (_, run) in &runs {
            kill_group(run);
        }
        return Ok(true);
    }
    let run = RUNNING
        .get_or_init(Default::default)
        .lock()
        .map_err(|e| e.to_string())?
        .get(&run_id)
        .cloned();
    match run {
        Some(run) => {
            if let Ok(mut set) = CANCELLED.get_or_init(Default::default).lock() {
                set.insert(run_id);
            }
            kill_group(&run);
            Ok(true)
        }
        None => Ok(false),
    }
}

#[derive(Serialize)]
pub struct SystemStats {
    pub memory_used: u64,
    pub memory_total: u64,
    pub cpu_usage: f32,
}

#[tauri::command]
pub fn get_system_stats(state: tauri::State<'_, SystemState>) -> SystemStats {
    let mut sys = state.0.lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    
    SystemStats {
        memory_used: sys.used_memory() / 1048576, // MB
        memory_total: sys.total_memory() / 1048576, // MB
        cpu_usage: sys.global_cpu_usage(),
    }
}

#[derive(Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub memory: u64,
    pub cpu: f32,
    pub cmd: Vec<String>,
}

#[tauri::command]
pub fn list_processes() -> Result<Vec<ProcessInfo>, String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    let mut processes = Vec::new();
    for (pid, process) in sys.processes() {
        processes.push(ProcessInfo {
            pid: pid.as_u32(),
            name: process.name().to_string_lossy().into_owned(),
            memory: process.memory(),
            cpu: process.cpu_usage(),
            cmd: process.cmd().iter().map(|s| s.to_string_lossy().into_owned()).collect(),
        });
    }
    
    // Optional: Sort by CPU or memory
    processes.sort_by(|a, b| b.memory.cmp(&a.memory));
    
    Ok(processes)
}

#[tauri::command]
pub fn kill_process(pid: u32) -> Result<bool, String> {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    
    if let Some(process) = sys.process(sysinfo::Pid::from_u32(pid)) {
        Ok(process.kill_with(Signal::Kill).unwrap_or(process.kill()))
    } else {
        Err("Process not found".to_string())
    }
}

#[derive(Serialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
    /// True when the command exceeded `timeout_ms` and was killed.
    pub timed_out: bool,
    /// True when the command was cancelled by cancel_command.
    pub cancelled: bool,
}

/// Per-stream capture cap. Output beyond this is drained and discarded so a runaway command
/// (`find /`, `yes`) cannot exhaust memory; callers truncate further for the model anyway.
const OUTPUT_CAPTURE_LIMIT: usize = 8 * 1024 * 1024;

/// How long to keep reading pipes after the shell itself has exited. A backgrounded child such
/// as `code . &` inherits stdout and can hold it open for hours; waiting for EOF would block the
/// caller until that app closes.
const PIPE_DRAIN_GRACE_MS: u64 = 250;

/// Exit code reported for a command killed by the timeout (same convention as coreutils `timeout`).
pub const TIMEOUT_EXIT_CODE: i32 = 124;

/// `~`, `~\x`, `~/x`, `%USERPROFILE%\x` and `$env:USERPROFILE\x` (any case) name the user's home folder.
pub fn expand_tilde(path: &str) -> std::path::PathBuf {
    match crate::home::home_dir() {
        Some(home) => crate::home::expand_home_forms(path, &home),
        None => std::path::PathBuf::from(path),
    }
}

fn resolve_working_dir(cwd: Option<String>) -> Option<std::path::PathBuf> {
    cwd.filter(|path| !path.trim().is_empty())
        .map(|path| expand_tilde(&path))
        .and_then(|p| if p.is_dir() { Some(p) } else { None })
        .or_else(|| {
            crate::home::home_dir().filter(|p| p.is_dir())
        })
}

async fn read_capped<R>(reader: Option<R>, buf: std::sync::Arc<std::sync::Mutex<Vec<u8>>>)
where
    R: tokio::io::AsyncRead + Unpin,
{
    use tokio::io::AsyncReadExt;
    let Some(mut reader) = reader else { return };
    let mut chunk = [0u8; 8192];
    loop {
        match reader.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if let Ok(mut b) = buf.lock() {
                    let room = OUTPUT_CAPTURE_LIMIT.saturating_sub(b.len());
                    b.extend_from_slice(&chunk[..n.min(room)]);
                }
            }
        }
    }
}

/// Kill the command and its whole tree, then reap the direct child.
async fn kill_process_tree(child: &mut tokio::process::Child, pid: Option<u32>, job: &Option<Arc<Job>>) {
    let ended = job.as_ref().map(|job| job.terminate().is_ok()).unwrap_or(false);
    if !ended {
        if let Some(pid) = pid {
            taskkill_tree(pid);
        }
        let _ = child.start_kill();
    }
    let _ = tokio::time::timeout(std::time::Duration::from_secs(2), child.wait()).await;
}

/// Put the process in a job of its own, when the system allows it. Without a job the caller falls back to `taskkill`.
fn job_for(child: &tokio::process::Child) -> Option<Arc<Job>> {
    let job = Job::new().ok()?;
    job.assign(child.raw_handle()?).ok()?;
    Some(Arc::new(job))
}

/// Runs a command without a terminal: stdin is closed so prompts fail fast instead of hanging,
/// output is captured with a size cap, and an optional timeout kills the whole process group.
pub async fn run_command(
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
    run_id: Option<String>,
) -> Result<CommandOutput, String> {
    use std::process::Stdio;
    use std::time::Duration;

    let mut process = tokio::process::Command::new(&command);
    process
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // No console window flashing up for every command
    process.creation_flags(crate::embedded_server::CREATE_NO_WINDOW);
    if let Some(directory) = resolve_working_dir(cwd) {
        process.current_dir(directory);
    }

    let mut child = process
        .spawn()
        .map_err(|e| format!("Failed to execute {}: {}", command, e))?;
    let pid = child.id();
    let job = job_for(&child);
    if job.is_none() {
        crate::logger::log_warn("EXEC", &format!("{} could not be put in a job object; cancel falls back to taskkill", command));
    }
    let _guard = RunningGuard::new(run_id.clone(), pid, job.clone());

    let stdout_buf = Arc::new(Mutex::new(Vec::new()));
    let stderr_buf = Arc::new(Mutex::new(Vec::new()));
    let mut stdout_task = tokio::spawn(read_capped(child.stdout.take(), stdout_buf.clone()));
    let mut stderr_task = tokio::spawn(read_capped(child.stderr.take(), stderr_buf.clone()));

    let mut timed_out = false;
    let status = match timeout_ms.filter(|ms| *ms > 0) {
        Some(ms) => match tokio::time::timeout(Duration::from_millis(ms), child.wait()).await {
            Ok(result) => Some(result.map_err(|e| e.to_string())?),
            Err(_) => {
                timed_out = true;
                kill_process_tree(&mut child, pid, &job).await;
                None
            }
        },
        None => Some(child.wait().await.map_err(|e| e.to_string())?),
    };

    // The command finished by itself: programs it started on purpose (an editor, a dev server) keep running
    if !timed_out {
        let cancelled_now = run_id
            .as_ref()
            .and_then(|id| CANCELLED.get_or_init(Default::default).lock().ok().map(|set| set.contains(id)))
            .unwrap_or(false);
        if !cancelled_now {
            if let Some(job) = &job {
                job.release();
            }
        }
    }

    let _ = tokio::time::timeout(Duration::from_millis(PIPE_DRAIN_GRACE_MS), async {
        let _ = (&mut stdout_task).await;
        let _ = (&mut stderr_task).await;
    })
    .await;

    let stdout = crate::encoding::decode_output(&stdout_buf.lock().map_err(|e| e.to_string())?);
    let mut stderr = crate::encoding::decode_output(&stderr_buf.lock().map_err(|e| e.to_string())?);
    if timed_out {
        if !stderr.is_empty() && !stderr.ends_with('\n') {
            stderr.push('\n');
        }
        stderr.push_str(&format!(
            "[cero] command timed out after {} ms and was terminated",
            timeout_ms.unwrap_or(0)
        ));
    }

    let was_cancelled = if let Some(ref id) = run_id {
        CANCELLED.get_or_init(Default::default).lock().map(|mut s| s.remove(id)).unwrap_or(false)
    } else {
        false
    };

    Ok(CommandOutput {
        stdout,
        stderr,
        code: if was_cancelled {
            130
        } else if timed_out {
            TIMEOUT_EXIT_CODE
        } else {
            status.and_then(|s| s.code()).unwrap_or(-1)
        },
        timed_out,
        cancelled: was_cancelled,
    })
}

/// `timeout_ms` is optional; omitting it keeps the old unbounded behaviour, which long-running
/// callers such as the model download rely on.
#[tauri::command]
pub async fn execute_command(
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
    run_id: Option<String>,
) -> Result<CommandOutput, String> {
    run_command(command, args, cwd, timeout_ms, run_id).await
}

#[tauri::command]
pub fn get_launch_args() -> Vec<String> {
    std::env::args().collect()
}

#[tauri::command]
pub fn get_app_binary_path() -> Result<String, String> {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_system_file(path: String, contents: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directories for {}: {}", path, e))?;
        }
    }
    std::fs::write(&path, contents)
        .map_err(|e| format!("Failed to write to {}: {}", path, e))
}

#[tauri::command]
pub fn create_system_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory {}: {}", path, e))
}

#[tauri::command]
pub fn read_system_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub fn check_path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

/// ~/.cero, where every learning store lives.
fn cero_dir() -> Option<std::path::PathBuf> {
    crate::home::home_dir().map(|home| home.join(".cero"))
}

/// ~/.cero holds the audit log, session transcripts and learning data.
/// TODO(2.9): restrict the folder to its owner with an ACL. Until then it inherits the permissions
/// of the user profile, which are already limited to the user and administrators.
pub fn ensure_private_data_dir() {}

/// Resolve a path relative to ~/.cero, refusing anything that escapes it.
pub(crate) fn resolve_in_cero(relative: &str) -> Result<std::path::PathBuf, String> {
    let rel = std::path::Path::new(relative);
    // Only plain names: a root ("\\x" or "/x" on Windows is not `is_absolute()` but `join` would
    // still leave the store), a drive prefix ("C:x") or ".." could all reach outside ~/.cero
    let plain = rel.components().all(|c| matches!(c, std::path::Component::Normal(_) | std::path::Component::CurDir));
    if relative.is_empty() || !plain {
        return Err(format!("Path must stay inside ~/.cero: {}", relative));
    }
    Ok(cero_dir().ok_or("HOME is not set")?.join(rel))
}

#[derive(Serialize)]
pub struct CeroStoreSnapshot {
    pub home: String,
    /// Relative path under ~/.cero -> file contents
    pub files: std::collections::HashMap<String, String>,
}

/// Directories holding binaries or logs rather than state (models/ is walked: only its small
/// .json files such as manifest.json are picked up; .gguf weights never match)
const SNAPSHOT_SKIP_DIRS: [&str; 4] = ["bin", "engine", "logs", "flow_icons"];
const SNAPSHOT_MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;
const SNAPSHOT_MAX_TOTAL_BYTES: u64 = 32 * 1024 * 1024;

/// Contents of the small .json/.jsonl state files (and .flow workflows) under ~/.cero, loaded once at startup so
/// the webview's synchronous `fs` shim can serve the learning stores.
#[tauri::command]
pub fn cero_store_snapshot() -> Result<CeroStoreSnapshot, String> {
    let home = crate::home::home_dir_string().ok_or_else(|| "home directory not found".to_string())?;
    let root = std::path::PathBuf::from(&home).join(".cero");
    let mut files = std::collections::HashMap::new();
    let mut total: u64 = 0;
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = entry.metadata() else { continue };
            let rel = path.strip_prefix(&root).map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_default();
            if meta.is_dir() {
                if dir == root && SNAPSHOT_SKIP_DIRS.contains(&rel.as_str()) {
                    continue;
                }
                stack.push(path);
            } else if meta.is_file()
                && (rel.ends_with(".json") || rel.ends_with(".jsonl") || rel.ends_with(".flow"))
                && meta.len() <= SNAPSHOT_MAX_FILE_BYTES
                && total + meta.len() <= SNAPSHOT_MAX_TOTAL_BYTES
            {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    total += meta.len();
                    files.insert(rel, content);
                }
            }
        }
    }
    Ok(CeroStoreSnapshot { home, files })
}

/// Append to a file under ~/.cero (creating it and its parents).
#[tauri::command]
pub fn cero_store_append(relative_path: String, contents: String) -> Result<(), String> {
    use std::io::Write;
    let path = resolve_in_cero(&relative_path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open {}: {}", path.display(), e))?;
    file.write_all(contents.as_bytes()).map_err(|e| e.to_string())
}

/// Replace a file under ~/.cero (creating it and its parents).
#[tauri::command]
pub fn cero_store_write(relative_path: String, contents: String) -> Result<(), String> {
    let path = resolve_in_cero(&relative_path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("Failed to write {}: {}", path.display(), e))
}

/// Delete a file under ~/.cero; missing files are not an error.
#[tauri::command]
pub fn cero_store_remove(relative_path: String) -> Result<(), String> {
    let path = resolve_in_cero(&relative_path)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expand_tilde() {
        let home = crate::home::home_dir().unwrap();
        let expanded = expand_tilde("~");
        assert_eq!(expanded, home);

        let expanded_sub = expand_tilde("~/test_dir");
        assert_eq!(expanded_sub, home.join("test_dir"));
        assert_eq!(expand_tilde("~\\test_dir"), home.join("test_dir"));

        let regular = expand_tilde("/tmp");
        assert_eq!(regular.to_str().unwrap(), "/tmp");
    }

    #[test]
    fn cero_store_paths_cannot_escape() {
        assert!(resolve_in_cero("learning/deficits.jsonl").is_ok());
        assert!(resolve_in_cero("../.ssh/authorized_keys").is_err());
        assert!(resolve_in_cero("/etc/passwd").is_err());
        assert!(resolve_in_cero("learning/../../x").is_err());
        assert!(resolve_in_cero("").is_err());
        assert!(resolve_in_cero("\\Windows\\System32\\x").is_err());
        assert!(resolve_in_cero("C:x").is_err());
        assert!(resolve_in_cero("C:\\x").is_err());
        assert!(resolve_in_cero("learning\\deficits.jsonl").is_ok());
    }

}

/// `run_command` against real processes. Each test pings its own 127.0.0.x address, so its processes can be told
/// apart from the other tests' (they run in parallel).
#[cfg(all(test, windows))]
mod windows_tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn ping_pids(ip: &str) -> Vec<sysinfo::Pid> {
        let mut sys = System::new();
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, sysinfo::ProcessRefreshKind::everything());
        sys.processes()
            .iter()
            .filter(|(_, p)| {
                p.name().to_string_lossy().to_ascii_lowercase().starts_with("ping")
                    && p.cmd().iter().any(|arg| arg.to_string_lossy().contains(ip))
            })
            .map(|(pid, _)| *pid)
            .collect()
    }

    fn kill_pings(ip: &str) {
        let mut sys = System::new();
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, sysinfo::ProcessRefreshKind::everything());
        for pid in ping_pids(ip) {
            if let Some(process) = sys.process(pid) {
                process.kill();
            }
        }
    }

    async fn no_pings_within(ip: &str, secs: u64) -> bool {
        let deadline = Instant::now() + Duration::from_secs(secs);
        while Instant::now() < deadline {
            if ping_pids(ip).is_empty() {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        false
    }

    async fn run(args: &[&str], timeout_ms: Option<u64>, run_id: Option<&str>) -> CommandOutput {
        run_command(
            "cmd".to_string(),
            args.iter().map(|a| a.to_string()).collect(),
            None,
            timeout_ms,
            run_id.map(str::to_string),
        )
        .await
        .expect("cmd starts")
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn captures_output_and_exit_code() {
        let out = run(&["/c", "echo hello& exit 3"], None, None).await;
        assert!(out.stdout.contains("hello"), "stdout: {:?}", out.stdout);
        assert_eq!(out.code, 3);
        assert!(!out.timed_out && !out.cancelled);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn stderr_is_captured_separately() {
        let out = run(&["/c", "echo to-stderr 1>&2"], None, None).await;
        assert!(out.stderr.contains("to-stderr"), "stderr: {:?}", out.stderr);
        assert!(!out.stdout.contains("to-stderr"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn timeout_kills_the_whole_tree() {
        let ip = "127.0.0.71";
        let started = Instant::now();
        // ping is a grandchild: this test -> cmd -> cmd -> ping
        let out = run(&["/c", "cmd /c ping -n 30 127.0.0.71 > nul"], Some(1000), None).await;
        assert!(out.timed_out, "should have timed out");
        assert_eq!(out.code, TIMEOUT_EXIT_CODE);
        assert!(started.elapsed() < Duration::from_secs(8), "took {:?}", started.elapsed());
        let gone = no_pings_within(ip, 3).await;
        kill_pings(ip);
        assert!(gone, "the grandchild ping outlived the timeout");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_background_child_holding_stdout_does_not_block_the_caller() {
        let ip = "127.0.0.72";
        let started = Instant::now();
        let out = run(&["/c", "start /b ping -n 30 127.0.0.72 & echo done"], None, None).await;
        let elapsed = started.elapsed();
        let still_running = !ping_pids(ip).is_empty();
        kill_pings(ip);
        assert!(out.stdout.contains("done"), "stdout: {:?}", out.stdout);
        assert!(elapsed < Duration::from_secs(5), "waited {:?} for the background child", elapsed);
        assert!(still_running, "a program the command started on purpose must outlive it");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn stdin_is_closed_so_prompts_do_not_hang() {
        // sort reads standard input until it ends; with a closed stdin it returns at once
        let out = run(&["/c", "sort"], Some(8000), None).await;
        assert!(!out.timed_out, "sort waited for input");
        assert_eq!(out.code, 0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn cancel_stops_the_process() {
        let id = "test-cancel-stop";
        let runner = tokio::spawn(async move { run(&["/c", "ping -n 30 127.0.0.73 > nul"], None, Some(id)).await });
        tokio::time::sleep(Duration::from_millis(800)).await;
        assert!(cancel_command(id.to_string()).await.unwrap(), "the run was known");
        let started = Instant::now();
        let out = runner.await.unwrap();
        assert!(out.cancelled);
        assert_eq!(out.code, 130);
        assert!(started.elapsed() < Duration::from_secs(5));
        kill_pings("127.0.0.73");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn cancel_kills_grandchildren() {
        let id = "test-cancel-tree";
        let ip = "127.0.0.74";
        let runner = tokio::spawn(async move { run(&["/c", "cmd /c start /b ping -n 30 127.0.0.74 > nul & ping -n 30 127.0.0.74 > nul"], None, Some(id)).await });
        // wait until both pings run
        let deadline = Instant::now() + Duration::from_secs(5);
        while ping_pids(ip).len() < 2 && Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        assert!(cancel_command(id.to_string()).await.unwrap());
        let out = runner.await.unwrap();
        let gone = no_pings_within(ip, 3).await;
        kill_pings(ip);
        assert!(out.cancelled);
        assert!(gone, "grandchildren survived the cancel");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn cancelling_one_run_leaves_the_other_running() {
        let (a, b) = ("test-iso-a", "test-iso-b");
        let first = tokio::spawn(async move { run(&["/c", "ping -n 4 127.0.0.75 > nul & echo first-done"], None, Some(a)).await });
        let second = tokio::spawn(async move { run(&["/c", "ping -n 30 127.0.0.76 > nul"], None, Some(b)).await });
        tokio::time::sleep(Duration::from_millis(800)).await;
        assert!(cancel_command(b.to_string()).await.unwrap());
        assert!(second.await.unwrap().cancelled);
        let first = first.await.unwrap();
        assert!(!first.cancelled, "cancelling another run must not stop this one");
        assert!(first.stdout.contains("first-done"), "stdout: {:?}", first.stdout);
        kill_pings("127.0.0.76");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn cancelling_an_unknown_run_reports_false() {
        assert!(!cancel_command("no-such-run".to_string()).await.unwrap());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn utf8_output_from_powershell_arrives_intact() {
        let out = run_command(
            "powershell".to_string(),
            vec![
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Write-Output ([string][char]0x00e9 + [char]0x2713)".to_string(),
            ],
            None,
            Some(30_000),
            None,
        )
        .await
        .expect("powershell starts");
        assert!(out.stdout.contains("\u{e9}\u{2713}"), "stdout: {:?}", out.stdout);
    }
}
