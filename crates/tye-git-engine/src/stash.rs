use crate::error::GitEngineError;
use git2::{Repository, StashFlags, StashApplyOptions, build::CheckoutBuilder};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StashItem {
    pub index: usize,
    pub message: String,
    pub stash_oid: String,
}

/// Retrieve the list of all stored stashes in the repository (`F-041`).
pub fn list_stashes(repo_path: &Path) -> Result<Vec<StashItem>, GitEngineError> {
    let mut repo = Repository::open(repo_path)?;
    let mut items = Vec::new();

    let _ = repo.stash_foreach(|index, message, oid| {
        items.push(StashItem {
            index,
            message: message.to_string(),
            stash_oid: oid.to_string(),
        });
        true
    });

    Ok(items)
}

/// Save current working directory (and optionally untracked) modifications to a new stash (`F-041`).
pub fn save_stash(
    repo_path: &Path,
    message: Option<&str>,
    include_untracked: bool,
    keep_index: bool,
) -> Result<StashItem, GitEngineError> {
    let mut repo = Repository::open(repo_path)?;
    let sig = repo.signature().or_else(|_| git2::Signature::now("Tyegit User", "user@tye.local"))?;

    let mut flags = StashFlags::DEFAULT;
    if include_untracked {
        flags |= StashFlags::INCLUDE_UNTRACKED;
    }
    if keep_index {
        flags |= StashFlags::KEEP_INDEX;
    }

    let msg = message.unwrap_or("WIP on branch");
    let oid = repo.stash_save(&sig, msg, Some(flags))
        .map_err(|e| GitEngineError::StashError(format!("Failed to save stash: {}", e)))?;

    Ok(StashItem {
        index: 0,
        message: msg.to_string(),
        stash_oid: oid.to_string(),
    })
}

/// Apply a stash by index without dropping it (`F-041`).
pub fn apply_stash(repo_path: &Path, index: usize) -> Result<String, GitEngineError> {
    let mut repo = Repository::open(repo_path)?;

    let mut checkout_opts = CheckoutBuilder::new();
    checkout_opts.allow_conflicts(true);

    let mut apply_opts = StashApplyOptions::new();
    apply_opts.checkout_options(checkout_opts);

    match repo.stash_apply(index, Some(&mut apply_opts)) {
        Ok(_) => {
            if repo.index()?.has_conflicts() {
                Ok("Stash applied with conflicts. Please resolve index conflicts.".to_string())
            } else {
                Ok("Stash applied cleanly.".to_string())
            }
        }
        Err(e) => Err(GitEngineError::StashError(format!("Failed to apply stash {}: {}", index, e))),
    }
}

/// Pop a stash by index (apply and then drop if applied without error) (`F-041`).
pub fn pop_stash(repo_path: &Path, index: usize) -> Result<String, GitEngineError> {
    let mut repo = Repository::open(repo_path)?;

    let mut checkout_opts = CheckoutBuilder::new();
    checkout_opts.allow_conflicts(true);

    let mut apply_opts = StashApplyOptions::new();
    apply_opts.checkout_options(checkout_opts);

    match repo.stash_pop(index, Some(&mut apply_opts)) {
        Ok(_) => {
            if repo.index()?.has_conflicts() {
                Ok("Stash popped with conflicts. Please check conflict resolver.".to_string())
            } else {
                Ok("Stash popped cleanly.".to_string())
            }
        }
        Err(e) => Err(GitEngineError::StashError(format!("Failed to pop stash {}: {}", index, e))),
    }
}

/// Drop (delete) a stash by its index (`F-041`).
pub fn drop_stash(repo_path: &Path, index: usize) -> Result<(), GitEngineError> {
    let mut repo = Repository::open(repo_path)?;
    repo.stash_drop(index)
        .map_err(|e| GitEngineError::StashError(format!("Failed to drop stash {}: {}", index, e)))?;
    Ok(())
}
