use crate::error::Result;
use chrono::{DateTime, Utc};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    FromRow, Pool, Sqlite,
};
use std::path::{Path, PathBuf};
use tye_core_models::{Ecosystem, Project};
use uuid::Uuid;

#[derive(Clone)]
pub struct Registry {
    pool: Pool<Sqlite>,
}

#[derive(FromRow)]
struct ProjectRow {
    id: String,
    name: String,
    path: String,
    icon: Option<String>,
    color: Option<String>,
    is_pinned: bool,
    has_git: bool,
    has_api_collections: bool,
    detected_ecosystems: Option<String>,
    last_opened: Option<String>,
    created_at: String,
}

impl ProjectRow {
    fn into_project(self) -> Result<Project> {
        let id = Uuid::parse_str(&self.id).unwrap_or_else(|_| Uuid::new_v4());
        let path = PathBuf::from(self.path);
        let detected_ecosystems: Vec<Ecosystem> = match self.detected_ecosystems {
            Some(s) if !s.is_empty() => serde_json::from_str(&s).unwrap_or_default(),
            _ => Vec::new(),
        };
        let last_opened = self
            .last_opened
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc)));
        let created_at = DateTime::parse_from_rfc3339(&self.created_at)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());

        Ok(Project {
            id,
            name: self.name,
            path,
            icon: self.icon,
            color: self.color,
            is_pinned: self.is_pinned,
            last_opened,
            created_at,
            has_git: self.has_git,
            has_api_collections: self.has_api_collections,
            detected_ecosystems,
            git: None,
            api: None,
            run: None,
        })
    }
}

impl Registry {
    /// Connects to (and creates if needed) the machine-global registry database.
    pub async fn open(db_path: impl AsRef<Path>) -> Result<Self> {
        let path = db_path.as_ref();
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)?;
            }
        }
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;

        let registry = Self { pool };
        registry.run_migrations().await?;
        Ok(registry)
    }

    pub async fn run_migrations(&self) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT UNIQUE NOT NULL,
                icon TEXT,
                color TEXT,
                is_pinned BOOLEAN DEFAULT 0,
                has_git BOOLEAN DEFAULT 0,
                has_api_collections BOOLEAN DEFAULT 0,
                detected_ecosystems TEXT,
                last_opened TEXT,
                last_opened_by TEXT,
                created_at TEXT NOT NULL
            );
            "#,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn save_project(&self, project: &Project, opened_by: &str) -> Result<()> {
        let ecosystems_json = serde_json::to_string(&project.detected_ecosystems)?;
        let id_str = project.id.to_string();
        let path_str = project.path.to_string_lossy().to_string();
        let last_opened_str = project.last_opened.map(|dt| dt.to_rfc3339());
        let created_at_str = project.created_at.to_rfc3339();

        sqlx::query(
            r#"
            INSERT INTO projects (
                id, name, path, icon, color, is_pinned, has_git, has_api_collections,
                detected_ecosystems, last_opened, last_opened_by, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                name = excluded.name,
                icon = excluded.icon,
                color = excluded.color,
                is_pinned = excluded.is_pinned,
                has_git = excluded.has_git,
                has_api_collections = excluded.has_api_collections,
                detected_ecosystems = excluded.detected_ecosystems,
                last_opened = excluded.last_opened,
                last_opened_by = excluded.last_opened_by
            "#,
        )
        .bind(&id_str)
        .bind(&project.name)
        .bind(&path_str)
        .bind(&project.icon)
        .bind(&project.color)
        .bind(project.is_pinned)
        .bind(project.has_git)
        .bind(project.has_api_collections)
        .bind(&ecosystems_json)
        .bind(&last_opened_str)
        .bind(opened_by)
        .bind(&created_at_str)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_project_by_path(&self, path: impl AsRef<Path>) -> Result<Option<Project>> {
        let path_str = path.as_ref().to_string_lossy().to_string();
        let row = sqlx::query_as::<_, ProjectRow>("SELECT * FROM projects WHERE path = ?")
            .bind(path_str)
            .fetch_optional(&self.pool)
            .await?;

        match row {
            Some(r) => Ok(Some(r.into_project()?)),
            None => Ok(None),
        }
    }

    pub async fn list_projects(&self) -> Result<Vec<Project>> {
        let rows = sqlx::query_as::<_, ProjectRow>("SELECT * FROM projects ORDER BY last_opened DESC")
            .fetch_all(&self.pool)
            .await?;

        let mut projects = Vec::new();
        for r in rows {
            projects.push(r.into_project()?);
        }
        Ok(projects)
    }
}
