use std::path::Path;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT, AUTHORIZATION, ACCEPT, CONTENT_TYPE};
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

fn parse_remote_url(url: &str) -> Result<(String, String, String), GitEngineError> {
    let mut clean_url = url.trim_end_matches(".git").to_string();
    
    let provider = if clean_url.contains("github.com") {
        "github"
    } else if clean_url.contains("gitlab.com") {
        "gitlab"
    } else if clean_url.contains("bitbucket.org") {
        "bitbucket"
    } else {
        return Err(GitEngineError::RemoteError(format!("Unsupported remote: {}", url)));
    };

    if clean_url.starts_with("https://") {
        clean_url = clean_url.replace("https://", "");
        if let Some(idx) = clean_url.find('@') {
            clean_url = clean_url[idx+1..].to_string();
        }
    } else if clean_url.starts_with("git@") {
        clean_url = clean_url.replace("git@", "");
    }

    let path = if let Some(idx) = clean_url.find(':') {
        &clean_url[idx+1..]
    } else if let Some(idx) = clean_url.find('/') {
        &clean_url[idx+1..]
    } else {
        return Err(GitEngineError::RemoteError(format!("Could not parse owner/repo from URL: {}", url)));
    };

    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() >= 2 {
        Ok((provider.to_string(), parts[0].to_string(), parts[1].to_string()))
    } else {
        Err(GitEngineError::RemoteError(format!("Could not parse owner/repo from URL: {}", url)))
    }
}

async fn get_account_and_token(pool: &Pool<Sqlite>, provider: &str) -> Result<(HostingAccount, String), GitEngineError> {
    let query = format!(
        "SELECT id, provider, username, base_url, is_enterprise, avatar_url, status FROM git_hosting_accounts WHERE provider = '{}' AND status = 'active' ORDER BY ROWID DESC LIMIT 1",
        provider
    );
    let account = sqlx::query_as::<_, HostingAccount>(&query)
        .fetch_optional(pool)
        .await
        .map_err(|e| GitEngineError::RemoteError(e.to_string()))?
        .ok_or_else(|| GitEngineError::RemoteError(format!("No {} account connected.", provider)))?;

    let key = VaultKey {
        module: Module::Git,
        project_id: None,
        key: format!("hosting_token_{}", account.id),
    };

    let token = tye_core_vault::get(&key)
        .map_err(|e| GitEngineError::RemoteError(format!("Vault error: {}", e)))?
        .ok_or_else(|| GitEngineError::RemoteError("Token not found in Vault".into()))?;

    Ok((account, token))
}

pub async fn list_pull_requests(
    pool: &Pool<Sqlite>,
    repo_path: &Path,
) -> Result<Vec<PullRequest>, GitEngineError> {
    let url = {
        let repo = git2::Repository::open(repo_path)
            .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;
        let remote = repo.find_remote("origin").map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        remote.url().ok_or_else(|| GitEngineError::RemoteError("Origin remote has no URL".into()))?.to_string()
    };
    
    let (provider, owner, repo_name) = parse_remote_url(&url)?;
    let (_, token) = get_account_and_token(pool, &provider).await?;

    let http_client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
    headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));

    let mut prs = Vec::new();

    if provider == "github" {
        headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github.v3+json"));
        let api_url = format!("https://api.github.com/repos/{}/{}/pulls?state=open", owner, repo_name);
        let res = http_client.get(&api_url).headers(headers).send().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        if !res.status().is_success() {
            return Err(GitEngineError::RemoteError(format!("GitHub API error: {}", res.status())));
        }
        let github_prs: Vec<serde_json::Value> = res.json().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
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
                checks_status: "pending".to_string(),
                url: pr["html_url"].as_str().unwrap_or("").to_string(),
            });
        }
    } else if provider == "gitlab" {
        let project_encoded = format!("{}%2F{}", owner, repo_name);
        let api_url = format!("https://gitlab.com/api/v4/projects/{}/merge_requests?state=opened", project_encoded);
        let res = http_client.get(&api_url).headers(headers).send().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        if !res.status().is_success() {
            return Err(GitEngineError::RemoteError(format!("GitLab API error: {}", res.status())));
        }
        let gitlab_prs: Vec<serde_json::Value> = res.json().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        for pr in gitlab_prs {
            prs.push(PullRequest {
                number: pr["iid"].as_u64().unwrap_or(0),
                title: pr["title"].as_str().unwrap_or("").to_string(),
                author: pr["author"]["username"].as_str().unwrap_or("Unknown").to_string(),
                head_branch: pr["source_branch"].as_str().unwrap_or("").to_string(),
                base_branch: pr["target_branch"].as_str().unwrap_or("").to_string(),
                state: pr["state"].as_str().unwrap_or("").to_string(),
                merged: pr["state"].as_str() == Some("merged"),
                draft: pr["draft"].as_bool().unwrap_or(false) || pr["work_in_progress"].as_bool().unwrap_or(false),
                checks_status: "pending".to_string(),
                url: pr["web_url"].as_str().unwrap_or("").to_string(),
            });
        }
    } else if provider == "bitbucket" {
        let api_url = format!("https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests?state=OPEN", owner, repo_name);
        let res = http_client.get(&api_url).headers(headers).send().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        if !res.status().is_success() {
            return Err(GitEngineError::RemoteError(format!("Bitbucket API error: {}", res.status())));
        }
        let bitbucket_res: serde_json::Value = res.json().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        let bitbucket_prs = bitbucket_res["values"].as_array().cloned().unwrap_or_default();
        for pr in bitbucket_prs {
            prs.push(PullRequest {
                number: pr["id"].as_u64().unwrap_or(0),
                title: pr["title"].as_str().unwrap_or("").to_string(),
                author: pr["author"]["nickname"].as_str().unwrap_or("Unknown").to_string(),
                head_branch: pr["source"]["branch"]["name"].as_str().unwrap_or("").to_string(),
                base_branch: pr["destination"]["branch"]["name"].as_str().unwrap_or("").to_string(),
                state: pr["state"].as_str().unwrap_or("").to_string(),
                merged: pr["state"].as_str() == Some("MERGED"),
                draft: false,
                checks_status: "pending".to_string(),
                url: pr["links"]["html"]["href"].as_str().unwrap_or("").to_string(),
            });
        }
    }

    Ok(prs)
}

