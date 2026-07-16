use crate::error::GitEngineError;
use git2::Repository;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConflictFileItem {
    pub file_path: String,
    pub is_resolved: bool,
    pub has_base: bool,
    pub has_ours: bool,
    pub has_theirs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreeWayPanes {
    pub file_path: String,
    pub base_content: String,
    pub ours_content: String,
    pub theirs_content: String,
}

/// Retrieve all conflicted files currently in the repository index (`F-040`).
pub fn get_conflicted_files(repo_path: &Path) -> Result<Vec<ConflictFileItem>, GitEngineError> {
    let repo = Repository::open(repo_path)?;
    let index = repo.index()?;

    if !index.has_conflicts() {
        return Ok(Vec::new());
    }

    let conflicts = index.conflicts()?;
    let mut items = Vec::new();

    for c in conflicts {
        if let Ok(conflict) = c {
            let path_bytes = match (conflict.ancestor.as_ref(), conflict.our.as_ref(), conflict.their.as_ref()) {
                (Some(a), _, _) => &a.path,
                (_, Some(o), _) => &o.path,
                (_, _, Some(t)) => &t.path,
                _ => continue,
            };
            let path_str = String::from_utf8_lossy(path_bytes).to_string();

            // Check if working tree file exists and whether index entries for stage 1/2/3 are still present vs resolved
            // If conflict iterator returns it, it is currently unresolved in stage 1/2/3.
            items.push(ConflictFileItem {
                file_path: path_str,
                is_resolved: false,
                has_base: conflict.ancestor.is_some(),
                has_ours: conflict.our.is_some(),
                has_theirs: conflict.their.is_some(),
            });
        }
    }

    // Sort by path for consistent UI display
    items.sort_by(|a, b| a.file_path.cmp(&b.file_path));
    items.dedup_by(|a, b| a.file_path == b.file_path);

    Ok(items)
}

/// Retrieve the exact three-way blob contents (`BASE`, `OURS`, `THEIRS`) for a specific conflicted file (`F-040`).
pub fn get_three_way_content(repo_path: &Path, file_path: &str) -> Result<ThreeWayPanes, GitEngineError> {
    let repo = Repository::open(repo_path)?;
    let index = repo.index()?;

    if !index.has_conflicts() {
        return Err(GitEngineError::ConflictError("No active conflicts in repository index".to_string()));
    }

    let conflicts = index.conflicts()?;
    for c in conflicts {
        if let Ok(conflict) = c {
            let path_bytes = match (conflict.ancestor.as_ref(), conflict.our.as_ref(), conflict.their.as_ref()) {
                (Some(a), _, _) => &a.path,
                (_, Some(o), _) => &o.path,
                (_, _, Some(t)) => &t.path,
                _ => continue,
            };
            let path_str = String::from_utf8_lossy(path_bytes).to_string();

            if path_str == file_path {
                let base_content = if let Some(entry) = conflict.ancestor {
                    if let Ok(blob) = repo.find_blob(entry.id) {
                        String::from_utf8_lossy(blob.content()).to_string()
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                };

                let ours_content = if let Some(entry) = conflict.our {
                    if let Ok(blob) = repo.find_blob(entry.id) {
                        String::from_utf8_lossy(blob.content()).to_string()
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                };

                let theirs_content = if let Some(entry) = conflict.their {
                    if let Ok(blob) = repo.find_blob(entry.id) {
                        String::from_utf8_lossy(blob.content()).to_string()
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                };

                return Ok(ThreeWayPanes {
                    file_path: path_str,
                    base_content,
                    ours_content,
                    theirs_content,
                });
            }
        }
    }

    Err(GitEngineError::ConflictError(format!("Conflicted file not found in index: {}", file_path)))
}

/// Write the user's resolved content to the working directory and mark the file as resolved in the index (`stage 0`) (`F-040`).
pub fn resolve_conflict_file(repo_path: &Path, file_path: &str, resolved_content: &str) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path)?;
    let full_path = repo_path.join(file_path);

    // Write resolved content to disk
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&full_path, resolved_content)?;

    // Stage the file (stage 0) to mark conflict as resolved
    let mut index = repo.index()?;
    index.add_path(Path::new(file_path))?;
    index.write()?;

    Ok(())
}

/// Abort an ongoing merge or interactive rebase by cleaning index conflicts and resetting (`F-040`).
pub fn abort_merge_or_rebase(repo_path: &Path) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path)?;

    // Check if rebase is in progress (.git/rebase-merge or .git/rebase-apply)
    let git_dir = repo.path();
    let rebase_merge = git_dir.join("rebase-merge");
    let rebase_apply = git_dir.join("rebase-apply");

    if rebase_merge.exists() || rebase_apply.exists() {
        if let Ok(mut rebase) = repo.open_rebase(None) {
            let _ = rebase.abort();
        } else {
            // Manual cleanup of rebase folder and hard reset to ORIG_HEAD
            if let Ok(orig_head) = repo.find_reference("ORIG_HEAD") {
                if let Ok(commit) = orig_head.peel_to_commit() {
                    let mut opts = git2::build::CheckoutBuilder::new();
                    opts.force();
                    let _ = repo.reset(commit.as_object(), git2::ResetType::Hard, Some(&mut opts));
                }
            }
            if rebase_merge.exists() { let _ = std::fs::remove_dir_all(rebase_merge); }
            if rebase_apply.exists() { let _ = std::fs::remove_dir_all(rebase_apply); }
        }
    } else if repo.state() == git2::RepositoryState::Merge {
        repo.cleanup_state()?;
        if let Ok(head) = repo.head() {
            if let Ok(commit) = head.peel_to_commit() {
                let mut opts = git2::build::CheckoutBuilder::new();
                opts.force();
                repo.reset(commit.as_object(), git2::ResetType::Hard, Some(&mut opts))?;
            }
        }
    } else {
        // Just clear index conflicts if neither state file was found but conflicts existed
        let index = repo.index()?;
        if index.has_conflicts() {
            if let Ok(head) = repo.head() {
                if let Ok(commit) = head.peel_to_commit() {
                    let mut opts = git2::build::CheckoutBuilder::new();
                    opts.force();
                    repo.reset(commit.as_object(), git2::ResetType::Hard, Some(&mut opts))?;
                }
            }
        }
    }

    Ok(())
}

