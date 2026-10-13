//! Decisions about the llama.cpp engine that need no Windows API (roadmap 2.5), kept in plain `std` so they are
//! tested on any machine: which paths a zip may write to, which process counts as Cero's own server, and what to tell
//! the user when antivirus removed the engine.

/// The parts of a path inside a zip, or `None` when the entry must not be extracted.
///
/// Zips made on Windows can use `\` as the separator. Absolute paths, `..`, drive letters and alternate data streams
/// (`name:stream`) would write outside the target folder, so they are refused.
pub fn safe_zip_entry_path(name: &str) -> Option<Vec<String>> {
    let normalized = name.replace('\\', "/");
    if normalized.starts_with('/') {
        return None;
    }
    let mut parts = Vec::new();
    for part in normalized.split('/') {
        match part {
            "" | "." => continue,
            ".." => return None,
            p if p.contains(':') => return None,
            p => parts.push(p.to_string()),
        }
    }
    (!parts.is_empty()).then_some(parts)
}

fn normalize(path: &str) -> String {
    path.replace('/', "\\").trim_end_matches('\\').to_ascii_lowercase()
}

/// True when `exe` is a `llama-server.exe` inside `cero_dir` (normally `%USERPROFILE%\.cero`). Only such a process may
/// be ended as an orphan: another program that happens to listen on the port is left alone.
pub fn is_cero_engine_image(exe: &str, cero_dir: &str) -> bool {
    let exe = normalize(exe);
    let root = normalize(cero_dir);
    !root.is_empty() && exe.starts_with(&format!("{root}\\")) && exe.ends_with("\\llama-server.exe")
}

/// Shown when the engine files are gone right after they were extracted, or cannot be started.
pub fn antivirus_message(engine_dir: &str) -> String {
    format!(
        "Windows Security (or another antivirus program) removed or blocked llama-server.exe in {engine_dir}. \
         Open Windows Security, Virus & threat protection, Manage settings, Exclusions, add the folder {engine_dir}, \
         then install the engine again."
    )
}

/// Windows error codes `CreateProcess` returns for a file an antivirus program blocked
/// (225 = ERROR_VIRUS_INFECTED, 226 = ERROR_VIRUS_DELETED).
pub fn is_antivirus_error(code: Option<i32>) -> bool {
    matches!(code, Some(225) | Some(226))
}

/// Message for a failed `llama-server` start.
pub fn spawn_failure_message(path: &str, engine_dir: &str, os_error: Option<i32>, text: &str) -> String {
    if is_antivirus_error(os_error) {
        antivirus_message(engine_dir)
    } else {
        format!("Failed to spawn llama-server at {path}: {text}")
    }
}

/// Message when no engine binary exists anywhere.
pub fn engine_missing_message(engine_dir: &str) -> String {
    format!(
        "llama-server.exe not found in {engine_dir}, next to Cero, or on PATH. Install the engine from Settings. If \
         Cero installed it before, Windows Security may have quarantined it: check Protection history and add \
         {engine_dir} to the exclusions."
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parts(name: &str) -> Option<Vec<String>> {
        safe_zip_entry_path(name)
    }

    #[test]
    fn normal_entries_are_split_on_either_separator() {
        assert_eq!(parts("llama-b1/llama-server.exe"), Some(vec!["llama-b1".into(), "llama-server.exe".into()]));
        assert_eq!(parts("llama-b1\\ggml.dll"), Some(vec!["llama-b1".into(), "ggml.dll".into()]));
        assert_eq!(parts("./a//b/./c.txt"), Some(vec!["a".into(), "b".into(), "c.txt".into()]));
        assert_eq!(parts("single.dll"), Some(vec!["single.dll".into()]));
    }

    #[test]
    fn entries_that_escape_the_folder_are_refused() {
        for bad in [
            "../evil.dll",
            "a/../../evil.dll",
            "a\\..\\..\\evil.dll",
            "/etc/passwd",
            "\\Windows\\System32\\x.dll",
            "C:\\Windows\\x.dll",
            "C:/x.dll",
            "file.txt:stream",
            "..",
        ] {
            assert_eq!(parts(bad), None, "{bad}");
        }
    }

    #[test]
    fn directory_entries_and_empty_names_have_no_file_path() {
        assert_eq!(parts(""), None);
        assert_eq!(parts("/"), None);
        assert_eq!(parts("./"), None);
        // A directory entry ends with a separator but still names a path to create
        assert_eq!(parts("llama-b1/"), Some(vec!["llama-b1".into()]));
    }

    #[test]
    fn only_llama_server_inside_the_cero_folder_counts_as_cero_s() {
        let cero = r"C:\Users\me\.cero";
        assert!(is_cero_engine_image(r"C:\Users\me\.cero\engine\current\llama-server.exe", cero));
        assert!(is_cero_engine_image(r"c:\users\ME\.CERO\bin\LLAMA-SERVER.EXE", cero));
        assert!(is_cero_engine_image("C:/Users/me/.cero/engine/current/llama-server.exe", cero));
        assert!(is_cero_engine_image(r"C:\Users\me\.cero\engine\current\llama-server.exe", r"C:\Users\me\.cero\"));
        assert!(!is_cero_engine_image(r"C:\Program Files\llama.cpp\llama-server.exe", cero));
        assert!(!is_cero_engine_image(r"C:\Users\me\.cero-other\engine\llama-server.exe", cero));
        assert!(!is_cero_engine_image(r"C:\Users\me\.cero\engine\current\other.exe", cero));
        assert!(!is_cero_engine_image(r"C:\Users\me\.cero\llama-server.exe.bak", cero));
        assert!(!is_cero_engine_image(r"C:\Users\me\.cero\engine\llama-server.exe", ""));
    }

    #[test]
    fn antivirus_errors_are_recognised_and_explained() {
        assert!(is_antivirus_error(Some(225)) && is_antivirus_error(Some(226)));
        assert!(!is_antivirus_error(Some(2)) && !is_antivirus_error(None));
        let dir = r"C:\Users\me\.cero\engine";
        let message = spawn_failure_message(r"C:\x\llama-server.exe", dir, Some(225), "virus");
        assert!(message.contains(dir) && message.contains("Exclusions"));
        let other = spawn_failure_message(r"C:\x\llama-server.exe", dir, Some(2), "not found");
        assert!(other.contains("Failed to spawn") && !other.contains("Exclusions"));
    }

    #[test]
    fn the_missing_engine_message_names_the_folder_and_defender() {
        let message = engine_missing_message(r"C:\Users\me\.cero\engine");
        assert!(message.contains(r"C:\Users\me\.cero\engine") && message.contains("Windows Security"));
    }
}
