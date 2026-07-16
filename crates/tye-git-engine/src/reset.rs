use crate::error::GitEngineError;
use git2::{Repository, ResetType, build::CheckoutBuilder};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ResetMode {
    Soft,
    Mixed,
    Hard,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResetResult {
    pub success: bool,
    pub target_oid: String,
    pub mode: ResetMode,
    pub message: String,
}

/// Reset current branch `HEAD` to `target_oid_str` using Soft, Mixed, or Hard mode (`F-039`).
pub fn execute_reset(repo_path: &Path, target_oid_str: &str, reset_type: ResetMode) -> Result<ResetResult, GitEngineError> {
    let repo = Repository::open(repo_path)?;
    let oid = git2::Oid::from_str(target_oid_str)
        .map_err(|e| GitEngineError::BranchError(format!("Invalid target Oid {}: {}", target_oid_str, e)))?;
    let target_object = repo.find_object(oid, None)?;

    let git_reset_type = match reset_type {
        ResetMode::Soft => ResetType::Soft,
        ResetMode::Mixed => ResetType::Mixed,
        ResetMode::Hard => ResetType::Hard,
    };

    let mut checkout_opts = CheckoutBuilder::new();
    if reset_type == ResetMode::Hard {
        checkout_opts.force();
    }

    repo.reset(
        &target_object,
        git_reset_type,
        if reset_type == ResetMode::Hard { Some(&mut checkout_opts) } else { None },
    )?;

    Ok(ResetResult {
        success: true,
        target_oid: target_oid_str.to_string(),
        mode: reset_type.clone(),
        message: match reset_type {
            ResetMode::Soft => format!("Soft reset HEAD to {}. Staged index kept intact.", target_oid_str),
            ResetMode::Mixed => format!("Mixed reset HEAD to {}. Staged index reset, working directory kept intact.", target_oid_str),
            ResetMode::Hard => format!("Hard reset HEAD to {}. Working tree and index reset completely.", target_oid_str),
        },
    })
}
