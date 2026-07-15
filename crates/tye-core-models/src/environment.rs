use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Environment {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub scope: EnvironmentScope,
    pub variables: Vec<EnvironmentVariable>,
    pub is_active: bool, // "active" is per-scope, not global
    pub color: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum EnvironmentScope {
    Project, // visible to git hooks, api requests, and run tasks alike
    ApiOnly, // API Tester's old per-collection environments
    RunOnly, // TyeRun's old per-workspace process env profiles
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EnvironmentVariable {
    pub key: String,
    pub value: EnvValue,
    pub is_secret: bool, // if true, `value` is a vault reference, never the raw string
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum EnvValue {
    Plain(String),
    VaultRef(String), // key into tye-vault, see Part G
}

impl Environment {
    pub fn new(project_id: Uuid, name: impl Into<String>, scope: EnvironmentScope) -> Self {
        Self {
            id: Uuid::new_v4(),
            project_id,
            name: name.into(),
            scope,
            variables: Vec::new(),
            is_active: false,
            color: None,
        }
    }
}
