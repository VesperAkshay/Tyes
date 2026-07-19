use extism_pdk::*;
use serde::Serialize;

#[derive(Serialize)]
struct HookResult {
    action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

#[plugin_fn]
pub fn pre_commit(input: String) -> FnResult<Json<HookResult>> {
    let forbidden_patterns = ["console.log(", "dbg!("];
    
    // Check if any added line in the diff contains the forbidden patterns
    for line in input.lines() {
        if line.starts_with('+') && !line.starts_with("+++") {
            for pattern in forbidden_patterns {
                if line.contains(pattern) {
                    return Ok(Json(HookResult {
                        action: "block".to_string(),
                        reason: Some(format!("Found forbidden pattern '{}' in your staged changes.", pattern)),
                    }));
                }
            }
        }
    }

    Ok(Json(HookResult {
        action: "allow".to_string(),
        reason: None,
    }))
}
