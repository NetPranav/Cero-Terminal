//! The user's home directory on Windows.
//!
//! `USERPROFILE` is the real profile folder. `HOME` is set by Git Bash, MSYS and some Node tools to other places
//! (for example `C:\Users\me\AppData\Roaming` or a POSIX path like `/c/Users/me`), so it is only a fallback.

use std::path::PathBuf;

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

#[cfg(test)]
mod tests {
    use super::pick_home;

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
}
