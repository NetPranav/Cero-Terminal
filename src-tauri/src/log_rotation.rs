//! A log file that rotates by size (roadmap 2.9): `cero.log`, then `cero.log.1`, `cero.log.2` ... up to `keep` old files.
//! Plain `std`; paths are handled as `OsString`, so a user name with non-ASCII characters works.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub struct RotatingLog {
    dir: PathBuf,
    name: String,
    max_bytes: u64,
    keep: usize,
    file: Option<File>,
    size: u64,
}

impl RotatingLog {
    pub fn new(dir: &Path, name: &str, max_bytes: u64, keep: usize) -> Self {
        Self { dir: dir.to_path_buf(), name: name.to_string(), max_bytes, keep, file: None, size: 0 }
    }

    fn path(&self) -> PathBuf {
        self.dir.join(&self.name)
    }

    fn numbered(&self, index: usize) -> PathBuf {
        self.dir.join(format!("{}.{}", self.name, index))
    }

    fn open(&mut self) -> io::Result<()> {
        fs::create_dir_all(&self.dir)?;
        let file = OpenOptions::new().create(true).append(true).open(self.path())?;
        self.size = file.metadata().map(|m| m.len()).unwrap_or(0);
        self.file = Some(file);
        Ok(())
    }

    /// `cero.log` becomes `cero.log.1`, `.1` becomes `.2` ... and the oldest is deleted.
    fn rotate(&mut self) -> io::Result<()> {
        self.file = None; // close before renaming: Windows will not rename an open file we hold
        if self.keep == 0 {
            let _ = fs::remove_file(self.path());
            return Ok(());
        }
        let _ = fs::remove_file(self.numbered(self.keep));
        for index in (1..self.keep).rev() {
            let from = self.numbered(index);
            if from.exists() {
                fs::rename(&from, self.numbered(index + 1))?;
            }
        }
        if self.path().exists() {
            fs::rename(self.path(), self.numbered(1))?;
        }
        Ok(())
    }

    /// Append a line (a newline is added), rotating first when the file would grow past the limit.
    pub fn write_line(&mut self, line: &str) -> io::Result<()> {
        if self.file.is_none() {
            self.open()?;
        }
        let needed = line.len() as u64 + 1;
        if self.size > 0 && self.size + needed > self.max_bytes {
            self.rotate()?;
            self.open()?;
        }
        let file = self.file.as_mut().expect("opened above");
        file.write_all(line.as_bytes())?;
        file.write_all(b"\n")?;
        self.size += needed;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cero-log-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn lines_are_appended_and_the_folder_is_created() {
        let dir = temp("append").join("nested").join("logs");
        let mut log = RotatingLog::new(&dir, "cero.log", 1000, 2);
        log.write_line("one").unwrap();
        log.write_line("two").unwrap();
        assert_eq!(fs::read_to_string(dir.join("cero.log")).unwrap(), "one\ntwo\n");
        let _ = fs::remove_dir_all(dir.parent().unwrap().parent().unwrap());
    }

    #[test]
    fn a_new_run_continues_the_existing_file() {
        let dir = temp("continue");
        RotatingLog::new(&dir, "cero.log", 1000, 2).write_line("first run").unwrap();
        RotatingLog::new(&dir, "cero.log", 1000, 2).write_line("second run").unwrap();
        assert_eq!(fs::read_to_string(dir.join("cero.log")).unwrap(), "first run\nsecond run\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_file_rotates_when_it_would_pass_the_limit_and_old_files_are_numbered() {
        let dir = temp("rotate");
        let mut log = RotatingLog::new(&dir, "cero.log", 20, 2);
        for line in ["aaaaaaaaa", "bbbbbbbbb", "ccccccccc", "ddddddddd", "eeeeeeeee"] {
            log.write_line(line).unwrap();
        }
        // 10 bytes per line, 20 per file: two lines each
        assert_eq!(fs::read_to_string(dir.join("cero.log")).unwrap(), "eeeeeeeee\n");
        assert_eq!(fs::read_to_string(dir.join("cero.log.1")).unwrap(), "ccccccccc\nddddddddd\n");
        assert_eq!(fs::read_to_string(dir.join("cero.log.2")).unwrap(), "aaaaaaaaa\nbbbbbbbbb\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_keep_old_files_are_kept() {
        let dir = temp("keep");
        let mut log = RotatingLog::new(&dir, "cero.log", 10, 2);
        for i in 0..8 {
            log.write_line(&format!("line{i}")).unwrap();
        }
        assert!(dir.join("cero.log").exists() && dir.join("cero.log.1").exists() && dir.join("cero.log.2").exists());
        assert!(!dir.join("cero.log.3").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_line_longer_than_the_limit_is_still_written() {
        let dir = temp("long");
        let mut log = RotatingLog::new(&dir, "cero.log", 5, 1);
        log.write_line("a line much longer than the limit").unwrap();
        log.write_line("next").unwrap();
        assert_eq!(fs::read_to_string(dir.join("cero.log")).unwrap(), "next\n");
        assert!(fs::read_to_string(dir.join("cero.log.1")).unwrap().contains("much longer"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn keeping_no_old_files_just_starts_over() {
        let dir = temp("nokeep");
        let mut log = RotatingLog::new(&dir, "cero.log", 10, 0);
        for i in 0..4 {
            log.write_line(&format!("line{i}")).unwrap();
        }
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_folder_with_non_ascii_characters_works() {
        let dir = temp("unicode").join("Üser ñame 用户").join(".cero").join("logs");
        let mut log = RotatingLog::new(&dir, "cero.log", 100, 1);
        log.write_line("h\u{e9}llo \u{2713}").unwrap();
        assert_eq!(fs::read_to_string(dir.join("cero.log")).unwrap(), "h\u{e9}llo \u{2713}\n");
        let _ = fs::remove_dir_all(dir.parent().unwrap().parent().unwrap().parent().unwrap());
    }
}
