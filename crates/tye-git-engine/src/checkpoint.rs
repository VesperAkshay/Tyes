use std::path::Path;
use std::fs;
use git2::{Repository, StatusOptions, StashFlags, ResetType, Signature};
use serde::{Serialize, Deserialize};
use sqlx::{Pool, Sqlite, Row};
use uuid::Uuid;
use chrono::{Utc, Duration};
use crate::error::GitEngineError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ConflictRisk {
    None,
    Low,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackFileDelta {
    pub path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointItem {
    pub id: String,
    pub repo_path: String,
    pub timestamp: String,
    pub operation: String,
    pub head_before: String,
    pub head_after: Option<String>,
    pub branch_before: String,
    pub stash_oid: Option<String>,
    pub snapshot_json: String,
    pub ai_explanation: String,
    pub is_pinned: bool,
    pub custom_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackPreview {
    pub checkpoint_id: String,
    pub target_commit_short: String,
    pub commits_undone: usize,
    pub commits_restored: usize,
    pub files_modified: usize,
    pub files_added: usize,
    pub files_deleted: usize,
    pub conflict_risk: ConflictRisk,
    pub diff_summaries: Vec<RollbackFileDelta>,
    pub summary_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackResult {
    pub success: bool,
    pub restored_head: String,
    pub stash_applied: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecoveryType {
    LostCommit,
    DeletedBranch,
    ReflogEntry,
    DanglingBlob,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryItem {
    pub id: String,
    pub recovery_type: RecoveryType,
    pub commit_oid: String,
    pub short_oid: String,
    pub subject: String,
    pub timestamp: String,
    pub details: String,
}

/// Helper to get signature
fn get_signature(repo: &Repository) -> Result<Signature<'static>, GitEngineError> {
    repo.signature().or_else(|_| Signature::now("Tyegit User", "user@tye.local")).map_err(|e| GitEngineError::BranchError(e.message().to_string()))
}

/// Synchronous helper for pre-op capture to ensure git2 objects do not cross async boundary.
fn capture_pre_op_sync(repo_path: &Path, op_name: &str, stash_if_dirty: bool) -> Result<(String, String, Option<String>, Vec<String>), GitEngineError> {
    let repo = Repository::open(repo_path)?;
    let head = repo.head()?;
    let head_oid = head.target().ok_or_else(|| GitEngineError::BranchError("Current HEAD invalid".to_string()))?.to_string();
    let branch_before = head.shorthand().unwrap_or("HEAD").to_string();

    // Block if the index has unresolved conflicts. A conflicted index cannot
    // be stashed (git would error "cannot create a tree from a not fully merged
    // index") and a partial checkpoint would not capture the real working-tree
    // state accurately. The caller should resolve conflicts first.
    let index_has_conflicts = repo.index()
        .map(|idx| idx.has_conflicts())
        .unwrap_or(false);

    if index_has_conflicts {
        return Err(GitEngineError::BranchError(
            "Cannot create a checkpoint while conflicts are unresolved. \
             Resolve all conflicts in the 3-Way Conflict Resolver first, then try again."
                .to_string(),
        ));
    }

    let mut status_opts = StatusOptions::new();
    status_opts.include_untracked(true).include_ignored(false);
    let statuses = repo.statuses(Some(&mut status_opts))?;

    let mut stash_oid_str = None;
    let mut modified_files = Vec::new();

    for s in statuses.iter() {
        if let Some(p) = s.path() {
            modified_files.push(p.to_string());
        }
    }

    if !modified_files.is_empty() && stash_if_dirty {
        let sig = get_signature(&repo)?;
        let mut repo_mut = Repository::open(repo_path)?;
        let stash_msg = format!("time-machine: auto checkpoint before {}", op_name);
        match repo_mut.stash_save(&sig, &stash_msg, Some(StashFlags::DEFAULT | StashFlags::INCLUDE_UNTRACKED)) {
            Ok(oid) => {
                stash_oid_str = Some(oid.to_string());
            }
            Err(e) => {
                if !e.message().contains("nothing to stash") {
                    return Err(GitEngineError::BranchError(format!("Pre-op auto stash failed: {}", e.message())));
                }
            }
        }
    }

    Ok((head_oid, branch_before, stash_oid_str, modified_files))
}

/// Capture pre-op checkpoint (`F-042`) with **Upgrade 2 Smart Stash Filtering** (`!INCLUDE_IGNORED`).
pub async fn capture_pre_op(pool: &Pool<Sqlite>, repo_path: &Path, op_name: &str, stash_if_dirty: bool) -> Result<CheckpointItem, GitEngineError> {
    let (head_oid, branch_before, stash_oid_str, modified_files) = capture_pre_op_sync(repo_path, op_name, stash_if_dirty)?;

    let id = Uuid::new_v4().to_string();
    let timestamp = Utc::now().to_rfc3339();
    let snapshot_json = serde_json::to_string(&serde_json::json!({
        "modified_files_count": modified_files.len(),
        "modified_files": modified_files,
        "op_name": op_name,
    })).unwrap_or_else(|_| "{}".to_string());

    let ai_explanation = if let Some(ref st) = stash_oid_str {
        format!("Auto-saved checkpoint prior to '{}'. Stashed {} uncommitted file changes (Stash {}).", op_name, modified_files.len(), &st[..7.min(st.len())])
    } else {
        format!("Auto-saved checkpoint prior to '{}'. Worktree clean, commit pinned at {}.", op_name, &head_oid[..7.min(head_oid.len())])
    };

    let item = CheckpointItem {
        id: id.clone(),
        repo_path: repo_path.display().to_string(),
        timestamp: timestamp.clone(),
        operation: op_name.to_string(),
        head_before: head_oid.clone(),
        head_after: None,
        branch_before: branch_before.clone(),
        stash_oid: stash_oid_str.clone(),
        snapshot_json: snapshot_json.clone(),
        ai_explanation: ai_explanation.clone(),
        is_pinned: false,
        custom_label: None,
    };

    sqlx::query(
        r#"
        INSERT INTO git_checkpoints (id, repo_path, timestamp, operation, head_before, head_after, branch_before, stash_oid, snapshot_json, ai_explanation, is_pinned, custom_label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
        "#
    )
    .bind(&item.id)
    .bind(&item.repo_path)
    .bind(&item.timestamp)
    .bind(&item.operation)
    .bind(&item.head_before)
    .bind(&item.head_after)
    .bind(&item.branch_before)
    .bind(&item.stash_oid)
    .bind(&item.snapshot_json)
    .bind(&item.ai_explanation)
    .execute(pool)
    .await?;

    Ok(item)
}

/// Capture manual pin (**Upgrade 4 Manual Pinning & Recovery Anchors**)
pub async fn capture_manual_pin(pool: &Pool<Sqlite>, repo_path: &Path, custom_label: &str, explanation: Option<&str>) -> Result<CheckpointItem, GitEngineError> {
    let mut item = capture_pre_op(pool, repo_path, "Manual Pin", true).await?;
    item.is_pinned = true;
    item.custom_label = Some(custom_label.to_string());
    if let Some(exp) = explanation {
        item.ai_explanation = exp.to_string();
    } else {
        item.ai_explanation = format!("User pinned recovery state: '{}'", custom_label);
    }

    sqlx::query("UPDATE git_checkpoints SET is_pinned = 1, custom_label = ?, ai_explanation = ? WHERE id = ?")
        .bind(&item.custom_label)
        .bind(&item.ai_explanation)
        .bind(&item.id)
        .execute(pool)
        .await?;

    Ok(item)
}

/// Toggle pin status of existing checkpoint (**Upgrade 4**)
pub async fn toggle_pin_status(pool: &Pool<Sqlite>, checkpoint_id: &str, is_pinned: bool) -> Result<(), GitEngineError> {
    sqlx::query("UPDATE git_checkpoints SET is_pinned = ? WHERE id = ?")
        .bind(if is_pinned { 1 } else { 0 })
        .bind(checkpoint_id)
        .execute(pool)
        .await?;
    Ok(())
}

fn get_external_transitions_sync(repo_path: &Path) -> Result<Vec<(String, String, String)>, GitEngineError> {
    let repo = Repository::open(repo_path)?;
    let mut transitions = Vec::new();
    if let Ok(reflog) = repo.reflog("HEAD") {
        for entry in reflog.iter() {
            let msg = entry.message().unwrap_or("HEAD change").to_string();
            let is_external = msg.starts_with("reset:") || msg.starts_with("rebase:") || msg.starts_with("checkout: moving from") || msg.starts_with("merge:");
            if is_external {
                let oid_old = entry.id_old().to_string();
                let oid_new = entry.id_new().to_string();
                if oid_old != oid_new && oid_old != "0000000000000000000000000000000000000000" {
                    transitions.push((oid_old, oid_new, msg));
                }
            }
        }
    }
    Ok(transitions)
}

/// Capture external CLI reflog transitions (**Upgrade 1 Terminal-Proofing**)
pub async fn capture_external_cli_op(pool: &Pool<Sqlite>, repo_path: &Path) -> Result<Vec<CheckpointItem>, GitEngineError> {
    let transitions = get_external_transitions_sync(repo_path)?;
    let mut new_checkpoints = Vec::new();
    let repo_path_str = repo_path.display().to_string();

    for (oid_old, oid_new, msg) in transitions {
        let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM git_checkpoints WHERE repo_path = ? AND head_before = ? AND operation LIKE 'External CLI%'")
            .bind(&repo_path_str)
            .bind(&oid_old)
            .fetch_one(pool)
            .await
            .unwrap_or((0,));

        if exists.0 == 0 {
            let id = Uuid::new_v4().to_string();
            let timestamp = Utc::now().to_rfc3339();
            let item = CheckpointItem {
                id: id.clone(),
                repo_path: repo_path_str.clone(),
                timestamp: timestamp.clone(),
                operation: format!("External CLI: {}", msg),
                head_before: oid_old.clone(),
                head_after: Some(oid_new.clone()),
                branch_before: "Terminal/HEAD".to_string(),
                stash_oid: None,
                snapshot_json: "{\"source\": \"external_cli\"}".to_string(),
                ai_explanation: format!("Detected terminal command: '{}'. Previous HEAD ({}) preserved.", msg, &oid_old[..7.min(oid_old.len())]),
                is_pinned: false,
                custom_label: None,
            };

            sqlx::query(
                r#"
                INSERT INTO git_checkpoints (id, repo_path, timestamp, operation, head_before, head_after, branch_before, stash_oid, snapshot_json, ai_explanation, is_pinned, custom_label)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
                "#
            )
            .bind(&item.id)
            .bind(&item.repo_path)
            .bind(&item.timestamp)
            .bind(&item.operation)
            .bind(&item.head_before)
            .bind(&item.head_after)
            .bind(&item.branch_before)
            .bind(&item.stash_oid)
            .bind(&item.snapshot_json)
            .bind(&item.ai_explanation)
            .execute(pool)
            .await?;

            new_checkpoints.push(item);
        }
    }

    Ok(new_checkpoints)
}

/// Install terminal hooks (`post-checkout`, `pre-rebase`, `post-merge`) (**Upgrade 1 Terminal-Proofing**)
pub fn install_terminal_hooks(repo_path: &Path) -> Result<String, GitEngineError> {
    let hooks_dir = repo_path.join(".git").join("hooks");
    if !hooks_dir.exists() {
        fs::create_dir_all(&hooks_dir)?;
    }

    let hook_script = r#"#!/bin/sh
# Tyegit Terminal-Proofing Hook (Upgrade 1)
# Auto-syncs external CLI transitions with Tyegit Time Machine
if command -v tyegit >/dev/null 2>&1; then
    tyegit checkpoint-save --auto 2>/dev/null || true
fi
"#;

    for hook_name in &["post-checkout", "pre-rebase", "post-merge"] {
        let p = hooks_dir.join(hook_name);
        fs::write(&p, hook_script)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&p)?.permissions();
            perms.set_mode(0o755);
            let _ = fs::set_permissions(&p, perms);
        }
    }

    Ok("Successfully installed terminal hooks across post-checkout, pre-rebase, and post-merge.".to_string())
}

fn preview_rollback_impact_sync(repo_path: &Path, checkpoint_id: &str, target_oid_str: &str) -> Result<RollbackPreview, GitEngineError> {
    let repo = Repository::open(repo_path)?;
    let head = repo.head()?;
    let current_oid = head.target().ok_or_else(|| GitEngineError::BranchError("Current HEAD invalid".to_string()))?;

    let target_oid = git2::Oid::from_str(target_oid_str)
        .map_err(|e| GitEngineError::BranchError(format!("Invalid Oid {}: {}", target_oid_str, e.message())))?;

    let (ahead, behind) = repo.graph_ahead_behind(current_oid, target_oid).unwrap_or((0, 0));

    let current_tree = repo.find_commit(current_oid)?.tree()?;
    let target_tree = repo.find_commit(target_oid)?.tree()?;
    let diff = repo.diff_tree_to_tree(Some(&current_tree), Some(&target_tree), None)?;

    let mut files_modified = 0;
    let mut files_added = 0;
    let mut files_deleted = 0;
    let mut diff_summaries = Vec::new();

    diff.foreach(
        &mut |delta, _progress| {
            let status = delta.status();
            let path = delta.new_file().path().or_else(|| delta.old_file().path())
                .map(|p| p.display().to_string()).unwrap_or_else(|| "unknown".to_string());
            
            match status {
                git2::Delta::Added => files_added += 1,
                git2::Delta::Deleted => files_deleted += 1,
                _ => files_modified += 1,
            }

            let status_str = match status {
                git2::Delta::Added => "Added",
                git2::Delta::Deleted => "Deleted",
                git2::Delta::Modified => "Modified",
                _ => "Changed",
            }.to_string();

            diff_summaries.push(RollbackFileDelta {
                path,
                status: status_str,
                additions: 0,
                deletions: 0,
            });
            true
        },
        None, None, None
    )?;

    let mut status_opts = StatusOptions::new();
    status_opts.include_untracked(true).include_ignored(false);
    let statuses = repo.statuses(Some(&mut status_opts))?;
    
    let mut conflict_risk = ConflictRisk::None;
    if !statuses.is_empty() {
        conflict_risk = ConflictRisk::Low;
        for s in statuses.iter() {
            if let Some(p) = s.path() {
                if diff_summaries.iter().any(|d| d.path == p) {
                    conflict_risk = ConflictRisk::High;
                    break;
                }
            }
        }
    }

    let summary_text = format!(
        "Rollback from {} to {} will undo {} commit(s) and alter {} file(s). Conflict risk: {:?}.",
        &current_oid.to_string()[..7],
        &target_oid_str[..7.min(target_oid_str.len())],
        ahead,
        files_modified + files_added + files_deleted,
        conflict_risk
    );

    Ok(RollbackPreview {
        checkpoint_id: checkpoint_id.to_string(),
        target_commit_short: target_oid_str[..7.min(target_oid_str.len())].to_string(),
        commits_undone: ahead,
        commits_restored: behind,
        files_modified,
        files_added,
        files_deleted,
        conflict_risk,
        diff_summaries,
        summary_text,
    })
}

/// Sandbox Rollback Preview (**Upgrade 3 Sandbox Rollback Preview**)
pub async fn preview_rollback_impact(pool: &Pool<Sqlite>, repo_path: &Path, checkpoint_id: &str) -> Result<RollbackPreview, GitEngineError> {
    let row = sqlx::query("SELECT head_before, stash_oid, operation, timestamp FROM git_checkpoints WHERE id = ?")
        .bind(checkpoint_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| GitEngineError::BranchError(format!("Checkpoint {} not found", checkpoint_id)))?;

    let target_oid_str: String = row.get("head_before");
    preview_rollback_impact_sync(repo_path, checkpoint_id, &target_oid_str)
}

fn rollback_checkpoint_sync(repo_path: &Path, head_before_str: &str, stash_oid_str: Option<&str>) -> Result<(bool, String), GitEngineError> {
    let mut repo = Repository::open(repo_path)?;
    let target_oid = git2::Oid::from_str(head_before_str)
        .map_err(|e| GitEngineError::BranchError(format!("Invalid commit Oid {}: {}", head_before_str, e.message())))?;
    {
        let target_commit = repo.find_commit(target_oid)?;
        repo.reset(target_commit.as_object(), ResetType::Hard, None)?;
    }

    let mut stash_applied = false;
    let mut msg = format!("Successfully rolled back HEAD to commit {}.", &head_before_str[..7.min(head_before_str.len())]);

    if let Some(st_oid) = stash_oid_str {
        if let Ok(_oid) = git2::Oid::from_str(st_oid) {
            let mut stash_idx = None;
            let _ = repo.stash_foreach(|idx, _name, id| {
                if id.to_string() == st_oid {
                    stash_idx = Some(idx);
                    false
                } else {
                    true
                }
            });

            if let Some(idx) = stash_idx {
                let mut checkout_opts = git2::build::CheckoutBuilder::new();
                checkout_opts.allow_conflicts(true);
                let mut stash_opts = git2::StashApplyOptions::new();
                stash_opts.checkout_options(checkout_opts);

                if let Ok(_) = repo.stash_pop(idx, Some(&mut stash_opts)) {
                    stash_applied = true;
                    msg.push_str(" Restored auto-stashed uncommitted changes.");
                } else if let Ok(_) = repo.stash_apply(idx, Some(&mut stash_opts)) {
                    stash_applied = true;
                    msg.push_str(" Applied auto-stashed uncommitted changes.");
                }
            }
        }
    }

    Ok((stash_applied, msg))
}

/// Rollback to specific checkpoint (`F-042`)
pub async fn rollback_checkpoint(pool: &Pool<Sqlite>, repo_path: &Path, checkpoint_id: &str) -> Result<RollbackResult, GitEngineError> {
    capture_pre_op(pool, repo_path, &format!("Rollback to {}", &checkpoint_id[..8.min(checkpoint_id.len())]), true).await?;

    let row = sqlx::query("SELECT head_before, stash_oid, branch_before FROM git_checkpoints WHERE id = ?")
        .bind(checkpoint_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| GitEngineError::BranchError(format!("Checkpoint {} not found", checkpoint_id)))?;

    let head_before_str: String = row.get("head_before");
    let stash_oid_str: Option<String> = row.get("stash_oid");

    let (stash_applied, msg) = rollback_checkpoint_sync(repo_path, &head_before_str, stash_oid_str.as_deref())?;

    Ok(RollbackResult {
        success: true,
        restored_head: head_before_str,
        stash_applied,
        message: msg,
    })
}

/// List checkpoints (`F-042`)
pub async fn list_checkpoints(pool: &Pool<Sqlite>, repo_path: &Path, limit: usize, only_pinned: bool) -> Result<Vec<CheckpointItem>, GitEngineError> {
    let repo_path_str = repo_path.display().to_string();
    
    let query = if only_pinned {
        "SELECT id, repo_path, timestamp, operation, head_before, head_after, branch_before, stash_oid, snapshot_json, ai_explanation, is_pinned, custom_label FROM git_checkpoints WHERE repo_path = ? AND is_pinned = 1 ORDER BY timestamp DESC LIMIT ?"
    } else {
        "SELECT id, repo_path, timestamp, operation, head_before, head_after, branch_before, stash_oid, snapshot_json, ai_explanation, is_pinned, custom_label FROM git_checkpoints WHERE repo_path = ? ORDER BY timestamp DESC LIMIT ?"
    };

    let rows = sqlx::query(query)
        .bind(&repo_path_str)
        .bind(limit as i64)
        .fetch_all(pool)
        .await?;

    let mut items = Vec::new();
    for row in rows {
        let is_pinned_int: i64 = row.get("is_pinned");
        items.push(CheckpointItem {
            id: row.get("id"),
            repo_path: row.get("repo_path"),
            timestamp: row.get("timestamp"),
            operation: row.get("operation"),
            head_before: row.get("head_before"),
            head_after: row.get("head_after"),
            branch_before: row.get("branch_before"),
            stash_oid: row.get("stash_oid"),
            snapshot_json: row.get("snapshot_json"),
            ai_explanation: row.get("ai_explanation"),
            is_pinned: is_pinned_int == 1,
            custom_label: row.get("custom_label"),
        });
    }

    Ok(items)
}

/// Prune old unpinned checkpoints (**Upgrade 2 Auto-Pruning**)
pub async fn prune_old_checkpoints(pool: &Pool<Sqlite>, repo_path: &Path, retention_days: i64) -> Result<usize, GitEngineError> {
    let repo_path_str = repo_path.display().to_string();
    let cutoff = (Utc::now() - Duration::try_days(retention_days).unwrap_or(Duration::days(30))).to_rfc3339();

    let result = sqlx::query("DELETE FROM git_checkpoints WHERE repo_path = ? AND is_pinned = 0 AND timestamp < ?")
        .bind(&repo_path_str)
        .bind(&cutoff)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() as usize)
}

/// Manually delete a single checkpoint (`F-042`).
///
/// The caller is responsible for showing a confirmation prompt before calling
/// this function. If the checkpoint is pinned, `was_pinned` is returned as
/// `true` so the frontend can enforce a stricter second confirmation.
///
/// Stash entries tied to the checkpoint are **not** automatically dropped —
/// they remain in the stash list so the user can manually inspect or apply
/// them. This is a deliberate safety choice.
pub async fn delete_checkpoint(pool: &Pool<Sqlite>, checkpoint_id: &str) -> Result<DeleteCheckpointResult, GitEngineError> {
    let row = sqlx::query(
        "SELECT id, custom_label, operation, is_pinned FROM git_checkpoints WHERE id = ?"
    )
    .bind(checkpoint_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| GitEngineError::BranchError(format!("Checkpoint '{}' not found.", checkpoint_id)))?;

    let was_pinned: bool = {
        let v: i64 = row.get("is_pinned");
        v == 1
    };
    let label: Option<String> = row.get("custom_label");
    let operation: String = row.get("operation");
    let display_name = label.clone().unwrap_or_else(|| operation.clone());

    sqlx::query("DELETE FROM git_checkpoints WHERE id = ?")
        .bind(checkpoint_id)
        .execute(pool)
        .await?;

    Ok(DeleteCheckpointResult {
        deleted_id: checkpoint_id.to_string(),
        display_name,
        was_pinned,
    })
}

/// Result of a manual checkpoint deletion.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeleteCheckpointResult {
    /// The UUID of the deleted checkpoint.
    pub deleted_id: String,
    /// Human-readable label or operation name of the deleted checkpoint.
    pub display_name: String,
    /// Whether the deleted checkpoint was pinned (used by the frontend
    /// to determine if the user bypassed the strict second confirmation).
    pub was_pinned: bool,
}

/// Get Recovery Center items (`F-042` Recovery Center)
pub fn get_recovery_center_items(repo_path: &Path) -> Result<Vec<RecoveryItem>, GitEngineError> {
    let repo = Repository::open(repo_path)?;
    let mut items = Vec::new();

    if let Ok(reflog) = repo.reflog("HEAD") {
        for entry in reflog.iter() {
            let oid = entry.id_old();
            if oid.is_zero() {
                continue;
            }
            if let Ok(commit) = repo.find_commit(oid) {
                let mut is_reachable = false;
                if let Ok(branches) = repo.branches(Some(git2::BranchType::Local)) {
                    for b in branches {
                        if let Ok((branch, _)) = b {
                            if let Some(target) = branch.get().target() {
                                if target == oid || repo.graph_descendant_of(target, oid).unwrap_or(false) {
                                    is_reachable = true;
                                    break;
                                }
                            }
                        }
                    }
                }

                if !is_reachable {
                    let oid_str = oid.to_string();
                    if !items.iter().any(|i: &RecoveryItem| i.commit_oid == oid_str) {
                        let short_str = oid_str[..7.min(oid_str.len())].to_string();
                        let subject = commit.summary().unwrap_or("No subject").to_string();
                        let timestamp = chrono::DateTime::<Utc>::from_timestamp(commit.time().seconds(), 0)
                            .map(|dt| dt.to_rfc3339()).unwrap_or_else(|| Utc::now().to_rfc3339());
                        
                        items.push(RecoveryItem {
                            id: Uuid::new_v4().to_string(),
                            recovery_type: RecoveryType::LostCommit,
                            commit_oid: oid_str,
                            short_oid: short_str,
                            subject,
                            timestamp,
                            details: format!("Unreferenced commit found in reflog: {}", entry.message().unwrap_or("HEAD movement")),
                        });
                    }
                }
            }
        }
    }

    Ok(items)
}
