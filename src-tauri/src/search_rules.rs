//! The rules of the folder search that need no file system (roadmap 2.9): loose name matching, which folders are noise
//! on Windows, and what the attribute bits of a directory entry mean. Plain `std`.

pub const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
pub const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
pub const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
pub const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

/// Folders no search goes into, whatever the case: build output, caches, per-user application data (which holds
/// `Local\Temp`) and the volume folders Windows keeps at the top of a drive.
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".cache",
    "target",
    "dist",
    "build",
    ".venv",
    "__pycache__",
    "AppData",
    "$Recycle.Bin",
    "System Volume Information",
    "$WinREAgent",
    "Config.Msi",
    "Recovery",
    "PerfLogs",
    "MSOCache",
];

/// Skipped only directly under a drive root (`D:\Windows`); deeper, a project may well have such a folder.
const SKIP_AT_DRIVE_ROOT: &[&str] = &["Windows", "Program Files", "Program Files (x86)", "ProgramData"];

/// A symbolic link, a junction (`Application Data`, `My Documents` are junctions that point back up the tree) or a
/// cloud placeholder. Following a directory like this can loop or leave the tree.
pub fn is_reparse_point(attributes: u32) -> bool {
    attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

/// A directory the search must not list or enter because it is a link.
pub fn is_linked_directory(attributes: u32) -> bool {
    is_reparse_point(attributes) && attributes & FILE_ATTRIBUTE_DIRECTORY != 0
}

/// Hidden by a dot in the name (the convention of developer tools) or by the file system attributes.
pub fn is_hidden(name: &str, attributes: u32) -> bool {
    name.starts_with('.') || attributes & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM) != 0
}

/// Should the search stay out of this folder?
pub fn skip_directory(name: &str, parent_is_drive_root: bool) -> bool {
    let matches = |list: &[&str]| list.iter().any(|skipped| skipped.eq_ignore_ascii_case(name));
    matches(SKIP_DIRS) || (parent_is_drive_root && matches(SKIP_AT_DRIVE_ROOT))
}

pub fn compact(s: &str) -> String {
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

/// Could `name` be what `query` meant? Deliberately loose and case-insensitive: substring of the compact names, or
/// within 3 edits.
pub fn could_match(query: &str, name: &str) -> bool {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loose_matching_accepts_typos_and_any_case_not_nonsense() {
        assert!(could_match("gitbarins", "gitbrains"));
        assert!(could_match("GITBRAINS", "GitBrains"));
        assert!(could_match("my project", "My-Project"));
        assert!(!could_match("zzzzzz", "gitbrains"));
        assert!(could_match("", "anything"));
        assert!(!could_match("!!!", "gitbrains"));
    }

    #[test]
    fn windows_noise_folders_are_skipped_in_any_case() {
        for name in ["node_modules", "NODE_MODULES", "AppData", "appdata", "$Recycle.Bin", "System Volume Information", ".git", "dist"] {
            assert!(skip_directory(name, false), "{name}");
        }
        for name in ["Projects", "source", "repos", "Documents", "OneDrive", "Desktop", "Downloads"] {
            assert!(!skip_directory(name, false), "{name}");
        }
    }

    #[test]
    fn system_folders_are_skipped_only_at_the_top_of_a_drive() {
        for name in ["Windows", "Program Files", "Program Files (x86)", "ProgramData", "windows"] {
            assert!(skip_directory(name, true), "{name} under a drive root");
            assert!(!skip_directory(name, false), "{name} elsewhere is an ordinary folder");
        }
    }

    #[test]
    fn links_are_recognised_from_the_attributes() {
        let junction = FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT;
        assert!(is_linked_directory(junction));
        assert!(!is_linked_directory(FILE_ATTRIBUTE_DIRECTORY));
        // A cloud placeholder file is a reparse point but not a directory: it stays visible
        assert!(is_reparse_point(FILE_ATTRIBUTE_REPARSE_POINT));
        assert!(!is_linked_directory(FILE_ATTRIBUTE_REPARSE_POINT));
        assert!(!is_linked_directory(0));
    }

    #[test]
    fn hidden_means_a_dot_or_a_hidden_or_system_attribute() {
        assert!(is_hidden(".config", 0));
        assert!(is_hidden("NTUSER.DAT", FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM));
        assert!(is_hidden("desktop.ini", FILE_ATTRIBUTE_HIDDEN));
        assert!(!is_hidden("notes.txt", 0));
        assert!(!is_hidden("Projects", FILE_ATTRIBUTE_DIRECTORY));
    }
}
