use std::path::{Path, PathBuf};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use tokio::process::Command;
use crate::error::GitEngineError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitInstallation {
    pub path: PathBuf,
    pub version: String,
    pub is_portable: bool,
    pub is_valid: bool,
}

/// Parse semantic version from output like "git version 2.42.0.windows.1" or "git version 2.39.2"
pub fn parse_git_version(output_str: &str) -> Result<String, GitEngineError> {
    let output = output_str.trim();
    let prefix = "git version ";
    if let Some(pos) = output.find(prefix) {
        let after = &output[pos + prefix.len()..];
        // Take digits and dots up to space or non-version token
        let ver_token: String = after
            .chars()
            .take_while(|c| c.is_ascii_digit() || *c == '.' || *c == '-' || *c == '+' || c.is_ascii_alphabetic())
            .collect();
        if !ver_token.is_empty() {
            return Ok(ver_token);
        }
    }
    Err(GitEngineError::VersionParseError(output.to_string()))
}

/// Check if version string >= 2.20.0
pub fn check_min_version(version: &str) -> Result<bool, GitEngineError> {
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() < 2 {
        return Ok(false);
    }
    let major: u32 = parts[0].parse().unwrap_or(0);
    let minor: u32 = parts[1].parse().unwrap_or(0);

    if major > 2 {
        Ok(true)
    } else if major == 2 {
        Ok(minor >= 20)
    } else {
        Ok(false)
    }
}

/// Detect Git installation on system (checking custom DB setting first if pool provided, then PATH via `which`).
pub async fn detect_git(pool: Option<&Pool<Sqlite>>) -> Result<GitInstallation, GitEngineError> {
    let mut target_exe = None;

    // Check if custom path is configured in DB
    if let Some(p) = pool {
        let row: Option<(String,)> = sqlx::query_as("SELECT value FROM git_settings WHERE key = 'git_custom_path'")
            .fetch_optional(p)
            .await?;
        if let Some((custom_path,)) = row {
            let path_obj = PathBuf::from(&custom_path);
            if path_obj.exists() {
                target_exe = Some(path_obj);
            }
        }
    }

    // If no valid custom path, search system PATH
    let exe = match target_exe {
        Some(e) => e,
        None => which::which("git")
            .map_err(|e| GitEngineError::GitNotFound(e.to_string()))?,
    };

    // Execute git --version
    let output = Command::new(&exe)
        .arg("--version")
        .output()
        .await
        .map_err(|e| GitEngineError::GitNotFound(format!("Failed to spawn {:?}: {}", exe, e)))?;

    if !output.status.success() {
        return Err(GitEngineError::GitNotFound(format!(
            "git --version exited with status {}",
            output.status
        )));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let version_str = parse_git_version(&stdout_str)?;
    let is_valid = check_min_version(&version_str)?;

    let path_str = exe.to_string_lossy();
    let is_portable = path_str.to_lowercase().contains("portablegit") || path_str.contains("appdata") || path_str.contains("temp");

    let installation = GitInstallation {
        path: exe.clone(),
        version: version_str.clone(),
        is_portable,
        is_valid,
    };

    // Cache result into DB if pool provided
    if let Some(p) = pool {
        let now = Utc::now().to_rfc3339();
        let _ = sqlx::query(
            "INSERT INTO git_settings (key, value, updated_at) VALUES ('git_detected_path', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
        )
        .bind(path_str.as_ref())
        .bind(&now)
        .execute(p)
        .await;

        let _ = sqlx::query(
            "INSERT INTO git_settings (key, value, updated_at) VALUES ('git_detected_version', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
        )
        .bind(&version_str)
        .bind(&now)
        .execute(p)
        .await;
    }

    if !is_valid {
        return Err(GitEngineError::VersionTooLow(version_str));
    }

    Ok(installation)
}

/// Set custom git executable path and verify it works.
pub async fn set_custom_git_path(pool: &Pool<Sqlite>, path: &Path) -> Result<GitInstallation, GitEngineError> {
    if !path.exists() {
        return Err(GitEngineError::GitNotFound(path.display().to_string()));
    }

    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO git_settings (key, value, updated_at) VALUES ('git_custom_path', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
    )
    .bind(path.to_string_lossy().as_ref())
    .bind(&now)
    .execute(pool)
    .await?;

    detect_git(Some(pool)).await
}
