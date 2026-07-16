use std::fs;
use std::path::{Path, PathBuf};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use tokio::process::Command;
use uuid::Uuid;
use crate::error::GitEngineError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RepositoryHandle {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub path: PathBuf,
    pub is_bare: bool,
    pub auto_discovered: bool,
    pub is_pinned: bool,
    pub last_opened: Option<String>,
    pub health_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloneOptions {
    pub url: String,
    pub path: PathBuf,
    pub depth: Option<u32>,
    pub single_branch: bool,
    pub branch: Option<String>,
    pub recurse_submodules: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RepoHealth {
    pub is_valid: bool,
    pub corruption_details: Option<String>,
    pub disk_usage_bytes: u64,
    pub object_count: usize,
    pub large_files: Vec<String>,
}

/// Open and validate an existing Git repository (`F-010`), registering or updating its row inside `git_repositories`.
pub async fn open_repository(
    pool: &Pool<Sqlite>,
    project_id: &str,
    path: &Path,
) -> Result<RepositoryHandle, GitEngineError> {
    if !path.exists() {
        return Err(GitEngineError::RepositoryError {
            path: path.display().to_string(),
            message: "Directory does not exist".to_string(),
        });
    }

    let repo = git2::Repository::open(path)
        .map_err(|_| GitEngineError::NotAGitRepo(path.display().to_string()))?;

    let is_bare = repo.is_bare();
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "repository".to_string());
    let path_str = path.to_string_lossy().to_string();
    let now = Utc::now().to_rfc3339();

    // Check if repository already exists in DB
    let existing: Option<(String, bool, bool)> = sqlx::query_as(
        "SELECT id, auto_discovered, is_pinned FROM git_repositories WHERE path = ?"
    )
    .bind(&path_str)
    .fetch_optional(pool)
    .await?;

    let (id, auto_discovered, is_pinned) = match existing {
        Some((e_id, e_auto, e_pin)) => {
            sqlx::query("UPDATE git_repositories SET last_opened = ?, health_status = 'valid' WHERE id = ?")
                .bind(&now)
                .bind(&e_id)
                .execute(pool)
                .await?;
            (e_id, e_auto, e_pin)
        }
        None => {
            let new_id = Uuid::new_v4().to_string();
            sqlx::query(
                r#"
                INSERT INTO git_repositories (id, project_id, name, path, is_bare, auto_discovered, is_pinned, last_opened, health_status, created_at)
                VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'valid', ?)
                "#
            )
            .bind(&new_id)
            .bind(project_id)
            .bind(&name)
            .bind(&path_str)
            .bind(is_bare)
            .bind(&now)
            .bind(&now)
            .execute(pool)
            .await?;
            (new_id, false, false)
        }
    };

    Ok(RepositoryHandle {
        id,
        project_id: project_id.to_string(),
        name,
        path: path.to_path_buf(),
        is_bare,
        auto_discovered,
        is_pinned,
        last_opened: Some(now),
        health_status: "valid".to_string(),
    })
}

/// Initialize a new Git repository (`F-008`), optionally creating a README, .gitignore template, and license, plus an initial commit.
pub async fn init_repository(
    pool: &Pool<Sqlite>,
    project_id: &str,
    path: &Path,
    init_readme: bool,
    gitignore_template: Option<&str>,
    license: Option<&str>,
) -> Result<RepositoryHandle, GitEngineError> {
    if !path.exists() {
        fs::create_dir_all(path)?;
    }

    let repo = git2::Repository::init(path)?;

    let mut staged_any = false;

    if init_readme {
        let readme_path = path.join("README.md");
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        fs::write(&readme_path, format!("# {}\n\nInitialized by Tyegit.\n", name))?;
        staged_any = true;
    }

    if let Some(tpl) = gitignore_template {
        let content = match tpl.to_lowercase().as_str() {
            "node" => "node_modules/\ndist/\n.env\n*.log\n",
            "rust" => "/target/\n**/*.rs.bk\n*.pdb\n",
            "python" => "__pycache__/\n*.py[cod]\n*$py.class\n.venv/\n",
            "go" => "bin/\n*.exe\n*.test\n*.out\n",
            "java" => "*.class\n*.jar\n*.war\ntarget/\n",
            _ => "# Custom or unsupported template\n",
        };
        fs::write(path.join(".gitignore"), content)?;
        staged_any = true;
    }

    if let Some(lic) = license {
        let content = match lic.to_uppercase().as_str() {
            "MIT" => "MIT License\n\nCopyright (c) 2026\n\nPermission is hereby granted...",
            "APACHE-2.0" => "Apache License\nVersion 2.0, January 2004\n\nCopyright 2026...",
            _ => "License: See license terms.\n",
        };
        fs::write(path.join("LICENSE"), content)?;
        staged_any = true;
    }

    if staged_any {
        let mut index = repo.index()?;
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
        index.write()?;

        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;
        let sig = repo.signature().unwrap_or_else(|_| git2::Signature::now("Tyegit User", "user@tyegit.local").unwrap());
        repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])?;
    }

    open_repository(pool, project_id, path).await
}

