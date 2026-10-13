//! The user's home directory on Windows.
//!
//! `USERPROFILE` is the real profile folder. `HOME` is set by Git Bash, MSYS and some Node tools to other places
//! (for example `C:\Users\me\AppData\Roaming` or a POSIX path like `/c/Users/me`), so it is only a fallback.

use std::path::{Path, PathBuf};

/// `USERPROFILE` when it is set and not empty, otherwise `HOME`.
fn pick_home(userprofile: Option<String>, home: Option<String>) -> Option<String> {
    userprofile
        .filter(|v| !v.trim().is_empty())
        .or_else(|| home.filter(|v| !v.trim().is_empty()))
}

pub fn home_dir_string() -> Option<String> {
    pick_home(std::env::var("USERPROFILE").ok(), std::env::var("HOME").ok())
}

pub fn home_dir() -> Option<PathBuf> {
    home_dir_string().map(PathBuf::from)
}

pub fn expand_home_forms(path: &str, home: &Path) -> PathBuf {
    const PREFIXES: [&str; 3] = ["~", "%userprofile%", "$env:userprofile"];
    for prefix in PREFIXES {
        // Prefixes are ASCII, so the length is also the byte length in the original text
        let Some(head) = path.get(..prefix.len()) else { continue };
        if !head.eq_ignore_ascii_case(prefix) {
            continue;
        }
        let rest = &path[prefix.len()..];
        if rest.is_empty() {
            return home.to_path_buf();
        }
        if let Some(sub) = rest.strip_prefix('/').or_else(|| rest.strip_prefix('\\')) {
            return if sub.is_empty() { home.to_path_buf() } else { home.join(sub) };
        }
    }
    PathBuf::from(path)
}

#[cfg(test)]
mod tests {
    use super::{expand_home_forms, pick_home};
    use std::path::{Path, PathBuf};

    fn s(v: &str) -> Option<String> {
        Some(v.to_string())
    }

    #[test]
    fn userprofile_wins_over_home() {
        assert_eq!(pick_home(s(r"C:\Users\me"), s("/c/Users/me")), s(r"C:\Users\me"));
    }

    #[test]
    fn home_is_the_fallback() {
        assert_eq!(pick_home(None, s(r"C:\Users\me")), s(r"C:\Users\me"));
    }

    #[test]
    fn empty_values_are_ignored() {
        assert_eq!(pick_home(s(""), s(r"C:\Users\me")), s(r"C:\Users\me"));
        assert_eq!(pick_home(s("  "), None), None);
    }

    #[test]
    fn nothing_set_gives_none() {
        assert_eq!(pick_home(None, None), None);
    }

    #[test]
    fn home_forms_expand_in_any_case_and_with_either_separator() {
        let home = Path::new("HOME");
        for form in [
            "~", "~/docs", "~\\docs", "%USERPROFILE%\\docs", "%userprofile%/docs", "$env:USERPROFILE\\docs", "$ENV:UserProfile/docs",
        ] {
            let got = expand_home_forms(form, home);
            let expected = if form.ends_with("docs") { home.join("docs") } else { home.to_path_buf() };
            assert_eq!(got, expected, "{form}");
        }
        assert_eq!(expand_home_forms("%USERPROFILE%", home), home.to_path_buf());
        assert_eq!(expand_home_forms("$env:USERPROFILE", home), home.to_path_buf());
        assert_eq!(expand_home_forms("~/", home), home.to_path_buf());
    }

    #[test]
    fn other_paths_are_left_alone() {
        let home = Path::new("HOME");
        for path in ["C:\\Temp", "~user\\x", "~x", "%USERPROFILEX%\\a", "$env:USERPROFILES", "relative\\dir", "", "\u{e9}"] {
            assert_eq!(expand_home_forms(path, home), PathBuf::from(path), "{path}");
        }
    }
}
