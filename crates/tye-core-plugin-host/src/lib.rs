use extism::{Plugin, Manifest, Wasm};
use serde::{Deserialize, Serialize};

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
