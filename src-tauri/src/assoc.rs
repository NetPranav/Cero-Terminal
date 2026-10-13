//! Decisions about the `.flow` file association that need no registry access (roadmap 2.6).

/// The program in a shell `open\command` value: `"C:\Program Files\Cero\Cero.exe" "%1"` gives
/// `C:\Program Files\Cero\Cero.exe`. An unquoted command ends at the first space after `.exe`.
pub fn exe_of_command(command: &str) -> Option<String> {
    let command = command.trim();
    if let Some(rest) = command.strip_prefix('"') {
        let end = rest.find('"')?;
        let exe = &rest[..end];
        return (!exe.is_empty()).then(|| exe.to_string());
    }
    let lower = command.to_ascii_lowercase();
    let end = lower.find(".exe").map(|i| i + 4).unwrap_or(command.len());
    let exe = command[..end].trim();
    (!exe.is_empty()).then(|| exe.to_string())
}

fn same_file(a: &str, b: &str) -> bool {
    let normalize = |p: &str| p.replace('/', "\\").trim().to_ascii_lowercase();
    normalize(a) == normalize(b)
}

/// `registered` when the handler is this program, `registered-elsewhere` when it is another path (an older install,
/// a portable copy, another program), `missing` when no handler is set.
pub fn classify(open_command: Option<&str>, current_exe: &str) -> &'static str {
    match open_command.and_then(exe_of_command) {
        Some(exe) if same_file(&exe, current_exe) => "registered",
        Some(_) => "registered-elsewhere",
        None => "missing",
    }
}

/// The value written to `shell\open\command`.
pub fn open_command_for(exe: &str) -> String {
    format!("\"{exe}\" \"%1\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXE: &str = r"C:\Program Files\Cero\Cero.exe";

    #[test]
    fn the_program_is_taken_from_quoted_and_unquoted_commands() {
        assert_eq!(exe_of_command(r#""C:\Program Files\Cero\Cero.exe" "%1""#).as_deref(), Some(EXE));
        assert_eq!(exe_of_command(r#"  "C:\Cero\cero-terminal.exe"  "%1" "#).as_deref(), Some(r"C:\Cero\cero-terminal.exe"));
        assert_eq!(exe_of_command(r"C:\Cero\Cero.exe %1").as_deref(), Some(r"C:\Cero\Cero.exe"));
        assert_eq!(exe_of_command(r"notepad %1").as_deref(), Some("notepad %1"));
        assert_eq!(exe_of_command(""), None);
        assert_eq!(exe_of_command(r#""""#), None);
        assert_eq!(exe_of_command(r#""unterminated"#), None);
    }

    #[test]
    fn this_program_is_registered_whatever_the_case_or_slashes() {
        assert_eq!(classify(Some(&open_command_for(EXE)), EXE), "registered");
        assert_eq!(classify(Some(&open_command_for(&EXE.to_ascii_uppercase())), EXE), "registered");
        assert_eq!(classify(Some(&open_command_for("C:/Program Files/Cero/Cero.exe")), EXE), "registered");
    }

    #[test]
    fn another_path_is_registered_elsewhere() {
        assert_eq!(classify(Some(&open_command_for(r"D:\old\Cero.exe")), EXE), "registered-elsewhere");
        assert_eq!(classify(Some(r"notepad.exe %1"), EXE), "registered-elsewhere");
    }

    #[test]
    fn no_handler_is_missing() {
        assert_eq!(classify(None, EXE), "missing");
        assert_eq!(classify(Some("  "), EXE), "missing");
    }

    #[test]
    fn the_written_command_quotes_both_the_program_and_the_file() {
        assert_eq!(open_command_for(EXE), r#""C:\Program Files\Cero\Cero.exe" "%1""#);
    }
}
