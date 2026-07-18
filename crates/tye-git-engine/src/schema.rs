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

        CREATE TABLE IF NOT EXISTS git_file_status_cache (
            repo_path TEXT NOT NULL,
            file_path TEXT NOT NULL,
            status TEXT NOT NULL,
            staged_status TEXT,
            unstaged_status TEXT,
            is_binary BOOLEAN NOT NULL DEFAULT 0,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(repo_path, file_path)
        );

        CREATE TABLE IF NOT EXISTS git_recent_commits_cache (
            repo_path TEXT NOT NULL,
            commit_id TEXT NOT NULL,
            short_id TEXT NOT NULL,
            subject TEXT NOT NULL,
            author_name TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            PRIMARY KEY(repo_path, commit_id)
        );

        CREATE TABLE IF NOT EXISTS git_checkpoints (
            id TEXT PRIMARY KEY,
            repo_path TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            operation TEXT NOT NULL,
            head_before TEXT NOT NULL,
            head_after TEXT,
            branch_before TEXT NOT NULL,
            stash_oid TEXT,
            snapshot_json TEXT NOT NULL,
            ai_explanation TEXT NOT NULL,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            custom_label TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_git_checkpoints_repo ON git_checkpoints(repo_path, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_git_checkpoints_pinned ON git_checkpoints(repo_path, is_pinned);

        CREATE TABLE IF NOT EXISTS git_hosting_accounts (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            username TEXT NOT NULL,
            base_url TEXT NOT NULL,
            is_enterprise BOOLEAN NOT NULL DEFAULT 0,
            avatar_url TEXT,
            status TEXT NOT NULL DEFAULT 'active'
        );
        "#
    )
    .execute(pool)
    .await?;

    Ok(())
}
