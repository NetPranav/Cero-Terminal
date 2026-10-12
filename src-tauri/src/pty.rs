use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::io::{Read, Write};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Serialize, Clone)]
pub struct PtyOutputEvent {
    pub session_id: String,
    pub data: Vec<u8>,
}

pub struct PtySession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn std::io::Write + Send>,
    /// Shell process id, used to read its working directory
    pid: Option<u32>,
}

pub struct PtyState {
    pub sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
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
    login_shell: Option<bool>,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
) -> Result<String, String> {
    let pty_system = NativePtySystem::default();

    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let default_shell = "powershell.exe".to_string();
    #[cfg(target_os = "macos")]
    let default_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    #[cfg(target_os = "linux")]
    let default_shell = std::env::var("SHELL")
        .ok()
        .filter(|s| !s.trim().is_empty() && std::path::Path::new(s).exists())
        .unwrap_or_else(|| {
            if std::path::Path::new("/bin/bash").exists() {
                "/bin/bash".to_string()
            } else if std::path::Path::new("/usr/bin/fish").exists() {
                "/usr/bin/fish".to_string()
            } else if std::path::Path::new("/usr/bin/bash").exists() {
                "/usr/bin/bash".to_string()
            } else {
                "/bin/sh".to_string()
            }
        });

    let target_shell = shell
        .filter(|s| {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                return false;
            }
            if trimmed.contains('/') || trimmed.contains('\\') {
                std::path::Path::new(trimmed).exists()
            } else {
                true
            }
        })
        .unwrap_or(default_shell);
    let mut cmd = CommandBuilder::new(&target_shell);

    if login_shell == Some(true) && !target_shell.contains("pwsh") && !target_shell.contains("powershell") {
        cmd.arg("-l");
    }

    if let Some(extra_args) = args {
        for arg in extra_args {
            cmd.arg(arg);
        }
    }

    let target_dir = cwd
        .filter(|d| !d.trim().is_empty())
        .map(|d| crate::process_cmds::expand_tilde(&d))
        .and_then(|p| if p.is_dir() { Some(p) } else { None })
        .or_else(|| {
            std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .ok()
                .map(std::path::PathBuf::from)
                .filter(|p| p.is_dir())
        });

    if let Some(ref dir) = target_dir {
        cmd.cwd(dir);
    }

    // Enforce standard terminal emulator variables
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "Cero");
    cmd.env("TERM_PROGRAM_VERSION", "0.1.0");
    cmd.env("CERO_TERMINAL", "1");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");

    if let Some(custom_env) = env {
        for (k, v) in custom_env {
            cmd.env(k, v);
        }
    }

    if let Ok(path) = std::env::var("PATH") {
        #[allow(unused_mut)] // only macOS and Linux add entries
        let mut path_additions: Vec<String> = Vec::new();
        #[cfg(target_os = "macos")]
        {
            if !path.contains("/opt/homebrew/bin") { path_additions.push("/opt/homebrew/bin".to_string()); }
            if !path.contains("/opt/homebrew/sbin") { path_additions.push("/opt/homebrew/sbin".to_string()); }
            if !path.contains("/usr/local/bin") { path_additions.push("/usr/local/bin".to_string()); }
        }
        #[cfg(target_os = "linux")]
        {
            if let Ok(home) = std::env::var("HOME") {
                let local_bin = format!("{}/.local/bin", home);
                let cargo_bin = format!("{}/.cargo/bin", home);
                if std::path::Path::new(&local_bin).exists() && !path.contains(&local_bin) {
                    path_additions.push(local_bin);
                }
                if std::path::Path::new(&cargo_bin).exists() && !path.contains(&cargo_bin) {
                    path_additions.push(cargo_bin);
                }
            }
            if !path.contains("/usr/local/bin") { path_additions.push("/usr/local/bin".to_string()); }
            if !path.contains("/usr/bin") { path_additions.push("/usr/bin".to_string()); }
            if !path.contains("/bin") { path_additions.push("/bin".to_string()); }
            if !path.contains("/usr/local/sbin") { path_additions.push("/usr/local/sbin".to_string()); }
            if !path.contains("/usr/sbin") { path_additions.push("/usr/sbin".to_string()); }
            if !path.contains("/sbin") { path_additions.push("/sbin".to_string()); }
        }
        if !path_additions.is_empty() {
            cmd.env("PATH", format!("{}:{}", path, path_additions.join(":")));
        }
    } else {
        #[cfg(target_os = "macos")]
        cmd.env("PATH", "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin");
        #[cfg(target_os = "linux")]
        cmd.env("PATH", "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin");
    }

    let _child = match pair.slave.spawn_command(cmd) {
        Ok(child) => child,
        Err(e) => {
            #[cfg(target_os = "linux")]
            {
                eprintln!("[pty] Failed to spawn '{}': {}. Falling back to default shell...", target_shell, e);
                let fallback = if std::path::Path::new("/bin/bash").exists() {
                    "/bin/bash"
                } else if std::path::Path::new("/usr/bin/bash").exists() {
                    "/usr/bin/bash"
                } else {
                    "/bin/sh"
                };
                let mut fallback_cmd = CommandBuilder::new(fallback);
                if login_shell == Some(true) {
                    fallback_cmd.arg("-l");
                }
                if let Some(dir) = target_dir {
                    fallback_cmd.cwd(dir);
                }
                fallback_cmd.env("TERM", "xterm-256color");
                fallback_cmd.env("COLORTERM", "truecolor");
                fallback_cmd.env("TERM_PROGRAM", "Cero");
                fallback_cmd.env("TERM_PROGRAM_VERSION", "0.1.0");
                fallback_cmd.env("CERO_TERMINAL", "1");
                pair.slave.spawn_command(fallback_cmd).map_err(|fb_err| {
                    format!("Failed to spawn shell '{}' ({}) and fallback '{}' ({})", target_shell, e, fallback, fb_err)
                })?
            }
            #[cfg(not(target_os = "linux"))]
            return Err(e.to_string());
        }
    };
    
    drop(pair.slave);
    let shell_pid = _child.process_id();
    
    let session_id = Uuid::new_v4().to_string();
    let session_id_clone = session_id.clone();
    
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    
    let app_handle_clone = app_handle.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let _ = app_handle_clone.emit("pty-output", PtyOutputEvent {
                        session_id: session_id_clone.clone(),
                        data: buf[..n].to_vec(),
                    });
                }
                Err(_) => break, // Error or closed
            }
        }
        let _ = app_handle_clone.emit("pty-exit", session_id_clone.clone());
    });

    crate::logger::log_info("PTY", &format!("Spawned PTY session {} (rows: {}, cols: {}, shell: {})", session_id, rows, cols, target_shell));

    state.sessions.lock().unwrap().insert(session_id.clone(), PtySession {
        master: pair.master,
        writer,
        pid: shell_pid,
    });

    Ok(session_id)
}