/// Continue an ongoing merge or rebase after all conflicts have been resolved (`F-040`).
pub fn continue_merge_or_rebase(repo_path: &Path) -> Result<String, GitEngineError> {
    let repo = Repository::open(repo_path)?;
    let mut index = repo.index()?;

    if index.has_conflicts() {
        return Err(GitEngineError::ConflictError("Cannot continue: there are still unresolved conflicts in the index".to_string()));
    }

    // Write index before committing
    index.write()?;

    // Check repository state
    match repo.state() {
        git2::RepositoryState::Merge => {
            // We are in the middle of a merge. Commit the merge result.
            let tree_oid = index.write_tree()?;
            let tree = repo.find_tree(tree_oid)?;

            let head_ref = repo.head()?;
            let parent1 = head_ref.peel_to_commit()?;

            let merge_head_path = repo.path().join("MERGE_HEAD");
            let merge_head_content = std::fs::read_to_string(&merge_head_path)
                .map_err(|e| GitEngineError::ConflictError(format!("Failed to read MERGE_HEAD: {}", e)))?;
            let parent2_oid = git2::Oid::from_str(merge_head_content.trim())
                .map_err(|e| GitEngineError::ConflictError(format!("Invalid MERGE_HEAD Oid: {}", e)))?;
            let parent2 = repo.find_commit(parent2_oid)?;

            let merge_msg_path = repo.path().join("MERGE_MSG");
            let msg = if merge_msg_path.exists() {
                std::fs::read_to_string(&merge_msg_path).unwrap_or_else(|_| format!("Merge commit {}", parent2.id()))
            } else {
                format!("Merge commit {}", parent2.id())
            };

            let sig = repo.signature().or_else(|_| git2::Signature::now("Tyegit User", "user@tye.local"))?;
            let commit_oid = repo.commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&parent1, &parent2])?;

            repo.cleanup_state()?;
            Ok(format!("Merge committed successfully: {}", commit_oid))
        }
        git2::RepositoryState::Rebase | git2::RepositoryState::RebaseInteractive | git2::RepositoryState::RebaseMerge => {
            if let Ok(mut rebase) = repo.open_rebase(None) {
                let sig = repo.signature().or_else(|_| git2::Signature::now("Tyegit User", "user@tye.local"))?;
                // Commit current rebase step
                let _ = rebase.commit(None, &sig, None);

                // Process remaining steps
                while let Some(op) = rebase.next() {
                    match op {
                        Ok(_) => {
                            if repo.index()?.has_conflicts() {
                                return Ok("Rebase paused: additional conflicts detected on next commit".to_string());
                            }
                            let _ = rebase.commit(None, &sig, None);
                        }
                        Err(e) => {
                            if repo.index()?.has_conflicts() {
                                return Ok("Rebase paused: additional conflicts detected on next commit".to_string());
                            }
                            return Err(GitEngineError::RebaseError(format!("Rebase step failed: {}", e)));
                        }
                    }
                }
                rebase.finish(None)?;
                Ok("Rebase completed successfully after conflict resolution".to_string())
            } else {
                Err(GitEngineError::RebaseError("Could not open active rebase state".to_string()))
            }
        }
        _ => {
            Ok("All conflicts resolved".to_string())
        }
    }
}