pub async fn create_pull_request(
    pool: &Pool<Sqlite>,
    repo_path: &Path,
    title: &str,
    description: &str,
    head_branch: &str,
    base_branch: &str,
) -> Result<PullRequest, GitEngineError> {
    let url = {
        let repo = git2::Repository::open(repo_path)
            .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;
        let remote = repo.find_remote("origin").map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        remote.url().ok_or_else(|| GitEngineError::RemoteError("Origin remote has no URL".into()))?.to_string()
    };
    
    let (provider, owner, repo_name) = parse_remote_url(&url)?;
    let (_, token) = get_account_and_token(pool, &provider).await?;

    let http_client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
    headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    if provider == "github" {
        headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github.v3+json"));
        let api_url = format!("https://api.github.com/repos/{}/{}/pulls", owner, repo_name);
        
        let body = serde_json::json!({
            "title": title,
            "body": description,
            "head": head_branch,
            "base": base_branch
        });

        let res = http_client.post(&api_url).headers(headers).json(&body).send().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        if !res.status().is_success() {
            let err_text = res.text().await.unwrap_or_default();
            return Err(GitEngineError::RemoteError(format!("GitHub API error: {}", err_text)));
        }
        
        let pr: serde_json::Value = res.json().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        
        Ok(PullRequest {
            number: pr["number"].as_u64().unwrap_or(0),
            title: pr["title"].as_str().unwrap_or("").to_string(),
            author: pr["user"]["login"].as_str().unwrap_or("Unknown").to_string(),
            head_branch: pr["head"]["ref"].as_str().unwrap_or("").to_string(),
            base_branch: pr["base"]["ref"].as_str().unwrap_or("").to_string(),
            state: pr["state"].as_str().unwrap_or("").to_string(),
            merged: false,
            draft: pr["draft"].as_bool().unwrap_or(false),
            checks_status: "pending".to_string(),
            url: pr["html_url"].as_str().unwrap_or("").to_string(),
        })
    } else if provider == "gitlab" {
        let project_encoded = format!("{}%2F{}", owner, repo_name);
        let api_url = format!("https://gitlab.com/api/v4/projects/{}/merge_requests", project_encoded);
        
        let body = serde_json::json!({
            "title": title,
            "description": description,
            "source_branch": head_branch,
            "target_branch": base_branch
        });

        let res = http_client.post(&api_url).headers(headers).json(&body).send().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        if !res.status().is_success() {
            let err_text = res.text().await.unwrap_or_default();
            return Err(GitEngineError::RemoteError(format!("GitLab API error: {}", err_text)));
        }
        
        let pr: serde_json::Value = res.json().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        
        Ok(PullRequest {
            number: pr["iid"].as_u64().unwrap_or(0),
            title: pr["title"].as_str().unwrap_or("").to_string(),
            author: pr["author"]["username"].as_str().unwrap_or("Unknown").to_string(),
            head_branch: pr["source_branch"].as_str().unwrap_or("").to_string(),
            base_branch: pr["target_branch"].as_str().unwrap_or("").to_string(),
            state: pr["state"].as_str().unwrap_or("").to_string(),
            merged: false,
            draft: pr["draft"].as_bool().unwrap_or(false) || pr["work_in_progress"].as_bool().unwrap_or(false),
            checks_status: "pending".to_string(),
            url: pr["web_url"].as_str().unwrap_or("").to_string(),
        })
    } else if provider == "bitbucket" {
        let api_url = format!("https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests", owner, repo_name);
        
        let body = serde_json::json!({
            "title": title,
            "description": description,
            "source": {
                "branch": {
                    "name": head_branch
                }
            },
            "destination": {
                "branch": {
                    "name": base_branch
                }
            }
        });

        let res = http_client.post(&api_url).headers(headers).json(&body).send().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        if !res.status().is_success() {
            let err_text = res.text().await.unwrap_or_default();
            return Err(GitEngineError::RemoteError(format!("Bitbucket API error: {}", err_text)));
        }
        
        let pr: serde_json::Value = res.json().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        
        Ok(PullRequest {
            number: pr["id"].as_u64().unwrap_or(0),
            title: pr["title"].as_str().unwrap_or("").to_string(),
            author: pr["author"]["nickname"].as_str().unwrap_or("Unknown").to_string(),
            head_branch: pr["source"]["branch"]["name"].as_str().unwrap_or("").to_string(),
            base_branch: pr["destination"]["branch"]["name"].as_str().unwrap_or("").to_string(),
            state: pr["state"].as_str().unwrap_or("").to_string(),
            merged: false,
            draft: false,
            checks_status: "pending".to_string(),
            url: pr["links"]["html"]["href"].as_str().unwrap_or("").to_string(),
        })
    } else {
        Err(GitEngineError::RemoteError(format!("Provider {} not supported for PR creation", provider)))
    }
}
