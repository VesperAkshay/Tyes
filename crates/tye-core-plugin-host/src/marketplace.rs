use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const REGISTRY_URL: &str = "https://plugin.tyes.dev/api/v1/plugins.json";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RemotePluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub entry_point: String,
    pub permissions: Vec<String>,
    pub hooks: Vec<String>,
    pub download_url: String,
}

pub async fn fetch_marketplace_plugins() -> Result<Vec<RemotePluginManifest>, String> {
    let client = reqwest::Client::new();
    let res = client.get(REGISTRY_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch marketplace: {}", e))?;
    
    let plugins: Vec<RemotePluginManifest> = res.json()
        .await
        .map_err(|e| format!("Failed to parse marketplace response: {}", e))?;
        
    Ok(plugins)
}

pub async fn install_plugin(plugin: RemotePluginManifest) -> Result<(), String> {
    let home_path = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Could not find home directory")?;
        
    let plugin_dir = PathBuf::from(home_path).join(".tyegit").join("plugins").join(&plugin.id);

    if !plugin_dir.exists() {
        std::fs::create_dir_all(&plugin_dir).map_err(|e| format!("Failed to create plugin directory: {}", e))?;
    }

    let client = reqwest::Client::new();
    
    // Download WASM
    let res = client.get(&plugin.download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download plugin: {}", e))?;
        
    let bytes = res.bytes()
        .await
        .map_err(|e| format!("Failed to read plugin bytes: {}", e))?;
        
    let wasm_path = plugin_dir.join(&plugin.entry_point);
    std::fs::write(&wasm_path, bytes).map_err(|e| format!("Failed to write plugin to disk: {}", e))?;
    
    // Create manifest.json dynamically from the RemotePluginManifest
    let local_manifest = crate::PluginManifest {
        name: plugin.name,
        version: plugin.version,
        author: plugin.author,
        entry_point: plugin.entry_point,
        permissions: plugin.permissions,
        hooks: plugin.hooks,
    };
    
    let manifest_json = serde_json::to_string_pretty(&local_manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
        
    std::fs::write(plugin_dir.join("manifest.json"), manifest_json)
        .map_err(|e| format!("Failed to write manifest.json: {}", e))?;

    Ok(())
}

pub async fn uninstall_plugin(id: &str) -> Result<(), String> {
    let home_path = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Could not find home directory")?;
        
    let plugin_dir = PathBuf::from(home_path).join(".tyegit").join("plugins").join(id);

    if plugin_dir.exists() {
        std::fs::remove_dir_all(&plugin_dir).map_err(|e| format!("Failed to remove plugin directory: {}", e))?;
    }

    Ok(())
}
