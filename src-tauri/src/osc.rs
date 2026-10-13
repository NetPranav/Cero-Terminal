//! Working directory of a shell, read from its output (roadmap 2.2).
//!
//! Windows has no `/proc/<pid>/cwd`, and reading another process's environment block is fragile. Instead the shell
//! reports its folder after every prompt, and this scanner picks the report out of the byte stream:
//!
//! - `ESC ] 9 ; 9 ; "<path>" ST`     the Windows Terminal convention (PowerShell, cmd through `PROMPT`)
//! - `ESC ] 7 ; file://<host>/<path> ST`  the convention of most other terminals (Git Bash, WSL)
//!
//! `ST` is `BEL` or `ESC \`. A report can be split across two reads, so the scanner keeps the unfinished tail.

/// A report longer than this is not a path; the scanner drops it instead of buffering without limit.
const MAX_OSC_LEN: usize = 8192;

#[derive(Default)]
pub struct CwdScanner {
    /// Bytes of an OSC sequence that has started and not ended yet (without the leading ESC ])
    pending: Option<Vec<u8>>,
    /// The previous byte was an ESC inside a sequence (the start of `ESC \`)
    escape: bool,
    /// The previous byte, outside a sequence, was an ESC
    lead_escape: bool,
}

impl CwdScanner {
    /// Feed the next chunk of output. Returns the last working directory reported in it.
    pub fn feed(&mut self, data: &[u8]) -> Option<String> {
        let mut found = None;
        for &byte in data {
            match self.pending.as_mut() {
                None => {
                    if self.lead_escape && byte == b']' {
                        self.pending = Some(Vec::new());
                        self.escape = false;
                    }
                    self.lead_escape = byte == 0x1b;
                }
                Some(buf) => {
                    let ended = if self.escape {
                        // ESC \ ends the sequence; an ESC followed by anything else cancels it
                        self.escape = false;
                        if byte == b'\\' {
                            true
                        } else {
                            // cancelled; but ESC ] is also the start of the next sequence
                            self.pending = (byte == b']').then(Vec::new);
                            self.lead_escape = byte == 0x1b;
                            continue;
                        }
                    } else if byte == 0x07 {
                        true
                    } else if byte == 0x1b {
                        self.escape = true;
                        continue;
                    } else {
                        buf.push(byte);
                        if buf.len() > MAX_OSC_LEN {
                            self.pending = None;
                        }
                        continue;
                    };
                    if ended {
                        let payload = self.pending.take().unwrap_or_default();
                        if let Some(path) = parse_report(&payload) {
                            found = Some(path);
                        }
                    }
                }
            }
        }
        found
    }
}

/// The path in one OSC payload (the text between `ESC ]` and the terminator), when it is a working-directory report.
pub fn parse_report(payload: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(payload);
    if let Some(rest) = text.strip_prefix("9;9;") {
        let path = rest.trim().trim_matches('"').trim();
        return (!path.is_empty()).then(|| path.to_string());
    }
    if let Some(uri) = text.strip_prefix("7;") {
        return crate::file_uri::file_uri_to_path(uri.trim());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scan(chunks: &[&[u8]]) -> Option<String> {
        let mut scanner = CwdScanner::default();
        let mut last = None;
        for chunk in chunks {
            if let Some(found) = scanner.feed(chunk) {
                last = Some(found);
            }
        }
        last
    }

    #[test]
    fn reads_the_windows_terminal_report_with_bel() {
        assert_eq!(scan(&[b"\x1b]9;9;\"C:\\Temp\"\x07"]), Some("C:\\Temp".to_string()));
    }

    #[test]
    fn reads_the_report_ended_by_string_terminator() {
        assert_eq!(scan(&[b"\x1b]9;9;\"C:\\Users\\me\"\x1b\\"]), Some("C:\\Users\\me".to_string()));
    }

    #[test]
    fn reads_an_unquoted_path_and_keeps_spaces() {
        assert_eq!(
            scan(&[b"\x1b]9;9;C:\\Program Files\\Git\x07"]),
            Some("C:\\Program Files\\Git".to_string())
        );
    }

    #[test]
    fn reads_osc7_file_uri_for_a_drive() {
        assert_eq!(
            scan(&[b"\x1b]7;file://MYPC/C:/Users/me/My%20Docs\x07"]),
            Some("C:\\Users\\me\\My Docs".to_string())
        );
        assert_eq!(scan(&[b"\x1b]7;file:///d:/work\x07"]), Some("d:\\work".to_string()));
    }

    #[test]
    fn osc7_with_a_server_and_no_drive_is_a_unc_path() {
        assert_eq!(scan(&[b"\x1b]7;file://fileserver/share/dir\x07"]), Some("\\\\fileserver\\share\\dir".to_string()));
    }

    #[test]
    fn osc7_posix_path_is_kept() {
        assert_eq!(scan(&[b"\x1b]7;file://localhost/home/me\x07"]), Some("/home/me".to_string()));
    }

    #[test]
    fn a_report_split_across_reads_is_found() {
        assert_eq!(
            scan(&[b"prompt\x1b]9;9;\"C:\\Te", b"mp\"", b"\x07more"]),
            Some("C:\\Temp".to_string())
        );
        // the ESC ] pair itself split, and the string terminator split
        assert_eq!(scan(&[b"x\x1b", b"]9;9;C:\\a\x1b", b"\\"]), Some("C:\\a".to_string()));
    }

    #[test]
    fn the_last_report_in_a_chunk_wins() {
        assert_eq!(
            scan(&[b"\x1b]9;9;C:\\one\x07text\x1b]9;9;C:\\two\x07"]),
            Some("C:\\two".to_string())
        );
    }

    #[test]
    fn other_sequences_and_plain_text_are_ignored() {
        assert_eq!(scan(&[b"\x1b]0;window title\x07\x1b]133;A\x07\x1b[31mred\x1b[0m plain"]), None);
        assert_eq!(scan(&[b"\x1b]9;4;3;50\x07"]), None, "OSC 9;4 is a progress report, not a folder");
        assert_eq!(scan(&[b"\x1b]9;9;\"\"\x07"]), None, "an empty path is nothing");
    }

    #[test]
    fn a_cancelled_sequence_does_not_swallow_later_text() {
        // ESC ] starts a sequence, a stray ES[ cancels it; the next real report must still be read
        assert_eq!(
            scan(&[b"\x1b]9;9;C:\\bad\x1b[31m", b"\x1b]9;9;C:\\good\x07"]),
            Some("C:\\good".to_string())
        );
    }

    #[test]
    fn a_new_sequence_starting_inside_an_unfinished_one_is_read() {
        assert_eq!(scan(&[b"\x1b]9;9;C:\\bad\x1b]9;9;C:\\good\x07"]), Some("C:\\good".to_string()));
    }

    #[test]
    fn an_endless_sequence_is_dropped_and_scanning_recovers() {
        let mut long = b"\x1b]9;9;".to_vec();
        long.extend(std::iter::repeat(b'a').take(MAX_OSC_LEN + 50));
        let mut scanner = CwdScanner::default();
        assert_eq!(scanner.feed(&long), None);
        assert_eq!(scanner.feed(b"\x1b]9;9;C:\\ok\x07"), Some("C:\\ok".to_string()));
    }

}
