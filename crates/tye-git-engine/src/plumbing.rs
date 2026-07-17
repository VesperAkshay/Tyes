use std::path::Path;
use std::process::Command;
use crate::error::GitEngineError;
use sqlx::SqlitePool;
use crate::checkpoint::capture_pre_op;

pub async fn git_plumbing_execute_safe(repo_path: &Path, args: Vec<String>) -> Result<String, GitEngineError> {
    // List of safe commands that don't modify the database or refs in a destructive way
    let safe_commands = ["hash-object", "cat-file", "rev-parse", "symbolic-ref", "rev-list", "pack-objects", "unpack-objects", "ls-tree", "show-ref"];
    
    if args.is_empty() {
        return Err(GitEngineError::RepositoryError {
            path: repo_path.display().to_string(),
            message: "No command provided".to_string(),
        });
    }

    let cmd_name = &args[0];
    if !safe_commands.contains(&cmd_name.as_str()) {
        return Err(GitEngineError::RepositoryError {
            path: repo_path.display().to_string(),
            message: format!("Command '{}' is not considered a safe plumbing command. Use the dangerous endpoint.", cmd_name),
        });
    }

    execute_git_command(repo_path, args)
}

pub async fn git_plumbing_execute_dangerous(pool: &SqlitePool, repo_path: &Path, args: Vec<String>) -> Result<String, GitEngineError> {
    // List of dangerous commands that modify refs, history, or object db
    let dangerous_commands = ["update-ref", "update-index", "write-tree", "read-tree", "commit-tree"];
    
    if args.is_empty() {
        return Err(GitEngineError::RepositoryError {
            path: repo_path.display().to_string(),
            message: "No command provided".to_string(),
        });
    }

    let cmd_name = &args[0];
    if !dangerous_commands.contains(&cmd_name.as_str()) {
        return Err(GitEngineError::RepositoryError {
            path: repo_path.display().to_string(),
            message: format!("Command '{}' is not recognized as a dangerous plumbing command.", cmd_name),
        });
    }

    // Time Machine Integration!
    // Take a snapshot before doing anything destructive
    let reason = format!("dangerous plumbing command: git {}", args.join(" "));
    let _ = capture_pre_op(pool, repo_path, &reason, true).await;

    execute_git_command(repo_path, args)
}

fn execute_git_command(repo_path: &Path, args: Vec<String>) -> Result<String, GitEngineError> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(&args)
        .output()
        .map_err(|e| GitEngineError::RepositoryError {
            path: repo_path.display().to_string(),
            message: format!("Failed to execute git process: {}", e),
        })?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(GitEngineError::RepositoryError {
            path: repo_path.display().to_string(),
            message: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }
}
