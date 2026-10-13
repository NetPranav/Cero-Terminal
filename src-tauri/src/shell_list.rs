//! `list_available_shells`: which shells Settings can offer (roadmap 2.3). The decisions are in `shell.rs`; this
//! file asks the machine: the Git for Windows registry key and `wsl.exe -l -q`.

use crate::shell::{self, Discovery, ResolveEnv};
use serde::Serialize;
use std::io::Read;
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY};
use winreg::RegKey;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const WSL_TIMEOUT: Duration = Duration::from_secs(4);

#[derive(Serialize, Clone, Debug)]
pub struct ShellInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub args: Vec<String>,
    pub version: Option<String>,
}

impl From<shell::ShellInfo> for ShellInfo {
    fn from(s: shell::ShellInfo) -> Self {
        Self { id: s.id, name: s.name, path: s.path, args: s.args, version: s.version }
    }
}

/// `InstallPath` and `CurrentVersion` of Git for Windows: machine-wide installs (64-bit and 32-bit view) first, then
/// the per-user install.
fn git_for_windows() -> (Option<String>, Option<String>) {
    let views = [
        (HKEY_LOCAL_MACHINE, KEY_READ | KEY_WOW64_64KEY),
        (HKEY_LOCAL_MACHINE, KEY_READ | KEY_WOW64_32KEY),
        (HKEY_CURRENT_USER, KEY_READ),
    ];
    for (hive, flags) in views {
        if let Ok(key) = RegKey::predef(hive).open_subkey_with_flags(r"SOFTWARE\GitForWindows", flags) {
            if let Ok(path) = key.get_value::<String, _>("InstallPath") {
                if !path.trim().is_empty() {
                    return (Some(path), key.get_value::<String, _>("CurrentVersion").ok());
                }
            }
        }
    }
    (None, None)
}

/// Run `wsl.exe -l -q` without a console window. `wsl.exe` can stall while the WSL service starts, so the answer is
/// awaited for a few seconds only.
fn wsl_distributions(wsl_exe: &str) -> Vec<String> {
    let Ok(mut child) = Command::new(wsl_exe)
        .args(["-l", "-q"])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return Vec::new();
    };
    let Some(mut stdout) = child.stdout.take() else { return Vec::new() };
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stdout.read_to_end(&mut bytes);
        let _ = tx.send(bytes);
    });
    match rx.recv_timeout(WSL_TIMEOUT) {
        Ok(bytes) => {
            let ok = child.wait().map(|status| status.success()).unwrap_or(false);
            if ok { shell::decode_wsl_list(&bytes) } else { Vec::new() }
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            crate::logger::log_warn("SHELLS", "wsl.exe -l -q did not answer in time");
            Vec::new()
        }
    }
}

fn real_exists(path: &str) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

pub fn detect() -> Vec<ShellInfo> {
    let env = ResolveEnv::from_process();
    let (git_install_path, git_version) = git_for_windows();
    let wsl_exe = format!("{}\\System32\\wsl.exe", if env.system_root.is_empty() { r"C:\Windows" } else { env.system_root.as_str() });
    let wsl_distros = if real_exists(&wsl_exe) { wsl_distributions(&wsl_exe) } else { Vec::new() };
    let found = Discovery { git_install_path, git_version, wsl_distros };
    shell::list_shells(&env, &real_exists, &found).into_iter().map(ShellInfo::from).collect()
}

/// The shells installed here. Runs off the UI thread because `wsl.exe` can take a moment.
#[tauri::command]
pub async fn list_available_shells() -> Result<Vec<ShellInfo>, String> {
    tauri::async_runtime::spawn_blocking(detect).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every Windows machine has cmd.exe and Windows PowerShell; the list must contain them with real paths.
    #[test]
    fn this_machine_lists_cmd_and_windows_powershell() {
        let shells = detect();
        let cmd = shells.iter().find(|s| s.id == "cmd").expect("cmd listed");
        let powershell = shells.iter().find(|s| s.id == "powershell").expect("Windows PowerShell listed");
        assert!(std::path::Path::new(&cmd.path).exists());
        assert!(std::path::Path::new(&powershell.path).exists());
        let ids: Vec<&str> = shells.iter().map(|s| s.id.as_str()).collect();
        let mut unique = ids.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(ids.len(), unique.len(), "no shell is listed twice: {:?}", ids);
    }

    #[test]
    fn every_listed_shell_can_be_classified_and_exists() {
        for shell in detect() {
            assert!(std::path::Path::new(&shell.path).exists(), "{} does not exist", shell.path);
            assert_ne!(shell::classify(&shell.path), shell::ShellKind::Other, "{}", shell.path);
        }
    }
}
