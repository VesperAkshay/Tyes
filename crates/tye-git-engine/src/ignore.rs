use std::fs::{OpenOptions, read_to_string};
use std::io::Write;
use std::path::Path;
use crate::error::GitEngineError;

pub fn ignore_file(repo_path: &Path, file_path: &str) -> Result<(), GitEngineError> {
    let gitignore_path = repo_path.join(".gitignore");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&gitignore_path)?;

    let ends_with_newline = if let Ok(contents) = read_to_string(&gitignore_path) {
        contents.is_empty() || contents.ends_with('\n')
    } else {
        true
    };

    if !ends_with_newline {
        writeln!(file)?;
    }
    writeln!(file, "{}", file_path)?;
    Ok(())
}

pub fn unignore_file(repo_path: &Path, file_path: &str) -> Result<(), GitEngineError> {
    let gitignore_path = repo_path.join(".gitignore");
    if !gitignore_path.exists() {
        return Ok(());
    }
    let contents = read_to_string(&gitignore_path)?;
    let mut new_contents = String::new();
    let mut changed = false;

    for line in contents.lines() {
        if line.trim() == file_path {
            changed = true;
        } else {
            new_contents.push_str(line);
            new_contents.push('\n');
        }
    }

    if changed {
        std::fs::write(&gitignore_path, new_contents)?;
    }
    Ok(())
}
