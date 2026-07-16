use std::path::Path;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitRequest {
    pub message: String,
    pub body: Option<String>,
    pub amend: bool,
    pub signoff: bool,
    pub co_authors: Vec<String>,
    pub commit_type: String, // Normal, Fixup, Squash
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitListItem {
    pub id: String,
    pub short_id: String,
    pub message_subject: String,
    pub author_name: String,
    pub timestamp: String,
    pub tags: Vec<String>,
    pub branches: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
    pub insertions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitDetail {
    pub id: String,
    pub short_id: String,
    pub message_subject: String,
    pub message_body: Option<String>,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: String,
    pub parents: Vec<String>,
    pub changed_files: Vec<ChangedFile>,
    pub insertions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookResult {
    pub hook_name: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub succeeded: bool,
}

/// Create a new commit or amend existing synchronously (`F-022`).
pub fn create_commit_sync(
    repo_path: &Path,
    req: &CommitRequest,
) -> Result<(String, String), crate::error::GitEngineError> {
    let repo = git2::Repository::open(repo_path)?;
    let mut index = repo.index()?;
    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;

    // Construct full message
    let mut full_msg = match req.commit_type.as_str() {
        "Fixup" => format!("fixup! {}\n", req.message),
        "Squash" => format!("squash! {}\n", req.message),
        _ => req.message.clone(),
    };

    if let Some(b) = &req.body {
        if !b.trim().is_empty() {
            full_msg.push_str("\n\n");
            full_msg.push_str(b.trim());
        }
    }

    if req.signoff {
        let sig = repo.signature()?;
        let signoff_line = format!("\n\nSigned-off-by: {} <{}>", sig.name().unwrap_or("User"), sig.email().unwrap_or("user@tyegit.dev"));
        full_msg.push_str(&signoff_line);
    }

    for co in &req.co_authors {
        if !co.trim().is_empty() {
            full_msg.push_str(&format!("\nCo-authored-by: {}", co.trim()));
        }
    }

    let sig = repo.signature()?;
    let author_name = sig.name().unwrap_or("User").to_string();

    let oid = if req.amend {
        let head = repo.head()?;
        let head_commit = head.peel_to_commit()?;
        head_commit.amend(
            Some("HEAD"),
            Some(&sig),
            Some(&sig),
            None,
            Some(&full_msg),
            Some(&tree),
        )?
    } else {
        let parent_commits: Vec<git2::Commit> = if let Ok(head) = repo.head() {
            if let Ok(c) = head.peel_to_commit() {
                vec![c]
            } else {
                vec![]
            }
        } else {
            vec![]
        };
        let parents: Vec<&git2::Commit> = parent_commits.iter().collect();

        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            &full_msg,
            &tree,
            &parents,
        )?
    };

    let oid_str = oid.to_string();
    Ok((oid_str, author_name))
}

/// Create a new commit or amend existing (`F-022`).
pub async fn create_commit(
    pool: Option<&Pool<Sqlite>>,
    repo_path: &Path,
    req: CommitRequest,
) -> Result<String, crate::error::GitEngineError> {
    let (oid_str, author_name) = create_commit_sync(repo_path, &req)?;

    if let Some(pool) = pool {
        let short_id = if oid_str.len() >= 7 { &oid_str[..7] } else { &oid_str };
        let now = Utc::now().to_rfc3339();
        let _ = sqlx::query(
            r#"INSERT OR REPLACE INTO git_recent_commits_cache
               (repo_path, commit_id, short_id, subject, author_name, timestamp)
               VALUES (?, ?, ?, ?, ?, ?)"#
        )
        .bind(repo_path.to_string_lossy().to_string())
        .bind(&oid_str)
        .bind(short_id)
        .bind(&req.message)
        .bind(&author_name)
        .bind(&now)
        .execute(pool)
        .await;
    }

    Ok(oid_str)
}

/// Paginated commit history (`F-024`).
pub fn get_commit_history(
    _pool: Option<&Pool<Sqlite>>,
    repo_path: &Path,
    offset: usize,
    limit: usize,
) -> Result<Vec<CommitListItem>, crate::error::GitEngineError> {
    let repo = git2::Repository::open(repo_path)?;
    let mut revwalk = repo.revwalk()?;
    
    // Push HEAD
    if revwalk.push_head().is_err() {
        return Ok(Vec::new()); // Empty repo
    }
    let _ = revwalk.set_sorting(git2::Sort::TIME);

    let mut commits = Vec::new();
    for oid_res in revwalk.skip(offset).take(limit) {
        if let Ok(oid) = oid_res {
            if let Ok(c) = repo.find_commit(oid) {
                let id = oid.to_string();
                let short_id = if id.len() >= 7 { id[..7].to_string() } else { id.clone() };
                let subject = c.summary().unwrap_or("").to_string();
                let author_name = c.author().name().unwrap_or("Unknown").to_string();
                let timestamp = DateTime::from_timestamp(c.time().seconds(), 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_else(|| Utc::now().to_rfc3339());

                commits.push(CommitListItem {
                    id,
                    short_id,
                    message_subject: subject,
                    author_name,
                    timestamp,
                    tags: Vec::new(),
                    branches: Vec::new(),
                });
            }
        }
    }

    Ok(commits)
}

/// Detailed commit info with file diff statistics (`F-025`).
pub fn get_commit_details(
    repo_path: &Path,
    commit_id: &str,
) -> Result<CommitDetail, crate::error::GitEngineError> {
    let repo = git2::Repository::open(repo_path)?;
    let oid = git2::Oid::from_str(commit_id)?;
    let commit = repo.find_commit(oid)?;

    let id = oid.to_string();
    let short_id = if id.len() >= 7 { id[..7].to_string() } else { id.clone() };
    let message_subject = commit.summary().unwrap_or("").to_string();
    let message_body = commit.body().map(|s| s.to_string());
    let author_name = commit.author().name().unwrap_or("Unknown").to_string();
    let author_email = commit.author().email().unwrap_or("").to_string();
    let timestamp = DateTime::from_timestamp(commit.time().seconds(), 0)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_else(|| Utc::now().to_rfc3339());

    let mut parents = Vec::new();
    for p in commit.parent_ids() {
        parents.push(p.to_string());
    }

    let commit_tree = commit.tree()?;
    let parent_tree = if commit.parent_count() > 0 {
        commit.parent(0).ok().and_then(|p| p.tree().ok())
    } else {
        None
    };

    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), None)?;
    let mut changed_files = Vec::new();
    let mut total_ins = 0;
    let mut total_del = 0;

    let _ = diff.print(git2::DiffFormat::Patch, |delta, _hunk, line| {
        let path = delta.new_file().path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        // Find or create changed file entry
        let pos = changed_files.iter().position(|cf: &ChangedFile| cf.path == path);
        let idx = if let Some(p) = pos {
            p
        } else {
            let status = match delta.status() {
                git2::Delta::Added => "Added",
                git2::Delta::Deleted => "Deleted",
                git2::Delta::Modified => "Modified",
                git2::Delta::Renamed => "Renamed",
                _ => "Modified",
            }.to_string();
            changed_files.push(ChangedFile {
                path,
                status,
                insertions: 0,
                deletions: 0,
            });
            changed_files.len() - 1
        };

        match line.origin() {
            '+' => {
                changed_files[idx].insertions += 1;
                total_ins += 1;
            }
            '-' => {
                changed_files[idx].deletions += 1;
                total_del += 1;
            }
            _ => {}
        }

        true
    });

    Ok(CommitDetail {
        id,
        short_id,
        message_subject,
        message_body,
        author_name,
        author_email,
        timestamp,
        parents,
        changed_files,
        insertions: total_ins,
        deletions: total_del,
    })
}

/// Run pre-commit hook (`F-023`).
pub async fn execute_pre_commit_hook(
    repo_path: &Path,
) -> Result<HookResult, crate::error::GitEngineError> {
    let hook_path = repo_path.join(".git").join("hooks").join("pre-commit");
    if !hook_path.exists() {
        return Ok(HookResult {
            hook_name: "pre-commit".to_string(),
            exit_code: 0,
            stdout: String::new(),
            stderr: String::new(),
            succeeded: true,
        });
    }

    let output = Command::new(&hook_path)
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| crate::error::GitEngineError::Git2Error(git2::Error::from_str(&format!("Hook execution failed: {}", e))))?;

    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(HookResult {
        hook_name: "pre-commit".to_string(),
        exit_code,
        stdout,
        stderr,
        succeeded: output.status.success(),
    })
}
