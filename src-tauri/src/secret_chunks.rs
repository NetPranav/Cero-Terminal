//! Long secrets in Credential Manager (roadmap 2.7).
//!
//! A Windows credential holds at most 2560 bytes, and the `keyring` crate stores a password as UTF-16, so one entry takes
//! about 1280 characters. Most API keys are far shorter, but tokens can be longer. A value that does not fit is split
//! over several entries: the pieces are stored as `<key>#chunk0`, `<key>#chunk1`, ... and the entry under `<key>`
//! holds a marker with the number of pieces. The marker is written last, so an interrupted write leaves the old value.

/// UTF-16 code units per entry: 1000 units are 2000 bytes, below the 2560-byte limit.
pub const MAX_UNITS_PER_ENTRY: usize = 1000;

const MARKER_PREFIX: &str = "cero-chunked:";

/// True when `value` cannot be stored as it is: too long, or it looks like a marker and would be misread.
pub fn needs_chunks(value: &str) -> bool {
    value.encode_utf16().count() > MAX_UNITS_PER_ENTRY || value.starts_with(MARKER_PREFIX)
}

/// Split `value` into pieces of at most `MAX_UNITS_PER_ENTRY` UTF-16 units, never inside a character.
pub fn split(value: &str) -> Vec<String> {
    let mut pieces = Vec::new();
    let mut current = String::new();
    let mut units = 0;
    for ch in value.chars() {
        let width = ch.len_utf16();
        if units + width > MAX_UNITS_PER_ENTRY {
            pieces.push(std::mem::take(&mut current));
            units = 0;
        }
        current.push(ch);
        units += width;
    }
    if !current.is_empty() || pieces.is_empty() {
        pieces.push(current);
    }
    pieces
}

pub fn marker(count: usize) -> String {
    format!("{MARKER_PREFIX}{count}")
}

/// The number of pieces named by a marker; `None` for an ordinary value.
pub fn parse_marker(stored: &str) -> Option<usize> {
    stored.strip_prefix(MARKER_PREFIX)?.parse::<usize>().ok().filter(|n| *n > 0)
}

pub fn chunk_key(key: &str, index: usize) -> String {
    format!("{key}#chunk{index}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_values_are_stored_as_they_are() {
        assert!(!needs_chunks("sk-abc123"));
        assert!(!needs_chunks(""));
        assert!(!needs_chunks(&"a".repeat(MAX_UNITS_PER_ENTRY)));
    }

    #[test]
    fn long_values_need_chunks() {
        assert!(needs_chunks(&"a".repeat(MAX_UNITS_PER_ENTRY + 1)));
        assert!(needs_chunks(&"a".repeat(2000)));
    }

    #[test]
    fn a_value_that_looks_like_a_marker_is_chunked_so_it_is_not_misread() {
        assert!(needs_chunks("cero-chunked:3"));
        assert_eq!(split("cero-chunked:3"), vec!["cero-chunked:3"]);
    }

    #[test]
    fn a_2000_character_key_splits_into_two_pieces_that_join_back() {
        let key: String = (0..2000).map(|i| char::from(b'a' + (i % 26) as u8)).collect();
        let pieces = split(&key);
        assert_eq!(pieces.len(), 2);
        assert!(pieces.iter().all(|p| p.encode_utf16().count() <= MAX_UNITS_PER_ENTRY));
        assert_eq!(pieces.concat(), key);
    }

    #[test]
    fn characters_outside_the_bmp_count_as_two_units_and_are_never_cut() {
        // 600 emoji are 1200 UTF-16 units, so two pieces
        let value = "\u{1F600}".repeat(600);
        let pieces = split(&value);
        assert_eq!(pieces.len(), 2);
        assert!(pieces.iter().all(|p| p.encode_utf16().count() <= MAX_UNITS_PER_ENTRY));
        assert_eq!(pieces.concat(), value);
        assert!(pieces.iter().all(|p| p.chars().all(|c| c == '\u{1F600}')));
    }

    #[test]
    fn splitting_an_empty_or_exact_value_gives_the_expected_pieces() {
        assert_eq!(split(""), vec![String::new()]);
        assert_eq!(split(&"a".repeat(MAX_UNITS_PER_ENTRY)).len(), 1);
        assert_eq!(split(&"a".repeat(MAX_UNITS_PER_ENTRY * 3)).len(), 3);
    }

    #[test]
    fn markers_round_trip_and_ordinary_values_are_not_markers() {
        assert_eq!(parse_marker(&marker(2)), Some(2));
        assert_eq!(parse_marker("sk-abc"), None);
        assert_eq!(parse_marker("cero-chunked:0"), None);
        assert_eq!(parse_marker("cero-chunked:x"), None);
        assert_eq!(parse_marker(""), None);
    }

    #[test]
    fn piece_names_are_derived_from_the_key() {
        assert_eq!(chunk_key("openai", 0), "openai#chunk0");
        assert_eq!(chunk_key("openai", 11), "openai#chunk11");
    }
}
