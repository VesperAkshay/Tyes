use std::path::Path;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT, AUTHORIZATION, ACCEPT};
use tye_core_vault::{VaultKey, Module};
use crate::error::GitEngineError;
use crate::hosting::HostingAccount;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub number: u64,
    pub title: String,
    pub author: String,
    pub head_branch: String,
    pub base_branch: String,
    pub state: String,
    pub merged: bool,
    pub draft: bool,
    pub checks_status: String,
    pub url: String,
}

pub async fn list_pull_requests(
    pool: &Pool<Sqlite>,
    repo_path: &Path,
) -> Result<Vec<PullRequest>, GitEngineError> {
    let (owner, repo_name) = {
        let repo = git2::Repository::open(repo_path)
            .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;
        
        let remote = repo.find_remote("origin").map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        let url = remote.url().ok_or_else(|| GitEngineError::RemoteError("Origin remote has no URL".into()))?.to_string();

        // Very naive GitHub URL parsing: git@github.com:owner/repo.git or https://github.com/owner/repo.git
        if url.contains("github.com") {
            let parts: Vec<&str> = url.split("github.com").collect();
            let path = parts.last().unwrap_or(&"").trim_start_matches(':').trim_start_matches('/');
            let path = path.trim_end_matches(".git");
            let split: Vec<&str> = path.split('/').collect();
            if split.len() >= 2 {
                (split[0].to_string(), split[1].to_string())
            } else {
                return Err(GitEngineError::RemoteError("Could not parse GitHub owner/repo".into()));
            }
        } else {
            return Err(GitEngineError::RemoteError("Only GitHub is supported for PRs right now".into()));
        }
    };

    // 2. Get the active GitHub account from DB
    let account = sqlx::query_as::<_, HostingAccount>(
        "SELECT id, provider, username, base_url, is_enterprise, avatar_url, status FROM git_hosting_accounts WHERE provider = 'github' AND status = 'active' ORDER BY ROWID DESC LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| GitEngineError::RemoteError(e.to_string()))?;

    let account = account.ok_or_else(|| GitEngineError::RemoteError("No GitHub account connected. Please connect in Settings -> Hosting Accounts.".into()))?;

    // 3. Get token from Vault
    let key = VaultKey {
        module: Module::Git,
        project_id: None,
        key: format!("hosting_token_{}", account.id),
    };

    let token = tye_core_vault::get(&key)
        .map_err(|e| GitEngineError::RemoteError(format!("Vault error: {}", e)))?
        .ok_or_else(|| GitEngineError::RemoteError("Token not found in Vault".into()))?;

    // 4. Query GitHub API
    let http_client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
    headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github.v3+json"));

    let api_url = format!("https://api.github.com/repos/{}/{}/pulls?state=open", owner, repo_name);
    let res = http_client.get(&api_url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| GitEngineError::RemoteError(format!("API Request failed: {}", e)))?;

    if !res.status().is_success() {
        return Err(GitEngineError::RemoteError(format!("API error: {}", res.status())));
    }

    let github_prs: Vec<serde_json::Value> = res.json()
        .await
        .map_err(|e| GitEngineError::RemoteError(format!("Failed to parse PR JSON: {}", e)))?;

    let mut prs = Vec::new();
    for pr in github_prs {
        prs.push(PullRequest {
            number: pr["number"].as_u64().unwrap_or(0),
            title: pr["title"].as_str().unwrap_or("").to_string(),
            author: pr["user"]["login"].as_str().unwrap_or("Unknown").to_string(),
            head_branch: pr["head"]["ref"].as_str().unwrap_or("").to_string(),
            base_branch: pr["base"]["ref"].as_str().unwrap_or("").to_string(),
            state: pr["state"].as_str().unwrap_or("").to_string(),
            merged: pr["merged_at"].is_string(),
            draft: pr["draft"].as_bool().unwrap_or(false),
            checks_status: "pending".to_string(), // Simplified for M6
            url: pr["html_url"].as_str().unwrap_or("").to_string(),
        });
    }

    Ok(prs)
}
