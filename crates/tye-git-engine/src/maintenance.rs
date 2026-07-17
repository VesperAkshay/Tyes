use std::path::Path;
use tokio::process::Command;
use crate::error::GitEngineError;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GcResult {
    pub message: String,
    pub space_saved_kb: i64,
    pub objects_packed: i64,
}

#[derive(Default)]
struct ObjectStats {
    size_loose_kb: i64,
    size_pack_kb: i64,
    in_pack: i64,
}

async fn get_object_stats(repo_path: &Path) -> Result<ObjectStats, GitEngineError> {
    let output = Command::new("git")
        .arg("count-objects")
        .arg("-v")
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| GitEngineError::RepositoryError {
            path: repo_path.display().to_string(),
            message: format!("Failed to execute git count-objects: {}", e),
        })?;

    if !output.status.success() {
        return Ok(ObjectStats::default());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut stats = ObjectStats::default();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(2, ':').map(|s| s.trim()).collect();
        if parts.len() == 2 {
            let val = parts[1].parse::<i64>().unwrap_or(0);
            match parts[0] {
                "size" => stats.size_loose_kb = val,
                "size-pack" => stats.size_pack_kb = val,
                "in-pack" => stats.in_pack = val,
                _ => {}
            }
        }
    }

    Ok(stats)
}

/// Runs `git gc` on the specified repository to optimize performance and reduce disk space.
pub async fn run_git_gc(repo_path: &Path) -> Result<GcResult, GitEngineError> {
    // Get stats BEFORE gc
    let stats_before = get_object_stats(repo_path).await?;
    let total_size_before = stats_before.size_loose_kb + stats_before.size_pack_kb;

    let output = Command::new("git")
        .arg("gc")
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| GitEngineError::RepositoryError {
            path: repo_path.display().to_string(),
            message: format!("Failed to execute git gc: {}", e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(GitEngineError::RepositoryError {
            path: repo_path.display().to_string(),
            message: format!("git gc failed: {}", stderr),
        });
    }

    // Get stats AFTER gc
    let stats_after = get_object_stats(repo_path).await?;
    let total_size_after = stats_after.size_loose_kb + stats_after.size_pack_kb;
    
    let space_saved_kb = total_size_before - total_size_after;
    let objects_packed = stats_after.in_pack;

    Ok(GcResult {
        message: "Repository optimized successfully".to_string(),
        space_saved_kb,
        objects_packed,
    })
}
