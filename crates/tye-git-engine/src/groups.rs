use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use tokio::process::Command;
use uuid::Uuid;
use crate::dashboard::{get_dashboard_cards, RepoCard};
use crate::error::GitEngineError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RepoGroup {
    pub id: String,
    pub name: String,
    pub repos: Vec<RepoCard>,
}

/// Create a named repository group (`F-012`).
pub async fn create_group(pool: &Pool<Sqlite>, name: &str) -> Result<RepoGroup, GitEngineError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query("INSERT INTO git_repo_groups (id, name, created_at) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(name)
        .bind(&now)
        .execute(pool)
        .await?;

    Ok(RepoGroup {
        id,
        name: name.to_string(),
        repos: Vec::new(),
    })
}

/// Delete a repository group (`F-012`).
pub async fn delete_group(pool: &Pool<Sqlite>, group_id: &str) -> Result<(), GitEngineError> {
    sqlx::query("DELETE FROM git_repo_groups WHERE id = ?")
        .bind(group_id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM git_repo_group_members WHERE group_id = ?")
        .bind(group_id)
        .execute(pool)
        .await?;
    Ok(())
}


/// Add a repository to a group (`F-012`).
pub async fn add_to_group(pool: &Pool<Sqlite>, group_id: &str, repo_id: &str) -> Result<(), GitEngineError> {
    sqlx::query("INSERT OR IGNORE INTO git_repo_group_members (group_id, repo_id) VALUES (?, ?)")
        .bind(group_id)
        .bind(repo_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Remove a repository from a group (`F-012`).
pub async fn remove_from_group(pool: &Pool<Sqlite>, group_id: &str, repo_id: &str) -> Result<(), GitEngineError> {
    sqlx::query("DELETE FROM git_repo_group_members WHERE group_id = ? AND repo_id = ?")
        .bind(group_id)
        .bind(repo_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Fetch all repository groups (`F-012`) with their associated RepoCard members.
pub async fn get_groups(pool: &Pool<Sqlite>, project_id: &str) -> Result<Vec<RepoGroup>, GitEngineError> {
    let group_rows: Vec<(String, String)> = sqlx::query_as("SELECT id, name FROM git_repo_groups ORDER BY created_at ASC")
        .fetch_all(pool)
        .await?;

    let all_cards = get_dashboard_cards(pool, project_id).await?;
    let mut groups = Vec::with_capacity(group_rows.len());

    for (g_id, g_name) in group_rows {
        let member_ids: Vec<(String,)> = sqlx::query_as("SELECT repo_id FROM git_repo_group_members WHERE group_id = ?")
            .bind(&g_id)
            .fetch_all(pool)
            .await?;

        let member_set: std::collections::HashSet<String> = member_ids.into_iter().map(|(id,)| id).collect();
        let repos: Vec<RepoCard> = all_cards
            .iter()
            .filter(|c| member_set.contains(&c.id))
            .cloned()
            .collect();

        groups.push(RepoGroup {
            id: g_id,
            name: g_name,
            repos,
        });
    }

    Ok(groups)
}

/// Run parallel bulk `git fetch --all` across all members of a repository group (`F-012`) using `tokio::join_all`.
pub async fn bulk_fetch_group(
    pool: &Pool<Sqlite>,
    project_id: &str,
    group_id: &str,
) -> Result<Vec<(String, Result<(), String>)>, GitEngineError> {
    let groups = get_groups(pool, project_id).await?;
    let group = groups
        .into_iter()
        .find(|g| g.id == group_id)
        .ok_or_else(|| GitEngineError::GroupNotFound(group_id.to_string()))?;

    let mut tasks = Vec::with_capacity(group.repos.len());
    for repo_card in group.repos {
        let path = repo_card.path.clone();
        let name = repo_card.name.clone();
        tasks.push(tokio::spawn(async move {
            let status = Command::new("git")
                .args(["fetch", "--all"])
                .current_dir(&path)
                .status()
                .await;

            match status {
                Ok(s) if s.success() => (name, Ok(())),
                Ok(s) => (name, Err(format!("exited with status {}", s))),
                Err(e) => (name, Err(format!("failed to run git fetch: {}", e))),
            }
        }));
    }

    let results = futures_util_join_all(tasks).await;
    Ok(results)
}

/// Helper to join spawned tasks cleanly without extra external dependencies
async fn futures_util_join_all<T>(tasks: Vec<tokio::task::JoinHandle<T>>) -> Vec<T> {
    let mut out = Vec::with_capacity(tasks.len());
    for task in tasks {
        if let Ok(res) = task.await {
            out.push(res);
        }
    }
    out
}
