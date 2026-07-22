use std::path::Path;
use std::process::Command;
use crate::error::GitEngineError;

/// Creates a ZIP archive of a specific commit using the system `git archive` command.
/// This natively respects `.gitattributes` (like export-ignore).
pub fn create_archive(repo_path: &Path, commit_id: &str, output_path: &Path) -> Result<(), GitEngineError> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .arg("archive")
        .arg("--format=zip")
        .arg(format!("--output={}", output_path.display()))
        .arg(commit_id)
        .output()
        .map_err(|e| GitEngineError::Internal(format!("Failed to execute git archive: {}", e)))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(GitEngineError::Internal(format!("git archive failed: {}", err)));
    }

    Ok(())
}
