//! Token-at-rest + OAuth state security primitives.
//! `integrations` rows hold Google refresh tokens encrypted with AES-256-GCM.
//! The key is derived per user (HKDF-SHA256 over a server master secret with
//! the user id as salt) so a leaked ciphertext for one user does not decrypt
//! another's even if the master secret were reused as a single AES key.
//! The OAuth `state` parameter is an HMAC-signed, expiring claim carrying the

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::Sha256;

use crate::core::error::{AppError, AppResult};

const NONCE_LEN: usize = 12;
const STATE_TTL_SECS: u64 = 600;

/// HKDF info labels — different purposes must never share a derived key.
const INFO_TOKEN: &[u8] = b"growth-copilot/token-enc";
const INFO_STATE: &[u8] = b"growth-copilot/state-sign";

#[derive(Clone)]
pub struct TokenCrypto {
    master: [u8; 32],
}

impl TokenCrypto {
    /// Master secret: hex-encoded 32 bytes (GROWTH_TOKEN_ENC_KEY).
    pub fn from_hex(hex_key: &str) -> Option<Self> {
        let bytes = hex::decode(hex_key.trim()).ok()?;
        let master: [u8; 32] = bytes.try_into().ok()?;
        Some(Self { master })
    }

    fn derive(&self, info: &'static [u8], salt: &[u8]) -> [u8; 32] {
        let hk = Hkdf::<Sha256>::new(Some(salt), &self.master);
        let mut out = [0u8; 32];
        hk.expand(info, &mut out).expect("32 bytes is a valid HKDF length");
        out
    }

    // -----------------------------------------------------------------------
    // Token encryption (integrations table)
    // -----------------------------------------------------------------------

    /// AES-256-GCM encrypt; wire format = nonce(12) || ciphertext+tag.
    pub fn encrypt_for_user(&self, user_id: &str, plaintext: &str) -> AppResult<Vec<u8>> {
        let key = self.derive(INFO_TOKEN, user_id.as_bytes());
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));

        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);

        let ct = cipher
            .encrypt(Nonce::from_slice(&nonce_bytes), plaintext.as_bytes())
            .map_err(|_| AppError::Internal(anyhow::anyhow!("token encryption failed")))?;

        let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
        out.extend_from_slice(&nonce_bytes);
        out.extend_from_slice(&ct);
        Ok(out)
    }

    pub fn decrypt_for_user(&self, user_id: &str, blob: &[u8]) -> AppResult<String> {
        if blob.len() <= NONCE_LEN {
            return Err(AppError::BadRequest("encrypted token blob truncated".into()));
        }
        let key = self.derive(INFO_TOKEN, user_id.as_bytes());
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
        let pt = cipher
            .decrypt(
                Nonce::from_slice(&blob[..NONCE_LEN]),
                &blob[NONCE_LEN..],
            )
            .map_err(|_| {
                AppError::BadRequest(
                    "token decryption failed (wrong key or corrupted row) — reconnect the integration".into(),
                )
            })?;
        String::from_utf8(pt)
            .map_err(|_| AppError::Internal(anyhow::anyhow!("token plaintext not utf8")))
    }

    // -----------------------------------------------------------------------
    // OAuth state (signed, expiring, carries the user id)
    // -----------------------------------------------------------------------

    fn state_mac(&self) -> Hmac<Sha256> {
        let key = self.derive(INFO_STATE, b"state");
        hmac::Mac::new_from_slice(&key).expect("HMAC accepts 32-byte key")
    }

    pub fn sign_state(&self, user_id: &str) -> String {
        let exp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() + STATE_TTL_SECS)
            .unwrap_or(STATE_TTL_SECS);
        let payload = format!("{user_id}|{exp}");
        let mut mac = self.state_mac();
        mac.update(payload.as_bytes());
        let tag = hex::encode(mac.finalize().into_bytes());
        format!("{payload}|{tag}")
    }

    /// Verifies MAC + expiry; returns the user id when the state is legit.
    pub fn verify_state(&self, state: &str) -> Option<String> {
        let mut parts = state.rsplitn(3, '|');
        let tag = parts.next()?;
        let exp: u64 = parts.next()?.parse().ok()?;
        let user_id = parts.next()?.to_string();
        if user_id.starts_with('|') {
            return None;
        }

        let mut mac = self.state_mac();
        mac.update(format!("{user_id}|{exp}").as_bytes());
        if hex::encode(mac.finalize().into_bytes()) != tag {
            return None;
        }
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        (exp >= now).then_some(user_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn crypto() -> TokenCrypto {
        let hex_key = hex::encode([7u8; 32]);
        TokenCrypto::from_hex(&hex_key).unwrap()
    }

    #[test]
    fn hex_parsing_rejects_bad_keys() {
        assert!(TokenCrypto::from_hex("zz").is_none());
        assert!(TokenCrypto::from_hex("").is_none());
        assert!(TokenCrypto::from_hex(&hex::encode([1u8; 16])).is_none()); // 16 ≠ 32 bytes
        assert!(TokenCrypto::from_hex(&hex::encode([1u8; 32])).is_some());
    }

    #[test]
    fn roundtrip_per_user() {
        let c = crypto();
        let blob = c.encrypt_for_user("user-a", "refresh-token-1").unwrap();
        assert_eq!(c.decrypt_for_user("user-a", &blob).unwrap(), "refresh-token-1");

        // ciphertexts differ per user even for identical plaintext
        let blob_b = c.encrypt_for_user("user-b", "refresh-token-1").unwrap();
        assert_ne!(blob, blob_b);

        // decrypting under the wrong user fails (auth tag mismatch)
        assert!(c.decrypt_for_user("user-a", &blob_b).is_err());
    }

    #[test]
    fn tampered_ciphertext_rejected() {
        let c = crypto();
        let mut blob = c.encrypt_for_user("u", "secret").unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0xff;
        assert!(c.decrypt_for_user("u", &blob).is_err());
    }

    #[test]
    fn state_signs_and_verifies() {
        let c = crypto();
        let state = c.sign_state("local_dev");
        assert_eq!(c.verify_state(&state).as_deref(), Some("local_dev"));
    }

    #[test]
    fn state_rejects_tampering_and_garbage() {
        let c = crypto();
        assert!(c.verify_state("local_dev|9999999999|deadbeef").is_none());
        assert!(c.verify_state("garbage").is_none());
        assert!(c.verify_state("").is_none());
    }

    #[test]
    fn cross_config_key_fails() {
        let c1 = crypto();
        let other = TokenCrypto::from_hex(&hex::encode([9u8; 32])).unwrap();
        let blob = c1.encrypt_for_user("u", "secret").unwrap();
        assert!(other.decrypt_for_user("u", &blob).is_err());
    }
}
