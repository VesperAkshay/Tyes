use std::path::Path;
use git2::{Repository, SubmoduleUpdateOptions};
use crate::error::GitEngineError;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmoduleInfo {
    pub name: String,
    pub path: String,
    pub url: String,
    pub current_oid: Option<String>,
    pub head_oid: Option<String>,
    pub is_dirty: bool,
    pub branch: Option<String>,
}

pub fn list_submodules(repo_path: &Path) -> Result<Vec<SubmoduleInfo>, GitEngineError> {
    let repo = Repository::open(repo_path).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let mut result = Vec::new();
    
    // We must pass a closure to `repo.submodules()` which isn't available directly in `git2` via iterator.
    // Actually, `git2::Repository::submodules()` returns a `Result<Vec<Submodule>, Error>`.
    let submodules = repo.submodules().map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    for sub in submodules {
        let is_dirty = match sub.open() {
            Ok(sub_repo) => {
                match sub_repo.statuses(None) {
                    Ok(statuses) => !statuses.is_empty(),
                    Err(_) => true,
                }
            },
            Err(_) => false,
        };

        result.push(SubmoduleInfo {
            name: sub.name().unwrap_or("").to_string(),
            path: sub.path().display().to_string(),
            url: sub.url().unwrap_or("").to_string(),
            current_oid: sub.head_id().map(|oid| oid.to_string()),
            head_oid: sub.index_id().map(|oid| oid.to_string()),
            is_dirty,
            branch: sub.branch().map(|b| b.to_string()),
        });
    }

    Ok(result)
}

pub fn init_submodule(repo_path: &Path, name: &str) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let mut sub = repo.find_submodule(name).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    sub.init(false).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: format!("Failed to init submodule: {}", e.message()),
    })?;

    Ok(())
}

pub fn update_submodule(repo_path: &Path, name: &str) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let mut sub = repo.find_submodule(name).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let mut opts = SubmoduleUpdateOptions::new();
    sub.update(true, Some(&mut opts)).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: format!("Failed to update submodule: {}", e.message()),
    })?;

    Ok(())
}

pub fn sync_submodule(repo_path: &Path, name: &str) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let mut sub = repo.find_submodule(name).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    sub.sync().map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: format!("Failed to sync submodule: {}", e.message()),
    })?;

    Ok(())
}

pub fn add_submodule(repo_path: &Path, url: &str, path: Option<&str>) -> Result<(), GitEngineError> {
    let mut cmd = std::process::Command::new("git");
    cmd.current_dir(repo_path);
    cmd.arg("submodule").arg("add").arg(url);
    
    if let Some(p) = path {
        if !p.trim().is_empty() {
            cmd.arg(p);
        }
    }
    
    let output = cmd.output().map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: format!("Failed to execute git submodule add: {}", e),
    })?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(GitEngineError::RepositoryError {
            path: repo_path.display().to_string(),
            message: format!("git submodule add failed: {}", stderr),
        });
    }
    
    Ok(())
}
