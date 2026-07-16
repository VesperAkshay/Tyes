use crate::error::GitEngineError;
use git2::{Repository, RevertOptions, build::CheckoutBuilder};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevertResult {
    pub success: bool,
    pub has_conflicts: bool,
    pub new_commit_oid: Option<String>,
    pub message: String,
}

/// Revert a specific commit by creating an inverse commit (`F-038`).
pub fn execute_revert(repo_path: &Path, commit_oid_str: &str, mainline: Option<u32>) -> Result<RevertResult, GitEngineError> {
    let repo = Repository::open(repo_path)?;

    let initial_index = repo.index()?;
    if initial_index.has_conflicts() {
        return Ok(RevertResult {
            success: false,
            has_conflicts: true,
            new_commit_oid: None,
            message: "Cannot revert: the repository already has unresolved conflicts. Please resolve or abort pending conflicts first.".to_string(),
        });
    }

    let oid = git2::Oid::from_str(commit_oid_str)
        .map_err(|e| GitEngineError::BranchError(format!("Invalid commit Oid {}: {}", commit_oid_str, e)))?;
    let commit = repo.find_commit(oid)?;

    if commit.parent_count() > 1 && mainline.is_none() {
        return Err(GitEngineError::BranchError("Commit is a merge commit; mainline parent index (1-indexed) must be specified to revert.".to_string()));
    }

    let mut revert_opts = RevertOptions::new();
    if let Some(m) = mainline {
        revert_opts.mainline(m);
    }
    let mut checkout_opts = CheckoutBuilder::new();
    checkout_opts.allow_conflicts(true);
    revert_opts.checkout_builder(checkout_opts);

    if let Err(e) = repo.revert(&commit, Some(&mut revert_opts)) {
        let index = repo.index()?;
        if index.has_conflicts() {
            return Ok(RevertResult {
                success: false,
                has_conflicts: true,
                new_commit_oid: None,
                message: format!("Revert paused due to conflicts while reverting commit {}. Please check and resolve conflicts.", commit_oid_str),
            });
        }
        return Err(GitEngineError::ConflictError(format!("Revert of {} failed due to checkout conflicts or modified working tree files: {}", commit_oid_str, e.message())));
    }

    let index = repo.index()?;
    if index.has_conflicts() {
        return Ok(RevertResult {
            success: false,
            has_conflicts: true,
            new_commit_oid: None,
            message: format!("Revert paused due to index conflicts while reverting commit {}. Please resolve conflicts.", commit_oid_str),
        });
    }

    let mut index = repo.index()?;
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;

    let head_ref = repo.head()?;
    let parent_commit = head_ref.peel_to_commit()?;
    let sig = repo.signature().or_else(|_| git2::Signature::now("Tyegit User", "user@tye.local"))?;

    let original_subject = commit.summary().unwrap_or(commit_oid_str);
    let msg = format!("Revert \"{}\"\n\nThis reverts commit {}.", original_subject, commit_oid_str);

    let new_oid = repo.commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&parent_commit])?;
    repo.cleanup_state()?;

    Ok(RevertResult {
        success: true,
        has_conflicts: false,
        new_commit_oid: Some(new_oid.to_string()),
        message: format!("Successfully reverted commit {} with revert commit {}", commit_oid_str, new_oid),
    })
}
