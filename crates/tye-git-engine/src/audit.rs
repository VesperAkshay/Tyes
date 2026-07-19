use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditEvent {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub action: String,
    pub user: String,
    pub resource: String,
    pub details: String,
}

impl AuditEvent {
    pub fn new(action: &str, user: &str, resource: &str, details: &str) -> Self {
        Self {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            action: action.to_string(),
            user: user.to_string(),
            resource: resource.to_string(),
            details: details.to_string(),
        }
    }

    pub fn append_to_log(&self, log_path: &Path) -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)?;

        let json = serde_json::to_string(self)?;
        writeln!(file, "{}", json)
    }
}
