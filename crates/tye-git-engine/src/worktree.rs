use std::path::Path;
use git2::{Repository, WorktreeAddOptions};
use crate::error::GitEngineError;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub name: String,
    pub path: String,
    pub is_locked: bool,
    pub is_prunable: bool,
}

pub fn list_worktrees(repo_path: &Path) -> Result<Vec<WorktreeInfo>, GitEngineError> {
    let repo = Repository::open(repo_path).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let worktrees = repo.worktrees().map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let mut result = Vec::new();
    for name in worktrees.iter().flatten() {
        if let Ok(wt) = repo.find_worktree(name) {
            result.push(WorktreeInfo {
                name: wt.name().unwrap_or("").to_string(),
                path: wt.path().display().to_string(),
                is_locked: wt.is_locked().is_ok(),
                is_prunable: wt.is_prunable(None).unwrap_or(false),
            });
        }
    }

    Ok(result)
}

pub fn add_worktree(repo_path: &Path, name: &str, path: &str) -> Result<WorktreeInfo, GitEngineError> {
    let repo = Repository::open(repo_path).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let target_path = Path::new(path);
    let opts = WorktreeAddOptions::new();
    
    let wt = repo.worktree(name, target_path, Some(&opts)).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    Ok(WorktreeInfo {
        name: wt.name().unwrap_or(name).to_string(),
        path: wt.path().display().to_string(),
        is_locked: wt.is_locked().is_ok(),
        is_prunable: wt.is_prunable(None).unwrap_or(false),
    })
}

pub fn remove_worktree(repo_path: &Path, name: &str) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let wt = repo.find_worktree(name).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;
    
    // libgit2 prune will remove the worktree references, but it requires it to be prunable 
    // or we can just force it if we want, but libgit2 rust bindings don't expose a straightforward 'delete'.
    // Typically `git worktree remove` deletes the directory as well.
    // Let's rely on standard std::fs to remove the directory if it's there.
    let wt_path = wt.path().to_path_buf();
    
    // Attempt to prune metadata from the main repo
    let mut prune_opts = git2::WorktreePruneOptions::new();
    prune_opts.valid(true); // force prune even if it's considered valid
    if let Err(e) = wt.prune(Some(&mut prune_opts)) {
        return Err(GitEngineError::RepositoryError {
            path: repo_path.display().to_string(),
            message: format!("Failed to prune worktree: {}", e.message()),
        });
    }

    if wt_path.exists() {
        std::fs::remove_dir_all(&wt_path).map_err(|e| GitEngineError::RepositoryError {
            path: wt_path.display().to_string(),
            message: format!("Failed to remove directory: {}", e),
        })?;
    }

    Ok(())
}

pub fn lock_worktree(repo_path: &Path, name: &str, reason: &str) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let wt = repo.find_worktree(name).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    wt.lock(Some(reason)).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: format!("Failed to lock worktree: {}", e.message()),
    })?;

    Ok(())
}

pub fn unlock_worktree(repo_path: &Path, name: &str) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let wt = repo.find_worktree(name).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    wt.unlock().map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: format!("Failed to unlock worktree: {}", e.message()),
    })?;

    Ok(())
}
