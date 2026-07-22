use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce as AesNonce,
};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use argon2::{Argon2, Algorithm, Version, Params};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;
use rand::{RngCore, thread_rng};
use std::error::Error;

/// Generates a new key based on a passphrase and salt using PBKDF2-HMAC-SHA256
pub fn new_key(passphrase: &[u8], user_salt: Option<&[u8]>) -> Result<(Vec<u8>, Vec<u8>), Box<dyn Error>> {
    if passphrase.is_empty() {
        return Err("need more than that for passphrase".into());
    }

    let salt = match user_salt {
        Some(s) => s.to_vec(),
        None => {
            let mut s = vec![0u8; 8];
            thread_rng().fill_bytes(&mut s);
            s
        }
    };

    let mut key = vec![0u8; 32];
    pbkdf2_hmac::<Sha256>(passphrase, &salt, 100, &mut key);
    Ok((key, salt))
}

/// Encrypts using AES-256-GCM with the pre-generated key
pub fn encrypt(plaintext: &[u8], key: &[u8]) -> Result<Vec<u8>, Box<dyn Error>> {
    let mut nonce_bytes = [0u8; 12];
    thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = AesNonce::from_slice(&nonce_bytes);
    
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("invalid key length: {}", e))?;
    let mut encrypted = cipher.encrypt(nonce, plaintext)
        .map_err(|e| format!("encryption failed: {}", e))?;
        
    let mut result = nonce_bytes.to_vec();
    result.append(&mut encrypted);
    Ok(result)
}

/// Decrypts using AES-256-GCM with the pre-generated key
pub fn decrypt(encrypted: &[u8], key: &[u8]) -> Result<Vec<u8>, Box<dyn Error>> {
    if encrypted.len() < 13 {
        return Err("incorrect passphrase or ciphertext too short".into());
    }
    
    let nonce = AesNonce::from_slice(&encrypted[..12]);
    let ciphertext = &encrypted[12..];
    
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("invalid key length: {}", e))?;
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|e| format!("decryption failed: {}", e))?;
        
    Ok(plaintext)
}

/// Generates a new key based on a passphrase and salt using Argon2id
pub fn new_argon2(passphrase: &[u8], user_salt: Option<&[u8]>) -> Result<(Vec<u8>, Vec<u8>), Box<dyn Error>> {
    if passphrase.is_empty() {
        return Err("need more than that for passphrase".into());
    }

    let salt = match user_salt {
        Some(s) => s.to_vec(),
        None => {
            let mut s = vec![0u8; 8];
            thread_rng().fill_bytes(&mut s);
            s
        }
    };

    let mut key = vec![0u8; 32];
    // argon2.IDKey(passphrase, salt, 1, 64*1024, 4, 32)
    // 1 pass (time_cost), 64*1024 KiB (memory_cost), 4 lanes (parallelism)
    let params = Params::new(64 * 1024, 1, 4, Some(32))
        .map_err(|e| format!("argon2 params error: {}", e))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    
    argon2.hash_password_into(passphrase, &salt, &mut key)
        .map_err(|e| format!("argon2 error: {}", e))?;
        
    Ok((key, salt))
}

/// Encrypts using XChaCha20-Poly1305 with the pre-generated key
pub fn encrypt_chacha(plaintext: &[u8], key: &[u8]) -> Result<Vec<u8>, Box<dyn Error>> {
    let mut nonce_bytes = [0u8; 24];
    thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from_slice(&nonce_bytes);
    
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|e| format!("invalid key length: {}", e))?;
    let mut encrypted = cipher.encrypt(nonce, plaintext)
        .map_err(|e| format!("encryption failed: {}", e))?;
        
    let mut result = nonce_bytes.to_vec();
    result.append(&mut encrypted);
    Ok(result)
}

/// Decrypts using XChaCha20-Poly1305 with the pre-generated key
pub fn decrypt_chacha(encrypted_msg: &[u8], key: &[u8]) -> Result<Vec<u8>, Box<dyn Error>> {
    if encrypted_msg.len() < 24 {
        return Err("ciphertext too short".into());
    }
    
    let nonce = XNonce::from_slice(&encrypted_msg[..24]);
    let ciphertext = &encrypted_msg[24..];
    
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|e| format!("invalid key length: {}", e))?;
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|e| format!("decryption failed: {}", e))?;
        
    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encryption() {
        let (key, salt) = new_key(b"password", None).unwrap();
        let msg = b"hello, world";
        
        let enc = encrypt(msg, &key).unwrap();
        let dec = decrypt(&enc, &key).unwrap();
        assert_eq!(msg, dec.as_slice());

        // Check reusing the salt
        let (key2, _) = new_key(b"password", Some(&salt)).unwrap();
        let dec2 = decrypt(&enc, &key2).unwrap();
        assert_eq!(msg, dec2.as_slice());

        // Check wrong password
        let (key3, _) = new_key(b"wrong password", Some(&salt)).unwrap();
        let dec3 = decrypt(&enc, &key3);
        assert!(dec3.is_err());

        // Error with no password
        let dec4 = decrypt(b"", &key);
        assert!(dec4.is_err());

        // Error with small password
        let res = new_key(b"", None);
        assert!(res.is_err());
    }

    #[test]
    fn test_encryption_chacha() {
        let (key, salt) = new_argon2(b"password", None).unwrap();
        let msg = b"hello, world";
        
        let enc = encrypt_chacha(msg, &key).unwrap();
        let dec = decrypt_chacha(&enc, &key).unwrap();
        assert_eq!(msg, dec.as_slice());

        // Check reusing the salt
        let (key2, _) = new_argon2(b"password", Some(&salt)).unwrap();
        let dec2 = decrypt_chacha(&enc, &key2).unwrap();
        assert_eq!(msg, dec2.as_slice());

        // Check wrong password
        let (key3, _) = new_argon2(b"wrong password", Some(&salt)).unwrap();
        let dec3 = decrypt_chacha(&enc, &key3);
        assert!(dec3.is_err());

        // Error with no password
        let dec4 = decrypt_chacha(b"", &key);
        assert!(dec4.is_err());

        // Error with small password
        let res = new_argon2(b"", None);
        assert!(res.is_err());
    }
}
