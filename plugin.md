# Tyegit Plugin Development & Publishing Guide

Welcome to the Tyegit First-Party Plugin ecosystem! Plugins in Tyegit are powered by **WebAssembly (WASM)** and the **Extism PDK**. This means you can write plugins in Rust, Go, TypeScript, or Python, and they will execute safely inside Tyegit's Rust backend sandbox.

This guide uses **Rust** as the primary language for building plugins.

---

## Part 1: Developing a New Plugin

### 1. Initialize the Project
Create a new library project using Cargo.
```bash
cargo new --lib my-tye-plugin
cd my-tye-plugin
```

### 2. Configure `Cargo.toml`
WebAssembly plugins require a specific crate type (`cdylib`). You also need the `extism-pdk` to communicate with Tyegit, and `serde` to handle JSON.

```toml
[package]
name = "my-tye-plugin"
version = "1.0.0"
edition = "2024"

[lib]
crate-type = ["cdylib"]

[dependencies]
extism-pdk = "1.0"
serde = { version = "1.0", features = ["derive"] }
```

### 3. Write the Plugin Logic
Open `src/lib.rs`. 

Tyegit plugins work by intercepting Git lifecycle hooks (like `pre_commit` or `commit_msg`). Tyegit passes contextual data (like the git diff) as a string, and your plugin must return a JSON `HookResult` telling Tyegit to `"allow"` or `"block"` the action.

```rust
use extism_pdk::*;
use serde::Serialize;

#[derive(Serialize)]
struct HookResult {
    action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

// Name this function after the hook you want to intercept.
// Examples: pre_commit, commit_msg, pre_push
#[plugin_fn]
pub fn pre_commit(input: String) -> FnResult<Json<HookResult>> {
    
    // Example: Block commits that are too large
    if input.len() > 100_000 {
        return Ok(Json(HookResult {
            action: "block".to_string(),
            reason: Some("This commit is too large. Please split your changes.".to_string()),
        }));
    }

    // Otherwise, allow the commit
    Ok(Json(HookResult {
        action: "allow".to_string(),
        reason: None,
    }))
}
```

### 4. Compile to WebAssembly
You must compile the project to the `wasm32-unknown-unknown` target.

```bash
# Add the WASM target if you don't have it installed
rustup target add wasm32-unknown-unknown

# Build the plugin
cargo build --target wasm32-unknown-unknown --release
```
Your compiled plugin will be located at:  
`target/wasm32-unknown-unknown/release/my_tye_plugin.wasm`

---

## Part 2: Publishing the Plugin

Now that you have your `.wasm` file, you need to publish it to the **Tyegit Plugin Registry** (`tyes-plugin-registry`) so users can download it.

### 1. Move the `.wasm` file to the Registry
Copy your compiled `my_tye_plugin.wasm` file into the registry's asset folder.
```bash
mkdir -p F:\tyes-plugin-registry\assets\plugins\my-tye-plugin
cp target/wasm32-unknown-unknown/release/my_tye_plugin.wasm F:\tyes-plugin-registry\assets\plugins\my-tye-plugin\
```

### 2. Update the Registry API
Open `F:\tyes-plugin-registry\src\main.rs`. 
Locate the `list_plugins` function and add your new plugin to the JSON array:

```rust
PluginManifest {
    id: "my-tye-plugin".to_string(),
    name: "My Awesome Plugin".to_string(),
    version: "1.0.0".to_string(),
    author: "Your Name".to_string(),
    description: "Blocks commits that are too large.".to_string(),
    entry_point: "my_tye_plugin.wasm".to_string(),
    permissions: vec![],
    hooks: vec!["pre_commit".to_string()], // Make sure this matches your Rust function name!
    download_url: "http://localhost:3000/assets/plugins/my-tye-plugin/my_tye_plugin.wasm".to_string(),
}
```

### 3. Restart the Registry Server
Restart your Axum server so the new API response takes effect.
```bash
cd F:\tyes-plugin-registry
cargo run
```

### 4. Install via Tyegit
1. Open the **Tyegit Desktop App**.
2. Navigate to **Settings > Plugin System**.
3. Click on the **First-Party Extensions** tab.
4. You will see your new plugin listed! Click **Install**.
5. Make a commit in your Git repository to see your plugin execute in real-time!

> [!WARNING]
> **Hook Names Matter**
> The `hooks` array in the manifest *must* perfectly match the `#[plugin_fn]` function name in your Rust code (e.g., `pre_commit`). Tyegit relies on this exact string to invoke the WASM binary.
