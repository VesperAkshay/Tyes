use std::fs;
use std::path::Path;
use crate::PluginManifest;

pub struct PluginRegistry;

impl PluginRegistry {
    pub fn scan_plugins(base_path: &Path) -> Result<Vec<PluginManifest>, String> {
        let mut plugins = Vec::new();

        if !base_path.exists() {
            // It's okay if the directory doesn't exist yet
            return Ok(plugins);
        }

        let entries = fs::read_dir(base_path)
            .map_err(|e| format!("Failed to read plugin directory: {}", e))?;

        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let path = entry.path();
            if path.is_dir() {
                let manifest_path = path.join("manifest.json");
                if manifest_path.exists() {
                    match fs::read_to_string(&manifest_path) {
                        Ok(content) => {
                            match serde_json::from_str::<PluginManifest>(&content) {
                                Ok(manifest) => {
                                    plugins.push(manifest);
                                },
                                Err(e) => {
                                    eprintln!("Failed to parse manifest {:?}: {}", manifest_path, e);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to read manifest {:?}: {}", manifest_path, e);
                        }
                    }
                }
            }
        }

        Ok(plugins)
    }
}
