use std::path::Path;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, USER_AGENT, ACCEPT};

use crate::error::GitEngineError;
use crate::hosting::HostingAccount;
use tye_core_vault::{Module, VaultKey};

#[derive(Debug, Serialize, Deserialize)]
pub struct CicdRun {
    pub id: String,
    pub name: String,
    pub display_title: String,
    pub head_branch: String,
    pub event: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub html_url: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CicdStep {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub number: u64,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CicdJob {
    pub id: String,
    pub run_id: String,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub steps: Vec<CicdStep>,
    pub html_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CicdEnvironment {
    pub id: u64,
    pub name: String,
    pub url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CicdSecret {
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CicdVariable {
    pub name: String,
    pub value: String,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn get_pipeline_runs(
    pool: &Pool<Sqlite>,
    repo_path: &Path,
) -> Result<Vec<CicdRun>, GitEngineError> {
    let url = {
        let repo = git2::Repository::open(repo_path)?;
        let remote = repo.find_remote("origin").map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        remote.url().ok_or_else(|| GitEngineError::RemoteError("No origin URL".to_string()))?.to_string()
    };

    // Parse owner and repo from URL (e.g. https://github.com/owner/repo.git or git@github.com:owner/repo.git)
    let (provider, owner, repo_name) = if url.contains("github.com") {
        let parts: Vec<&str> = url.split("github.com").collect();
        let path = parts[1].trim_start_matches(':').trim_start_matches('/');
        let path = path.trim_end_matches(".git");
        let mut split = path.split('/');
        let owner = split.next().unwrap_or("");
        let repo_name = split.next().unwrap_or("");
        ("github", owner, repo_name)
    } else {
        return Err(GitEngineError::RemoteError("Only GitHub is currently supported for CI/CD".into()));
    };

    // Get the account from DB
    let account: Option<HostingAccount> = sqlx::query_as(
        "SELECT * FROM git_hosting_accounts WHERE provider = ? AND status = 'active' LIMIT 1"
    )
    .bind(provider)
    .fetch_optional(pool)
    .await?;

    let account = account.ok_or_else(|| GitEngineError::RemoteError("No active GitHub account found. Please authenticate first.".into()))?;

    // Fetch token from vault
    let key = VaultKey {
        module: Module::Git,
        project_id: None,
        key: format!("hosting_token_{}", account.id),
    };
    let token_opt = tye_core_vault::get(&key).map_err(|e| GitEngineError::VaultError(e))?;
    let token = token_opt.ok_or_else(|| GitEngineError::RemoteError("No token found for account".into()))?;

    let http_client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
    headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));

    // Call GitHub API
    let api_url = format!("https://api.github.com/repos/{}/{}/actions/runs", owner, repo_name);
    let res = http_client.get(&api_url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| GitEngineError::RemoteError(format!("Failed to fetch CI/CD runs: {}", e)))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(GitEngineError::RemoteError(format!("GitHub API error: {}", err_text)));
    }

    #[derive(Deserialize)]
    struct GhRun {
        id: u64,
        name: String,
        display_title: String,
        head_branch: String,
        event: String,
        status: String,
        conclusion: Option<String>,
        html_url: String,
        created_at: String,
    }

    #[derive(Deserialize)]
    struct GhResponse {
        workflow_runs: Vec<GhRun>,
    }

    let parsed: GhResponse = res.json().await.map_err(|e| GitEngineError::RemoteError(format!("Failed to parse JSON: {}", e)))?;

    let runs = parsed.workflow_runs.into_iter().map(|r| CicdRun {
        id: r.id.to_string(),
        name: r.name,
        display_title: r.display_title,
        head_branch: r.head_branch,
        event: r.event,
        status: r.status,
        conclusion: r.conclusion,
        html_url: r.html_url,
        created_at: r.created_at,
    }).collect();

    Ok(runs)
}

pub async fn get_pipeline_jobs(
    pool: &Pool<Sqlite>,
    repo_path: &Path,
    run_id: &str,
) -> Result<Vec<CicdJob>, GitEngineError> {
    let url = {
        let repo = git2::Repository::open(repo_path)?;
        let remote = repo.find_remote("origin").map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        remote.url().ok_or_else(|| GitEngineError::RemoteError("No origin URL".to_string()))?.to_string()
    };

    let (provider, owner, repo_name) = if url.contains("github.com") {
        let parts: Vec<&str> = url.split("github.com").collect();
        let path = parts[1].trim_start_matches(':').trim_start_matches('/');
        let path = path.trim_end_matches(".git");
        let mut split = path.split('/');
        let owner = split.next().unwrap_or("");
        let repo_name = split.next().unwrap_or("");
        ("github", owner, repo_name)
    } else {
        return Err(GitEngineError::RemoteError("Only GitHub is currently supported for CI/CD".into()));
    };

    let account: Option<HostingAccount> = sqlx::query_as(
        "SELECT * FROM git_hosting_accounts WHERE provider = ? AND status = 'active' LIMIT 1"
    )
    .bind(provider)
    .fetch_optional(pool)
    .await?;

    let account = account.ok_or_else(|| GitEngineError::RemoteError("No active GitHub account found. Please authenticate first.".into()))?;

    let key = VaultKey {
        module: Module::Git,
        project_id: None,
        key: format!("hosting_token_{}", account.id),
    };
    let token_opt = tye_core_vault::get(&key).map_err(|e| GitEngineError::VaultError(e))?;
    let token = token_opt.ok_or_else(|| GitEngineError::RemoteError("No token found for account".into()))?;

    let http_client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
    headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));

    let api_url = format!("https://api.github.com/repos/{}/{}/actions/runs/{}/jobs", owner, repo_name, run_id);
    let res = http_client.get(&api_url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| GitEngineError::RemoteError(format!("Failed to fetch CI/CD jobs: {}", e)))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(GitEngineError::RemoteError(format!("GitHub API error: {}", err_text)));
    }

