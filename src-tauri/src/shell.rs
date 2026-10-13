//! Which shell the terminal starts, and with which arguments (roadmap 2.1).
//!
//! Everything here is plain `std` string logic with the environment and the file system passed in, so the order of
//! the fallbacks can be tested with a fake `PATH` and a fake set of installed files. Paths are Windows paths and are
//! joined with a backslash by hand.

/// Order of the fallbacks: the shell chosen in Settings, `pwsh.exe` (PowerShell 7) on the `PATH`,
/// `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`, then `%ComSpec%` (`cmd.exe`).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellKind {
    Pwsh,
    WindowsPowerShell,
    Cmd,
    GitBash,
    Wsl,
    Other,
}

/// The parts of the process environment that decide where programs are found.
#[derive(Debug, Clone, Default)]
pub struct ResolveEnv {
    pub path: String,
    pub pathext: String,
    pub system_root: String,
    pub comspec: String,
}

impl ResolveEnv {
    pub fn from_process() -> Self {
        let get = |name: &str| std::env::var(name).unwrap_or_default();
        Self {
            path: get("PATH"),
            pathext: get("PATHEXT"),
            system_root: get("SystemRoot"),
            comspec: get("ComSpec"),
        }
    }

    fn extensions(&self) -> Vec<String> {
        let list: Vec<String> = self
            .pathext
            .split(';')
            .map(|e| e.trim().to_ascii_lowercase())
            .filter(|e| e.starts_with('.') && e.len() > 1)
            .collect();
        if list.is_empty() {
            vec![".com".into(), ".exe".into(), ".bat".into(), ".cmd".into()]
        } else {
            list
        }
    }

    fn system_dir(&self) -> String {
        if self.system_root.trim().is_empty() {
            r"C:\Windows".to_string()
        } else {
            self.system_root.trim().trim_end_matches(['\\', '/']).to_string()
        }
    }
}

/// True for a value that names a place (`C:\x\pwsh.exe`, `.\x`, `/c/x`) and not a bare program name.
fn is_path_like(value: &str) -> bool {
    value.contains('\\') || value.contains('/') || value.as_bytes().get(1) == Some(&b':')
}

fn join(dir: &str, name: &str) -> String {
    format!("{}\\{}", dir.trim_end_matches(['\\', '/']), name)
}

fn file_name(path: &str) -> &str {
    path.rsplit(['\\', '/']).next().unwrap_or(path)
}

fn has_extension(name: &str) -> bool {
    match name.rfind('.') {
        Some(i) => i > 0 && i + 1 < name.len(),
        None => false,
    }
}

/// Names to try for `name` in one folder: as typed when it already has an extension that is executable, then with
/// every `PATHEXT` extension appended.
fn name_variants(name: &str, env: &ResolveEnv) -> Vec<String> {
    let exts = env.extensions();
    let lower = name.to_ascii_lowercase();
    if has_extension(name) && exts.iter().any(|e| lower.ends_with(e.as_str())) {
        return vec![name.to_string()];
    }
    let mut out: Vec<String> = exts.iter().map(|e| format!("{name}{e}")).collect();
    out.push(name.to_string());
    out
}

