use crate::error::Result;
use chrono::Utc;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    FromRow, Pool, Sqlite,
};
use std::path::Path;
use tye_core_models::{Environment, EnvironmentScope, EnvironmentVariable, EnvValue};
use uuid::Uuid;

#[derive(Clone)]
pub struct ProjectStorage {
    pool: Pool<Sqlite>,
}

#[derive(FromRow)]
struct EnvRow {
    id: String,
    name: String,
    scope: String,
    is_active: bool,
    color: Option<String>,
}

#[derive(FromRow)]
struct VarRow {
    key: String,
    value_type: String,
    value: String,
    is_secret: bool,
}

impl ProjectStorage {
    pub async fn open(project_root: impl AsRef<Path>) -> Result<Self> {
        let db_dir = project_root.as_ref().join(".tye");
        if !db_dir.exists() {
            std::fs::create_dir_all(&db_dir)?;
        }
        let db_path = db_dir.join("project.db");

        let options = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;

        let storage = Self { pool };
        storage.run_migrations().await?;
        Ok(storage)
    }

    pub async fn run_migrations(&self) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS core_environments (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                scope TEXT NOT NULL,
                is_active BOOLEAN DEFAULT 0,
                color TEXT
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS core_environment_variables (
                environment_id TEXT NOT NULL,
                key TEXT NOT NULL,
                value_type TEXT NOT NULL,
                value TEXT NOT NULL,
                is_secret BOOLEAN DEFAULT 0,
                PRIMARY KEY (environment_id, key),
                FOREIGN KEY (environment_id) REFERENCES core_environments(id) ON DELETE CASCADE
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS core_events_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn save_environment(&self, env: &Environment) -> Result<()> {
        let id_str = env.id.to_string();
        let project_id_str = env.project_id.to_string();
        let scope_str = match env.scope {
            EnvironmentScope::Project => "Project",
            EnvironmentScope::ApiOnly => "ApiOnly",
            EnvironmentScope::RunOnly => "RunOnly",
        };

        sqlx::query(
            r#"
            INSERT INTO core_environments (id, project_id, name, scope, is_active, color)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                scope = excluded.scope,
                is_active = excluded.is_active,
                color = excluded.color
            "#,
        )
        .bind(&id_str)
        .bind(&project_id_str)
        .bind(&env.name)
        .bind(scope_str)
        .bind(env.is_active)
        .bind(&env.color)
        .execute(&self.pool)
        .await?;

        sqlx::query("DELETE FROM core_environment_variables WHERE environment_id = ?")
            .bind(&id_str)
            .execute(&self.pool)
            .await?;

        for var in &env.variables {
            let (value_type, value_str) = match &var.value {
                EnvValue::Plain(s) => ("Plain", s.as_str()),
                EnvValue::VaultRef(s) => ("VaultRef", s.as_str()),
            };

            sqlx::query(
                r#"
                INSERT INTO core_environment_variables (environment_id, key, value_type, value, is_secret)
                VALUES (?, ?, ?, ?, ?)
                "#,
            )
            .bind(&id_str)
            .bind(&var.key)
            .bind(value_type)
            .bind(value_str)
            .bind(var.is_secret)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    pub async fn get_environments(&self, project_id: Uuid) -> Result<Vec<Environment>> {
        let project_id_str = project_id.to_string();
        let rows = sqlx::query_as::<_, EnvRow>("SELECT * FROM core_environments WHERE project_id = ?")
            .bind(&project_id_str)
            .fetch_all(&self.pool)
            .await?;

        let mut envs = Vec::new();
        for r in rows {
            let scope = match r.scope.as_str() {
                "ApiOnly" => EnvironmentScope::ApiOnly,
                "RunOnly" => EnvironmentScope::RunOnly,
                _ => EnvironmentScope::Project,
            };

            let var_rows = sqlx::query_as::<_, VarRow>(
                "SELECT * FROM core_environment_variables WHERE environment_id = ?",
            )
            .bind(&r.id)
            .fetch_all(&self.pool)
            .await?;

            let mut variables = Vec::new();
            for vr in var_rows {
                let value = match vr.value_type.as_str() {
                    "VaultRef" => EnvValue::VaultRef(vr.value),
                    _ => EnvValue::Plain(vr.value),
                };
                variables.push(EnvironmentVariable {
                    key: vr.key,
                    value,
                    is_secret: vr.is_secret,
                });
            }

            envs.push(Environment {
                id: Uuid::parse_str(&r.id).unwrap_or_default(),
                project_id,
                name: r.name,
                scope,
                variables,
                is_active: r.is_active,
                color: r.color,
            });
        }

        Ok(envs)
    }

    pub async fn log_event(&self, project_id: Uuid, event_type: &str, payload: &str) -> Result<()> {
        let created_at = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO core_events_log (project_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(project_id.to_string())
        .bind(event_type)
        .bind(payload)
        .bind(created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
