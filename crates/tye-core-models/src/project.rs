use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

/// The one and only "opened folder" concept across the whole suite.
/// Replaces: API Tester's `Workspace`, TyeRun's `Workspace`, and stands
/// alongside (not instead of) Git Desktop's `RepositoryHandle`, which
/// becomes a satellite attached to a Project when a .git dir is found.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub path: PathBuf, // canonical root folder — the ONE identity key
    pub icon: Option<String>,
    pub color: Option<String>,
    pub is_pinned: bool,
    pub last_opened: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,

    // Presence flags, computed on open, cheap to recompute — not sources of truth.
    pub has_git: bool,
    pub has_api_collections: bool,
    pub detected_ecosystems: Vec<Ecosystem>,

    // Satellites — each module owns and migrates its own table/struct.
    // A standalone Tyegit build only ever populates `git`. A standalone
    // TyeApi build only ever populates `api`. Hub populates whichever exist.
    pub git: Option<GitProjectState>,
    pub api: Option<ApiProjectState>,
    pub run: Option<RunProjectState>,
}

impl Project {
    /// Creates a new `Project` struct in memory for a given path and name.
    pub fn new(name: impl Into<String>, path: impl Into<PathBuf>) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            path: path.into(),
            icon: None,
            color: None,
            is_pinned: false,
            last_opened: Some(Utc::now()),
            created_at: Utc::now(),
            has_git: false,
            has_api_collections: false,
            detected_ecosystems: Vec::new(),
            git: None,
            api: None,
            run: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitProjectState {
    pub repo: RepositoryHandle,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApiProjectState {
    pub settings: WorkspaceSettings,
    pub collections: Vec<Collection>,
    pub global_variables: Vec<Variable>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RunProjectState {
    pub tasks: Vec<Task>,
    pub task_groups: Vec<TaskGroup>,
    pub pipelines: Vec<Pipeline>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RepositoryHandle {
    pub id: Uuid,
    pub path: PathBuf,
    pub head_branch: Option<String>,
    pub is_bare: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct WorkspaceSettings {
    pub default_timeout_ms: u64,
    pub validate_ssl: bool,
    pub follow_redirects: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Collection {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub requests: Vec<ApiRequestStub>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ApiRequestStub {
    pub id: Uuid,
    pub name: String,
    pub method: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Variable {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Task {
    pub id: Uuid,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub working_directory: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskGroup {
    pub id: Uuid,
    pub name: String,
    pub task_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Pipeline {
    pub id: Uuid,
    pub name: String,
    pub trigger: String,
    pub task_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Ecosystem {
    Cargo,
    Npm,
    Pnpm,
    Yarn,
    Docker,
    Make,
    Go,
    Python,
    Custom(String),
}
