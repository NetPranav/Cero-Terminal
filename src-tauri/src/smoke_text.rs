//! The pure parts of the smoke test (roadmap 2.10): when it was asked for, and how its output is read. Plain `std`.

pub const MARKER: &str = "cero-smoke-ok";

/// Smoke mode needs both the flag and `CERO_SMOKE=1`, so a stray `--smoke-test` never changes how a normal start works.
pub fn requested(args: &[String], smoke_env: Option<&str>) -> bool {
    smoke_env == Some("1") && args.iter().any(|a| a == "--smoke-test")
}

/// Terminal output without escape sequences (colours, cursor moves, window titles).
pub fn strip_ansi(input: &str) -> String {
    let mut out = String::new();
    let mut chars = input.chars();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('[') => {
                for n in chars.by_ref() {
                    if ('@'..='~').contains(&n) {
                        break;
                    }
                }
            }
            Some(']') => {
                while let Some(n) = chars.next() {
                    if n == '\u{7}' {
                        break;
                    }
                    if n == '\u{1b}' {
                        chars.next();
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}

/// True when the marker is printed on a line of its own. The typed command (`PS C:\> echo cero-smoke-ok`) also
/// contains the marker, but never alone on a line, so only the shell's answer counts.
pub fn has_marker_line(output: &str) -> bool {
    strip_ansi(output).replace('\r', "\n").lines().any(|line| line.trim() == MARKER)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn smoke_mode_needs_the_flag_and_the_environment_variable() {
        assert!(requested(&args(&["Cero.exe", "--smoke-test"]), Some("1")));
        assert!(!requested(&args(&["Cero.exe", "--smoke-test"]), None));
        assert!(!requested(&args(&["Cero.exe", "--smoke-test"]), Some("0")));
        assert!(!requested(&args(&["Cero.exe"]), Some("1")));
        assert!(!requested(&args(&["Cero.exe", "--smoke"]), Some("1")));
    }

    #[test]
    fn the_answer_line_counts_and_the_typed_command_does_not() {
        assert!(has_marker_line("PS C:\\Users\\me> echo cero-smoke-ok\r\ncero-smoke-ok\r\nPS C:\\Users\\me> "));
        assert!(has_marker_line("C:\\>echo cero-smoke-ok\r\ncero-smoke-ok\r\n"));
        assert!(!has_marker_line("PS C:\\Users\\me> echo cero-smoke-ok"));
        assert!(!has_marker_line("C:\\>echo cero-smoke-ok\r\n"));
        assert!(!has_marker_line(""));
    }

    #[test]
    fn escape_sequences_around_the_answer_are_ignored() {
        assert!(has_marker_line("\u{1b}[2J\u{1b}[H\u{1b}]0;title\u{7}\u{1b}[32mcero-smoke-ok\u{1b}[0m\r\n"));
        assert!(!has_marker_line("\u{1b}[32mcero-smoke-ok-not\u{1b}[0m\r\n"));
    }

    #[test]
    fn stripping_removes_sequences_and_keeps_text() {
        assert_eq!(strip_ansi("a\u{1b}[31mb\u{1b}[0mc"), "abc");
        assert_eq!(strip_ansi("\u{1b}]0;t\u{1b}\\x"), "x");
        assert_eq!(strip_ansi("plain"), "plain");
    }
}
