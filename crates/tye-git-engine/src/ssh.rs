use std::fs;
use std::path::PathBuf;
use base64::Engine;
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use crate::error::GitEngineError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SshKey {
    pub path: PathBuf,
    pub public_path: Option<PathBuf>,
    pub key_type: String,
    pub fingerprint: String,
    pub size_bits: usize,
    pub is_weak: bool,
    pub warning_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SshConfigHost {
    pub host: String,
    pub hostname: Option<String>,
    pub user: Option<String>,
    pub identity_file: Option<String>,
}

/// Helper to get `~/.ssh` directory path
pub fn get_ssh_dir() -> Option<PathBuf> {
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        let p = PathBuf::from(home).join(".ssh");
        return Some(p);
    }
    None
}

/// Compute SHA256 fingerprint formatted as `SHA256:<base64-nopad>` from OpenSSH public key blob.
pub fn compute_fingerprint(pub_content: &str) -> Option<(String, String, usize)> {
    // OpenSSH public key format: "<key-type> <base64-blob> [comment]"
    let parts: Vec<&str> = pub_content.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return None;
    }
    let key_type = parts[0].to_string();
    let b64 = parts[1];

    let decoded = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
    let mut hasher = Sha256::new();
    hasher.update(&decoded);
    let hash = hasher.finalize();
    let fp = format!("SHA256:{}", base64::engine::general_purpose::STANDARD_NO_PAD.encode(hash));

    // Approximate size in bits from binary blob length or key type
    let size_bits = match key_type.as_str() {
        "ssh-ed25519" => 256,
        "ssh-rsa" => {
            // Rough estimation of modulus bits from blob length (total bytes minus headers ~ * 8)
            if decoded.len() > 300 { 4096 }
            else if decoded.len() > 200 { 2048 }
            else { 1024 }
        }
        "ecdsa-sha2-nistp256" => 256,
        "ecdsa-sha2-nistp384" => 384,
        "ecdsa-sha2-nistp521" => 521,
        "ssh-dss" => 1024,
        _ => decoded.len() * 8,
    };

    Some((key_type, fp, size_bits))
}

/// Scan `~/.ssh/` (`F-005`) for common key files (`id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa`) and custom key pairs.
pub async fn list_ssh_keys() -> Result<Vec<SshKey>, GitEngineError> {
    let mut keys = Vec::new();
    let ssh_dir = match get_ssh_dir() {
        Some(d) if d.exists() => d,
        _ => return Ok(keys),
    };

    let entries = fs::read_dir(&ssh_dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let fname = path.file_name().unwrap_or_default().to_string_lossy();
        if fname.ends_with(".pub") || fname.eq_ignore_ascii_case("config") || fname.eq_ignore_ascii_case("known_hosts") || fname.eq_ignore_ascii_case("authorized_keys") {
            continue;
        }

        // Check if there is a corresponding .pub file or if this is a known private key name
        let pub_path = path.with_extension("pub");
        let pub_exists = pub_path.exists();
        let is_known_name = fname.starts_with("id_");

        if pub_exists || is_known_name {
            let mut key_type = "unknown".to_string();
            let mut fingerprint = "Unknown Fingerprint".to_string();
            let mut size_bits = 0;

            if pub_exists {
                if let Ok(pub_content) = fs::read_to_string(&pub_path) {
                    if let Some((kt, fp, sb)) = compute_fingerprint(&pub_content) {
                        key_type = kt;
                        fingerprint = fp;
                        size_bits = sb;
                    }
                }
            } else if fname.contains("ed25519") {
                key_type = "ssh-ed25519".to_string();
                size_bits = 256;
            } else if fname.contains("rsa") {
                key_type = "ssh-rsa".to_string();
                size_bits = 2048;
            }

            let is_weak = key_type == "ssh-dss" || (key_type == "ssh-rsa" && size_bits < 2048);
            let warning_message = if key_type == "ssh-dss" {
                Some("DSA keys (ssh-dss) are insecure and deprecated by modern OpenSSH.".to_string())
            } else if key_type == "ssh-rsa" && size_bits < 2048 {
                Some(format!("RSA key size {} bits is weak (< 2048 bits). Recommend upgrading to Ed25519.", size_bits))
            } else {
                None
            };

            keys.push(SshKey {
                path,
                public_path: if pub_exists { Some(pub_path) } else { None },
                key_type,
                fingerprint,
                size_bits,
                is_weak,
                warning_message,
            });
        }
    }

    Ok(keys)
}

/// Read and parse `~/.ssh/config` (`F-005`).
pub fn read_ssh_config() -> Result<Vec<SshConfigHost>, GitEngineError> {
    let mut hosts = Vec::new();
    let ssh_dir = match get_ssh_dir() {
        Some(d) => d,
        None => return Ok(hosts),
    };
    let config_path = ssh_dir.join("config");
    if !config_path.exists() {
        return Ok(hosts);
    }

    let content = fs::read_to_string(&config_path)?;
    let mut current_host: Option<SshConfigHost> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }

        let key = parts[0].to_lowercase();
        let val = parts[1..].join(" ");

        if key == "host" {
            if let Some(h) = current_host.take() {
                hosts.push(h);
            }
            current_host = Some(SshConfigHost {
                host: val,
                hostname: None,
                user: None,
                identity_file: None,
            });
        } else if let Some(ref mut h) = current_host {
            match key.as_str() {
                "hostname" => h.hostname = Some(val),
                "user" => h.user = Some(val),
                "identityfile" => h.identity_file = Some(val),
                _ => {}
            }
        }
    }

    if let Some(h) = current_host {
        hosts.push(h);
    }

    Ok(hosts)
}

/// Generate a new Ed25519 SSH key (`F-005`).
pub async fn generate_ed25519_key(key_name: &str, comment: &str, passphrase: &str) -> Result<SshKey, GitEngineError> {
    let ssh_dir = get_ssh_dir().ok_or_else(|| GitEngineError::SshError("Could not determine user home directory".to_string()))?;
    fs::create_dir_all(&ssh_dir)?;

    let key_path = ssh_dir.join(key_name);
    if key_path.exists() {
        return Err(GitEngineError::SshError(format!("SSH key file already exists: {:?}", key_path)));
    }

    let status = Command::new("ssh-keygen")
        .args([
            "-t", "ed25519",
            "-C", comment,
            "-f", &key_path.to_string_lossy(),
            "-N", passphrase,
        ])
        .status()
        .await
        .map_err(|e| GitEngineError::SshError(format!("Failed to execute ssh-keygen: {}", e)))?;

    if !status.success() {
        return Err(GitEngineError::SshError(format!("ssh-keygen exited with status {}", status)));
    }

    let pub_path = key_path.with_extension("pub");
    let pub_content = fs::read_to_string(&pub_path).unwrap_or_default();
    let (key_type, fingerprint, size_bits) = compute_fingerprint(&pub_content)
        .unwrap_or(("ssh-ed25519".to_string(), "SHA256:Generated".to_string(), 256));

    Ok(SshKey {
        path: key_path,
        public_path: Some(pub_path),
        key_type,
        fingerprint,
        size_bits,
        is_weak: false,
        warning_message: None,
    })
}
