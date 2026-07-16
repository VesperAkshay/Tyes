use crate::error::GitEngineError;
use git2::{Repository, MergeAnalysis, MergeOptions, build::CheckoutBuilder};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum MergeStrategy {
    FastForward,
    NoFastForward,
    Squash,
    FastForwardOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeAnalysisResult {
    pub is_up_to_date: bool,
    pub can_fast_forward: bool,
    pub is_normal_merge: bool,
    pub commits_ahead: usize,
    pub commits_behind: usize,
    pub conflict_probability: String, // e.g., "Low", "Medium", "High" based on file overlap
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeExecuteResult {
    pub success: bool,
    pub has_conflicts: bool,
    pub merge_commit_oid: Option<String>,
    pub message: String,
}

/// Analyze a potential merge from `source_branch` into current `HEAD` (`F-035`).
pub fn analyze_merge(repo_path: &Path, source_branch: &str) -> Result<MergeAnalysisResult, GitEngineError> {
    let repo = Repository::open(repo_path)?;
    let head = repo.head()?;
    let head_oid = head.target()
        .ok_or_else(|| GitEngineError::BranchError("Current HEAD is detached or invalid".to_string()))?;

    let source_ref = repo.find_reference(source_branch)
        .or_else(|_| repo.find_reference(&format!("refs/heads/{}", source_branch)))
        .or_else(|_| repo.find_reference(&format!("refs/remotes/{}", source_branch)))
        .map_err(|e| GitEngineError::BranchError(format!("Could not find source branch {}: {}", source_branch, e)))?;
    let source_oid = source_ref.target()
        .ok_or_else(|| GitEngineError::BranchError("Source branch target Oid invalid".to_string()))?;

    let annotated = repo.find_annotated_commit(source_oid)?;
    let (analysis, _preference) = repo.merge_analysis(&[&annotated])?;

    let is_up_to_date = analysis.contains(MergeAnalysis::ANALYSIS_UP_TO_DATE);
    let can_fast_forward = analysis.contains(MergeAnalysis::ANALYSIS_FASTFORWARD);
    let is_normal_merge = analysis.contains(MergeAnalysis::ANALYSIS_NORMAL);

    let (ahead, behind) = repo.graph_ahead_behind(source_oid, head_oid).unwrap_or((0, 0));

    // Calculate conflict probability by comparing touched file paths between common ancestor, head, and source
    let mut conflict_probability = "Low".to_string();
    if let Ok(base_oid) = repo.merge_base(head_oid, source_oid) {
        if let (Ok(base_tree), Ok(head_tree), Ok(source_tree)) = (
            repo.find_commit(base_oid).and_then(|c| c.tree()),
            repo.find_commit(head_oid).and_then(|c| c.tree()),
            repo.find_commit(source_oid).and_then(|c| c.tree()),
        ) {
            let mut head_files = std::collections::HashSet::new();
            let mut source_files = std::collections::HashSet::new();

            if let Ok(diff1) = repo.diff_tree_to_tree(Some(&base_tree), Some(&head_tree), None) {
                diff1.foreach(&mut |delta, _| {
                    if let Some(p) = delta.new_file().path() { head_files.insert(p.to_path_buf()); }
                    true
                }, None, None, None).ok();
            }

            if let Ok(diff2) = repo.diff_tree_to_tree(Some(&base_tree), Some(&source_tree), None) {
                diff2.foreach(&mut |delta, _| {
                    if let Some(p) = delta.new_file().path() { source_files.insert(p.to_path_buf()); }
                    true
                }, None, None, None).ok();
            }

            let overlap_count = head_files.intersection(&source_files).count();
            if overlap_count > 5 {
                conflict_probability = "High".to_string();
            } else if overlap_count > 0 {
                conflict_probability = "Medium".to_string();
            }
        }
    }

    Ok(MergeAnalysisResult {
        is_up_to_date,
        can_fast_forward,
        is_normal_merge,
        commits_ahead: ahead,
        commits_behind: behind,
        conflict_probability,
    })
}

/// Execute a merge of `source_branch` into current `HEAD` (`F-035`).
pub fn execute_merge(repo_path: &Path, source_branch: &str, strategy: MergeStrategy) -> Result<MergeExecuteResult, GitEngineError> {
    let repo = Repository::open(repo_path)?;

    let initial_index = repo.index()?;
    if initial_index.has_conflicts() {
        return Ok(MergeExecuteResult {
            success: false,
            has_conflicts: true,
            merge_commit_oid: None,
            message: "Cannot merge: the repository already has unresolved conflicts. Please resolve or abort pending conflicts first.".to_string(),
        });
    }

    let head = repo.head()?;
    let head_oid = head.target()
        .ok_or_else(|| GitEngineError::BranchError("Current HEAD invalid".to_string()))?;

    let source_ref = repo.find_reference(source_branch)
        .or_else(|_| repo.find_reference(&format!("refs/heads/{}", source_branch)))
        .or_else(|_| repo.find_reference(&format!("refs/remotes/{}", source_branch)))
        .map_err(|e| GitEngineError::BranchError(format!("Could not find branch {}: {}", source_branch, e)))?;
    let source_oid = source_ref.target()
        .ok_or_else(|| GitEngineError::BranchError("Source Oid invalid".to_string()))?;

    let annotated = repo.find_annotated_commit(source_oid)?;
    let (analysis, _preference) = repo.merge_analysis(&[&annotated])?;

    if analysis.contains(MergeAnalysis::ANALYSIS_UP_TO_DATE) {
        return Ok(MergeExecuteResult {
            success: true,
            has_conflicts: false,
            merge_commit_oid: Some(head_oid.to_string()),
            message: "Already up to date.".to_string(),
        });
    }

    if strategy == MergeStrategy::FastForwardOnly && !analysis.contains(MergeAnalysis::ANALYSIS_FASTFORWARD) {
        return Err(GitEngineError::BranchError("Fast-Forward only requested, but branch diverged.".to_string()));
    }

    // Handle Fast-Forward
    if analysis.contains(MergeAnalysis::ANALYSIS_FASTFORWARD) && strategy != MergeStrategy::NoFastForward && strategy != MergeStrategy::Squash {
        let mut head_ref = repo.head()?;
        let target_commit = repo.find_commit(source_oid)?;
        let mut checkout_builder = CheckoutBuilder::new();
        checkout_builder.force();

        repo.checkout_tree(target_commit.as_object(), Some(&mut checkout_builder))?;
        head_ref.set_target(source_oid, &format!("Fast-Forward merge of {}", source_branch))?;

        return Ok(MergeExecuteResult {
            success: true,
            has_conflicts: false,
            merge_commit_oid: Some(source_oid.to_string()),
            message: format!("Fast-forwarded to {}", source_branch),
        });
    }

    // Normal or No-FF Merge
    let mut merge_opts = MergeOptions::new();
    let mut checkout_opts = CheckoutBuilder::new();
    checkout_opts.allow_conflicts(true);

    if let Err(e) = repo.merge(&[&annotated], Some(&mut merge_opts), Some(&mut checkout_opts)) {
        let index = repo.index()?;
        if index.has_conflicts() {
            return Ok(MergeExecuteResult {
                success: false,
                has_conflicts: true,
                merge_commit_oid: None,
                message: "Merge paused due to conflicts. Please check and resolve conflicts.".to_string(),
            });
        }
        return Err(GitEngineError::ConflictError(format!("Merge of {} failed due to checkout conflicts or modified working tree files: {}", source_branch, e.message())));
    }

    let index = repo.index()?;
    if index.has_conflicts() {
        return Ok(MergeExecuteResult {
            success: false,
            has_conflicts: true,
            merge_commit_oid: None,
            message: "Merge paused due to index conflicts. Please resolve conflicts.".to_string(),
        });
    }

    // If Squash requested, write tree and commit with single parent
    if strategy == MergeStrategy::Squash {
        let mut index = repo.index()?;
        let tree_oid = index.write_tree()?;
        let tree = repo.find_tree(tree_oid)?;
        let parent_commit = repo.find_commit(head_oid)?;
        let sig = repo.signature().or_else(|_| git2::Signature::now("Tyegit User", "user@tye.local"))?;

        let msg = format!("Squashed commit of {}", source_branch);
        let commit_oid = repo.commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&parent_commit])?;
        repo.cleanup_state()?;

        return Ok(MergeExecuteResult {
            success: true,
            has_conflicts: false,
            merge_commit_oid: Some(commit_oid.to_string()),
            message: format!("Squash merged {} into current branch.", source_branch),
        });
    }

    // Standard merge commit
    let mut index = repo.index()?;
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;

    let parent1 = repo.find_commit(head_oid)?;
    let parent2 = repo.find_commit(source_oid)?;
    let sig = repo.signature().or_else(|_| git2::Signature::now("Tyegit User", "user@tye.local"))?;

    let msg = format!("Merge branch '{}'", source_branch);
    let commit_oid = repo.commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&parent1, &parent2])?;
    repo.cleanup_state()?;

    Ok(MergeExecuteResult {
        success: true,
        has_conflicts: false,
        merge_commit_oid: Some(commit_oid.to_string()),
        message: format!("Successfully merged {} with commit {}", source_branch, commit_oid),
    })
}