#[tauri::command]
pub fn write_pty(
    state: State<'_, PtyState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&session_id) {
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
pub fn resize_pty(
    state: State<'_, PtyState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&session_id) {
        session.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
pub fn kill_pty(
    state: State<'_, PtyState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if sessions.remove(&session_id).is_some() {
        crate::logger::log_info("PTY", &format!("Terminated PTY session {}", session_id));
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
pub fn get_default_shell() -> String {
    #[cfg(target_os = "windows")]
    return "powershell.exe".to_string();

    #[cfg(target_os = "macos")]
    return std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    #[cfg(target_os = "linux")]
    return std::env::var("SHELL")
        .ok()
        .filter(|s| !s.trim().is_empty() && std::path::Path::new(s).exists())
        .unwrap_or_else(|| {
            if std::path::Path::new("/bin/bash").exists() {
                "/bin/bash".to_string()
            } else if std::path::Path::new("/usr/bin/fish").exists() {
                "/usr/bin/fish".to_string()
            } else if std::path::Path::new("/usr/bin/bash").exists() {
                "/usr/bin/bash".to_string()
            } else {
                "/bin/sh".to_string()
            }
        });
}


/// Current working directory of the session's shell, read from the OS (not guessed from
/// typed `cd` commands, which miss aliases, `pushd`, `z` and compound lines).
#[tauri::command]
pub fn get_pty_cwd(state: State<'_, PtyState>, session_id: String) -> Result<Option<String>, String> {
    let pid = {
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions.get(&session_id).and_then(|s| s.pid)
    };
    Ok(pid.and_then(process_cwd))
}

#[cfg(target_os = "linux")]
pub fn process_cwd(pid: u32) -> Option<String> {
    std::fs::read_link(format!("/proc/{}/cwd", pid))
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}

#[cfg(target_os = "macos")]
pub fn process_cwd(pid: u32) -> Option<String> {
    let mut info: libc::proc_vnodepathinfo = unsafe { std::mem::zeroed() };
    let size = std::mem::size_of::<libc::proc_vnodepathinfo>() as libc::c_int;
    let ret = unsafe {
        libc::proc_pidinfo(
            pid as libc::c_int,
            libc::PROC_PIDVNODEPATHINFO,
            0,
            &mut info as *mut _ as *mut libc::c_void,
            size,
        )
    };
    if ret != size {
        return None;
    }
    let path = unsafe { std::ffi::CStr::from_ptr(info.pvi_cdir.vip_path.as_ptr() as *const libc::c_char) };
    let cwd = path.to_string_lossy().into_owned();
    if cwd.is_empty() { None } else { Some(cwd) }
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
pub fn process_cwd(_pid: u32) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    use super::process_cwd;

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    #[test]
    fn reads_own_working_directory() {
        let expected = std::env::current_dir().unwrap().canonicalize().unwrap();
        let cwd = process_cwd(std::process::id()).expect("cwd of this process");
        assert_eq!(std::path::Path::new(&cwd).canonicalize().unwrap(), expected);
    }
}
