use std::path::Path;
use serde::{Deserialize, Serialize};
use git2::{BranchType, Repository, StatusOptions};
use crate::error::GitEngineError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BranchItem {
    pub name: String,
    pub shorthand: String,
    pub is_head: bool,
    pub is_remote: bool,
    pub upstream_name: Option<String>,
    pub last_commit_id: String,
    pub last_commit_subject: String,
    pub last_commit_time: i64,
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchList {
    pub local: Vec<BranchItem>,
    pub remote: Vec<BranchItem>,
    pub active_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CheckoutStrategy {
    Clean,
    StashAndCheckout,
    DiscardAndCheckout,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum CheckoutResult {
    Success {
        branch: String,
        stashed: bool,
    },
    Dirty {
        affected_files: Vec<String>,
        suggestion: String,
    },
}

pub fn get_branches(repo_path: &Path) -> Result<BranchList, GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    let mut local = Vec::new();
    let mut remote = Vec::new();
    let mut active_branch = String::from("DETACHED");

    if let Ok(head) = repo.head() {
        if let Some(name) = head.shorthand() {
            if head.is_branch() {
                active_branch = name.to_string();
            }
        }
    }

    let branches = repo.branches(None)?;
    for branch_res in branches {
        let (branch, branch_type) = branch_res?;
        let name = match branch.name()? {
            Some(n) => n.to_string(),
            None => continue,
        };

        let is_head = branch.is_head();
        let is_remote = branch_type == BranchType::Remote;
        let shorthand = if is_remote {
            if name.starts_with("origin/") {
                name["origin/".len()..].to_string()
            } else {
                name.clone()
            }
        } else {
            name.clone()
        };

        let upstream_name = match branch.upstream() {
            Ok(up) => up.name()?.map(|s| s.to_string()),
            Err(_) => None,
        };

        let mut last_commit_id = String::new();
        let mut last_commit_subject = String::new();
        let mut last_commit_time = 0i64;
        let mut ahead = 0usize;
        let mut behind = 0usize;

        if let Ok(target) = branch.get().peel_to_commit() {
            last_commit_id = target.id().to_string();
            last_commit_subject = target.summary().unwrap_or("").to_string();
            last_commit_time = target.time().seconds();

            if !is_remote {
                if let Ok(up) = branch.upstream() {
                    if let Ok(up_target) = up.get().peel_to_commit() {
                        if let Ok((a, b)) = repo.graph_ahead_behind(target.id(), up_target.id()) {
                            ahead = a;
                            behind = b;
                        }
                    }
                }
            }
        }

        let item = BranchItem {
            name,
            shorthand,
            is_head,
            is_remote,
            upstream_name,
            last_commit_id,
            last_commit_subject,
            last_commit_time,
            ahead,
            behind,
        };

        if is_remote {
            remote.push(item);
        } else {
            local.push(item);
        }
    }

    local.sort_by(|a, b| {
        if a.is_head {
            std::cmp::Ordering::Less
        } else if b.is_head {
            std::cmp::Ordering::Greater
        } else {
            b.last_commit_time.cmp(&a.last_commit_time)
        }
    });

    remote.sort_by(|a, b| b.last_commit_time.cmp(&a.last_commit_time));

    Ok(BranchList {
        local,
        remote,
        active_branch,
    })
}

pub fn create_branch(repo_path: &Path, name: &str, target_commit: Option<&str>) -> Result<BranchItem, GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    let commit = match target_commit {
        Some(cid) => {
            let oid = git2::Oid::from_str(cid)
                .map_err(|e| GitEngineError::BranchError(format!("Invalid commit ID {}: {}", cid, e)))?;
            repo.find_commit(oid)?
        }
        None => {
            let head = repo.head()
                .map_err(|_| GitEngineError::BranchError("Repository has no HEAD commit to branch from".into()))?;
            head.peel_to_commit()?
        }
    };

    let branch = repo.branch(name, &commit, false)?;
    let is_head = branch.is_head();
    let shorthand = name.to_string();

    Ok(BranchItem {
        name: name.to_string(),
        shorthand,
        is_head,
        is_remote: false,
        upstream_name: None,
        last_commit_id: commit.id().to_string(),
        last_commit_subject: commit.summary().unwrap_or("").to_string(),
        last_commit_time: commit.time().seconds(),
        ahead: 0,
        behind: 0,
    })
}

pub fn delete_branch(repo_path: &Path, name: &str, force: bool) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    let mut branch = repo.find_branch(name, BranchType::Local)?;
    if branch.is_head() {
        return Err(GitEngineError::BranchError(format!("Cannot delete active checked out branch '{}'", name)));
    }

    if !force {
        // Check if merged into HEAD
        if let Ok(head_commit) = repo.head().and_then(|h| h.peel_to_commit()) {
            if let Ok(branch_commit) = branch.get().peel_to_commit() {
                if let Ok(is_merged) = repo.graph_descendant_of(head_commit.id(), branch_commit.id()) {
                    if !is_merged && head_commit.id() != branch_commit.id() {
                        return Err(GitEngineError::BranchError(format!("Branch '{}' is not fully merged. Use force delete (-D) to delete anyway.", name)));
                    }
                }
            }
        }
    }

    branch.delete()?;
    Ok(())
}

