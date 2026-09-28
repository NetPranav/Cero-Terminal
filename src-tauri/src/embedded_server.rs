use std::sync::Mutex;
use std::process::{Child, Command, Stdio};
use std::path::PathBuf;
use std::collections::{HashMap, VecDeque};
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct QueuedInferenceSlot {
    pub session_id: String,
    pub request_id: String,
    pub created_at_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InferenceQueueStatus {
    pub active_request: Option<QueuedInferenceSlot>,
    pub queued_count: usize,
    pub session_queue_counts: HashMap<String, usize>,
    pub is_cpu_fallback: bool,
}

pub struct EmbeddedLlmState {
    pub process: Mutex<Option<Child>>,
    pub active_model: Mutex<Option<String>>,
    pub active_lora: Mutex<Option<String>>,
    pub port: u16,
    pub is_cpu_fallback: Mutex<bool>,
    pub active_request: Mutex<Option<QueuedInferenceSlot>>,
    pub queue: Mutex<VecDeque<QueuedInferenceSlot>>,
}

impl Default for EmbeddedLlmState {
    fn default() -> Self {
        Self {
            process: Mutex::new(None),
            active_model: Mutex::new(None),
            active_lora: Mutex::new(None),
            port: 8847,
            is_cpu_fallback: Mutex::new(false),
            active_request: Mutex::new(None),
            queue: Mutex::new(VecDeque::new()),
        }
    }
}

#[derive(Serialize)]
pub struct EmbeddedLlmStatus {
    pub is_running: bool,
    pub pid: Option<u32>,
    pub active_model: Option<String>,
    pub active_lora: Option<String>,
    pub port: u16,
    pub is_cpu_fallback: bool,
    pub queued_requests: usize,
}

fn get_home_dir() -> Option<PathBuf> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(PathBuf::from)
}

/// Directory the in-app installer extracts the full llama.cpp release bundle into. Modern
/// releases ship `llama-server` next to its shared libraries (libllama, libggml*), so the
/// binary must be run from inside this directory rather than copied out on its own.
fn sentinel_engine_dir() -> Option<PathBuf> {
    get_home_dir().map(|home| home.join(".sentinel").join("engine").join("current"))
}

fn find_on_path(binary: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    std::env::split_paths(&path_var)
        .map(|dir| dir.join(binary))
        .find(|p| p.is_file())
}

fn find_llama_server_binary() -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(engine_dir) = sentinel_engine_dir() {
        candidates.push(engine_dir.join("llama-server"));
    }

    if let Some(home) = get_home_dir() {
        candidates.push(home.join(".sentinel").join("bin").join("llama-server"));
        candidates.push(home.join(".local").join("bin").join("llama-server"));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("llama-server"));
            candidates.push(parent.join("../MacOS/llama-server"));
            candidates.push(parent.join("../bin/llama-server"));
        }
    }

    // Distro packages (Arch `llama.cpp`, Fedora/Ubuntu builds) and Homebrew
    candidates.push(PathBuf::from("/usr/bin/llama-server"));
    candidates.push(PathBuf::from("/usr/local/bin/llama-server"));
    candidates.push(PathBuf::from("/opt/homebrew/bin/llama-server"));
    if let Some(on_path) = find_on_path("llama-server") {
        candidates.push(on_path);
    }
    candidates.push(PathBuf::from("/usr/lib/ollama/llama-server"));

    candidates.into_iter().find(|p| p.exists() && p.is_file())
}

/// Where llama-server's stderr goes, so a failed start (bad flag, missing library, model load
/// error) can be diagnosed instead of silently disappearing.
pub fn llama_server_log_path() -> Option<PathBuf> {
    get_home_dir().map(|home| home.join(".sentinel").join("logs").join("llama-server.log"))
}

