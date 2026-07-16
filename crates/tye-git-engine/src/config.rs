use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use crate::error::GitEngineError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum GitConfigLevel {
    System,
    Global,
    Xdg,
    Local,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitConfigEntry {
    pub level: GitConfigLevel,
    pub key: String,
    pub value: String,
    pub is_critical: bool,
}

impl GitConfigEntry {
    pub fn new(level: GitConfigLevel, key: String, value: String) -> Self {
        let is_critical = matches!(
            key.as_str(),
            "core.editor" | "http.sslverify" | "http.proxy" | "credential.helper" | "user.name" | "user.email"
        );
        Self {
            level,
            key,
            value,
            is_critical,
        }
    }
}

/// Helper to get global gitconfig path (~/.gitconfig or %USERPROFILE%\.gitconfig)
pub fn get_global_gitconfig_path() -> Option<PathBuf> {
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        let p = PathBuf::from(home).join(".gitconfig");
        return Some(p);
    }
    None
}

/// Create a backup of `~/.gitconfig` to `~/.gitconfig.backup` before making modifications.
pub fn backup_global_config() -> Result<(), GitEngineError> {
    if let Some(path) = get_global_gitconfig_path() {
        if path.exists() {
            let backup_path = path.with_extension("gitconfig.backup");
            fs::copy(&path, &backup_path)?;
        }
    }
    Ok(())
}

/// Read system Git configuration (`F-002: System Git Configuration Reader`).
pub async fn read_system_config() -> Result<Vec<GitConfigEntry>, GitEngineError> {
    let mut entries = Vec::new();

    // First try libgit2 open_default
    if let Ok(config) = git2::Config::open_default() {
        if let Ok(mut iter) = config.entries(None) {
            while let Some(Ok(entry)) = iter.next() {
                if entry.level() == git2::ConfigLevel::System {
                    if let (Some(k), Some(v)) = (entry.name(), entry.value()) {
                        entries.push(GitConfigEntry::new(GitConfigLevel::System, k.to_string(), v.to_string()));
                    }
                }
            }
        }
    }

    // If libgit2 found nothing or failed, try git config --system --list as fallback
    if entries.is_empty() {
        if let Ok(output) = Command::new("git").args(["config", "--system", "--list"]).output().await {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if let Some((k, v)) = line.split_once('=') {
                        entries.push(GitConfigEntry::new(GitConfigLevel::System, k.trim().to_string(), v.trim().to_string()));
                    }
                }
            }
        }
    }

    Ok(entries)
}

/// Read global Git configuration (`F-003: Global Git Configuration Manager`).
pub async fn read_global_config() -> Result<Vec<GitConfigEntry>, GitEngineError> {
    let mut entries = Vec::new();

    if let Ok(config) = git2::Config::open_default() {
        if let Ok(mut iter) = config.entries(None) {
            while let Some(Ok(entry)) = iter.next() {
                if entry.level() == git2::ConfigLevel::Global || entry.level() == git2::ConfigLevel::XDG {
                    let lvl = if entry.level() == git2::ConfigLevel::XDG { GitConfigLevel::Xdg } else { GitConfigLevel::Global };
                    if let (Some(k), Some(v)) = (entry.name(), entry.value()) {
                        entries.push(GitConfigEntry::new(lvl, k.to_string(), v.to_string()));
                    }
                }
            }
        }
    }

    // Fallback via CLI if libgit2 misses entries
    if entries.is_empty() {
        if let Ok(output) = Command::new("git").args(["config", "--global", "--list"]).output().await {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if let Some((k, v)) = line.split_once('=') {
                        entries.push(GitConfigEntry::new(GitConfigLevel::Global, k.trim().to_string(), v.trim().to_string()));
                    }
                }
            }
        }
    }

    Ok(entries)
}

/// Set global Git configuration key-value (`F-003`). Automatically backs up `~/.gitconfig`.
pub async fn set_global_config(key: &str, value: &str) -> Result<(), GitEngineError> {
    // Validate email format if setting user.email
    if key.eq_ignore_ascii_case("user.email") {
        if !value.contains('@') || !value.contains('.') {
            return Err(GitEngineError::ConfigError {
                level: "Global".to_string(),
                message: format!("Invalid email format: {}", value),
            });
        }
    }

    backup_global_config()?;

    // Try setting via libgit2 or git CLI
    let res = if let Ok(config) = git2::Config::open_default() {
        if let Ok(mut global) = config.open_level(git2::ConfigLevel::Global) {
            global.set_str(key, value).map_err(|e| GitEngineError::Git2Error(e))
        } else {
            Err(GitEngineError::ConfigError { level: "Global".to_string(), message: "Cannot open global config level".to_string() })
        }
    } else {
        Err(GitEngineError::ConfigError { level: "Global".to_string(), message: "open_default failed".to_string() })
    };

    if res.is_err() {
        let status = Command::new("git")
            .args(["config", "--global", key, value])
            .status()
            .await
            .map_err(|e| GitEngineError::ConfigError { level: "Global".to_string(), message: e.to_string() })?;
        if !status.success() {
            return Err(GitEngineError::ConfigError {
                level: "Global".to_string(),
                message: format!("git config --global {} exited with {}", key, status),
            });
        }
    }

    Ok(())
}

/// Read local Git configuration for a specific repository (`F-004`).
pub fn read_local_config(repo_path: &Path) -> Result<Vec<GitConfigEntry>, GitEngineError> {
    let repo = git2::Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;
    let config = repo.config()?;

    let mut entries = Vec::new();
    let mut iter = config.entries(None)?;
    while let Some(Ok(entry)) = iter.next() {
        if let (Some(k), Some(v)) = (entry.name(), entry.value()) {
            let lvl = match entry.level() {
                git2::ConfigLevel::System => GitConfigLevel::System,
                git2::ConfigLevel::Global => GitConfigLevel::Global,
                git2::ConfigLevel::XDG => GitConfigLevel::Xdg,
                git2::ConfigLevel::Local => GitConfigLevel::Local,
                _ => GitConfigLevel::Local,
            };
            entries.push(GitConfigEntry::new(lvl, k.to_string(), v.to_string()));
        }
    }

    Ok(entries)
}

/// Set local repository configuration (`F-004`).
pub fn set_local_config(repo_path: &Path, key: &str, value: &str) -> Result<(), GitEngineError> {
    let repo = git2::Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;
    let config = repo.config()?;
    let mut local = config.open_level(git2::ConfigLevel::Local)?;
    local.set_str(key, value)?;
    Ok(())
}

/// Edit remote URL (`F-004`).
pub fn set_remote_url(repo_path: &Path, remote_name: &str, new_url: &str) -> Result<(), GitEngineError> {
    let repo = git2::Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;
    repo.remote_set_url(remote_name, new_url)?;
    Ok(())
}

/// Configure branch upstream tracking (`F-004`).
pub fn set_branch_upstream(repo_path: &Path, branch_name: &str, upstream_name: &str) -> Result<(), GitEngineError> {
    let repo = git2::Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;
    let mut branch = repo.find_branch(branch_name, git2::BranchType::Local)?;
    branch.set_upstream(Some(upstream_name))?;
    Ok(())
}
