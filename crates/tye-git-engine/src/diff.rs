use std::path::Path;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use git2::DiffOptions;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
    pub origin: char,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffView {
    pub file_path: String,
    pub is_staged: bool,
    pub is_binary: bool,
    pub hunks: Vec<DiffHunk>,
    pub insertions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageDiff {
    pub file_path: String,
    pub old_data: Option<String>,
    pub new_data: Option<String>,
    pub width: u32,
    pub height: u32,
    pub format: String,
}

/// Get detailed hunk and line diff for a specific file (`F-019`, `F-020`).
pub fn get_file_diff(
    repo_path: &Path,
    file_path: &str,
    staged: bool,
) -> Result<DiffView, crate::error::GitEngineError> {
    let repo = git2::Repository::open(repo_path)?;
    let mut opts = DiffOptions::new();
    opts.pathspec(file_path);

    let diff = if staged {
        if let Ok(head) = repo.head() {
            if let Ok(tree) = head.peel_to_tree() {
                repo.diff_tree_to_index(Some(&tree), None, Some(&mut opts))?
            } else {
                repo.diff_tree_to_index(None, None, Some(&mut opts))?
            }
        } else {
            repo.diff_tree_to_index(None, None, Some(&mut opts))?
        }
    } else {
        repo.diff_index_to_workdir(None, Some(&mut opts))?
    };

    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut current_hunk: Option<DiffHunk> = None;
    let mut insertions = 0;
    let mut deletions = 0;
    let mut is_binary = false;

    // Check if binary
    for delta in diff.deltas() {
        if delta.flags().contains(git2::DiffFlags::BINARY) {
            is_binary = true;
        }
    }

    if !is_binary {
        let _ = diff.print(git2::DiffFormat::Patch, |delta, hunk, line| {
            if delta.flags().contains(git2::DiffFlags::BINARY) {
                is_binary = true;
                return true;
            }

            if let Some(h) = hunk {
                let header = String::from_utf8_lossy(h.header()).trim().to_string();
                if current_hunk.as_ref().map_or(true, |ch| ch.header != header) {
                    if let Some(prev) = current_hunk.take() {
                        hunks.push(prev);
                    }
                    current_hunk = Some(DiffHunk {
                        header,
                        old_start: h.old_start(),
                        old_lines: h.old_lines(),
                        new_start: h.new_start(),
                        new_lines: h.new_lines(),
                        lines: Vec::new(),
                    });
                }
            }

            let origin = match line.origin() {
                '+' => {
                    insertions += 1;
                    '+'
                }
                '-' => {
                    deletions += 1;
                    '-'
                }
                ' ' => ' ',
                _ => return true,
            };

            if let Some(ch) = current_hunk.as_mut() {
                let content = String::from_utf8_lossy(line.content()).to_string();
                ch.lines.push(DiffLine {
                    old_lineno: line.old_lineno(),
                    new_lineno: line.new_lineno(),
                    origin,
                    content,
                });
            }

            true
        });

        if let Some(last) = current_hunk.take() {
            hunks.push(last);
        }
    }

    Ok(DiffView {
        file_path: file_path.to_string(),
        is_staged: staged,
        is_binary,
        hunks,
        insertions,
        deletions,
    })
}

/// Get base64 encoded image diff (`F-021`).
pub fn get_image_diff(
    repo_path: &Path,
    file_path: &str,
    staged: bool,
) -> Result<ImageDiff, crate::error::GitEngineError> {
    let repo = git2::Repository::open(repo_path)?;
    
    let ext = Path::new(file_path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();

    // Get old image from HEAD (or index if staged)
    let mut old_data = None;
    if let Ok(head) = repo.head() {
        if let Ok(tree) = head.peel_to_tree() {
            if let Ok(entry) = tree.get_path(Path::new(file_path)) {
                if let Ok(obj) = entry.to_object(&repo) {
                    if let Some(blob) = obj.as_blob() {
                        old_data = Some(BASE64.encode(blob.content()));
                    }
                }
            }
        }
    }

    // Get new image from Index (if staged) or Workdir (if unstaged)
    let mut new_data = None;
    if staged {
        let index = repo.index()?;
        if let Some(entry) = index.get_path(Path::new(file_path), 0) {
            if let Ok(blob) = repo.find_blob(entry.id) {
                new_data = Some(BASE64.encode(blob.content()));
            }
        }
    } else {
        let full_path = repo_path.join(file_path);
        if let Ok(bytes) = std::fs::read(&full_path) {
            new_data = Some(BASE64.encode(&bytes));
        }
    }

    Ok(ImageDiff {
        file_path: file_path.to_string(),
        old_data,
        new_data,
        width: 0,
        height: 0,
        format: ext,
    })
}