/// Walk `PATH` and `PATHEXT` like `CreateProcess` does and return the first existing file.
pub fn find_on_path(name: &str, env: &ResolveEnv, exists: &dyn Fn(&str) -> bool) -> Option<String> {
    let variants = name_variants(name, env);
    for dir in env.path.split(';') {
        let dir = dir.trim().trim_matches('"');
        if dir.is_empty() {
            continue;
        }
        for variant in &variants {
            let candidate = join(dir, variant);
            if exists(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

/// A shell named in Settings: a full path is used when it exists (with `PATHEXT` tried when it has no
/// extension), a bare name is looked up on the `PATH`.
pub fn resolve_requested(requested: &str, env: &ResolveEnv, exists: &dyn Fn(&str) -> bool) -> Option<String> {
    let requested = requested.trim().trim_matches('"');
    if requested.is_empty() {
        return None;
    }
    if is_path_like(requested) {
        return name_variants(requested, env).into_iter().find(|candidate| exists(candidate));
    }
    find_on_path(requested, env, exists)
}

/// The shells to try, best first, without duplicates (compared without case). The list is never empty: when none of
/// the standard files can be found, the bare names `powershell.exe` and `cmd.exe` are left for the OS to resolve so
/// that the spawn error says what is missing.
pub fn shell_candidates(requested: Option<&str>, env: &ResolveEnv, exists: &dyn Fn(&str) -> bool) -> Vec<String> {
    let mut list: Vec<String> = Vec::new();
    let mut add = |path: Option<String>| {
        if let Some(path) = path {
            if !list.iter().any(|known| known.eq_ignore_ascii_case(&path)) {
                list.push(path);
            }
        }
    };

    add(requested.and_then(|r| resolve_requested(r, env, exists)));
    add(find_on_path("pwsh", env, exists));

    let windows_powershell = join(&env.system_dir(), r"System32\WindowsPowerShell\v1.0\powershell.exe");
    add(exists(&windows_powershell).then_some(windows_powershell));

    let comspec = env.comspec.trim().trim_matches('"').to_string();
    let cmd_default = join(&env.system_dir(), r"System32\cmd.exe");
    add((!comspec.is_empty() && exists(&comspec)).then_some(comspec));
    add(exists(&cmd_default).then_some(cmd_default));

    if list.is_empty() {
        list.push("powershell.exe".to_string());
        list.push("cmd.exe".to_string());
    }
    list
}

pub fn classify(path: &str) -> ShellKind {
    let lower = path.to_ascii_lowercase();
    let name = file_name(&lower);
    let stem = name.strip_suffix(".exe").unwrap_or(name);
    match stem {
        "pwsh" | "pwsh-preview" => ShellKind::Pwsh,
        "powershell" => ShellKind::WindowsPowerShell,
        "cmd" => ShellKind::Cmd,
        "wsl" => ShellKind::Wsl,
        // C:\Windows\System32\bash.exe is the WSL launcher; every other bash.exe is Git Bash or MSYS
        "bash" if lower.contains(r"\windows\system32\") || lower.contains(r"\windows\sysnative\") => ShellKind::Wsl,
        "bash" | "sh" | "zsh" => ShellKind::GitBash,
        _ => ShellKind::Other,
    }
}

/// True when the arguments already choose what the shell runs, so the integration script must not be added.
fn picks_own_command(extra: &[String]) -> bool {
    extra.iter().any(|a| {
        let a = a.to_ascii_lowercase();
        matches!(
            a.as_str(),
            "-command" | "-c" | "-file" | "-f" | "-encodedcommand" | "-ec" | "-enc" | "/c" | "/k" | "/r"
        ) || a.starts_with("-command") || a.starts_with("-file")
    })
}

/// Arguments for an interactive session. No Unix `-l`: PowerShell and cmd have no login shells.
///
/// `integration` is the shell-integration script for this kind of shell (3.3), when it exists. It is started with
/// the execution policy bypassed for this process only; the machine policy is not changed.
pub fn shell_args(kind: ShellKind, integration: Option<&str>, extra: &[String]) -> Vec<String> {
    let script = integration.filter(|_| !picks_own_command(extra));
    let mut args: Vec<String> = Vec::new();
    match kind {
        ShellKind::Pwsh | ShellKind::WindowsPowerShell => {
            args.extend(["-NoLogo".to_string(), "-NoExit".to_string()]);
            args.extend(extra.iter().cloned());
            // -File takes everything after it as script arguments, so it comes last
            if let Some(script) = script {
                args.extend(["-ExecutionPolicy".to_string(), "Bypass".to_string(), "-File".to_string(), script.to_string()]);
            }
        }
        ShellKind::Cmd => {
            args.extend(extra.iter().cloned());
            if let Some(script) = script {
                args.extend(["/K".to_string(), script.to_string()]);
            }
        }
        ShellKind::GitBash => {
            args.extend(["--login".to_string(), "-i".to_string()]);
            args.extend(extra.iter().cloned());
        }
        ShellKind::Wsl | ShellKind::Other => args.extend(extra.iter().cloned()),
    }
    args
}

/// Name of the integration script that goes with a shell, inside the `shell-integration` resource folder.
pub fn integration_file(kind: ShellKind) -> Option<&'static str> {
    match kind {
        ShellKind::Pwsh | ShellKind::WindowsPowerShell => Some("cero.ps1"),
        ShellKind::Cmd => Some("cero.cmd"),
        _ => None,
    }
}

/// Variables every session gets. `LANG` and `LC_ALL` are left out on purpose: they do nothing for Windows programs
/// and confuse locale detection in Git Bash.
pub const SESSION_ENV: [(&str, &str); 5] = [
    ("TERM", "xterm-256color"),
    ("COLORTERM", "truecolor"),
    ("TERM_PROGRAM", "Cero"),
    ("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION")),
    ("CERO_TERMINAL", "1"),
];

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn env() -> ResolveEnv {
        ResolveEnv {
            path: r"C:\Windows\System32;C:\Program Files\PowerShell\7;C:\Tools\".to_string(),
            pathext: ".COM;.EXE;.BAT;.CMD;.VBS".to_string(),
            system_root: r"C:\Windows".to_string(),
            comspec: r"C:\Windows\System32\cmd.exe".to_string(),
        }
    }

    /// A fake disk: the exact paths that exist (compared without case, like NTFS).
    fn disk(files: &[&str]) -> impl Fn(&str) -> bool {
        let set: HashSet<String> = files.iter().map(|f| f.to_ascii_lowercase()).collect();
        move |p: &str| set.contains(&p.to_ascii_lowercase())
    }

    const PWSH: &str = r"C:\Program Files\PowerShell\7\pwsh.exe";
    const WINPS: &str = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
    const CMD: &str = r"C:\Windows\System32\cmd.exe";

    #[test]
    fn pwsh_on_the_path_comes_first_without_a_setting() {
        let exists = disk(&[PWSH, WINPS, CMD]);
        assert_eq!(shell_candidates(None, &env(), &exists), vec![PWSH, WINPS, CMD]);
    }

    #[test]
    fn windows_powershell_is_next_when_pwsh_is_missing() {
        let exists = disk(&[WINPS, CMD]);
        assert_eq!(shell_candidates(None, &env(), &exists), vec![WINPS, CMD]);
    }

    #[test]
    fn cmd_is_the_last_resort() {
        let exists = disk(&[CMD]);
        assert_eq!(shell_candidates(None, &env(), &exists), vec![CMD]);
    }

    #[test]
    fn the_shell_from_settings_wins_when_it_exists() {
        let git_bash = r"C:\Program Files\Git\bin\bash.exe";
        let exists = disk(&[git_bash, PWSH, WINPS, CMD]);
        let list = shell_candidates(Some(git_bash), &env(), &exists);
        assert_eq!(list, vec![git_bash, PWSH, WINPS, CMD]);
    }

    #[test]
    fn a_missing_shell_from_settings_is_skipped() {
        let exists = disk(&[PWSH, WINPS, CMD]);
        let list = shell_candidates(Some(r"D:\gone\bash.exe"), &env(), &exists);
        assert_eq!(list, vec![PWSH, WINPS, CMD]);
    }

    #[test]
    fn a_bare_name_from_settings_is_found_on_the_path() {
        let exists = disk(&[PWSH, WINPS, CMD]);
        let list = shell_candidates(Some("powershell"), &env(), &exists);
        // powershell.exe is not on this PATH folder list (System32 itself has none), so Settings falls through
        assert_eq!(list, vec![PWSH, WINPS, CMD]);
        let exists = disk(&[r"C:\Tools\mysh.exe", PWSH, WINPS, CMD]);
        let list = shell_candidates(Some("mysh"), &env(), &exists);
        assert_eq!(list[0], r"C:\Tools\mysh.exe");
    }

    #[test]
    fn the_same_shell_is_not_listed_twice() {
        let exists = disk(&[PWSH, WINPS, CMD]);
        let list = shell_candidates(Some(&PWSH.to_ascii_uppercase()), &env(), &exists);
        assert_eq!(list, vec![PWSH.to_ascii_uppercase(), WINPS.to_string(), CMD.to_string()]);
    }

    #[test]
    fn comspec_is_used_when_it_differs_from_the_default() {
        let custom = r"D:\Sys\cmd.exe";
        let mut e = env();
        e.comspec = custom.to_string();
        let exists = disk(&[custom, CMD]);
        assert_eq!(shell_candidates(None, &e, &exists), vec![custom, CMD]);
    }

    #[test]
    fn bare_names_are_returned_when_nothing_exists() {
        let exists = disk(&[]);
        assert_eq!(shell_candidates(None, &env(), &exists), vec!["powershell.exe", "cmd.exe"]);
    }

    #[test]
    fn find_on_path_tries_extensions_in_order_per_folder() {
        let e = env();
        let exists = disk(&[r"C:\Tools\tool.cmd", r"C:\Tools\tool.exe"]);
        assert_eq!(find_on_path("tool", &e, &exists), Some(r"C:\Tools\tool.exe".to_string()));
        let exists = disk(&[r"C:\Tools\tool.cmd"]);
        assert_eq!(find_on_path("tool", &e, &exists), Some(r"C:\Tools\tool.cmd".to_string()));
    }

    #[test]
    fn find_on_path_prefers_the_earlier_folder() {
        let e = env();
        let exists = disk(&[r"C:\Tools\tool.exe", r"C:\Windows\System32\tool.exe"]);
        assert_eq!(find_on_path("tool", &e, &exists), Some(r"C:\Windows\System32\tool.exe".to_string()));
    }

    #[test]
    fn find_on_path_accepts_a_name_with_its_extension_and_skips_odd_entries() {
        let mut e = env();
        e.path = r#";"C:\Quoted Dir";  ;C:\Tools"#.to_string();
        let exists = disk(&[r"C:\Quoted Dir\x.exe"]);
        assert_eq!(find_on_path("x.exe", &e, &exists), Some(r"C:\Quoted Dir\x.exe".to_string()));
        assert_eq!(find_on_path("missing", &e, &exists), None);
    }

    #[test]
    fn a_full_path_without_extension_gets_one() {
        let exists = disk(&[r"C:\Program Files\Git\bin\bash.exe"]);
        assert_eq!(
            resolve_requested(r"C:\Program Files\Git\bin\bash", &env(), &exists),
            Some(r"C:\Program Files\Git\bin\bash.exe".to_string())
        );
    }

    #[test]
    fn an_empty_pathext_falls_back_to_the_usual_four() {
        let mut e = env();
        e.pathext = String::new();
        let exists = disk(&[r"C:\Tools\a.bat"]);
        assert_eq!(find_on_path("a", &e, &exists), Some(r"C:\Tools\a.bat".to_string()));
    }

    #[test]
    fn classify_recognises_each_shell() {
        assert_eq!(classify(PWSH), ShellKind::Pwsh);
        assert_eq!(classify("pwsh"), ShellKind::Pwsh);
        assert_eq!(classify(WINPS), ShellKind::WindowsPowerShell);
        assert_eq!(classify("PowerShell.EXE"), ShellKind::WindowsPowerShell);
        assert_eq!(classify(CMD), ShellKind::Cmd);
        assert_eq!(classify(r"C:\Program Files\Git\bin\bash.exe"), ShellKind::GitBash);
        assert_eq!(classify(r"C:\Program Files\Git\usr\bin\zsh.exe"), ShellKind::GitBash);
        assert_eq!(classify(r"C:\Windows\System32\wsl.exe"), ShellKind::Wsl);
        assert_eq!(classify(r"C:\Windows\System32\bash.exe"), ShellKind::Wsl);
        assert_eq!(classify(r"C:\Tools\nu.exe"), ShellKind::Other);
    }

    #[test]
    fn powershell_args_have_no_unix_login_flag() {
        for kind in [ShellKind::Pwsh, ShellKind::WindowsPowerShell] {
            let args = shell_args(kind, None, &[]);
            assert_eq!(args, vec!["-NoLogo", "-NoExit"]);
            assert!(!args.iter().any(|a| a == "-l"));
        }
    }

    #[test]
    fn powershell_runs_the_integration_script_last_with_bypass() {
        let args = shell_args(ShellKind::Pwsh, Some(r"C:\App\cero.ps1"), &["-Interactive".to_string()]);
        assert_eq!(
            args,
            vec!["-NoLogo", "-NoExit", "-Interactive", "-ExecutionPolicy", "Bypass", "-File", r"C:\App\cero.ps1"]
        );
    }

    #[test]
    fn cmd_runs_its_script_with_k() {
        assert_eq!(shell_args(ShellKind::Cmd, Some(r"C:\App\cero.cmd"), &[]), vec!["/K", r"C:\App\cero.cmd"]);
        assert!(shell_args(ShellKind::Cmd, None, &[]).is_empty());
    }

    #[test]
    fn git_bash_is_a_login_interactive_shell_and_wsl_has_no_arguments() {
        assert_eq!(shell_args(ShellKind::GitBash, None, &[]), vec!["--login", "-i"]);
        assert!(shell_args(ShellKind::Wsl, None, &[]).is_empty());
        assert_eq!(shell_args(ShellKind::Other, None, &["--x".to_string()]), vec!["--x"]);
    }

    #[test]
    fn the_integration_script_is_dropped_when_the_caller_chooses_the_command() {
        let extra = vec!["-Command".to_string(), "Get-Date".to_string()];
        let args = shell_args(ShellKind::Pwsh, Some(r"C:\App\cero.ps1"), &extra);
        assert_eq!(args, vec!["-NoLogo", "-NoExit", "-Command", "Get-Date"]);
        let args = shell_args(ShellKind::Cmd, Some(r"C:\App\cero.cmd"), &["/c".to_string(), "dir".to_string()]);
        assert_eq!(args, vec!["/c", "dir"]);
    }

    #[test]
    fn only_powershell_and_cmd_have_integration_scripts() {
        assert_eq!(integration_file(ShellKind::Pwsh), Some("cero.ps1"));
        assert_eq!(integration_file(ShellKind::WindowsPowerShell), Some("cero.ps1"));
        assert_eq!(integration_file(ShellKind::Cmd), Some("cero.cmd"));
        assert_eq!(integration_file(ShellKind::GitBash), None);
    }

    #[test]
    fn session_env_has_no_locale_variables_and_never_touches_path() {
        let names: Vec<&str> = SESSION_ENV.iter().map(|(k, _)| *k).collect();
        assert!(names.contains(&"TERM") && names.contains(&"COLORTERM"));
        assert!(names.contains(&"TERM_PROGRAM") && names.contains(&"CERO_TERMINAL"));
        for banned in ["LANG", "LC_ALL", "PATH"] {
            assert!(!names.contains(&banned));
        }
    }
}
