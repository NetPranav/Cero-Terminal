//! What `watch_service_start` runs (roadmap 2.8): a PowerShell loop that prints new Event Log entries about a service.
//! Plain `std`, so the name rules and the script text are tested on any machine.
//!
//! The service name never becomes part of the script: it travels in the `CERO_SERVICE` environment variable, so no
//! name can inject a command. The rules below still refuse names Windows cannot have and characters that would break
//! the XPath filter the script builds from the name.

/// Environment variable that carries the service name to the script.
pub const SERVICE_ENV: &str = "CERO_SERVICE";

/// Windows service names have no `/` or `\`, and are at most 256 characters. Quotes and control characters are refused
/// as well: the name is used inside an XPath string.
pub fn validate_service_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Give the name of a Windows service, for example Spooler.".to_string());
    }
    if trimmed.chars().count() > 256 {
        return Err("A Windows service name has at most 256 characters.".to_string());
    }
    if let Some(bad) = trimmed.chars().find(|c| matches!(c, '/' | '\\' | '\'' | '"' | '<' | '>' | '&' | '`') || c.is_control()) {
        let shown = if bad.is_control() { "a control character".to_string() } else { format!("'{bad}'") };
        return Err(format!("{shown} cannot be part of a Windows service name."));
    }
    Ok(())
}

/// The script: resolves the service, remembers the newest entry of the System and Application logs, then every 2 s
/// prints entries that arrived since, when they come from the service itself or are Service Control Manager entries that
/// name it (its display name or its short name).
///
/// No double quotes inside, so it passes through `-Command` unchanged.
pub const WATCH_SCRIPT: &str = r"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$name = $env:CERO_SERVICE
$svc = Get-Service -Name $name
if (-not $svc) { Write-Output ('[cero] service not found: ' + $name); exit 2 }
$display = $svc.DisplayName
$logs = 'System', 'Application'
$last = @{}
foreach ($log in $logs) {
  $newest = Get-WinEvent -LogName $log -MaxEvents 1
  $last[$log] = if ($newest) { [long]$newest.RecordId } else { 0 }
}
while ($true) {
  foreach ($log in $logs) {
    $xpath = '*[System[(Provider[@Name=''' + $name + ''' or @Name=''Service Control Manager'']) and EventRecordID > ' + $last[$log] + ']]'
    $events = @(Get-WinEvent -LogName $log -FilterXPath $xpath | Sort-Object RecordId)
    foreach ($e in $events) {
      if ([long]$e.RecordId -gt $last[$log]) { $last[$log] = [long]$e.RecordId }
      $text = ($e.Message -replace '\s+', ' ').Trim()
      $mine = ($e.ProviderName -eq $name) -or ($text -like ('*' + $display + '*')) -or ($text -like ('*' + $name + '*'))
      if ($mine) { Write-Output ('{0} [{1}] {2}: {3}' -f $e.TimeCreated.ToString('s'), $e.LevelDisplayName, $e.ProviderName, $text) }
    }
  }
  Start-Sleep -Seconds 2
}
";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordinary_service_names_are_accepted() {
        for name in ["Spooler", "wuauserv", "Windows Update", "MSSQL$SQLEXPRESS", "WSearch", "cero-test_1.0", "Dhcp (client)"] {
            assert!(validate_service_name(name).is_ok(), "{name}");
        }
    }

    #[test]
    fn names_windows_cannot_have_or_that_would_break_the_filter_are_refused() {
        for name in ["", "   ", "a/b", "a\\b", "x'y", "x\"y", "a<b", "a>b", "a&b", "a`b", "line\nbreak", "tab\there"] {
            assert!(validate_service_name(name).is_err(), "{name:?}");
        }
        assert!(validate_service_name(&"a".repeat(257)).is_err());
        assert!(validate_service_name(&"a".repeat(256)).is_ok());
    }

    #[test]
    fn the_error_names_the_problem() {
        assert!(validate_service_name("a/b").unwrap_err().contains('/'));
        assert!(validate_service_name("").unwrap_err().contains("Spooler"));
        assert!(validate_service_name("a\nb").unwrap_err().contains("control"));
    }

    #[test]
    fn the_script_reads_the_name_from_the_environment_and_has_no_double_quotes() {
        assert!(WATCH_SCRIPT.contains("$env:CERO_SERVICE"));
        assert!(!WATCH_SCRIPT.contains('"'), "double quotes would be mangled on the way through -Command");
        assert!(SERVICE_ENV == "CERO_SERVICE");
    }

    #[test]
    fn the_script_stops_with_a_message_for_an_unknown_service() {
        assert!(WATCH_SCRIPT.contains("service not found"));
        assert!(WATCH_SCRIPT.contains("exit 2"));
    }
}