    #[derive(Deserialize)]
    struct GhStep {
        name: String,
        status: String,
        conclusion: Option<String>,
        number: u64,
        started_at: Option<String>,
        completed_at: Option<String>,
    }

    #[derive(Deserialize)]
    struct GhJob {
        id: u64,
        run_id: u64,
        name: String,
        status: String,
        conclusion: Option<String>,
        started_at: String,
        completed_at: Option<String>,
        steps: Option<Vec<GhStep>>,
        html_url: Option<String>,
    }

    #[derive(Deserialize)]
    struct GhResponse {
        jobs: Vec<GhJob>,
    }

    let parsed: GhResponse = res.json().await.map_err(|e| GitEngineError::RemoteError(format!("Failed to parse JSON: {}", e)))?;

    let jobs = parsed.jobs.into_iter().map(|j| CicdJob {
        id: j.id.to_string(),
        run_id: j.run_id.to_string(),
        name: j.name,
        status: j.status,
        conclusion: j.conclusion,
        started_at: j.started_at,
        completed_at: j.completed_at,
        html_url: j.html_url.unwrap_or_default(),
        steps: j.steps.unwrap_or_default().into_iter().map(|s| CicdStep {
            name: s.name,
            status: s.status,
            conclusion: s.conclusion,
            number: s.number,
            started_at: s.started_at,
            completed_at: s.completed_at,
        }).collect(),
    }).collect();

    Ok(jobs)
}

pub async fn get_pipeline_log(
    pool: &Pool<Sqlite>,
    repo_path: &Path,
    job_id: &str,
) -> Result<String, GitEngineError> {
    let url = {
        let repo = git2::Repository::open(repo_path)?;
        let remote = repo.find_remote("origin").map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        remote.url().ok_or_else(|| GitEngineError::RemoteError("No origin URL".to_string()))?.to_string()
    };

    let (provider, owner, repo_name) = if url.contains("github.com") {
        let parts: Vec<&str> = url.split("github.com").collect();
        let path = parts[1].trim_start_matches(':').trim_start_matches('/');
        let path = path.trim_end_matches(".git");
        let mut split = path.split('/');
        let owner = split.next().unwrap_or("");
        let repo_name = split.next().unwrap_or("");
        ("github", owner, repo_name)
    } else {
        return Err(GitEngineError::RemoteError("Only GitHub is currently supported".into()));
    };

    let account: Option<HostingAccount> = sqlx::query_as("SELECT * FROM git_hosting_accounts WHERE provider = ? AND status = 'active' LIMIT 1")
        .bind(provider).fetch_optional(pool).await?;
    let account = account.ok_or_else(|| GitEngineError::RemoteError("No account found".into()))?;
    
    let key = VaultKey { module: Module::Git, project_id: None, key: format!("hosting_token_{}", account.id) };
    let token = tye_core_vault::get(&key).map_err(|e| GitEngineError::VaultError(e))?.ok_or_else(|| GitEngineError::RemoteError("No token".into()))?;

    let http_client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
    headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));

    let api_url = format!("https://api.github.com/repos/{}/{}/actions/jobs/{}/logs", owner, repo_name, job_id);
    let res = http_client.get(&api_url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| GitEngineError::RemoteError(format!("Failed to fetch logs: {}", e)))?;

    if res.status() == reqwest::StatusCode::GONE {
        return Ok("The logs for this job have expired or have been deleted.".to_string());
    } else if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok("The logs for this job are not available yet. Please wait for the job to complete or start generating output.".to_string());
    } else if !res.status().is_success() {
        return Err(GitEngineError::RemoteError(format!("GitHub API error: {}", res.status())));
    }

    let logs = res.text().await.unwrap_or_default();
    Ok(logs)
}

