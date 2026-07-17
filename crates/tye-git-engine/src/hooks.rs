use std::path::Path;
use std::fs;
use crate::error::GitEngineError;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hook {
    pub name: String,
    pub path: String,
    pub is_enabled: bool,
    pub content: String,
}

const KNOWN_HOOKS: &[&str] = &[
    "applypatch-msg",
    "commit-msg",
    "post-update",
    "pre-applypatch",
    "pre-commit",
    "pre-merge-commit",
    "pre-push",
    "pre-rebase",
    "pre-receive",
    "prepare-commit-msg",
    "update",
];

pub fn list_hooks(repo_path: &Path) -> Result<Vec<Hook>, GitEngineError> {
    let hooks_dir = repo_path.join(".git").join("hooks");
    if !hooks_dir.exists() {
        return Ok(Vec::new());
    }

    let mut result = Vec::new();

    for hook_name in KNOWN_HOOKS {
        let active_path = hooks_dir.join(hook_name);
        let sample_path = hooks_dir.join(format!("{}.sample", hook_name));

        if active_path.exists() {
            let content = fs::read_to_string(&active_path).unwrap_or_default();
            result.push(Hook {
                name: hook_name.to_string(),
                path: active_path.display().to_string(),
                is_enabled: true,
                content,
            });
        } else if sample_path.exists() {
            let content = fs::read_to_string(&sample_path).unwrap_or_default();
            result.push(Hook {
                name: hook_name.to_string(),
                path: sample_path.display().to_string(),
                is_enabled: false,
                content,
            });
        }
    }

    Ok(result)
}

pub fn toggle_hook(repo_path: &Path, name: &str, enable: bool) -> Result<(), GitEngineError> {
    let hooks_dir = repo_path.join(".git").join("hooks");
    let active_path = hooks_dir.join(name);
    let sample_path = hooks_dir.join(format!("{}.sample", name));

    if enable {
        if sample_path.exists() && !active_path.exists() {
            fs::rename(&sample_path, &active_path).map_err(|e| GitEngineError::RepositoryError {
                path: repo_path.display().to_string(),
                message: format!("Failed to enable hook: {}", e),
            })?;
        }
    } else {
        if active_path.exists() && !sample_path.exists() {
            fs::rename(&active_path, &sample_path).map_err(|e| GitEngineError::RepositoryError {
                path: repo_path.display().to_string(),
                message: format!("Failed to disable hook: {}", e),
            })?;
        }
    }

    Ok(())
}

pub fn edit_hook_script(repo_path: &Path, name: &str, content: &str) -> Result<(), GitEngineError> {
    let hooks_dir = repo_path.join(".git").join("hooks");
    let active_path = hooks_dir.join(name);
    let sample_path = hooks_dir.join(format!("{}.sample", name));

    let target_path = if active_path.exists() {
        active_path
    } else {
        sample_path
    };

    fs::write(&target_path, content).map_err(|e| GitEngineError::RepositoryError {
        path: target_path.display().to_string(),
        message: format!("Failed to save hook: {}", e),
    })?;

    Ok(())
}
