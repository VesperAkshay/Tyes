use std::path::Path;
use std::time::Instant;
use serde::{Deserialize, Serialize};
use git2::{BranchType, Direction, RemoteCallbacks, Repository};
use crate::error::GitEngineError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RemoteItem {
    pub name: String,
    pub fetch_url: String,
    pub push_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub latency_ms: u128,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FetchResult {
    pub remote: String,
    pub commits_fetched: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PullStrategy {
    Merge,
    Rebase,
    FFOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PullResult {
    pub strategy_used: String,
    pub fast_forwarded: bool,
    pub commits_pulled: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PushResult {
    pub remote: String,
    pub branch: String,
    pub forced: bool,
    pub message: String,
}

pub fn get_remotes(repo_path: &Path) -> Result<Vec<RemoteItem>, GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    let remote_names = repo.remotes()?;
    let mut remotes = Vec::new();

    for name_opt in remote_names.iter() {
        if let Some(name) = name_opt {
            if let Ok(remote) = repo.find_remote(name) {
                let fetch_url = remote.url().unwrap_or("").to_string();
                let push_url = remote.pushurl().unwrap_or(&fetch_url).to_string();
                remotes.push(RemoteItem {
                    name: name.to_string(),
                    fetch_url,
                    push_url,
                });
            }
        }
    }

    Ok(remotes)
}

pub fn add_remote(repo_path: &Path, name: &str, url: &str) -> Result<RemoteItem, GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    if !url.starts_with("http://") && !url.starts_with("https://") && !url.starts_with("git@") && !url.starts_with("ssh://") && !url.starts_with("file://") && !Path::new(url).exists() {
        return Err(GitEngineError::RemoteError("Invalid remote URL scheme. Must be https://, ssh://, git@, file://, or valid path.".into()));
    }

    let remote = repo.remote(name, url)?;
    Ok(RemoteItem {
        name: name.to_string(),
        fetch_url: remote.url().unwrap_or(url).to_string(),
        push_url: remote.pushurl().unwrap_or(url).to_string(),
    })
}

pub fn remove_remote(repo_path: &Path, name: &str) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    repo.remote_delete(name)?;
    Ok(())
}

pub fn edit_remote(repo_path: &Path, name: &str, new_url: &str) -> Result<RemoteItem, GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    repo.remote_set_url(name, new_url)?;
    repo.remote_set_pushurl(name, Some(new_url))?;

    Ok(RemoteItem {
        name: name.to_string(),
        fetch_url: new_url.to_string(),
        push_url: new_url.to_string(),
    })
}

pub fn prune_remote(repo_path: &Path, name: &str) -> Result<(), GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    // Try libgit2 connect + prune
    if let Ok(mut remote) = repo.find_remote(name) {
        let cb = RemoteCallbacks::new();
        let _ = remote.connect_auth(Direction::Fetch, Some(cb), None);
        let cb_prune = RemoteCallbacks::new();
        let _ = remote.prune(Some(cb_prune));
    }

    // Also run git CLI as fallback safety
    let _ = std::process::Command::new("git")
        .current_dir(repo_path)
        .args(&["remote", "prune", name])
        .output();

    Ok(())
}

pub fn test_remote_connection(repo_path: &Path, name: &str) -> Result<ConnectionTestResult, GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    let mut remote = repo.find_remote(name)
        .map_err(|_| GitEngineError::RemoteError(format!("Remote '{}' not found", name)))?;

    let start = Instant::now();
    let cb = RemoteCallbacks::new();

    let connect_res = remote.connect_auth(Direction::Fetch, Some(cb), None);
    let latency_ms = start.elapsed().as_millis();

    if let Err(e) = connect_res {
        return Ok(ConnectionTestResult {
            success: false,
            latency_ms,
            message: format!("Connection failed: {}", e),
        });
    }

    drop(connect_res);
    let _ = remote.disconnect();

    Ok(ConnectionTestResult {
        success: true,
        latency_ms,
        message: format!("Successfully connected to '{}' in {}ms", name, latency_ms),
    })
}