pub async fn get_pipeline_environments(
    pool: &Pool<Sqlite>,
    repo_path: &Path,
) -> Result<Vec<CicdEnvironment>, GitEngineError> {
    let url = {
        let repo = git2::Repository::open(repo_path)?;
        let remote = repo.find_remote("origin").map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        remote.url().ok_or_else(|| GitEngineError::RemoteError("No origin URL".to_string()))?.to_string()
    };
    let (provider, owner, repo_name) = if url.contains("github.com") {
        let parts: Vec<&str> = url.split("github.com").collect();
        let path = parts[1].trim_start_matches(':').trim_start_matches('/');
        let path = path.trim_end_matches(".git");
        let mut split = path.split('/');
        let owner = split.next().unwrap_or("");
        let repo_name = split.next().unwrap_or("");
        ("github", owner, repo_name)
    } else {
        return Err(GitEngineError::RemoteError("Only GitHub supported".into()));
    };

    let account: Option<HostingAccount> = sqlx::query_as("SELECT * FROM git_hosting_accounts WHERE provider = ? AND status = 'active' LIMIT 1")
        .bind(provider).fetch_optional(pool).await?;
    let account = account.ok_or_else(|| GitEngineError::RemoteError("No account found".into()))?;
    let key = VaultKey { module: Module::Git, project_id: None, key: format!("hosting_token_{}", account.id) };
    let token = tye_core_vault::get(&key).map_err(|e| GitEngineError::VaultError(e))?.ok_or_else(|| GitEngineError::RemoteError("No token".into()))?;

    let http_client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
    headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));

    let api_url = format!("https://api.github.com/repos/{}/{}/environments", owner, repo_name);
    let res = http_client.get(&api_url).headers(headers).send().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;

    if !res.status().is_success() {
        return Ok(vec![]); // Repos without environments API enabled
    }

    #[derive(Deserialize)]
    struct GhEnv { id: u64, name: String, html_url: Option<String> }
    #[derive(Deserialize)]
    struct GhResponse { environments: Option<Vec<GhEnv>> }

    let parsed: GhResponse = res.json().await.unwrap_or(GhResponse { environments: Some(vec![]) });
    let envs = parsed.environments.unwrap_or_default().into_iter().map(|e| CicdEnvironment {
        id: e.id,
        name: e.name,
        url: e.html_url,
    }).collect();

    Ok(envs)
}

pub async fn get_pipeline_secrets(
    pool: &Pool<Sqlite>,
    repo_path: &Path,
) -> Result<Vec<CicdSecret>, GitEngineError> {
    let url = {
        let repo = git2::Repository::open(repo_path)?;
        let remote = repo.find_remote("origin").map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        remote.url().ok_or_else(|| GitEngineError::RemoteError("No origin URL".to_string()))?.to_string()
    };
    let (provider, owner, repo_name) = if url.contains("github.com") {
        let parts: Vec<&str> = url.split("github.com").collect();
        let path = parts[1].trim_start_matches(':').trim_start_matches('/');
        let path = path.trim_end_matches(".git");
        let mut split = path.split('/');
        let owner = split.next().unwrap_or("");
        let repo_name = split.next().unwrap_or("");
        ("github", owner, repo_name)
    } else {
        return Err(GitEngineError::RemoteError("Only GitHub supported".into()));
    };

    let account: Option<HostingAccount> = sqlx::query_as("SELECT * FROM git_hosting_accounts WHERE provider = ? AND status = 'active' LIMIT 1")
        .bind(provider).fetch_optional(pool).await?;
    let account = account.ok_or_else(|| GitEngineError::RemoteError("No account found".into()))?;
    let key = VaultKey { module: Module::Git, project_id: None, key: format!("hosting_token_{}", account.id) };
    let token = tye_core_vault::get(&key).map_err(|e| GitEngineError::VaultError(e))?.ok_or_else(|| GitEngineError::RemoteError("No token".into()))?;

    let http_client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
    headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));

    let api_url = format!("https://api.github.com/repos/{}/{}/actions/secrets", owner, repo_name);
    let res = http_client.get(&api_url).headers(headers).send().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;

    if !res.status().is_success() {
        return Ok(vec![]);
    }

    #[derive(Deserialize)]
    struct GhSecret { name: String, created_at: String, updated_at: String }
    #[derive(Deserialize)]
    struct GhResponse { secrets: Vec<GhSecret> }

    let parsed: GhResponse = res.json().await.unwrap_or(GhResponse { secrets: vec![] });
    let secrets = parsed.secrets.into_iter().map(|s| CicdSecret {
        name: s.name,
        created_at: s.created_at,
        updated_at: s.updated_at,
    }).collect();

    Ok(secrets)
}

