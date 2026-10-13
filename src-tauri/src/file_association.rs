//! `.flow` file association status and the Settings toggle (roadmap 2.6).
//!
//! The installer registers the association (`src-tauri/windows/installer-hooks.nsh`). Settings reads the effective
//! handler from the merged `HKEY_CLASSES_ROOT` view and can add or remove a per-user registration under
//! `HKCU\Software\Classes`, which needs no administrator rights. A registration made for all users (`HKLM`) is
//! reported as `machine_wide` and is not touched from Settings.
//!
//! Not looked at: the choice the user made in "Open with" (`Explorer\FileExts\.flow\UserChoice`), which wins over
//! these keys but cannot be set by a program.

use crate::assoc;
use serde::{Deserialize, Serialize};
use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
use winreg::RegKey;

pub const PROG_ID: &str = "Cero.Flow";
const USER_CLASSES: &str = r"Software\Classes";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AssociationStatus {
    /// `registered`, `registered-elsewhere` or `missing`
    pub status: String,
    /// True when `.flow` files open with this program
    pub registered: bool,
    /// The command that opens a `.flow` file now
    pub command: Option<String>,
    /// Set for all users by the installer; Settings cannot remove that
    pub machine_wide: bool,
}

/// Called once at startup. The installer owns the registration, so there is nothing to do.
/// (Portable builds have no installer; asking once whether to register is a follow-up.)
pub fn ensure_registered(_app: &tauri::AppHandle) {}

fn current_exe() -> Result<String, String> {
    std::env::current_exe().map(|p| p.display().to_string()).map_err(|e| e.to_string())
}

/// The command that opens `.flow` files in `classes` (a `Software\Classes`-shaped key).
fn read_open_command(classes: &RegKey) -> Option<String> {
    let extension = classes.open_subkey_with_flags(".flow", KEY_READ).ok()?;
    let prog_id: String = extension.get_value("").ok()?;
    if prog_id.trim().is_empty() {
        return None;
    }
    let command = classes
        .open_subkey_with_flags(format!(r"{}\shell\open\command", prog_id.trim()), KEY_READ)
        .ok()?;
    command.get_value::<String, _>("").ok().filter(|c| !c.trim().is_empty())
}

/// Write the `.flow` registration under `classes`.
fn write_registration(classes: &RegKey, exe: &str, icon: Option<&str>) -> std::io::Result<()> {
    let (extension, _) = classes.create_subkey(".flow")?;
    extension.set_value("", &PROG_ID)?;
    extension.set_value("Content Type", &"application/x-cero-workflow")?;
    let (prog, _) = classes.create_subkey(PROG_ID)?;
    prog.set_value("", &"Cero Flow")?;
    if let Some(icon) = icon {
        let (default_icon, _) = prog.create_subkey("DefaultIcon")?;
        default_icon.set_value("", &format!("{icon},0"))?;
    }
    let (command, _) = prog.create_subkey(r"shell\open\command")?;
    command.set_value("", &assoc::open_command_for(exe))?;
    Ok(())
}

/// Remove what `write_registration` made. A key that is not there is fine.
fn remove_registration(classes: &RegKey) -> std::io::Result<()> {
    for name in [".flow", PROG_ID] {
        match classes.delete_subkey_all(name) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

/// Tell Explorer that file associations changed, so icons and "Open with" refresh without a restart.
fn notify_association_changed() {
    use windows_sys::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
    unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED as i32, SHCNF_IDLIST, std::ptr::null(), std::ptr::null()) };
}

fn status_for(command: Option<String>, machine_wide: bool, exe: &str) -> AssociationStatus {
    let status = assoc::classify(command.as_deref(), exe);
    AssociationStatus {
        status: status.to_string(),
        registered: status == "registered",
        command,
        machine_wide,
    }
}

