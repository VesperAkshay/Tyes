use crate::error::GitEngineError;
use git2::{Repository, CherrypickOptions, build::CheckoutBuilder};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CherryPickResult {
    pub success: bool,
    pub has_conflicts: bool,
    pub applied_count: usize,
    pub new_commit_oids: Vec<String>,
    pub message: String,
}

/// Execute cherry-pick of one or more commit OIDs sequentially (`F-037`).
pub fn execute_cherrypick(repo_path: &Path, commit_oids: Vec<String>, no_commit: bool) -> Result<CherryPickResult, GitEngineError> {
    let repo = Repository::open(repo_path)?;
    let mut applied_count = 0;
    let mut new_commit_oids = Vec::new();

    let initial_index = repo.index()?;
    if initial_index.has_conflicts() {
        return Ok(CherryPickResult {
            success: false,
            has_conflicts: true,
            applied_count: 0,
            new_commit_oids: Vec::new(),
            message: "Cannot cherry-pick: the repository already has unresolved conflicts. Please resolve or abort pending conflicts first.".to_string(),
        });
    }

    let mut cherrypick_opts = CherrypickOptions::new();
    let mut checkout_opts = CheckoutBuilder::new();
    checkout_opts.allow_conflicts(true);
    cherrypick_opts.checkout_builder(checkout_opts);

    for oid_str in &commit_oids {
        let oid = git2::Oid::from_str(oid_str)
            .map_err(|e| GitEngineError::BranchError(format!("Invalid commit Oid {}: {}", oid_str, e)))?;
        let commit = repo.find_commit(oid)?;

        if let Err(e) = repo.cherrypick(&commit, Some(&mut cherrypick_opts)) {
            let index = repo.index()?;
            if index.has_conflicts() {
                return Ok(CherryPickResult {
                    success: false,
                    has_conflicts: true,
                    applied_count,
                    new_commit_oids,
                    message: format!("Cherry-pick paused due to conflicts while applying commit {}. Please check and resolve conflicts.", oid_str),
                });
            }
            return Err(GitEngineError::ConflictError(format!("Cherry-pick of {} failed due to checkout conflicts or modified working tree files: {}", oid_str, e.message())));
        }

        let index = repo.index()?;
        if index.has_conflicts() {
            return Ok(CherryPickResult {
                success: false,
                has_conflicts: true,
                applied_count,
                new_commit_oids,
                message: format!("Cherry-pick paused due to index conflicts while applying commit {}. Please resolve conflicts.", oid_str),
            });
        }

        if !no_commit {
            let mut index = repo.index()?;
            let tree_oid = index.write_tree()?;
            let tree = repo.find_tree(tree_oid)?;

            let head_ref = repo.head()?;
            let parent_commit = head_ref.peel_to_commit()?;
            let sig = repo.signature().or_else(|_| git2::Signature::now("Tyegit User", "user@tye.local"))?;

            let original_msg = commit.message().unwrap_or("Cherry-picked commit");
            let msg = format!("{}\n\n(cherry picked from commit {})", original_msg.trim(), oid_str);

            let new_oid = repo.commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&parent_commit])?;
            repo.cleanup_state()?;

            applied_count += 1;
            new_commit_oids.push(new_oid.to_string());
        } else {
            applied_count += 1;
        }
    }

    Ok(CherryPickResult {
        success: true,
        has_conflicts: false,
        applied_count,
        new_commit_oids,
        message: if no_commit {
            format!("Cherry-picked {} commits to working tree without committing.", applied_count)
        } else {
            format!("Successfully cherry-picked {} commits.", applied_count)
        },
    })
}
