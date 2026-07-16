use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use git2::{StatusOptions, BranchType};
use crate::error::GitEngineError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RepoCard {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub branch: String,
    pub last_commit_subject: String,
    pub uncommitted_count: usize,
    pub ahead: usize,
    pub behind: usize,
    pub is_pinned: bool,
    pub last_opened: Option<String>,
    pub health_status: String,
}

/// Fetch repository cards (`F-006`) for the home screen dashboard sorted by pinned status and last opened time.
pub async fn get_dashboard_cards(
    pool: &Pool<Sqlite>,
    project_id: &str,
) -> Result<Vec<RepoCard>, GitEngineError> {
    let rows: Vec<(String, String, String, bool, Option<String>, String)> = sqlx::query_as(
        "SELECT id, name, path, is_pinned, last_opened, health_status FROM git_repositories WHERE project_id = ? ORDER BY is_pinned DESC, last_opened DESC"
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    let mut tasks = Vec::with_capacity(rows.len());

    for (id, name, path_str, is_pinned, last_opened, health_status) in rows {
        let path = PathBuf::from(&path_str);
        tasks.push(tokio::spawn(async move {
            let path_clone = path.clone();
            let card_res = tokio::time::timeout(
                std::time::Duration::from_millis(1500),
                tokio::task::spawn_blocking(move || {
                    let mut branch = "HEAD".to_string();
                    let mut last_commit_subject = "No commits".to_string();
                    let mut uncommitted_count = 0;
                    let mut ahead = 0;
                    let mut behind = 0;

                    if let Ok(repo) = git2::Repository::open(&path_clone) {
                        if let Ok(head) = repo.head() {
                            if let Some(sh) = head.shorthand() {
                                branch = sh.to_string();
                            }
                            if let Ok(commit) = head.peel_to_commit() {
                                if let Some(summary) = commit.summary() {
                                    last_commit_subject = summary.to_string();
                                }
                            }
                        }

                        let mut opts = StatusOptions::new();
                        opts.include_untracked(true);
                        opts.include_ignored(false);
                        opts.exclude_submodules(true);
                        opts.no_refresh(true);
                        if let Ok(statuses) = repo.statuses(Some(&mut opts)) {
                            uncommitted_count = statuses.len();
                        }

                        // Calculate ahead/behind if upstream exists
                        if let Ok(local_head) = repo.head() {
                            if let Some(shorthand) = local_head.shorthand() {
                                if let Ok(local_branch) = repo.find_branch(shorthand, BranchType::Local) {
                                    if let Ok(upstream) = local_branch.upstream() {
                                        if let (Some(l_oid), Some(u_oid)) = (local_branch.get().target(), upstream.get().target()) {
                                            if let Ok((a, b)) = repo.graph_ahead_behind(l_oid, u_oid) {
                                                ahead = a;
                                                behind = b;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    (branch, last_commit_subject, uncommitted_count, ahead, behind)
                })
            ).await;

            match card_res {
                Ok(Ok((branch, last_commit_subject, uncommitted_count, ahead, behind))) => RepoCard {
                    id,
                    name,
                    path,
                    branch,
                    last_commit_subject,
                    uncommitted_count,
                    ahead,
                    behind,
                    is_pinned,
                    last_opened,
                    health_status,
                },
                _ => RepoCard {
                    id,
                    name,
                    path,
                    branch: "Unknown".to_string(),
                    last_commit_subject: "Status timeout / unreadable".to_string(),
                    uncommitted_count: 0,
                    ahead: 0,
                    behind: 0,
                    is_pinned,
                    last_opened,
                    health_status: "Degraded".to_string(),
                }
            }
        }));
    }

    let mut cards = Vec::with_capacity(tasks.len());
    for t in tasks {
        if let Ok(card) = t.await {
            cards.push(card);
        }
    }

    Ok(cards)
}

/// Pin or unpin a repository (`F-006`).
pub async fn pin_repository(
    pool: &Pool<Sqlite>,
    repo_id: &str,
    pinned: bool,
) -> Result<(), GitEngineError> {
    sqlx::query("UPDATE git_repositories SET is_pinned = ? WHERE id = ?")
        .bind(pinned)
        .bind(repo_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Remove a repository from the Tyegit dashboard index (does NOT delete files on disk).
pub async fn remove_repository(
    pool: &Pool<Sqlite>,
    repo_id: &str,
) -> Result<(), GitEngineError> {
    sqlx::query("DELETE FROM git_repositories WHERE id = ?")
        .bind(repo_id)
        .execute(pool)
        .await?;
    Ok(())
}