/// Server flags. Deliberately minimal so they work on both older and current llama.cpp builds:
/// - no `--flash-attn`: its syntax changed from a bare flag to `on|off|auto` in Aug 2025
///   (PR #15434); passing `auto` makes older builds exit with "invalid argument", and newer
///   builds already default to auto.
/// - no `-t`: llama.cpp picks the physical/performance core count itself, which beats the
///   logical-core count (hyper-threads slow token generation down).
/// - `-np 1`: one interactive user, so one slot; newer builds otherwise auto-create several
///   slots that share (and split) the context.
/// - `--cache-reuse 256`: reuse cached KV chunks across requests; together with the stable
///   system-prompt prefix this skips re-processing ~1.8k prompt tokens per request.
pub fn build_server_args(model: &str, port: u16, gpu_layers: &str, lora: Option<&str>) -> Vec<String> {
    let mut args = vec![
        "--host".to_string(), "127.0.0.1".to_string(),
        "--port".to_string(), port.to_string(),
        "-m".to_string(), model.to_string(),
        "-ngl".to_string(), gpu_layers.to_string(),
        "-c".to_string(), "8192".to_string(),
        "-np".to_string(), "1".to_string(),
        "--cache-reuse".to_string(), "256".to_string(),
    ];
    if let Some(lora) = lora {
        args.push("--lora".to_string());
        args.push(lora.to_string());
    }
    args
}

/// LoRA adapters live next to base models in ~/.sentinel/models; loading one as the base model
/// fails, so discovery must skip them.
fn is_lora_adapter(path: &std::path::Path) -> bool {
    path.file_name()
        .map(|n| n.to_string_lossy().to_lowercase().contains("lora"))
        .unwrap_or(false)
}

fn find_model_file(preferred: Option<String>) -> Option<PathBuf> {
    if let Some(ref path) = preferred {
        let p = crate::process_cmds::expand_tilde(path);
        if p.exists() && !is_lora_adapter(&p) {
            return Some(p);
        }
    }

    let mut candidates = Vec::new();

    if let Some(home) = get_home_dir() {
        let models_dir = home.join(".sentinel").join("models");
        // The downloadable tiers, most capable first (see EMBEDDED_MODEL_TIERS in TypeScript)
        candidates.push(models_dir.join("Qwen3-4B-Instruct-2507-Q4_K_M.gguf"));
        candidates.push(models_dir.join("qwen2.5-coder-3b-instruct-q4_k_m.gguf"));
        candidates.push(models_dir.join("qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"));
        candidates.push(models_dir.join("model.gguf"));

        // Or search models_dir for any other base-model .gguf file
        if let Ok(entries) = std::fs::read_dir(&models_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "gguf") && !is_lora_adapter(&path) {
                    candidates.push(path);
                }
            }
        }

        // Check user's Ollama model cache
        let ollama_blobs = home.join(".ollama").join("models").join("blobs");
        if let Ok(entries) = std::fs::read_dir(&ollama_blobs) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Ok(metadata) = path.metadata() {
                    if metadata.len() > 500 * 1024 * 1024 {
                        candidates.push(path);
                    }
                }
            }
        }
    }

    // Check system Ollama blobs (/var/lib/ollama/blobs)
    let var_ollama = PathBuf::from("/var/lib/ollama/blobs");
    if let Ok(entries) = std::fs::read_dir(&var_ollama) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Ok(metadata) = path.metadata() {
                if metadata.len() > 500 * 1024 * 1024 {
                    candidates.push(path);
                }
            }
        }
    }

    candidates.into_iter().find(|p| p.exists() && p.is_file())
}