pub async fn get_pipeline_variables(
    pool: &Pool<Sqlite>,
    repo_path: &Path,
) -> Result<Vec<CicdVariable>, GitEngineError> {
    let url = {
        let repo = git2::Repository::open(repo_path)?;
        let remote = repo.find_remote("origin").map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        remote.url().ok_or_else(|| GitEngineError::RemoteError("No origin URL".to_string()))?.to_string()
    };
    let (provider, owner, repo_name) = if url.contains("github.com") {
        let parts: Vec<&str> = url.split("github.com").collect();
        let path = parts[1].trim_start_matches(':').trim_start_matches('/');
        let path = path.trim_end_matches(".git");
        let mut split = path.split('/');
        let owner = split.next().unwrap_or("");
        let repo_name = split.next().unwrap_or("");
        ("github", owner, repo_name)
    } else {
        return Err(GitEngineError::RemoteError("Only GitHub supported".into()));
    };

    let account: Option<HostingAccount> = sqlx::query_as("SELECT * FROM git_hosting_accounts WHERE provider = ? AND status = 'active' LIMIT 1")
        .bind(provider).fetch_optional(pool).await?;
    let account = account.ok_or_else(|| GitEngineError::RemoteError("No account found".into()))?;
    let key = VaultKey { module: Module::Git, project_id: None, key: format!("hosting_token_{}", account.id) };
    let token = tye_core_vault::get(&key).map_err(|e| GitEngineError::VaultError(e))?.ok_or_else(|| GitEngineError::RemoteError("No token".into()))?;

    let http_client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
    headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));

    let api_url = format!("https://api.github.com/repos/{}/{}/actions/variables", owner, repo_name);
    let res = http_client.get(&api_url).headers(headers).send().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;

    if !res.status().is_success() {
        return Ok(vec![]);
    }

    #[derive(Deserialize)]
    struct GhVar { name: String, value: String, created_at: String, updated_at: String }
    #[derive(Deserialize)]
    struct GhResponse { variables: Vec<GhVar> }

    let parsed: GhResponse = res.json().await.unwrap_or(GhResponse { variables: vec![] });
    let vars = parsed.variables.into_iter().map(|v| CicdVariable {
        name: v.name,
        value: v.value,
        created_at: v.created_at,
        updated_at: v.updated_at,
    }).collect();

    Ok(vars)
}

pub async fn add_pipeline_variable(
    pool: &Pool<Sqlite>,
    repo_path: &Path,
    name: &str,
    value: &str,
) -> Result<(), GitEngineError> {
    let url = {
        let repo = git2::Repository::open(repo_path)?;
        let remote = repo.find_remote("origin").map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        remote.url().ok_or_else(|| GitEngineError::RemoteError("No origin URL".to_string()))?.to_string()
    };
    let (provider, owner, repo_name) = if url.contains("github.com") {
        let parts: Vec<&str> = url.split("github.com").collect();
        let path = parts[1].trim_start_matches(':').trim_start_matches('/');
        let path = path.trim_end_matches(".git");
        let mut split = path.split('/');
        let owner = split.next().unwrap_or("");
        let repo_name = split.next().unwrap_or("");
        ("github", owner, repo_name)
    } else {
        return Err(GitEngineError::RemoteError("Only GitHub supported".into()));
    };

    let account: Option<HostingAccount> = sqlx::query_as("SELECT * FROM git_hosting_accounts WHERE provider = ? AND status = 'active' LIMIT 1")
        .bind(provider).fetch_optional(pool).await?;
    let account = account.ok_or_else(|| GitEngineError::RemoteError("No account found".into()))?;
    let key = VaultKey { module: Module::Git, project_id: None, key: format!("hosting_token_{}", account.id) };
    let token = tye_core_vault::get(&key).map_err(|e| GitEngineError::VaultError(e))?.ok_or_else(|| GitEngineError::RemoteError("No token".into()))?;

    let http_client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
    headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));

    let api_url = format!("https://api.github.com/repos/{}/{}/actions/variables", owner, repo_name);
    
    #[derive(Serialize)]
    struct Payload { name: String, value: String }

    let res = http_client.post(&api_url)
        .headers(headers)
        .json(&Payload { name: name.to_string(), value: value.to_string() })
        .send()
        .await
        .map_err(|e| GitEngineError::RemoteError(e.to_string()))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(GitEngineError::RemoteError(format!("Failed to add variable: {}", err_text)));
    }

    Ok(())
}

