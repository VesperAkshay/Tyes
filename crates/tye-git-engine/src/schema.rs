use sqlx::{Pool, Sqlite};

/// Run SQLite schema migrations for Tyegit domain tables (prefixed `git_*`).
/// Per Unified-Suite Patch Note 2 & Master Spec Part C.3, these tables live in `<project_root>/.tye/project.db`
/// (and `git_repositories` / `git_settings` can also run on machine-global pools if needed).
pub async fn run_migrations(pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS git_repositories (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            is_bare BOOLEAN NOT NULL DEFAULT 0,
            auto_discovered BOOLEAN NOT NULL DEFAULT 0,
            is_pinned BOOLEAN NOT NULL DEFAULT 0,
            last_opened TEXT,
            health_status TEXT NOT NULL DEFAULT 'valid',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS git_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS git_repo_groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS git_repo_group_members (
            group_id TEXT NOT NULL,
            repo_id TEXT NOT NULL,
            PRIMARY KEY(group_id, repo_id)
        );
        "#
    )
    .execute(pool)
    .await?;

    Ok(())
}
