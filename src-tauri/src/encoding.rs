//! Text from the programs Cero runs (roadmap 2.4).
//!
//! PowerShell commands the agent sends set the console encoding to UTF-8 (4.2), but native console programs
//! (`ipconfig`, `net`, `ping`) print in the OEM code page (437, 850, 932 ...). So output is read as UTF-8 first; when
//! the bytes are not valid UTF-8 they are converted from the OEM code page. UTF-16 with a byte order mark (what
//! `wsl.exe` and redirected Windows PowerShell 5.1 output use) is recognised as well.

/// Decode `bytes`, using `oem` for bytes that are neither UTF-8 nor UTF-16.
pub fn decode_bytes(bytes: &[u8], oem: &dyn Fn(&[u8]) -> String) -> String {
    if let Some(rest) = bytes.strip_prefix(&[0xff, 0xfe]) {
        return decode_utf16(rest, u16::from_le_bytes);
    }
    if let Some(rest) = bytes.strip_prefix(&[0xfe, 0xff]) {
        return decode_utf16(rest, u16::from_be_bytes);
    }
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        // The capture limit can cut the last character in half: still UTF-8
        Err(e) if e.error_len().is_none() => String::from_utf8_lossy(bytes).into_owned(),
        Err(_) => oem(bytes),
    }
}

fn decode_utf16(bytes: &[u8], read: fn([u8; 2]) -> u16) -> String {
    let units: Vec<u16> = bytes.chunks_exact(2).map(|pair| read([pair[0], pair[1]])).collect();
    String::from_utf16_lossy(&units)
}

/// Convert from the OEM code page with `MultiByteToWideChar(CP_OEMCP)`.
#[cfg(windows)]
fn oem_to_string(bytes: &[u8]) -> String {
    use windows_sys::Win32::Globalization::{MultiByteToWideChar, CP_OEMCP};
    if bytes.is_empty() {
        return String::new();
    }
    let Ok(len) = i32::try_from(bytes.len()) else {
        return String::from_utf8_lossy(bytes).into_owned();
    };
    unsafe {
        let needed = MultiByteToWideChar(CP_OEMCP, 0, bytes.as_ptr(), len, std::ptr::null_mut(), 0);
        if needed <= 0 {
            return String::from_utf8_lossy(bytes).into_owned();
        }
        let mut wide = vec![0u16; needed as usize];
        let written = MultiByteToWideChar(CP_OEMCP, 0, bytes.as_ptr(), len, wide.as_mut_ptr(), needed);
        if written <= 0 {
            return String::from_utf8_lossy(bytes).into_owned();
        }
        String::from_utf16_lossy(&wide[..written as usize])
    }
}

/// Text of a program's output: UTF-8, UTF-16 with a byte order mark, or the OEM code page.
#[cfg(windows)]
pub fn decode_output(bytes: &[u8]) -> String {
    decode_bytes(bytes, &oem_to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A stand-in for the OEM code page 437: byte 0x82 is e-acute, 0x81 is u-diaeresis.
    fn cp437(bytes: &[u8]) -> String {
        bytes
            .iter()
            .map(|&b| match b {
                0x81 => '\u{fc}',
                0x82 => '\u{e9}',
                b if b < 0x80 => b as char,
                _ => '?',
            })
            .collect()
    }

    #[test]
    fn valid_utf8_is_used_as_it_is() {
        assert_eq!(decode_bytes("h\u{e9}llo \u{2713}".as_bytes(), &cp437), "h\u{e9}llo \u{2713}");
        assert_eq!(decode_bytes(b"plain ascii", &cp437), "plain ascii");
        assert_eq!(decode_bytes(b"", &cp437), "");
    }

    #[test]
    fn a_utf8_byte_order_mark_is_dropped() {
        assert_eq!(decode_bytes(b"\xef\xbb\xbfhello", &cp437), "hello");
    }

    #[test]
    fn oem_bytes_that_are_not_utf8_go_through_the_code_page() {
        // "m\x82nu" is not valid UTF-8 (0x82 is a continuation byte with no lead)
        assert_eq!(decode_bytes(b"m\x82nu f\x81r", &cp437), "m\u{e9}nu f\u{fc}r");
    }

    #[test]
    fn a_character_cut_by_the_capture_limit_is_still_utf8() {
        let mut bytes = "ok \u{2713}".as_bytes().to_vec();
        bytes.pop(); // the check mark loses its last byte
        let text = decode_bytes(&bytes, &|_| panic!("must not use the OEM code page"));
        assert!(text.starts_with("ok "));
    }

    #[test]
    fn utf16_with_a_byte_order_mark_is_decoded() {
        let mut le = vec![0xff, 0xfe];
        for unit in "Ubuntu\r\n".encode_utf16() {
            le.extend(unit.to_le_bytes());
        }
        assert_eq!(decode_bytes(&le, &cp437), "Ubuntu\r\n");
        let mut be = vec![0xfe, 0xff];
        for unit in "caf\u{e9}".encode_utf16() {
            be.extend(unit.to_be_bytes());
        }
        assert_eq!(decode_bytes(&be, &cp437), "caf\u{e9}");
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use super::*;

    #[test]
    fn the_real_oem_conversion_keeps_ascii_and_decodes_high_bytes() {
        assert_eq!(oem_to_string(b"abc"), "abc");
        assert_eq!(oem_to_string(b""), "");
        // Whatever the machine's OEM code page is, a high byte becomes one non-ASCII character, not the replacement
        let converted = oem_to_string(&[0x82]);
        assert_eq!(converted.chars().count(), 1);
        assert_ne!(converted, "\u{fffd}");
    }

    #[test]
    fn decode_output_uses_utf8_first() {
        assert_eq!(decode_output("h\u{e9}llo".as_bytes()), "h\u{e9}llo");
    }
}