use sodiumoxide::crypto::box_::curve25519xsalsa20poly1305::PublicKey;
use sodiumoxide::crypto::sealedbox;
use base64::{engine::general_purpose::STANDARD, Engine as _};

pub async fn add_pipeline_secret(
    pool: &Pool<Sqlite>,
    repo_path: &Path,
    name: &str,
    value: &str,
) -> Result<(), GitEngineError> {
    let url = {
        let repo = git2::Repository::open(repo_path)?;
        let remote = repo.find_remote("origin").map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
        remote.url().ok_or_else(|| GitEngineError::RemoteError("No origin URL".to_string()))?.to_string()
    };
    let (provider, owner, repo_name) = if url.contains("github.com") {
        let parts: Vec<&str> = url.split("github.com").collect();
        let path = parts[1].trim_start_matches(':').trim_start_matches('/');
        let path = path.trim_end_matches(".git");
        let mut split = path.split('/');
        let owner = split.next().unwrap_or("");
        let repo_name = split.next().unwrap_or("");
        ("github", owner, repo_name)
    } else {
        return Err(GitEngineError::RemoteError("Only GitHub supported".into()));
    };

    let account: Option<HostingAccount> = sqlx::query_as("SELECT * FROM git_hosting_accounts WHERE provider = ? AND status = 'active' LIMIT 1")
        .bind(provider).fetch_optional(pool).await?;
    let account = account.ok_or_else(|| GitEngineError::RemoteError("No account found".into()))?;
    let key = VaultKey { module: Module::Git, project_id: None, key: format!("hosting_token_{}", account.id) };
    let token = tye_core_vault::get(&key).map_err(|e| GitEngineError::VaultError(e))?.ok_or_else(|| GitEngineError::RemoteError("No token".into()))?;

    let http_client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
    headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));

    // 1. Get Public Key
    let pk_url = format!("https://api.github.com/repos/{}/{}/actions/secrets/public-key", owner, repo_name);
    let pk_res = http_client.get(&pk_url).headers(headers.clone()).send().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;

    if !pk_res.status().is_success() {
        return Err(GitEngineError::RemoteError("Failed to fetch public key".into()));
    }

    #[derive(Deserialize)]
    struct PkResponse { key_id: String, key: String }
    let pk_data: PkResponse = pk_res.json().await.map_err(|e| GitEngineError::RemoteError(e.to_string()))?;

    // Decode base64 key
    let pk_bytes = STANDARD.decode(&pk_data.key).map_err(|e| GitEngineError::RemoteError(e.to_string()))?;
    if pk_bytes.len() != 32 {
        return Err(GitEngineError::RemoteError("Invalid public key length".into()));
    }
    
    sodiumoxide::init().map_err(|_| GitEngineError::RemoteError("Failed to init sodium".into()))?;
    let public_key = PublicKey::from_slice(&pk_bytes).ok_or_else(|| GitEngineError::RemoteError("Invalid public key data".into()))?;

    // 2. Encrypt Secret
    let cipher_bytes = sealedbox::seal(value.as_bytes(), &public_key);
    let encrypted_value = STANDARD.encode(cipher_bytes);

    // 3. PUT Secret
    let put_url = format!("https://api.github.com/repos/{}/{}/actions/secrets/{}", owner, repo_name, name);
    #[derive(Serialize)]
    struct PutPayload { encrypted_value: String, key_id: String }

    let res = http_client.put(&put_url)
        .headers(headers)
        .json(&PutPayload { encrypted_value, key_id: pk_data.key_id })
        .send()
        .await
        .map_err(|e| GitEngineError::RemoteError(e.to_string()))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(GitEngineError::RemoteError(format!("Failed to add secret: {}", err_text)));
    }

    Ok(())
}
