//! find_paths: look for a folder or file by a rough name under some roots.
//!
//! The walk is breadth first and bounded (entries, time, depth) so a huge home folder never hangs the
//! app. This is only a loose pre-filter; the TypeScript side scores the names with the shared matcher.

use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::path::PathBuf;
use std::time::{Duration, Instant};

use crate::process_cmds::expand_tilde;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct FoundPath {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", ".cache", "target", "dist", "build", ".venv", "__pycache__", "Library", "AppData",
    "proc", "sys", "dev", "snap",
];
/// Folders macOS asks permission for the first time an app looks inside. A search that starts at the home folder
/// does not go into them (searching one directly, or naming it, still does).
const PROTECTED_UNDER_HOME: &[&str] = &["Desktop", "Documents", "Downloads", "Movies", "Music", "Pictures", "Public"];
const MAX_VISITED: usize = 20_000;
const MAX_TIME: Duration = Duration::from_secs(2);

fn compact(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
}

fn edit_distance(a: &[char], b: &[char]) -> usize {
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut cur = vec![i; b.len() + 1];
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
        }
        prev = cur;
    }
    prev[b.len()]
}

/// Could `name` be what `query` meant? Deliberately loose: substring of the compact names, or within 3 edits.
fn could_match(query: &str, name: &str) -> bool {
    if query.is_empty() {
        return true;
    }
    let q = compact(query);
    let n = compact(name);
    if q.is_empty() || n.is_empty() {
        return false;
    }
    if n.contains(&q) || q.contains(&n) && n.len() >= 3 {
        return true;
    }
    let (qc, nc): (Vec<char>, Vec<char>) = (q.chars().collect(), n.chars().collect());
    if (qc.len() as isize - nc.len() as isize).abs() > 3 {
        return false;
    }
    edit_distance(&qc, &nc) <= 3
}

/// kind: "dir", "file" or "any". Returns at most `limit * 10` loose candidates.
pub fn search(query: &str, roots: &[String], kind: &str, max_depth: u32, limit: u32) -> Vec<FoundPath> {
    let started = Instant::now();
    let cap = (limit.max(1) as usize) * 10;
    let want_hidden = query.starts_with('.');
    let mut out: Vec<FoundPath> = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut visited = 0usize;

    let home: Option<PathBuf> = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).ok().map(PathBuf::from);
    let mut queue: VecDeque<(PathBuf, u32)> = VecDeque::new();
    for root in roots {
        let p = expand_tilde(root);
        if p.is_dir() {
            queue.push_back((p, 0));
        }
    }

    while let Some((dir, depth)) = queue.pop_front() {
        if depth >= max_depth || out.len() >= cap || visited >= MAX_VISITED || started.elapsed() > MAX_TIME {
            break;
        }
        let canonical = std::fs::canonicalize(&dir).unwrap_or_else(|_| dir.clone());
        if !seen.insert(canonical) {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        let mut children: Vec<_> = entries.flatten().collect();
        children.sort_by_key(|e| e.file_name());
        for entry in children {
            visited += 1;
            if visited >= MAX_VISITED || started.elapsed() > MAX_TIME {
                break;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(file_type) = entry.file_type() else { continue };
            // never follow a symlink into a folder: it may loop or leave the tree
            let is_dir = file_type.is_dir();
            if file_type.is_symlink() && !entry.path().is_file() && !entry.path().is_dir() {
                continue;
            }
            let hidden = name.starts_with('.');
            if is_dir {
                if SKIP_DIRS.contains(&name.as_str()) || (hidden && !want_hidden) {
                    continue;
                }
                if depth == 0 && home.as_ref().map_or(false, |h| *h == dir) && PROTECTED_UNDER_HOME.contains(&name.as_str()) {
                    continue;
                }
                queue.push_back((entry.path(), depth + 1));
            } else if hidden && !want_hidden {
                continue;
            }
            let kind_ok = match kind {
                "dir" => is_dir,
                "file" => !is_dir && !file_type.is_dir(),
                _ => true,
            };
            if kind_ok && could_match(query, &name) {
                out.push(FoundPath { path: entry.path().to_string_lossy().to_string(), name, is_dir });
                if out.len() >= cap {
                    break;
                }
            }
        }
    }
    out
}

#[tauri::command]
pub async fn find_paths(query: String, roots: Vec<String>, kind: String, max_depth: u32, limit: u32) -> Result<Vec<FoundPath>, String> {
    tauri::async_runtime::spawn_blocking(move || search(&query, &roots, &kind, max_depth.clamp(1, 8), limit.clamp(1, 200)))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tree() -> PathBuf {
        // each test gets its own folder: tests run in parallel and one must not delete another's tree
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let root = std::env::temp_dir().join(format!("cero-find-{}-{}", std::process::id(), n));
        let _ = fs::remove_dir_all(&root);
        for d in ["Projects/gitbrains", "Projects/other", "Projects/node_modules/gitbrains", ".hidden/gitbrains", "deep/a/b/c/gitbrains"] {
            fs::create_dir_all(root.join(d)).unwrap();
        }
        fs::write(root.join("Projects/notes.txt"), "x").unwrap();
        root
    }

    #[test]
    fn finds_loosely_named_folders_and_skips_noise() {
        let root = tree();
        let found = search("gitBrains", &[root.to_string_lossy().to_string()], "dir", 6, 20);
        let paths: Vec<String> = found.iter().map(|f| f.path.replace(&root.to_string_lossy().to_string(), "").replace('\\', "/")).collect();
        assert!(paths.iter().any(|p| p.ends_with("Projects/gitbrains")), "{paths:?}");
        assert!(!paths.iter().any(|p| p.contains("node_modules")), "{paths:?}");
        assert!(!paths.iter().any(|p| p.contains(".hidden")), "{paths:?}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn honours_depth_and_kind() {
        let root = tree();
        let shallow = search("gitbrains", &[root.to_string_lossy().to_string()], "dir", 2, 20);
        assert!(!shallow.iter().any(|f| f.path.contains("deep")));
        let files = search("notes", &[root.to_string_lossy().to_string()], "file", 4, 20);
        assert_eq!(files.len(), 1);
        assert!(!files[0].is_dir);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn honours_the_limit() {
        let root = std::env::temp_dir().join(format!("cero-find-limit-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for i in 0..40 {
            fs::create_dir_all(root.join(format!("proj{i}"))).unwrap();
        }
        let found = search("proj", &[root.to_string_lossy().to_string()], "dir", 2, 2);
        assert_eq!(found.len(), 20);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn loose_matching_accepts_typos_not_nonsense() {
        assert!(could_match("gitbarins", "gitbrains"));
        assert!(!could_match("zzzzzz", "gitbrains"));
    }
}