pub fn rename_branch(repo_path: &Path, old_name: &str, new_name: &str) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    let mut branch = repo.find_branch(old_name, BranchType::Local)?;
    branch.rename(new_name, false)?;
    Ok(())
}

pub fn set_branch_upstream(repo_path: &Path, branch_name: &str, upstream_name: Option<&str>) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    let mut branch = repo.find_branch(branch_name, BranchType::Local)?;
    branch.set_upstream(upstream_name)?;
    Ok(())
}

pub fn checkout_branch(repo_path: &Path, name: &str, strategy: CheckoutStrategy) -> Result<CheckoutResult, GitEngineError> {
    let mut repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    let mut dirty_files = Vec::new();
    {
        let mut status_opts = StatusOptions::new();
        status_opts.include_untracked(false).include_ignored(false);
        let statuses = repo.statuses(Some(&mut status_opts))?;

        for entry in statuses.iter() {
            let status = entry.status();
            if status.intersects(
                git2::Status::INDEX_NEW
                    | git2::Status::INDEX_MODIFIED
                    | git2::Status::INDEX_DELETED
                    | git2::Status::WT_MODIFIED
                    | git2::Status::WT_DELETED,
            ) {
                if let Some(p) = entry.path() {
                    dirty_files.push(p.to_string());
                }
            }
        }
    }

    let mut stashed = false;

    if !dirty_files.is_empty() {
        match strategy {
            CheckoutStrategy::Clean => {
                return Ok(CheckoutResult::Dirty {
                    affected_files: dirty_files,
                    suggestion: "Stash changes or discard uncommitted modifications before checkout.".into(),
                });
            }
            CheckoutStrategy::StashAndCheckout => {
                // Save stash using git CLI or libgit2
                let sig = repo.signature().or_else(|_| git2::Signature::now("Tye User", "user@tyes.dev"))?;
                let msg = format!("WIP switching to branch {}", name);
                let _ = repo.stash_save(&sig, &msg, Some(git2::StashFlags::DEFAULT));
                stashed = true;
            }
            CheckoutStrategy::DiscardAndCheckout => {
                // Reset index and workdir changes
                if let Ok(head_obj) = repo.head().and_then(|h| h.peel(git2::ObjectType::Any)) {
                    let mut cb = git2::build::CheckoutBuilder::new();
                    cb.force();
                    let _ = repo.reset(&head_obj, git2::ResetType::Hard, Some(&mut cb));
                }
            }
        }
    }

    // Resolve target branch or ref
    let (obj, ref_name) = if let Ok(branch) = repo.find_branch(name, BranchType::Local) {
        let refname = branch.get().name().unwrap_or("").to_string();
        let obj = branch.get().peel(git2::ObjectType::Any)?;
        (obj, refname)
    } else if let Ok(branch) = repo.find_branch(name, BranchType::Remote) {
        let refname = branch.get().name().unwrap_or("").to_string();
        let obj = branch.get().peel(git2::ObjectType::Any)?;
        (obj, refname)
    } else {
        return Err(GitEngineError::BranchError(format!("Branch '{}' not found", name)));
    };

    let mut cb = git2::build::CheckoutBuilder::new();
    cb.safe();
    repo.checkout_tree(&obj, Some(&mut cb))?;
    repo.set_head(&ref_name)?;

    Ok(CheckoutResult::Success {
        branch: name.to_string(),
        stashed,
    })
}
