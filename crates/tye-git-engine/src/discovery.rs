use std::path::PathBuf;
use sqlx::{Pool, Sqlite};
use walkdir::WalkDir;
use crate::error::GitEngineError;
use crate::repository::{open_repository, RepositoryHandle};

/// Scan directories (`F-007`) across `root_dirs` up to max depth 4, detecting valid `.git` repositories while respecting exclude patterns (`node_modules`, `target`, `.cargo`, etc.).
pub async fn scan_directories(
    pool: &Pool<Sqlite>,
    project_id: &str,
    root_dirs: &[PathBuf],
    exclude_patterns: &[String],
) -> Result<Vec<RepositoryHandle>, GitEngineError> {
    let mut discovered_paths = Vec::new();

    for root in root_dirs {
        if !root.exists() {
            continue;
        }

        let walker = WalkDir::new(root).max_depth(4).into_iter();
        for entry in walker.filter_entry(|e| {
            let fname = e.file_name().to_string_lossy();
            if fname == "node_modules" || fname == "target" || fname == ".cargo" || fname == ".venv" || fname.contains("$RECYCLE") || fname.contains(".Trash") || fname.contains("System Volume Information") {
                return false;
            }
            for pattern in exclude_patterns {
                if fname.eq_ignore_ascii_case(pattern) {
                    return false;
                }
            }
            true
        }) {
            if let Ok(e) = entry {
                if e.file_name() == ".git" && e.path().is_dir() {
                    if let Some(repo_root) = e.path().parent() {
                        discovered_paths.push(repo_root.to_path_buf());
                    }
                }
            }
        }
    }

    let mut handles = Vec::new();
    for path in discovered_paths {
        if let Ok(mut handle) = open_repository(pool, project_id, &path).await {
            // Mark as auto-discovered in DB
            let _ = sqlx::query("UPDATE git_repositories SET auto_discovered = 1 WHERE id = ?")
                .bind(&handle.id)
                .execute(pool)
                .await;
            handle.auto_discovered = true;
            handles.push(handle);
        }
    }

    Ok(handles)
}
