use sysinfo::{System, Signal, ProcessesToUpdate};
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use std::collections::{HashMap, HashSet};

pub struct SystemState(pub Mutex<System>);

static RUNNING: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();
static CANCELLED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

struct RunningGuard {
    run_id: Option<String>,
}

impl RunningGuard {
    fn new(run_id: Option<String>, pid: Option<u32>) -> Self {
        if let (Some(ref id), Some(pid)) = (&run_id, pid) {
            if let Ok(mut map) = RUNNING.get_or_init(Default::default).lock() {
                map.insert(id.clone(), pid);
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

fn kill_group(pid: u32) {
    #[cfg(unix)]
    {
        unsafe {
            libc::killpg(pid as libc::pid_t, libc::SIGTERM);
        }
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(800)).await;
            unsafe {
                libc::killpg(pid as libc::pid_t, libc::SIGKILL);
            }
        });
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .spawn();
    }
}

#[tauri::command]
pub async fn cancel_command(run_id: String) -> Result<bool, String> {
    let pid = RUNNING
        .get_or_init(Default::default)
        .lock()
        .map_err(|e| e.to_string())?
        .get(&run_id)
        .copied();
    match pid {
        Some(pid) => {
            if let Ok(mut set) = CANCELLED.get_or_init(Default::default).lock() {
                set.insert(run_id);
            }
            kill_group(pid);
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

pub fn expand_tilde(path: &str) -> std::path::PathBuf {
    if path == "~" {
        if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
            return std::path::PathBuf::from(home);
        }
    } else if let Some(rest) = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
            return std::path::PathBuf::from(home).join(rest);
        }
    }
    std::path::PathBuf::from(path)
}

fn resolve_working_dir(cwd: Option<String>) -> Option<std::path::PathBuf> {
    cwd.filter(|path| !path.trim().is_empty())
        .map(|path| expand_tilde(&path))
        .and_then(|p| if p.is_dir() { Some(p) } else { None })
        .or_else(|| {
            std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .ok()
                .map(std::path::PathBuf::from)
                .filter(|p| p.is_dir())
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

/// Kill the command and everything it started. The child runs in its own process group
/// (pgid == pid), so `killpg` also reaches grandchildren such as the `find` under `sh -c`.
async fn kill_process_tree(child: &mut tokio::process::Child, pid: Option<u32>) {
    #[cfg(unix)]
    if let Some(pid) = pid {
        unsafe {
            libc::killpg(pid as libc::pid_t, libc::SIGKILL);
        }
    }
    #[cfg(not(unix))]
    let _ = pid;
    let _ = child.kill().await;
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
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    let mut process = tokio::process::Command::new(&command);
    process
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    process.process_group(0);
    // No console window flashing up for every command on Windows
    #[cfg(windows)]
    process.creation_flags(crate::embedded_server::CREATE_NO_WINDOW);
    if let Some(directory) = resolve_working_dir(cwd) {
        process.current_dir(directory);
    }

    let mut child = process
        .spawn()
        .map_err(|e| format!("Failed to execute {}: {}", command, e))?;
    let pid = child.id();
    let _guard = RunningGuard::new(run_id.clone(), pid);

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
                kill_process_tree(&mut child, pid).await;
                None
            }
        },
        None => Some(child.wait().await.map_err(|e| e.to_string())?),
    };

    let _ = tokio::time::timeout(Duration::from_millis(PIPE_DRAIN_GRACE_MS), async {
        let _ = (&mut stdout_task).await;
        let _ = (&mut stderr_task).await;
    })
    .await;

    let stdout = String::from_utf8_lossy(&stdout_buf.lock().map_err(|e| e.to_string())?).into_owned();
    let mut stderr = String::from_utf8_lossy(&stderr_buf.lock().map_err(|e| e.to_string())?).into_owned();
    if timed_out {
        if !stderr.is_empty() && !stderr.ends_with('\n') {
            stderr.push('\n');
        }
        stderr.push_str(&format!(
            "[sentinel] command timed out after {} ms and was terminated",
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

/// ~/.sentinel, where every learning store lives.
fn sentinel_dir() -> Option<std::path::PathBuf> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(|home| std::path::PathBuf::from(home).join(".sentinel"))
}

/// Make ~/.sentinel readable by its owner only. It holds the audit log, session transcripts and
/// learning data; a folder that is world-readable would expose them on machines whose home folders
/// are open to other users. Everything inside is protected by this folder's permissions.
pub fn ensure_private_data_dir() {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Some(dir) = sentinel_dir() {
            if std::fs::create_dir_all(&dir).is_ok() {
                let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
            }
        }
    }
}

/// Resolve a path relative to ~/.sentinel, refusing anything that escapes it.
pub(crate) fn resolve_in_sentinel(relative: &str) -> Result<std::path::PathBuf, String> {
    let rel = std::path::Path::new(relative);
    // Only plain names: a root ("\\x" or "/x" on Windows is not `is_absolute()` but `join` would
    // still leave the store), a drive prefix ("C:x") or ".." could all reach outside ~/.sentinel
    let plain = rel.components().all(|c| matches!(c, std::path::Component::Normal(_) | std::path::Component::CurDir));
    if relative.is_empty() || !plain {
        return Err(format!("Path must stay inside ~/.sentinel: {}", relative));
    }
    Ok(sentinel_dir().ok_or("HOME is not set")?.join(rel))
}

#[derive(Serialize)]
pub struct SentinelStoreSnapshot {
    pub home: String,
    /// Relative path under ~/.sentinel -> file contents
    pub files: std::collections::HashMap<String, String>,
}

/// Directories holding binaries or logs rather than state (models/ is walked: only its small
/// .json files such as manifest.json are picked up; .gguf weights never match)
const SNAPSHOT_SKIP_DIRS: [&str; 4] = ["bin", "engine", "logs", "flow_icons"];
const SNAPSHOT_MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;
const SNAPSHOT_MAX_TOTAL_BYTES: u64 = 32 * 1024 * 1024;

/// Contents of the small .json/.jsonl state files (and .flow workflows) under ~/.sentinel, loaded once at startup so
/// the webview's synchronous `fs` shim can serve the learning stores.
#[tauri::command]
pub fn sentinel_store_snapshot() -> Result<SentinelStoreSnapshot, String> {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).map_err(|e| e.to_string())?;
    let root = std::path::PathBuf::from(&home).join(".sentinel");
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
    Ok(SentinelStoreSnapshot { home, files })
}

/// Append to a file under ~/.sentinel (creating it and its parents).
#[tauri::command]
pub fn sentinel_store_append(relative_path: String, contents: String) -> Result<(), String> {
    use std::io::Write;
    let path = resolve_in_sentinel(&relative_path)?;
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

/// Replace a file under ~/.sentinel (creating it and its parents).
#[tauri::command]
pub fn sentinel_store_write(relative_path: String, contents: String) -> Result<(), String> {
    let path = resolve_in_sentinel(&relative_path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("Failed to write {}: {}", path.display(), e))
}

/// Delete a file under ~/.sentinel; missing files are not an error.
#[tauri::command]
pub fn sentinel_store_remove(relative_path: String) -> Result<(), String> {
    let path = resolve_in_sentinel(&relative_path)?;
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
        let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap();
        let expanded = expand_tilde("~");
        assert_eq!(expanded.to_str().unwrap(), home);

        let expanded_sub = expand_tilde("~/test_dir");
        assert_eq!(expanded_sub, std::path::PathBuf::from(&home).join("test_dir"));

        let regular = expand_tilde("/tmp");
        assert_eq!(regular.to_str().unwrap(), "/tmp");
    }

    #[cfg(unix)]
    fn sh(script: &str) -> (String, Vec<String>) {
        ("sh".to_string(), vec!["-c".to_string(), script.to_string()])
    }

    #[test]
    fn sentinel_store_paths_cannot_escape() {
        assert!(resolve_in_sentinel("learning/deficits.jsonl").is_ok());
        assert!(resolve_in_sentinel("../.ssh/authorized_keys").is_err());
        assert!(resolve_in_sentinel("/etc/passwd").is_err());
        assert!(resolve_in_sentinel("learning/../../x").is_err());
        assert!(resolve_in_sentinel("").is_err());
        #[cfg(windows)]
        {
            assert!(resolve_in_sentinel("\\Windows\\System32\\x").is_err());
            assert!(resolve_in_sentinel("C:x").is_err());
            assert!(resolve_in_sentinel("C:\\x").is_err());
            assert!(resolve_in_sentinel("learning\\deficits.jsonl").is_ok());
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn captures_output_and_exit_code() {
        let (cmd, args) = sh("echo hello; echo oops 1>&2; exit 3");
        let out = run_command(cmd, args, Some("/tmp".into()), Some(5_000), None).await.unwrap();
        assert_eq!(out.stdout.trim(), "hello");
        assert_eq!(out.stderr.trim(), "oops");
        assert_eq!(out.code, 3);
        assert!(!out.timed_out);
        assert!(!out.cancelled);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn timeout_kills_the_whole_process_group() {
        let started = std::time::Instant::now();
        let (cmd, args) = sh("sleep 30 & sleep 30; wait");
        let out = run_command(cmd, args, None, Some(300), None).await.unwrap();
        assert!(out.timed_out);
        assert_eq!(out.code, TIMEOUT_EXIT_CODE);
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn backgrounded_child_holding_stdout_does_not_block() {
        // `sleep` inherits the stdout pipe; waiting for EOF would take 5 seconds.
        let started = std::time::Instant::now();
        let (cmd, args) = sh("sleep 5 & echo launched");
        let out = run_command(cmd, args, None, None, None).await.unwrap();
        assert_eq!(out.stdout.trim(), "launched");
        assert_eq!(out.code, 0);
        assert!(started.elapsed() < std::time::Duration::from_secs(2));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn stdin_is_closed_so_prompts_do_not_hang() {
        let (cmd, args) = sh("read answer; echo \"got:$answer\"");
        let out = run_command(cmd, args, None, Some(5_000), None).await.unwrap();
        assert!(!out.timed_out);
        assert_eq!(out.stdout.trim(), "got:");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancel_command_stops_running_process() {
        let started = std::time::Instant::now();
        let (cmd, args) = sh("sleep 30");
        let run_id = "test-cancel-run-1".to_string();
        let run_id_clone = run_id.clone();
        let handle = tokio::spawn(async move {
            run_command(cmd, args, None, None, Some(run_id_clone)).await.unwrap()
        });
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let cancelled = cancel_command(run_id.clone()).await.unwrap();
        assert!(cancelled);
        let out = handle.await.unwrap();
        assert!(out.cancelled);
        assert_eq!(out.code, 130);
        assert!(started.elapsed() < std::time::Duration::from_secs(1));
        assert!(RUNNING.get_or_init(Default::default).lock().unwrap().is_empty());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancel_command_kills_grandchildren() {
        let (cmd, args) = sh("sh -c 'sleep 30 & wait'");
        let run_id = "test-cancel-run-2".to_string();
        let run_id_clone = run_id.clone();
        let handle = tokio::spawn(async move {
            run_command(cmd, args, None, None, Some(run_id_clone)).await.unwrap()
        });
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let cancelled = cancel_command(run_id).await.unwrap();
        assert!(cancelled);
        let out = handle.await.unwrap();
        assert!(out.cancelled);
        assert_eq!(out.code, 130);
    }
}
