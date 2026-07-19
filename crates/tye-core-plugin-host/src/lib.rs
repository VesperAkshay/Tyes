pub mod registry;
pub mod marketplace;

use extism::{Plugin, Manifest, Wasm};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HookResult {
    pub action: String,
    pub reason: Option<String>,
}

pub fn execute_pre_commit_hooks(diff_text: &str) -> Result<(), String> {
    let home_path = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Could not find home directory")?;
        
    let plugin_dir = std::path::PathBuf::from(home_path).join(".tyegit").join("plugins");
    let plugins = registry::PluginRegistry::scan_plugins(&plugin_dir)?;

    for plugin_info in plugins {
        if plugin_info.hooks.contains(&"pre_commit".to_string()) {
            let wasm_path = plugin_dir.join(&plugin_info.name.replace(" ", "-").to_lowercase()).join(&plugin_info.entry_point);
            if !wasm_path.exists() {
                continue;
            }

            let wasm = Wasm::file(wasm_path);
            let manifest = Manifest::new([wasm]);
            
            let mut plugin = match Plugin::new(&manifest, [], true) {
                Ok(p) => p,
                Err(e) => return Err(format!("Failed to load plugin {}: {}", plugin_info.name, e)),
            };

            let res = match plugin.call::<&str, &str>("pre_commit", diff_text) {
                Ok(out) => out.to_string(),
                Err(e) => return Err(format!("Plugin {} crashed: {}", plugin_info.name, e)),
            };

            let result: HookResult = serde_json::from_str(&res)
                .map_err(|e| format!("Plugin {} returned invalid JSON: {}", plugin_info.name, e))?;

            if result.action == "block" {
                return Err(result.reason.unwrap_or_else(|| "Blocked by plugin".to_string()));
            }
        }
    }

    Ok(())
}

pub fn execute_commit_msg_hooks(message: &str) -> Result<(), String> {
    let home_path = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Could not find home directory")?;
        
    let plugin_dir = std::path::PathBuf::from(home_path).join(".tyegit").join("plugins");
    let plugins = registry::PluginRegistry::scan_plugins(&plugin_dir)?;

    for plugin_info in plugins {
        if plugin_info.hooks.contains(&"commit_msg".to_string()) {
            let wasm_path = plugin_dir.join(&plugin_info.name.replace(" ", "-").to_lowercase()).join(&plugin_info.entry_point);
            if !wasm_path.exists() {
                continue;
            }

            let wasm = Wasm::file(wasm_path);
            let manifest = Manifest::new([wasm]);
            
            let mut plugin = match Plugin::new(&manifest, [], true) {
                Ok(p) => p,
                Err(e) => return Err(format!("Failed to load plugin {}: {}", plugin_info.name, e)),
            };

            let res = match plugin.call::<&str, &str>("commit_msg", message) {
                Ok(out) => out.to_string(),
                Err(e) => return Err(format!("Plugin {} crashed: {}", plugin_info.name, e)),
            };

            let result: HookResult = serde_json::from_str(&res)
                .map_err(|e| format!("Plugin {} returned invalid JSON: {}", plugin_info.name, e))?;

            if result.action == "block" {
                return Err(result.reason.unwrap_or_else(|| "Blocked by plugin".to_string()));
            }
        }
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginManifest {
    pub name: String,
    pub version: String,
    pub author: String,
    pub entry_point: String,
    pub permissions: Vec<String>,
    pub hooks: Vec<String>,
}

pub struct PluginHost {
    plugin: Plugin,
    pub manifest: PluginManifest,
}

impl PluginHost {
    pub fn new(wasm_bytes: impl Into<Vec<u8>>, manifest: PluginManifest) -> Result<Self, String> {
        let wasm = Wasm::data(wasm_bytes);
        let extism_manifest = Manifest::new([wasm]);
        
        let plugin = Plugin::new(&extism_manifest, [], true)
            .map_err(|e| format!("Failed to create Extism plugin: {}", e))?;
            
        Ok(Self { plugin, manifest })
    }
    
    pub fn execute_hook(&mut self, hook_name: &str, input_json: &str) -> Result<String, String> {
        if !self.manifest.hooks.contains(&hook_name.to_string()) {
            return Err(format!("Plugin does not support hook: {}", hook_name));
        }
        
        let result = self.plugin.call::<&str, &str>(hook_name, input_json)
            .map_err(|e| format!("Plugin execution failed: {}", e))?;
            
        Ok(result.to_string())
    }
}