pub fn fetch_remote(
    repo_path: &Path,
    remote_name: Option<&str>,
    prune: bool,
    tags: bool,
) -> Result<FetchResult, GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    let target_remote = remote_name.unwrap_or("origin");

    // Execute via git subprocess for robust credential/SSH agent handling
    let mut args = vec!["fetch", target_remote];
    if prune {
        args.push("--prune");
    }
    if tags {
        args.push("--tags");
    }

    let output = std::process::Command::new("git")
        .current_dir(repo_path)
        .args(&args)
        .output()
        .map_err(|e| GitEngineError::SyncError(format!("Failed to run git fetch: {}", e)))?;

    if !output.status.success() {
        let err_str = String::from_utf8_lossy(&output.stderr);
        return Err(GitEngineError::SyncError(format!("Fetch failed: {}", err_str)));
    }

    // Calculate ahead/behind count for active branch
    let mut commits_fetched = 0;
    if let Ok(head) = repo.head() {
        if let Some(branch_name) = head.shorthand() {
            if let Ok(branch) = repo.find_branch(branch_name, BranchType::Local) {
                if let Ok(up) = branch.upstream() {
                    if let Ok(target) = branch.get().peel_to_commit() {
                        if let Ok(up_target) = up.get().peel_to_commit() {
                            if let Ok((_, b)) = repo.graph_ahead_behind(target.id(), up_target.id()) {
                                commits_fetched = b;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(FetchResult {
        remote: target_remote.to_string(),
        commits_fetched,
        message: format!("Successfully fetched from {}", target_remote),
    })
}

pub fn pull_branch(
    repo_path: &Path,
    remote_name: &str,
    branch_name: &str,
    strategy: PullStrategy,
) -> Result<PullResult, GitEngineError> {
    // Run fetch first
    let _ = fetch_remote(repo_path, Some(remote_name), false, false)?;

    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    let remote_ref_name = format!("refs/remotes/{}/{}", remote_name, branch_name);
    let fetch_head = repo.find_reference(&remote_ref_name)
        .map_err(|_| GitEngineError::SyncError(format!("Remote branch {}/{} not found after fetch", remote_name, branch_name)))?;
    let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)?;

    let analysis = repo.merge_analysis(&[&fetch_commit])?;

    if analysis.0.is_up_to_date() {
        return Ok(PullResult {
            strategy_used: "UP_TO_DATE".into(),
            fast_forwarded: true,
            commits_pulled: 0,
            message: "Already up to date.".into(),
        });
    }

    if analysis.0.is_fast_forward() {
        let refname = format!("refs/heads/{}", branch_name);
        let mut reference = repo.find_reference(&refname)?;
        reference.set_target(fetch_commit.id(), "Fast-Forward")?;
        repo.set_head(&refname)?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;

        return Ok(PullResult {
            strategy_used: "FASTFORWARD".into(),
            fast_forwarded: true,
            commits_pulled: 1,
            message: format!("Fast-forwarded to {}", fetch_commit.id()),
        });
    }

    match strategy {
        PullStrategy::FFOnly => {
            Err(GitEngineError::SyncError("Pull rejected: fast-forward only requested, but branch has diverged.".into()))
        }
        PullStrategy::Merge | PullStrategy::Rebase => {
            // Run git pull via CLI for non-FF merge or rebase
            let mut args = vec!["pull", remote_name, branch_name];
            if strategy == PullStrategy::Rebase {
                args.push("--rebase");
            } else {
                args.push("--no-rebase");
            }

            let output = std::process::Command::new("git")
                .current_dir(repo_path)
                .args(&args)
                .output()
                .map_err(|e| GitEngineError::SyncError(format!("Git pull execution failed: {}", e)))?;

            if !output.status.success() {
                let err = String::from_utf8_lossy(&output.stderr);
                return Err(GitEngineError::SyncError(format!("Pull failed (possible conflicts): {}", err)));
            }

            let strat_str = if strategy == PullStrategy::Rebase { "REBASE" } else { "MERGE" };
            Ok(PullResult {
                strategy_used: strat_str.into(),
                fast_forwarded: false,
                commits_pulled: 1,
                message: format!("Successfully pulled {} via {}", branch_name, strat_str),
            })
        }
    }
}

pub fn push_branch(
    repo_path: &Path,
    remote_name: &str,
    branch_name: &str,
    force: bool,
    force_lease: bool,
    set_upstream: bool,
) -> Result<PushResult, GitEngineError> {
    let mut args = vec!["push", remote_name, branch_name];
    if force_lease {
        args.push("--force-with-lease");
    } else if force {
        args.push("--force");
    }
    if set_upstream {
        args.push("--set-upstream");
    }

    let output = std::process::Command::new("git")
        .current_dir(repo_path)
        .args(&args)
        .output()
        .map_err(|e| GitEngineError::SyncError(format!("Failed to run git push: {}", e)))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        if err.contains("non-fast-forward") || err.contains("stale info") {
            return Err(GitEngineError::SyncError("Push rejected: remote has changes. Pull first or use force-with-lease.".into()));
        }
        return Err(GitEngineError::SyncError(format!("Push failed: {}", err)));
    }

    Ok(PushResult {
        remote: remote_name.to_string(),
        branch: branch_name.to_string(),
        forced: force || force_lease,
        message: format!("Successfully pushed {} to {}", branch_name, remote_name),
    })
}
