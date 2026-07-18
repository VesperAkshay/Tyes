use std::path::Path;
use chrono::Utc;
use git2::{Status, StatusOptions};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiffStats {
    pub insertions: usize,
    pub deletions: usize,
    pub files_changed: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmoduleSummary {
    pub name: String,
    pub is_dirty: bool,
    pub commits_ahead: i32,
    pub commits_behind: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStatus {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
    pub staged_status: Option<String>,
    pub unstaged_status: Option<String>,
    pub is_binary: bool,
    pub size_bytes: u64,
    pub diff_stats: Option<DiffStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StatusResult {
    pub staged: Vec<FileStatus>,
    pub unstaged: Vec<FileStatus>,
    pub untracked: Vec<FileStatus>,
    pub ignored: Vec<FileStatus>,
    pub conflicted: Vec<FileStatus>,
    pub submodule_summary: Vec<SubmoduleSummary>,
    pub total_staged_stats: DiffStats,
    pub total_unstaged_stats: DiffStats,
}

/// Helper to check if a file buffer is likely binary (null byte within first 8KB)
pub fn is_binary_buffer(bytes: &[u8]) -> bool {
    let check_len = bytes.len().min(8192);
    bytes[..check_len].contains(&0)
}

/// Helper to check if a file on disk is binary and its size
pub fn check_file_metadata(repo_path: &Path, rel_path: &str) -> (bool, u64) {
    let full_path = repo_path.join(rel_path);
    if let Ok(meta) = std::fs::metadata(&full_path) {
        let size = meta.len();
        if meta.is_file() {
            if let Ok(bytes) = std::fs::read(&full_path) {
                return (is_binary_buffer(&bytes), size);
            }
        }
        return (false, size);
    }
    (false, 0)
}

/// Execute git status --porcelain=v2 equivalent synchronously, returning categorized FileStatus vectors, statistics, and submodules.
pub fn get_repository_status_sync(
    repo_path: &Path,
    include_ignored: bool,
) -> Result<StatusResult, crate::error::GitEngineError> {
    let repo = git2::Repository::open(repo_path)?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);
    if include_ignored {
        opts.include_ignored(true);
    }

    let statuses = repo.statuses(Some(&mut opts))?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();
    let mut ignored = Vec::new();
    let mut conflicted = Vec::new();

    for entry in statuses.iter() {
        let status = entry.status();
        let path_str = entry.path().unwrap_or("unknown").to_string();
        let (is_binary, size_bytes) = check_file_metadata(repo_path, &path_str);

        // Check conflicted first
        if status.contains(Status::CONFLICTED) {
            conflicted.push(FileStatus {
                path: path_str.clone(),
                old_path: None,
                status: "Unmerged".to_string(),
                staged_status: None,
                unstaged_status: Some("Unmerged".to_string()),
                is_binary,
                size_bytes,
                diff_stats: None,
            });
            continue;
        }

        // Ignored
        if status.contains(Status::IGNORED) {
            ignored.push(FileStatus {
                path: path_str.clone(),
                old_path: None,
                status: "Ignored".to_string(),
                staged_status: None,
                unstaged_status: Some("Ignored".to_string()),
                is_binary,
                size_bytes,
                diff_stats: None,
            });
            continue;
        }

        // Untracked
        if status.contains(Status::WT_NEW) {
            untracked.push(FileStatus {
                path: path_str.clone(),
                old_path: None,
                status: "Untracked".to_string(),
                staged_status: None,
                unstaged_status: Some("Untracked".to_string()),
                is_binary,
                size_bytes,
                diff_stats: None,
            });
            continue;
        }

        // Staged changes
        if status.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE,
        ) {
            let mut s_str = "Modified";
            let mut old_p = None;
            if status.contains(Status::INDEX_NEW) {
                s_str = "Added";
            } else if status.contains(Status::INDEX_DELETED) {
                s_str = "Deleted";
            } else if status.contains(Status::INDEX_RENAMED) {
                s_str = "Renamed";
                if let Some(hd) = entry.head_to_index() {
                    old_p = hd.old_file().path().map(|p| p.to_string_lossy().to_string());
                }
            }

            staged.push(FileStatus {
                path: path_str.clone(),
                old_path: old_p,
                status: s_str.to_string(),
                staged_status: Some(s_str.to_string()),
                unstaged_status: None,
                is_binary,
                size_bytes,
                diff_stats: None,
            });
        }

        // Unstaged working tree changes
        if status.intersects(
            Status::WT_MODIFIED
                | Status::WT_DELETED
                | Status::WT_RENAMED
                | Status::WT_TYPECHANGE,
        ) {
            let mut u_str = "Modified";
            let mut old_p = None;
            if status.contains(Status::WT_DELETED) {
                u_str = "Deleted";
            } else if status.contains(Status::WT_RENAMED) {
                u_str = "Renamed";
                if let Some(wd) = entry.index_to_workdir() {
                    old_p = wd.old_file().path().map(|p| p.to_string_lossy().to_string());
                }
            }

            unstaged.push(FileStatus {
                path: path_str.clone(),
                old_path: old_p,
                status: u_str.to_string(),
                staged_status: None,
                unstaged_status: Some(u_str.to_string()),
                is_binary,
                size_bytes,
                diff_stats: None,
            });
        }
    }

    // Compute diff stats for staged vs unstaged
    let mut total_staged_stats = DiffStats {
        insertions: 0,
        deletions: 0,
        files_changed: staged.len(),
    };
    if let Ok(head) = repo.head() {
        if let Ok(tree) = head.peel_to_tree() {
            if let Ok(diff) = repo.diff_tree_to_index(Some(&tree), None, None) {
                if let Ok(stats) = diff.stats() {
                    total_staged_stats.insertions = stats.insertions();
                    total_staged_stats.deletions = stats.deletions();
                }
            }
        }
    } else if let Ok(diff) = repo.diff_tree_to_index(None, None, None) {
        if let Ok(stats) = diff.stats() {
            total_staged_stats.insertions = stats.insertions();
            total_staged_stats.deletions = stats.deletions();
        }
    }

    let mut total_unstaged_stats = DiffStats {
        insertions: 0,
        deletions: 0,
        files_changed: unstaged.len(),
    };
    if let Ok(diff) = repo.diff_index_to_workdir(None, None) {
        if let Ok(stats) = diff.stats() {
            total_unstaged_stats.insertions = stats.insertions();
            total_unstaged_stats.deletions = stats.deletions();
        }
    }

    // Check submodules
    let mut submodule_summary = Vec::new();
    if let Ok(submodules) = repo.submodules() {
        for sub in submodules {
            let name = sub.name().unwrap_or("unknown").to_string();
            let mut is_dirty = false;
            if let Ok(st) = repo.submodule_status(&name, git2::SubmoduleIgnore::Unspecified) {
                if !st.is_empty() && !st.contains(git2::SubmoduleStatus::IN_INDEX) && !st.contains(git2::SubmoduleStatus::IN_HEAD) {
                    is_dirty = true;
                }
            }
            submodule_summary.push(SubmoduleSummary {
                name,
                is_dirty,
                commits_ahead: 0,
                commits_behind: 0,
            });
        }
    }

    Ok(StatusResult {
        staged,
        unstaged,
        untracked,
        ignored,
        conflicted,
        submodule_summary,
        total_staged_stats,
        total_unstaged_stats,
    })
}

/// Execute git status and cache in SQLite if pool is provided (`F-013`).
pub async fn get_repository_status(
    pool: Option<&Pool<Sqlite>>,
    repo_path: &Path,
    include_ignored: bool,
) -> Result<StatusResult, crate::error::GitEngineError> {
    let res = get_repository_status_sync(repo_path, include_ignored)?;

    // Cache status in SQLite if pool is present
    if let Some(pool) = pool {
        let now = Utc::now().to_rfc3339();
        let repo_str = repo_path.to_string_lossy().to_string();
        for s in res.staged.iter().chain(res.unstaged.iter()).chain(res.untracked.iter()) {
            let _ = sqlx::query(
                r#"INSERT OR REPLACE INTO git_file_status_cache
                   (repo_path, file_path, status, staged_status, unstaged_status, is_binary, size_bytes, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#
            )
            .bind(&repo_str)
            .bind(&s.path)
            .bind(&s.status)
            .bind(&s.staged_status)
            .bind(&s.unstaged_status)
            .bind(s.is_binary)
            .bind(s.size_bytes as i64)
            .bind(&now)
            .execute(pool)
            .await;
        }
    }

    Ok(res)
}