#[tauri::command]
pub fn start_embedded_llm(
    state: tauri::State<'_, EmbeddedLlmState>,
    model_path: Option<String>,
    lora_path: Option<String>,
    gpu_layers: Option<i32>,
) -> Result<bool, String> {
    let bin_path = find_llama_server_binary().ok_or_else(|| {
        "llama-server binary not found in ~/.sentinel/bin, /usr/lib/ollama, or /usr/bin".to_string()
    })?;

    let model_file = find_model_file(model_path).ok_or_else(|| {
        "No GGUF model file found. Download a model into ~/.sentinel/models/".to_string()
    })?;

    let mut proc_guard = state.process.lock().map_err(|e| e.to_string())?;

    // Stop existing process if already running
    if let Some(mut child) = proc_guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    let model_str = model_file.to_string_lossy().into_owned();

    let is_cpu = gpu_layers.map_or(false, |l| l <= 0);
    {
        let mut fb_guard = state.is_cpu_fallback.lock().map_err(|e| e.to_string())?;
        *fb_guard = is_cpu;
    }

    let ngl_val = if is_cpu {
        "0".to_string()
    } else {
        gpu_layers.unwrap_or(99).to_string()
    };

    let applied_lora: Option<String> = lora_path
        .as_ref()
        .filter(|lora| std::path::Path::new(lora.as_str()).exists())
        .cloned();
    let args = build_server_args(&model_str, state.port, &ngl_val, applied_lora.as_deref());

    let stderr_target = llama_server_log_path()
        .and_then(|log_path| {
            if let Some(dir) = log_path.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            std::fs::File::create(&log_path).ok()
        })
        .map(Stdio::from)
        .unwrap_or_else(Stdio::null);

    let mut cmd = Command::new(&bin_path);
    cmd.args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(stderr_target);
    // Run from the binary's own directory so bundled shared libraries resolve.
    if let Some(bin_dir) = bin_path.parent() {
        cmd.current_dir(bin_dir);
    }

    #[cfg(target_os = "linux")]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                Ok(())
            });
        }
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn llama-server at {}: {}", bin_path.display(), e))?;

    crate::logger::log_info("LLM", &format!("Spawned llama-server (pid: {}) on port {}", child.id(), state.port));

    let mut model_guard = state.active_model.lock().map_err(|e| e.to_string())?;
    let mut lora_guard = state.active_lora.lock().map_err(|e| e.to_string())?;
    *model_guard = Some(model_str);
    *lora_guard = applied_lora;
    *proc_guard = Some(child);

    Ok(true)
}

