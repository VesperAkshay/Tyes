use std::path::Path;
use git2::{build::CheckoutBuilder, IndexAddOption};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum DiscardType {
    Unstaged,
    Staged,
    Untracked,
    AllUnstaged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineSelection {
    pub file_path: String,
    pub hunk_index: usize,
    pub line_indices: Vec<usize>,
}

/// Stage a single file to index (`F-015`).
pub fn stage_file(repo_path: &Path, file_path: &str) -> Result<(), crate::error::GitEngineError> {
    let repo = git2::Repository::open(repo_path)?;
    let mut index = repo.index()?;
    index.add_path(Path::new(file_path))?;
    index.write()?;
    Ok(())
}

/// Unstage a single file from index (`F-015`).
pub fn unstage_file(repo_path: &Path, file_path: &str) -> Result<(), crate::error::GitEngineError> {
    let repo = git2::Repository::open(repo_path)?;
    let mut index = repo.index()?;

    if let Ok(head) = repo.head() {
        if let Ok(tree) = head.peel_to_tree() {
            if let Ok(entry) = tree.get_path(Path::new(file_path)) {
                let index_entry = git2::IndexEntry {
                    ctime: git2::IndexTime::new(0, 0),
                    mtime: git2::IndexTime::new(0, 0),
                    dev: 0,
                    ino: 0,
                    mode: entry.filemode() as u32,
                    uid: 0,
                    gid: 0,
                    file_size: 0,
                    id: entry.id(),
                    flags: 0,
                    flags_extended: 0,
                    path: file_path.as_bytes().to_vec(),
                };
                index.add(&index_entry)?;
                index.write()?;
                return Ok(());
            }
        }
    }
    // If no HEAD or file not in HEAD, remove from index
    let _ = index.remove_path(Path::new(file_path));
    index.write()?;
    Ok(())
}

/// Stage all unstaged and untracked changes (`F-015`).
pub fn stage_all(repo_path: &Path) -> Result<(), crate::error::GitEngineError> {
    let repo = git2::Repository::open(repo_path)?;
    let mut index = repo.index()?;
    index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
    index.write()?;
    Ok(())
}

/// Unstage all staged changes (`F-015`).
pub fn unstage_all(repo_path: &Path) -> Result<(), crate::error::GitEngineError> {
    let repo = git2::Repository::open(repo_path)?;
    let mut index = repo.index()?;

    if let Ok(head) = repo.head() {
        if let Ok(tree) = head.peel_to_tree() {
            index.read_tree(&tree)?;
            index.write()?;
            return Ok(());
        }
    }
    index.clear()?;
    index.write()?;
    Ok(())
}

/// Stage exact hunk or patch string (`F-016`).
pub fn stage_patch(repo_path: &Path, patch_str: &str) -> Result<(), crate::error::GitEngineError> {
    let repo = git2::Repository::open(repo_path)?;

    // Attempt 1: Standard libgit2 apply to Index
    if let Ok(diff) = git2::Diff::from_buffer(patch_str.as_bytes()) {
        if let Ok(()) = repo.apply(&diff, git2::ApplyLocation::Index, None) {
            if let Ok(mut index) = repo.index() {
                let _ = index.write();
            }
            return Ok(());
        }
    }

    // Attempt 2: If libgit2 failed (e.g. ApplyFail -35 due to CRLF vs LF line endings in patch),
    // toggle CRLF/LF line endings in patch body (`+`, `-`, ` `) and retry libgit2 apply.
    let toggled_patch = if patch_str.contains("\r\n") {
        patch_str.replace("\r\n", "\n")
    } else {
        patch_str.lines().map(|line| format!("{}\r\n", line)).collect::<String>()
    };
    if let Ok(diff_toggled) = git2::Diff::from_buffer(toggled_patch.as_bytes()) {
        if let Ok(()) = repo.apply(&diff_toggled, git2::ApplyLocation::Index, None) {
            if let Ok(mut index) = repo.index() {
                let _ = index.write();
            }
            return Ok(());
        }
    }

    // Attempt 3: If libgit2 still rejects patch due to core.autocrlf or index filtering (`ApplyFail(-35)`),
    // fall back to robust git CLI: `git apply --cached --ignore-whitespace` via stdin.
    use std::process::Command;
    use std::io::Write;

    let mut child = Command::new("git")
        .arg("apply")
        .arg("--cached")
        .arg("--ignore-whitespace")
        .arg("-")
        .current_dir(repo_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| crate::error::GitEngineError::Git2Error(git2::Error::from_str(&format!("Failed to spawn git apply: {}", e))))?;

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(patch_str.as_bytes());
    }

    let output = child.wait_with_output()
        .map_err(|e| crate::error::GitEngineError::Git2Error(git2::Error::from_str(&format!("git apply process failed: {}", e))))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(crate::error::GitEngineError::Git2Error(git2::Error::from_str(&format!(
            "Patch apply failed (libgit2 ApplyFail(-35) & git apply error): {}", stderr.trim()
        ))));
    }

    // Refresh index after git CLI apply
    if let Ok(mut index) = repo.index() {
        let _ = index.read(true);
    }

    Ok(())
}

/// Discard changes in working tree or move untracked files to OS recycle bin (`F-018`).
pub fn discard_changes(
    repo_path: &Path,
    file_path: Option<&str>,
    discard_type: DiscardType,
) -> Result<(), crate::error::GitEngineError> {
    let repo = git2::Repository::open(repo_path)?;

    match discard_type {
        DiscardType::Unstaged => {
            if let Some(fp) = file_path {
                let mut cb = CheckoutBuilder::new();
                cb.path(fp).force();
                if let Ok(head) = repo.head() {
                    if let Ok(obj) = head.peel(git2::ObjectType::Any) {
                        let _ = repo.checkout_tree(&obj, Some(&mut cb));
                    }
                } else {
                    // No head yet, checkout index
                    let mut index = repo.index()?;
                    let _ = repo.checkout_index(Some(&mut index), Some(&mut cb));
                }
            }
        }
        DiscardType::Staged => {
            if let Some(fp) = file_path {
                unstage_file(repo_path, fp)?;
            }
        }
        DiscardType::Untracked => {
            if let Some(fp) = file_path {
                let full_p = repo_path.join(fp);
                if full_p.exists() {
                    // Use trash crate per user requirement ("for discard use os rescyle bin")
                    trash::delete(&full_p).map_err(|e| crate::error::GitEngineError::Git2Error(git2::Error::from_str(&format!("Trash delete failed: {}", e))))?;
                }
            }
        }
        DiscardType::AllUnstaged => {
            let mut cb = CheckoutBuilder::new();
            cb.force();
            if let Ok(head) = repo.head() {
                if let Ok(obj) = head.peel(git2::ObjectType::Any) {
                    let _ = repo.checkout_tree(&obj, Some(&mut cb));
                }
            } else {
                let mut index = repo.index()?;
                let _ = repo.checkout_index(Some(&mut index), Some(&mut cb));
            }
        }
    }

    Ok(())
}
