//! Secrets (API keys) live in Windows Credential Manager, through the `keyring` crate with the `windows-native`
//! backend. The entry names are `service` and `key` exactly as in 2.2.0, so keys stored by an earlier version are
//! still found after an upgrade.
//!
//! Every command returns an error rather than pretending: the caller keeps the old copy of a key until a write has
//! been read back. There is no plaintext fallback file: Credential Manager is part of every Windows install, and a file
//! of API keys would be a worse place for them.
//!
//! A credential holds at most 2560 bytes, so a value longer than about 1000 characters is split over several entries
//! (`secret_chunks.rs`).

use crate::secret_chunks as chunks;

mod native {
    pub fn set(service: &str, key: &str, value: &str) -> Result<(), String> {
        keyring::Entry::new(service, key).map_err(|e| e.to_string())?.set_password(value).map_err(|e| e.to_string())
    }
    pub fn get(service: &str, key: &str) -> Result<Option<String>, String> {
        match keyring::Entry::new(service, key).map_err(|e| e.to_string())?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn delete(service: &str, key: &str) -> Result<(), String> {
        match keyring::Entry::new(service, key).map_err(|e| e.to_string())?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

/// How many pieces the stored value of `key` has, when it was split; `None` for an ordinary value or no value.
fn stored_piece_count(service: &str, key: &str) -> Result<Option<usize>, String> {
    Ok(native::get(service, key)?.as_deref().and_then(chunks::parse_marker))
}

fn set_value(service: &str, key: &str, value: &str) -> Result<(), String> {
    let previous_pieces = stored_piece_count(service, key)?.unwrap_or(0);

    let new_pieces = if chunks::needs_chunks(value) {
        let pieces = chunks::split(value);
        // The pieces first, the marker last: an interrupted write leaves the old value readable
        for (index, piece) in pieces.iter().enumerate() {
            native::set(service, &chunks::chunk_key(key, index), piece)?;
        }
        native::set(service, key, &chunks::marker(pieces.len()))?;
        pieces.len()
    } else {
        native::set(service, key, value)?;
        0
    };

    // Pieces of an earlier, longer value are no longer used
    for index in new_pieces..previous_pieces {
        native::delete(service, &chunks::chunk_key(key, index))?;
    }
    Ok(())
}

fn get_value(service: &str, key: &str) -> Result<Option<String>, String> {
    let Some(stored) = native::get(service, key)? else { return Ok(None) };
    let Some(count) = chunks::parse_marker(&stored) else { return Ok(Some(stored)) };
    let mut value = String::new();
    for index in 0..count {
        match native::get(service, &chunks::chunk_key(key, index))? {
            Some(piece) => value.push_str(&piece),
            None => return Err(format!("the stored value of {key} is incomplete (piece {index} of {count} is missing)")),
        }
    }
    Ok(Some(value))
}

fn delete_value(service: &str, key: &str) -> Result<(), String> {
    let pieces = stored_piece_count(service, key)?.unwrap_or(0);
    // The marker first: without it the pieces are unreachable, and a failure below can be retried
    native::delete(service, key)?;
    for index in 0..pieces {
        native::delete(service, &chunks::chunk_key(key, index))?;
    }
    Ok(())
}

/// "keychain": what Settings tells the person
#[tauri::command]
pub fn secret_backend() -> String {
    "keychain".into()
}

#[tauri::command]
pub fn secret_set(service: String, key: String, value: String) -> Result<(), String> {
    set_value(&service, &key, &value)
}

#[tauri::command]
pub fn secret_get(service: String, key: String) -> Result<Option<String>, String> {
    get_value(&service, &key)
}

#[tauri::command]
pub fn secret_delete(service: String, key: String) -> Result<(), String> {
    delete_value(&service, &key)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A service name no real key uses, removed again when the test ends.
    struct TestService(String);

    impl TestService {
        fn new(name: &str) -> Self {
            Self(format!("cero-test-{}-{}", name, std::process::id()))
        }
    }

    impl Drop for TestService {
        fn drop(&mut self) {
            for key in ["a", "b", "key", "openai", "groq"] {
                let _ = delete_value(&self.0, key);
            }
        }
    }

    fn long_key(len: usize) -> String {
        (0..len).map(|i| char::from(b'a' + (i % 26) as u8)).collect()
    }

    #[test]
    fn a_short_key_round_trips_and_deletes() {
        let s = TestService::new("short");
        assert_eq!(get_value(&s.0, "openai").unwrap(), None);
        set_value(&s.0, "openai", "sk-test-123").unwrap();
        assert_eq!(get_value(&s.0, "openai").unwrap().as_deref(), Some("sk-test-123"));
        delete_value(&s.0, "openai").unwrap();
        assert_eq!(get_value(&s.0, "openai").unwrap(), None);
        // deleting what is not there is fine
        delete_value(&s.0, "openai").unwrap();
    }

    #[test]
    fn a_2000_character_key_round_trips() {
        let s = TestService::new("long");
        let key = long_key(2000);
        set_value(&s.0, "key", &key).unwrap();
        assert_eq!(get_value(&s.0, "key").unwrap().as_deref(), Some(key.as_str()));
        // one entry alone could not have held it
        assert!(native::set(&s.0, "key", &key).is_err(), "the platform limit is what makes the split necessary");
        delete_value(&s.0, "key").unwrap();
        assert_eq!(get_value(&s.0, "key").unwrap(), None);
        assert_eq!(native::get(&s.0, &chunks::chunk_key("key", 0)).unwrap(), None, "pieces are removed too");
    }

    #[test]
    fn unicode_keys_survive_including_characters_outside_the_bmp() {
        let s = TestService::new("unicode");
        let value = format!("caf\u{e9}-\u{2713}-{}", "\u{1F600}".repeat(700));
        set_value(&s.0, "key", &value).unwrap();
        assert_eq!(get_value(&s.0, "key").unwrap().as_deref(), Some(value.as_str()));
    }

    #[test]
    fn replacing_a_long_key_with_a_short_one_removes_the_old_pieces() {
        let s = TestService::new("replace");
        set_value(&s.0, "key", &long_key(3500)).unwrap();
        assert!(native::get(&s.0, &chunks::chunk_key("key", 3)).unwrap().is_some());
        set_value(&s.0, "key", "short").unwrap();
        assert_eq!(get_value(&s.0, "key").unwrap().as_deref(), Some("short"));
        assert_eq!(native::get(&s.0, &chunks::chunk_key("key", 0)).unwrap(), None);
        assert_eq!(native::get(&s.0, &chunks::chunk_key("key", 3)).unwrap(), None);
    }

    #[test]
    fn replacing_a_long_key_with_a_shorter_long_one_trims_the_pieces() {
        let s = TestService::new("trim");
        set_value(&s.0, "key", &long_key(3500)).unwrap();
        let second = long_key(1500);
        set_value(&s.0, "key", &second).unwrap();
        assert_eq!(get_value(&s.0, "key").unwrap().as_deref(), Some(second.as_str()));
        assert_eq!(native::get(&s.0, &chunks::chunk_key("key", 2)).unwrap(), None);
    }

    #[test]
    fn a_value_that_looks_like_a_marker_comes_back_unchanged() {
        let s = TestService::new("marker");
        set_value(&s.0, "key", "cero-chunked:7").unwrap();
        assert_eq!(get_value(&s.0, "key").unwrap().as_deref(), Some("cero-chunked:7"));
    }

    #[test]
    fn a_missing_piece_is_reported_instead_of_returning_half_a_key() {
        let s = TestService::new("broken");
        set_value(&s.0, "key", &long_key(2500)).unwrap();
        native::delete(&s.0, &chunks::chunk_key("key", 1)).unwrap();
        let error = get_value(&s.0, "key").unwrap_err();
        assert!(error.contains("incomplete"), "{error}");
        delete_value(&s.0, "key").unwrap();
    }

    #[test]
    fn services_and_keys_do_not_mix() {
        let one = TestService::new("one");
        let two = TestService::new("two");
        set_value(&one.0, "a", "first").unwrap();
        set_value(&two.0, "a", "second").unwrap();
        set_value(&one.0, "b", "third").unwrap();
        assert_eq!(get_value(&one.0, "a").unwrap().as_deref(), Some("first"));
        assert_eq!(get_value(&two.0, "a").unwrap().as_deref(), Some("second"));
        assert_eq!(get_value(&two.0, "b").unwrap(), None);
    }

    #[test]
    fn the_backend_is_the_keychain() {
        assert_eq!(secret_backend(), "keychain");
    }
}