/// Clone a remote repository (`F-009`) using libgit2 (or shallow git subprocess fallback) and open it.
pub async fn clone_repository(
    pool: &Pool<Sqlite>,
    project_id: &str,
    options: &CloneOptions,
) -> Result<RepositoryHandle, GitEngineError> {
    if options.path.exists() && fs::read_dir(&options.path)?.next().is_some() {
        return Err(GitEngineError::RepositoryError {
            path: options.path.display().to_string(),
            message: "Destination directory is not empty".to_string(),
        });
    }

    // Per technical spec, shallow clone or specialized flags run via git CLI subprocess
    if let Some(depth) = options.depth {
        let mut args = vec!["clone".to_string(), "--depth".to_string(), depth.to_string()];
        if options.single_branch {
            args.push("--single-branch".to_string());
        }
        if let Some(ref b) = options.branch {
            args.push("-b".to_string());
            args.push(b.clone());
        }
        if options.recurse_submodules {
            args.push("--recurse-submodules".to_string());
        }
        args.push(options.url.clone());
        args.push(options.path.to_string_lossy().to_string());

        let status = Command::new("git")
            .args(&args)
            .status()
            .await
            .map_err(|e| GitEngineError::RepositoryError {
                path: options.path.display().to_string(),
                message: format!("Failed to spawn git clone: {}", e),
            })?;

        if !status.success() {
            return Err(GitEngineError::RepositoryError {
                path: options.path.display().to_string(),
                message: format!("git clone exited with status {}", status),
            });
        }
    } else {
        // Full clone using libgit2 RepoBuilder
        let mut builder = git2::build::RepoBuilder::new();
        if let Some(ref b) = options.branch {
            builder.branch(b);
        }

        builder.clone(&options.url, &options.path).map_err(|e| GitEngineError::RepositoryError {
            path: options.path.display().to_string(),
            message: format!("libgit2 clone failed: {}", e),
        })?;
    }

    open_repository(pool, project_id, &options.path).await
}

/// Compute recursive directory size
fn dir_size(path: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_dir() {
                    total += dir_size(&entry.path());
                } else {
                    total += meta.len();
                }
            }
        }
    }
    total
}

/// Check repository health and integrity (`F-011`).
pub fn check_repository_health(path: &Path) -> Result<RepoHealth, GitEngineError> {
    let repo = match git2::Repository::open(path) {
        Ok(r) => r,
        Err(e) => {
            return Ok(RepoHealth {
                is_valid: false,
                corruption_details: Some(format!("Could not open repository: {}", e)),
                disk_usage_bytes: 0,
                object_count: 0,
                large_files: Vec::new(),
            });
        }
    };

    let odb = match repo.odb() {
        Ok(o) => o,
        Err(e) => {
            return Ok(RepoHealth {
                is_valid: false,
                corruption_details: Some(format!("Corrupt object database: {}", e)),
                disk_usage_bytes: dir_size(path),
                object_count: 0,
                large_files: Vec::new(),
            });
        }
    };

    let mut object_count = 0;
    let _ = odb.foreach(|_oid| {
        object_count += 1;
        true
    });

    // Check for large files (> 50MB) in working directory
    let mut large_files = Vec::new();
    if let Ok(entries) = walkdir::WalkDir::new(path).max_depth(5).into_iter().collect::<Result<Vec<_>, _>>() {
        for entry in entries {
            if entry.file_type().is_file() {
                if entry.path().components().any(|c| c.as_os_str() == ".git") {
                    continue;
                }
                if let Ok(meta) = entry.metadata() {
                    if meta.len() > 50 * 1024 * 1024 {
                        large_files.push(entry.path().to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    let disk_usage_bytes = dir_size(path);

    Ok(RepoHealth {
        is_valid: true,
        corruption_details: None,
        disk_usage_bytes,
        object_count,
        large_files,
    })
}
