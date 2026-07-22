use std::path::{Path, PathBuf};
use std::time::SystemTime;
use walkdir::WalkDir;
use crate::models::FileInfo;
use std::fs;

/// Given a list of paths (files or directories), recursively discovers all files
/// and constructs a list of `FileInfo` items, preserving relative directory structures
/// in `folder_source` and `folder_remote`.
pub fn get_files_info(paths: &[String]) -> Result<Vec<FileInfo>, String> {
    let mut files_info = Vec::new();

    for path_str in paths {
        let base_path = Path::new(path_str);
        
        if !base_path.exists() {
            return Err(format!("Path does not exist: {}", path_str));
        }

        if base_path.is_file() {
            let metadata = fs::metadata(base_path).map_err(|e| e.to_string())?;
            let file_name = base_path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let folder_source = base_path.parent().unwrap_or(Path::new(".")).to_string_lossy().to_string();
            
            files_info.push(FileInfo {
                name: Some(file_name),
                folder_remote: Some(".".to_string()),
                folder_source: Some(folder_source),
                hash: None, // Will be computed in the sender async loop
                size: Some(metadata.len() as i64),
                mod_time: Some(metadata.modified().unwrap_or(SystemTime::now())),
                is_compressed: Some(false),
                is_encrypted: Some(false),
                symlink: None,
                mode: Some(0o666),
                temp_file: Some(false),
                is_ignored: Some(false),
            });
        } else if base_path.is_dir() {
            // For directories, we want to preserve the name of the directory itself
            // as the root of the relative path, so if user sends "my_folder",
            // the remote gets "my_folder/..."
            let base_folder_name = base_path.file_name().unwrap_or_default().to_string_lossy().to_string();

            for entry in WalkDir::new(base_path).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_file() {
                    let metadata = entry.metadata().map_err(|e| e.to_string())?;
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    
                    // Compute relative path
                    let relative_path = path.strip_prefix(base_path).unwrap_or(path);
                    let mut folder_remote = PathBuf::from(&base_folder_name);
                    
                    if let Some(parent) = relative_path.parent() {
                        if parent != Path::new("") {
                            folder_remote.push(parent);
                        }
                    }
                    
                    // Folder source is the actual absolute path to the directory on the local disk
                    let folder_source = path.parent().unwrap_or(Path::new(".")).to_string_lossy().to_string();

                    // Standardize slashes to forward slashes for cross-platform remote compatibility
                    let folder_remote_str = folder_remote.to_string_lossy().replace("\\", "/");

                    files_info.push(FileInfo {
                        name: Some(file_name),
                        folder_remote: Some(folder_remote_str),
                        folder_source: Some(folder_source),
                        hash: None,
                        size: Some(metadata.len() as i64),
                        mod_time: Some(metadata.modified().unwrap_or(SystemTime::now())),
                        is_compressed: Some(false),
                        is_encrypted: Some(false),
                        symlink: None,
                        mode: Some(0o666),
                        temp_file: Some(false),
                        is_ignored: Some(false),
                    });
                }
            }
        }
    }

    Ok(files_info)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use tempfile::tempdir;

    #[test]
    fn test_get_files_info_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        File::create(&file_path).unwrap();

        let paths = vec![file_path.to_string_lossy().to_string()];
        let infos = get_files_info(&paths).unwrap();

        assert_eq!(infos.len(), 1);
        assert_eq!(infos[0].name.as_deref(), Some("test.txt"));
        assert_eq!(infos[0].folder_remote.as_deref(), Some("."));
    }

    #[test]
    fn test_get_files_info_dir() {
        let dir = tempdir().unwrap();
        let root_dir = dir.path().join("my_folder");
        fs::create_dir(&root_dir).unwrap();
        
        let sub_dir = root_dir.join("sub");
        fs::create_dir(&sub_dir).unwrap();

        File::create(root_dir.join("root.txt")).unwrap();
        File::create(sub_dir.join("sub.txt")).unwrap();

        let paths = vec![root_dir.to_string_lossy().to_string()];
        let mut infos = get_files_info(&paths).unwrap();
        
        // Sort by name to make assertions deterministic
        infos.sort_by(|a, b| a.name.cmp(&b.name));

        assert_eq!(infos.len(), 2);
        
        assert_eq!(infos[0].name.as_deref(), Some("root.txt"));
        assert_eq!(infos[0].folder_remote.as_deref(), Some("my_folder"));
        
        assert_eq!(infos[1].name.as_deref(), Some("sub.txt"));
        assert_eq!(infos[1].folder_remote.as_deref(), Some("my_folder/sub"));
    }
}