#[tauri::command]
pub fn get_association_status() -> AssociationStatus {
    let exe = current_exe().unwrap_or_default();
    let effective = read_open_command(&RegKey::predef(HKEY_CLASSES_ROOT));
    let user_has = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(USER_CLASSES, KEY_READ)
        .ok()
        .and_then(|classes| read_open_command(&classes))
        .is_some();
    let machine_has = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(USER_CLASSES, KEY_READ)
        .ok()
        .and_then(|classes| read_open_command(&classes))
        .is_some();
    status_for(effective, machine_has && !user_has, &exe)
}

#[tauri::command]
pub fn set_association_status(enabled: bool) -> Result<AssociationStatus, String> {
    let user = RegKey::predef(HKEY_CURRENT_USER);
    let (classes, _) = user.create_subkey(USER_CLASSES).map_err(|e| e.to_string())?;
    if enabled {
        let exe = current_exe()?;
        let icon = std::path::Path::new(&exe)
            .parent()
            .map(|dir| dir.join("flow.ico"))
            .filter(|path| path.is_file())
            .map(|path| path.display().to_string());
        write_registration(&classes, &exe, icon.as_deref()).map_err(|e| e.to_string())?;
    } else {
        remove_registration(&classes).map_err(|e| e.to_string())?;
    }
    notify_association_changed();
    Ok(get_association_status())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A throwaway `Software\Classes` under HKCU, so a test never touches the real association.
    struct TestClasses {
        root: RegKey,
        path: String,
    }

    impl TestClasses {
        fn new(name: &str) -> Self {
            let path = format!(r"Software\CeroTest\{}-{}", name, std::process::id());
            let (root, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(&path).unwrap();
            Self { root, path }
        }
    }

    impl Drop for TestClasses {
        fn drop(&mut self) {
            let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(&self.path);
        }
    }

    const EXE: &str = r"C:\Program Files\Cero\Cero.exe";

    #[test]
    fn registration_round_trips() {
        let t = TestClasses::new("round-trip");
        assert_eq!(read_open_command(&t.root), None);

        write_registration(&t.root, EXE, Some(r"C:\Program Files\Cero\flow.ico")).unwrap();
        let command = read_open_command(&t.root).expect("registered");
        assert_eq!(command, r#""C:\Program Files\Cero\Cero.exe" "%1""#);
        assert_eq!(status_for(Some(command), false, EXE).status, "registered");

        remove_registration(&t.root).unwrap();
        assert_eq!(read_open_command(&t.root), None);
        // removing again is fine
        remove_registration(&t.root).unwrap();
    }

    #[test]
    fn an_older_install_path_is_registered_elsewhere() {
        let t = TestClasses::new("elsewhere");
        write_registration(&t.root, r"D:\old\Cero.exe", None).unwrap();
        let status = status_for(read_open_command(&t.root), false, EXE);
        assert_eq!(status.status, "registered-elsewhere");
        assert!(!status.registered);
    }

    #[test]
    fn writing_again_replaces_the_command() {
        let t = TestClasses::new("rewrite");
        write_registration(&t.root, r"D:\old\Cero.exe", None).unwrap();
        write_registration(&t.root, EXE, None).unwrap();
        assert_eq!(status_for(read_open_command(&t.root), false, EXE).status, "registered");
    }

    #[test]
    fn an_extension_without_a_program_is_missing() {
        let t = TestClasses::new("dangling");
        let (extension, _) = t.root.create_subkey(".flow").unwrap();
        extension.set_value("", &"Some.Missing.ProgId").unwrap();
        assert_eq!(read_open_command(&t.root), None);
        assert_eq!(status_for(None, false, EXE).status, "missing");
    }

    #[test]
    fn the_real_status_can_be_read() {
        // Only reads the registry; whichever state this machine is in, the fields agree
        let status = get_association_status();
        assert_eq!(status.registered, status.status == "registered");
        assert!(["registered", "registered-elsewhere", "missing"].contains(&status.status.as_str()));
    }
}
