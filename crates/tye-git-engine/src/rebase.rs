use crate::error::GitEngineError;
use git2::{Repository, RebaseOptions};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RebaseAction {
    Pick,
    Reword,
    Edit,
    Squash,
    Fixup,
    Drop,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebasePlanItem {
    pub commit_oid: String,
    pub action: RebaseAction,
    pub new_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebaseStatus {
    pub is_finished: bool,
    pub has_conflicts: bool,
    pub current_step: usize,
    pub total_steps: usize,
    pub message: String,
}

/// Start an interactive rebase of `HEAD` onto `upstream_ref` according to `plan` (`F-036`).
pub fn start_interactive_rebase(repo_path: &Path, upstream_ref: &str, plan: Vec<RebasePlanItem>) -> Result<RebaseStatus, GitEngineError> {
    let repo = Repository::open(repo_path)?;

    let initial_index = repo.index()?;
    if initial_index.has_conflicts() {
        return Ok(RebaseStatus {
            is_finished: false,
            has_conflicts: true,
            current_step: 0,
            total_steps: plan.len(),
            message: "Cannot start rebase: the repository already has unresolved conflicts. Please resolve or abort pending conflicts first.".to_string(),
        });
    }

    let head = repo.head()?;
    let branch_commit = head.peel_to_commit()?;

    let upstream = repo.find_reference(upstream_ref)
        .or_else(|_| repo.find_reference(&format!("refs/heads/{}", upstream_ref)))
        .or_else(|_| repo.find_reference(&format!("refs/remotes/{}", upstream_ref)))
        .map_err(|e| GitEngineError::RebaseError(format!("Upstream reference not found {}: {}", upstream_ref, e)))?;
    let upstream_annotated = repo.find_annotated_commit(upstream.target().unwrap())?;
    let branch_annotated = repo.find_annotated_commit(branch_commit.id())?;

    let mut rebase_opts = RebaseOptions::new();
    let mut rebase = repo.rebase(Some(&branch_annotated), Some(&upstream_annotated), None, Some(&mut rebase_opts))?;

    let sig = repo.signature().or_else(|_| git2::Signature::now("Tyegit User", "user@tye.local"))?;
    let total_steps = rebase.len();
    let mut current_step = 0;

    // Apply steps
    while let Some(op_result) = rebase.next() {
        current_step += 1;
        let op = match op_result {
            Ok(o) => o,
            Err(e) => {
                if repo.index()?.has_conflicts() {
                    return Ok(RebaseStatus {
                        is_finished: false,
                        has_conflicts: true,
                        current_step,
                        total_steps,
                        message: format!("Rebase paused due to conflict at step {}: {}", current_step, e.message()),
                    });
                }
                return Err(GitEngineError::RebaseError(format!("Rebase op failed: {}", e.message())));
            }
        };

        let oid_str = op.id().to_string();
        let plan_item = plan.iter().find(|item| item.commit_oid == oid_str);

        let action = plan_item.map(|i| &i.action).unwrap_or(&RebaseAction::Pick);

        match action {
            RebaseAction::Drop => {
                // Do nothing, don't commit
                continue;
            }
            RebaseAction::Reword => {
                if repo.index()?.has_conflicts() {
                    return Ok(RebaseStatus {
                        is_finished: false,
                        has_conflicts: true,
                        current_step,
                        total_steps,
                        message: "Rebase paused for conflict resolution during Reword.".to_string(),
                    });
                }
                let new_msg = plan_item.and_then(|i| i.new_message.as_ref()).cloned();
                let _ = rebase.commit(None, &sig, new_msg.as_deref());
            }
            RebaseAction::Edit => {
                // Pause for edit
                return Ok(RebaseStatus {
                    is_finished: false,
                    has_conflicts: false,
                    current_step,
                    total_steps,
                    message: "Rebase paused for user to edit commit.".to_string(),
                });
            }
            _ => {
                if repo.index()?.has_conflicts() {
                    return Ok(RebaseStatus {
                        is_finished: false,
                        has_conflicts: true,
                        current_step,
                        total_steps,
                        message: format!("Rebase paused due to conflict at step {}", current_step),
                    });
                }
                let _ = rebase.commit(None, &sig, None);
            }
        }
    }

    rebase.finish(None)?;

    Ok(RebaseStatus {
        is_finished: true,
        has_conflicts: false,
        current_step: total_steps,
        total_steps,
        message: "Interactive rebase completed successfully.".to_string(),
    })
}

/// Continue a rebase that was paused due to conflicts or `Edit` (`F-036`).
pub fn continue_rebase(repo_path: &Path) -> Result<RebaseStatus, GitEngineError> {
    let repo = Repository::open(repo_path)?;
    if repo.index()?.has_conflicts() {
        return Err(GitEngineError::ConflictError("Cannot continue rebase: index still has conflicts".to_string()));
    }

    let mut rebase = repo.open_rebase(None)?;
    let sig = repo.signature().or_else(|_| git2::Signature::now("Tyegit User", "user@tye.local"))?;
    let total_steps = rebase.len();
    let mut current_step = rebase.operation_current().unwrap_or(0);

    // Commit current step if needed
    let _ = rebase.commit(None, &sig, None);

    while let Some(op_result) = rebase.next() {
        current_step += 1;
        match op_result {
            Ok(_) => {
                if repo.index()?.has_conflicts() {
                    return Ok(RebaseStatus {
                        is_finished: false,
                        has_conflicts: true,
                        current_step,
                        total_steps,
                        message: format!("Rebase paused due to conflict at step {}", current_step),
                    });
                }
                let _ = rebase.commit(None, &sig, None);
            }
            Err(e) => {
                if repo.index()?.has_conflicts() {
                    return Ok(RebaseStatus {
                        is_finished: false,
                        has_conflicts: true,
                        current_step,
                        total_steps,
                        message: format!("Rebase paused due to conflict at step {}: {}", current_step, e),
                    });
                }
                return Err(GitEngineError::RebaseError(format!("Rebase step failed: {}", e)));
            }
        }
    }

    rebase.finish(None)?;

    Ok(RebaseStatus {
        is_finished: true,
        has_conflicts: false,
        current_step: total_steps,
        total_steps,
        message: "Rebase continued and completed successfully.".to_string(),
    })
}

/// Abort an ongoing rebase (`F-036`).
pub fn abort_rebase(repo_path: &Path) -> Result<(), GitEngineError> {
    crate::conflict::abort_merge_or_rebase(repo_path)
}
