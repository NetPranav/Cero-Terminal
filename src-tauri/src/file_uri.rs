//! `file://` URIs and percent encoding, shared by the OSC 7 working-directory reports (`osc.rs`) and the `.flow`
//! paths a second launch hands over (`launch.rs`). Plain `std`.

pub fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let high = (bytes[i + 1] as char).to_digit(16);
            let low = (bytes[i + 2] as char).to_digit(16);
            if let (Some(high), Some(low)) = (high, low) {
                out.push((high * 16 + low) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn is_drive_path(path: &str) -> bool {
    let b = path.as_bytes();
    b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':'
}

/// `file://PC/C:/Users/me` -> `C:\Users\me`; `file://server/share/dir` -> `\\server\share\dir`.
pub fn file_uri_to_path(uri: &str) -> Option<String> {
    let rest = uri.strip_prefix("file://")?;
    let slash = rest.find('/')?;
    let (host, path) = rest.split_at(slash);
    let path = percent_decode(path);
    let trimmed = path.trim_start_matches('/');
    let converted = if is_drive_path(trimmed) {
        trimmed.replace('/', "\\")
    } else if !host.is_empty() && !host.eq_ignore_ascii_case("localhost") {
        format!("\\\\{}\\{}", percent_decode(host), trimmed.replace('/', "\\"))
    } else {
        // A POSIX path (WSL, Git Bash without a drive): keep it as reported
        path
    };
    (!converted.is_empty()).then_some(converted)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_decoding_handles_bad_escapes() {
        assert_eq!(percent_decode("a%20b"), "a b");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
        assert_eq!(percent_decode("caf%C3%A9"), "caf\u{e9}");
    }

    #[test]
    fn drive_uris_become_windows_paths() {
        assert_eq!(file_uri_to_path("file:///C:/Users/a%20b/x.flow").as_deref(), Some("C:\\Users\\a b\\x.flow"));
        assert_eq!(file_uri_to_path("file://MYPC/D:/work/x.flow").as_deref(), Some("D:\\work\\x.flow"));
    }

    #[test]
    fn server_uris_become_unc_paths() {
        assert_eq!(file_uri_to_path("file://server/share/dir/x.flow").as_deref(), Some("\\\\server\\share\\dir\\x.flow"));
    }

    #[test]
    fn localhost_posix_paths_stay_as_reported_and_junk_is_refused() {
        assert_eq!(file_uri_to_path("file://localhost/home/me/x.flow").as_deref(), Some("/home/me/x.flow"));
        assert_eq!(file_uri_to_path("https://example.com/x"), None);
        assert_eq!(file_uri_to_path("file://nohostpath"), None);
        // the root of a POSIX file system (WSL) is a valid folder to report
        assert_eq!(file_uri_to_path("file:///").as_deref(), Some("/"));
    }
}
