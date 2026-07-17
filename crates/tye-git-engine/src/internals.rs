use git2::{Repository, ObjectType, Oid};
use std::path::Path;
use crate::error::GitEngineError;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct GitObjectInfo {
    pub oid: String,
    pub kind: String,
    pub size: usize,
    pub content_hex: Option<String>,
    pub parsed_content: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GitTreeEntry {
    pub name: String,
    pub oid: String,
    pub kind: String,
    pub filemode: String,
}

pub fn git_internals_get_object(repo_path: &Path, oid_hex: &str) -> Result<GitObjectInfo, GitEngineError> {
    let repo = Repository::open(repo_path).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let oid = Oid::from_str(oid_hex).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: format!("Invalid OID '{}': {}", oid_hex, e.message()),
    })?;

    let obj = repo.find_object(oid, None).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: format!("Object not found: {}", e.message()),
    })?;

    let kind_str = match obj.kind() {
        Some(ObjectType::Commit) => "Commit",
        Some(ObjectType::Tree) => "Tree",
        Some(ObjectType::Blob) => "Blob",
        Some(ObjectType::Tag) => "Tag",
        _ => "Unknown",
    }.to_string();

    let odb = repo.odb().map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: format!("Failed to open ODB: {}", e.message()),
    })?;
    
    let raw = odb.read(oid).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: format!("Failed to read raw object: {}", e.message()),
    })?;

    let data = raw.data();
    let size = data.len();
    
    // Provide a simple hex dump string (up to a limit to prevent memory exhaustion on huge blobs)
    let max_hex_bytes = 2048;
    let hex = data.iter().take(max_hex_bytes).map(|b| format!("{:02x}", b)).collect::<Vec<String>>().join(" ");
    
    // Try to parse text content for Blob, Commit, and Tag
    let parsed = if kind_str == "Blob" || kind_str == "Commit" || kind_str == "Tag" {
        String::from_utf8(data.to_vec()).ok()
    } else {
        None
    };

    Ok(GitObjectInfo {
        oid: oid_hex.to_string(),
        kind: kind_str,
        size,
        content_hex: Some(hex),
        parsed_content: parsed,
    })
}

pub fn git_internals_search_prefix(repo_path: &Path, prefix: &str) -> Result<String, GitEngineError> {
    let repo = Repository::open(repo_path).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let odb = repo.odb().map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let mut found_oid = String::new();
    
    odb.foreach(|oid| {
        let oid_str = oid.to_string();
        if oid_str.starts_with(prefix) {
            found_oid = oid_str;
            return false; // stop iterating
        }
        true // continue
    }).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    if found_oid.is_empty() {
        return Err(GitEngineError::RepositoryError {
            path: repo_path.display().to_string(),
            message: format!("No object found matching prefix: {}", prefix),
        });
    }

    Ok(found_oid)
}

pub fn git_internals_get_tree(repo_path: &Path, tree_oid_hex: &str) -> Result<Vec<GitTreeEntry>, GitEngineError> {
    let repo = Repository::open(repo_path).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: e.message().to_string(),
    })?;

    let oid = Oid::from_str(tree_oid_hex).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: format!("Invalid OID '{}': {}", tree_oid_hex, e.message()),
    })?;

    let tree = repo.find_tree(oid).map_err(|e| GitEngineError::RepositoryError {
        path: repo_path.display().to_string(),
        message: format!("Tree not found: {}", e.message()),
    })?;

    let mut entries = Vec::new();
    for entry in tree.iter() {
        let kind = match entry.kind() {
            Some(ObjectType::Commit) => "Commit",
            Some(ObjectType::Tree) => "Tree",
            Some(ObjectType::Blob) => "Blob",
            Some(ObjectType::Tag) => "Tag",
            _ => "Unknown",
        }.to_string();

        entries.push(GitTreeEntry {
            name: entry.name().unwrap_or("").to_string(),
            oid: entry.id().to_string(),
            kind,
            filemode: format!("{:06o}", entry.filemode()),
        });
    }

    Ok(entries)
}
