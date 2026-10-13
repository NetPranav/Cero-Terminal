//! find_paths: look for a folder or file by a rough name under some roots.
//!
//! The walk is breadth first and bounded (entries, time, depth) so a huge home folder never hangs the
//! app. This is only a loose pre-filter; the TypeScript side scores the names with the shared matcher.

use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::path::PathBuf;
use std::time::{Duration, Instant};

use crate::process_cmds::expand_tilde;
use crate::search_rules as rules;
use std::os::windows::fs::MetadataExt;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct FoundPath {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

const MAX_VISITED: usize = 20_000;
const MAX_TIME: Duration = Duration::from_secs(2);

/// kind: "dir", "file" or "any". Returns at most `limit * 10` loose candidates.
pub fn search(query: &str, roots: &[String], kind: &str, max_depth: u32, limit: u32) -> Vec<FoundPath> {
    let started = Instant::now();
    let cap = (limit.max(1) as usize) * 10;
    let want_hidden = query.starts_with('.');
    let mut out: Vec<FoundPath> = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut visited = 0usize;

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
            // DirEntry::metadata does not follow links, so these are the attributes of the entry itself
            let attributes = entry.metadata().map(|m| m.file_attributes()).unwrap_or(0);
            // a junction or symbolic link to a folder (`Application Data`, `My Documents`) may loop or leave the
            // tree: it is neither listed nor entered
            if rules::is_linked_directory(attributes) {
                continue;
            }
            let is_dir = file_type.is_dir();
            // a link to a file that no longer exists
            if file_type.is_symlink() && !entry.path().is_file() {
                continue;
            }
            let hidden = rules::is_hidden(&name, attributes);
            if is_dir {
                if rules::skip_directory(&name, dir.parent().is_none()) || (hidden && !want_hidden) {
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
            if kind_ok && rules::could_match(query, &name) {
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

    /// `mklink /J` makes a junction without administrator rights
    fn junction(link: &std::path::Path, target: &std::path::Path) {
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .stdout(std::process::Stdio::null())
            .status()
            .unwrap();
        assert!(status.success(), "mklink /J failed");
    }

    #[test]
    fn a_junction_that_points_back_up_the_tree_is_neither_followed_nor_listed() {
        let root = tree();
        // like `Application Data` -> its own parent: following it would repeat the whole tree forever
        junction(&root.join("Projects").join("gitbrains-loop"), &root);
        let started = Instant::now();
        let found = search("gitbrains", &[root.to_string_lossy().to_string()], "dir", 8, 50);
        assert!(started.elapsed() < Duration::from_secs(3), "the search did not stop: {:?}", started.elapsed());
        assert!(!found.iter().any(|f| f.path.contains("gitbrains-loop")), "{found:?}");
        // each real folder is found once
        let real = found.iter().filter(|f| f.path.ends_with("Projects\\gitbrains")).count();
        assert_eq!(real, 1, "{found:?}");
        let _ = std::process::Command::new("cmd").args(["/C", "rmdir"]).arg(root.join("Projects").join("gitbrains-loop")).status();
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn matching_ignores_case_and_windows_system_folders_are_left_out() {
        let root = std::env::temp_dir().join(format!("cero-find-sys-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for d in ["Work/MyProject", "$Recycle.Bin/myproject", "AppData/Local/Temp/myproject"] {
            fs::create_dir_all(root.join(d)).unwrap();
        }
        let found = search("MYPROJECT", &[root.to_string_lossy().to_string()], "dir", 6, 20);
        assert_eq!(found.len(), 1, "{found:?}");
        assert!(found[0].path.ends_with("Work\\MyProject"));
        let _ = fs::remove_dir_all(&root);
    }
}