pub fn terminate_embedded_llm_child(state: &EmbeddedLlmState) {
    if let Ok(mut proc_guard) = state.process.lock() {
        if let Some(mut child) = proc_guard.take() {
            crate::logger::log_info("LLM", &format!("Terminating embedded llama-server (pid: {})", child.id()));
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    if let Ok(mut model_guard) = state.active_model.lock() {
        *model_guard = None;
    }
    if let Ok(mut lora_guard) = state.active_lora.lock() {
        *lora_guard = None;
    }
}

#[tauri::command]
pub fn stop_embedded_llm(state: tauri::State<'_, EmbeddedLlmState>) -> Result<bool, String> {
    terminate_embedded_llm_child(state.inner());
    Ok(true)
}

#[tauri::command]
pub fn get_embedded_llm_status(
    state: tauri::State<'_, EmbeddedLlmState>,
) -> Result<EmbeddedLlmStatus, String> {
    let mut proc_guard = state.process.lock().map_err(|e| e.to_string())?;
    let model_guard = state.active_model.lock().map_err(|e| e.to_string())?;
    let lora_guard = state.active_lora.lock().map_err(|e| e.to_string())?;
    let fb_guard = state.is_cpu_fallback.lock().map_err(|e| e.to_string())?;
    let active_guard = state.active_request.lock().map_err(|e| e.to_string())?;
    let queue_guard = state.queue.lock().map_err(|e| e.to_string())?;

    let is_running = if let Some(ref mut child) = *proc_guard {
        match child.try_wait() {
            Ok(None) => true,
            _ => {
                *proc_guard = None;
                false
            }
        }
    } else {
        false
    };

    let pid = if is_running {
        proc_guard.as_ref().map(|c| c.id())
    } else {
        None
    };

    let total_queued = queue_guard.len() + if active_guard.is_some() { 1 } else { 0 };

    Ok(EmbeddedLlmStatus {
        is_running,
        pid,
        active_model: model_guard.clone(),
        active_lora: lora_guard.clone(),
        port: state.port,
        is_cpu_fallback: *fb_guard,
        queued_requests: total_queued,
    })
}

/// Last `max_lines` lines of llama-server's stderr log, for diagnosing a failed start.
#[tauri::command]
pub fn get_embedded_llm_log_tail(max_lines: Option<usize>) -> Result<String, String> {
    let Some(path) = llama_server_log_path() else {
        return Ok(String::new());
    };
    let contents = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Ok(String::new()),
    };
    let lines: Vec<&str> = contents.lines().collect();
    let keep = max_lines.unwrap_or(40);
    let start = lines.len().saturating_sub(keep);
    Ok(lines[start..].join("\n"))
}

#[tauri::command]
pub fn acquire_inference_slot(
    state: tauri::State<'_, EmbeddedLlmState>,
    session_id: String,
    request_id: String,
) -> Result<bool, String> {
    let mut active_guard = state.active_request.lock().map_err(|e| e.to_string())?;
    let mut queue_guard = state.queue.lock().map_err(|e| e.to_string())?;

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let slot = QueuedInferenceSlot {
        session_id,
        request_id,
        created_at_ms: now_ms,
    };

    if active_guard.is_none() {
        *active_guard = Some(slot);
        Ok(true)
    } else {
        queue_guard.push_back(slot);
        Ok(false)
    }
}

#[tauri::command]
pub fn release_inference_slot(
    state: tauri::State<'_, EmbeddedLlmState>,
    session_id: String,
    request_id: String,
) -> Result<Option<QueuedInferenceSlot>, String> {
    let mut active_guard = state.active_request.lock().map_err(|e| e.to_string())?;
    let mut queue_guard = state.queue.lock().map_err(|e| e.to_string())?;

    if let Some(ref current) = *active_guard {
        if current.session_id == session_id && current.request_id == request_id {
            *active_guard = queue_guard.pop_front();
            return Ok(active_guard.clone());
        }
    }

    queue_guard.retain(|s| !(s.session_id == session_id && s.request_id == request_id));
    Ok(active_guard.clone())
}

#[tauri::command]
pub fn cancel_session_requests(
    state: tauri::State<'_, EmbeddedLlmState>,
    session_id: String,
) -> Result<usize, String> {
    let mut active_guard = state.active_request.lock().map_err(|e| e.to_string())?;
    let mut queue_guard = state.queue.lock().map_err(|e| e.to_string())?;

    let initial_len = queue_guard.len();
    queue_guard.retain(|s| s.session_id != session_id);
    let removed = initial_len - queue_guard.len();

    if let Some(ref current) = *active_guard {
        if current.session_id == session_id {
            *active_guard = queue_guard.pop_front();
            return Ok(removed + 1);
        }
    }

    Ok(removed)
}

#[tauri::command]
pub fn get_inference_queue_status(
    state: tauri::State<'_, EmbeddedLlmState>,
) -> Result<InferenceQueueStatus, String> {
    let active_guard = state.active_request.lock().map_err(|e| e.to_string())?;
    let queue_guard = state.queue.lock().map_err(|e| e.to_string())?;
    let fb_guard = state.is_cpu_fallback.lock().map_err(|e| e.to_string())?;

    let mut session_counts: HashMap<String, usize> = HashMap::new();
    if let Some(ref act) = *active_guard {
        *session_counts.entry(act.session_id.clone()).or_insert(0) += 1;
    }
    for item in queue_guard.iter() {
        *session_counts.entry(item.session_id.clone()).or_insert(0) += 1;
    }

    Ok(InferenceQueueStatus {
        active_request: active_guard.clone(),
        queued_count: queue_guard.len(),
        session_queue_counts: session_counts,
        is_cpu_fallback: *fb_guard,
    })
}

#[tauri::command]
pub fn verify_file_checksum(
    file_path: String,
    expected_sha256: String,
) -> Result<bool, String> {
    let resolved_path = if file_path.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
            file_path.replacen("~", &home, 1)
        } else {
            file_path
        }
    } else if file_path.starts_with("$HOME/") {
        if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
            file_path.replacen("$HOME", &home, 1)
        } else {
            file_path
        }
    } else {
        file_path
    };

    let path = std::path::Path::new(&resolved_path);
    if !path.exists() || !path.is_file() {
        return Err(format!("File not found: {}", resolved_path));
    }

    let output = Command::new("sha256sum")
        .arg(&resolved_path)
        .output()
        .or_else(|_| {
            Command::new("shasum")
                .arg("-a")
                .arg("256")
                .arg(&resolved_path)
                .output()
        })
        .map_err(|e| format!("Failed to execute checksum utility: {}", e))?;

    if !output.status.success() {
        return Err("Checksum calculation command exited with error".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let calculated = stdout
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();

    Ok(calculated == expected_sha256.trim().to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lora_adapters_are_never_used_as_base_models() {
        assert!(is_lora_adapter(std::path::Path::new("/m/sentinel_lora.gguf")));
        assert!(is_lora_adapter(std::path::Path::new("/m/sentinel_mlx_LoRA.gguf")));
        assert!(!is_lora_adapter(std::path::Path::new("/m/qwen2.5-coder-3b-instruct-q4_k_m.gguf")));
    }

    #[test]
    fn server_args_work_across_llama_cpp_versions() {
        let args = build_server_args("/models/m.gguf", 8847, "99", None);
        let joined = args.join(" ");
        // `--flash-attn auto` breaks builds older than Aug 2025; -t overrides llama.cpp's core detection
        assert!(!joined.contains("flash-attn"));
        assert!(!args.iter().any(|a| a == "-t"));
        assert!(joined.contains("-np 1"));
        assert!(joined.contains("-c 8192"));
        assert!(joined.contains("--cache-reuse 256"));
        assert!(joined.contains("--port 8847"));
        assert!(!joined.contains("--lora"));

        let with_lora = build_server_args("/models/m.gguf", 8847, "0", Some("/models/a.gguf"));
        assert!(with_lora.join(" ").contains("--lora /models/a.gguf"));
    }

    #[test]
    fn test_inference_queue_slot_lifecycle() {
        let state = EmbeddedLlmState::default();

        // 1. First slot acquired immediately
        {
            let mut active = state.active_request.lock().unwrap();
            let queue = state.queue.lock().unwrap();
            assert!(active.is_none());
            *active = Some(QueuedInferenceSlot {
                session_id: "tab-1".to_string(),
                request_id: "req-1".to_string(),
                created_at_ms: 100,
            });
            assert!(active.is_some());
            assert_eq!(queue.len(), 0);
        }

        // 2. Second slot queued
        {
            let mut queue = state.queue.lock().unwrap();
            queue.push_back(QueuedInferenceSlot {
                session_id: "tab-2".to_string(),
                request_id: "req-2".to_string(),
                created_at_ms: 200,
            });
            assert_eq!(queue.len(), 1);
        }

        // 3. Releasing active slot advances queue to next slot
        {
            let mut active = state.active_request.lock().unwrap();
            let mut queue = state.queue.lock().unwrap();
            assert_eq!(active.as_ref().unwrap().session_id, "tab-1");
            *active = queue.pop_front();
            assert_eq!(active.as_ref().unwrap().session_id, "tab-2");
            assert_eq!(queue.len(), 0);
        }
    }

    #[test]
    fn test_session_cancellation_cleans_up() {
        let state = EmbeddedLlmState::default();

        {
            let mut active = state.active_request.lock().unwrap();
            let mut queue = state.queue.lock().unwrap();
            *active = Some(QueuedInferenceSlot {
                session_id: "tab-dead".to_string(),
                request_id: "req-1".to_string(),
                created_at_ms: 100,
            });
            queue.push_back(QueuedInferenceSlot {
                session_id: "tab-alive".to_string(),
                request_id: "req-2".to_string(),
                created_at_ms: 200,
            });
            queue.push_back(QueuedInferenceSlot {
                session_id: "tab-dead".to_string(),
                request_id: "req-3".to_string(),
                created_at_ms: 300,
            });
        }

        // Cancel "tab-dead"
        {
            let mut active = state.active_request.lock().unwrap();
            let mut queue = state.queue.lock().unwrap();
            queue.retain(|s| s.session_id != "tab-dead");
            if let Some(ref act) = *active {
                if act.session_id == "tab-dead" {
                    *active = queue.pop_front();
                }
            }
        }

        let active = state.active_request.lock().unwrap();
        let queue = state.queue.lock().unwrap();
        assert_eq!(active.as_ref().unwrap().session_id, "tab-alive");
        assert_eq!(queue.len(), 0);
    }
}
