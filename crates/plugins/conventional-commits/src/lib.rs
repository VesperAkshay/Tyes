use extism_pdk::*;
use serde::Serialize;

#[derive(Serialize)]
struct HookResult {
    action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

#[plugin_fn]
pub fn commit_msg(input: String) -> FnResult<Json<HookResult>> {
    let valid_prefixes = [
        "feat:", "fix:", "docs:", "style:", "refactor:", "perf:", "test:", "build:", "ci:", "chore:", "revert:",
        "feat(", "fix(", "docs(", "style(", "refactor(", "perf(", "test(", "build(", "ci(", "chore(", "revert("
    ];

    let trimmed = input.trim();
    
    let is_valid = valid_prefixes.iter().any(|&prefix| trimmed.starts_with(prefix));

    if !is_valid {
        return Ok(Json(HookResult {
            action: "block".to_string(),
            reason: Some(
                format!("Invalid commit message: '{}'. Must follow Conventional Commits (e.g., 'feat: added login').", trimmed)
            ),
        }));
    }

    Ok(Json(HookResult {
        action: "allow".to_string(),
        reason: None,
    }))
}
