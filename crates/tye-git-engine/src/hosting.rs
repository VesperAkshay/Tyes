use std::time::Duration;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use thiserror::Error;
use uuid::Uuid;
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT, AUTHORIZATION};
use tiny_http::{Server, Response};
use tye_core_vault::{VaultKey, Module};
#[derive(Debug, Error)]
pub enum HostingError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Vault error: {0}")]
    Vault(String),
    #[error("OAuth error: {0}")]
    OAuth(String),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct HostingAccount {
    pub id: String,
    pub provider: String,
    pub username: String,
    pub base_url: String,
    pub is_enterprise: bool,
    pub avatar_url: Option<String>,
    pub status: String,
}

pub async fn list_accounts(pool: &Pool<Sqlite>) -> Result<Vec<HostingAccount>, HostingError> {
    let accounts = sqlx::query_as::<_, HostingAccount>(
        "SELECT id, provider, username, base_url, is_enterprise, avatar_url, status FROM git_hosting_accounts ORDER BY username ASC"
    )
    .fetch_all(pool)
    .await?;

    Ok(accounts)
}

pub async fn remove_account(pool: &Pool<Sqlite>, account_id: &str) -> Result<(), HostingError> {
    sqlx::query("DELETE FROM git_hosting_accounts WHERE id = ?")
        .bind(account_id)
        .execute(pool)
        .await?;

    // Remove from vault
    let key = VaultKey {
        module: Module::Git,
        project_id: None,
        key: format!("hosting_token_{}", account_id),
    };
    let _ = tye_core_vault::delete(&key);

    Ok(())
}

/// Start an OAuth flow on a background thread (blocking) and return the created HostingAccount.
pub async fn start_oauth_flow(pool: &Pool<Sqlite>, provider: &str) -> Result<HostingAccount, HostingError> {
    let auth_url = format!("https://tyegit.tyes.dev/auth/{}/login", provider);

    // Spin up a local server on port 8421
    let server = Server::http("127.0.0.1:8421").map_err(|e| {
        let err_str = e.to_string();
        if err_str.contains("10048") || err_str.contains("Address already in use") {
            HostingError::OAuth("An authentication flow is already waiting in the background. Please check your browser or restart Tyegit.".into())
        } else {
            HostingError::OAuth(format!("Failed to start local server: {}", e))
        }
    })?;

    open::that(&auth_url)
        .map_err(|e| HostingError::OAuth(format!("Failed to open browser: {}", e)))?;

    // Wait for the callback with a 120-second timeout to prevent locking the port forever
    let mut access_token = None;
    let timeout = std::time::Duration::from_secs(120);
    let start_time = std::time::Instant::now();

    while start_time.elapsed() < timeout {
        if let Ok(Some(request)) = server.recv_timeout(std::time::Duration::from_millis(500)) {
            let url = request.url();
            if url.starts_with("/callback") {
                let parsed_url = reqwest::Url::parse(&format!("http://127.0.0.1{}", url)).unwrap();
                let mut token_val = None;
                for (key, val) in parsed_url.query_pairs() {
                    if key == "token" {
                        token_val = Some(val.into_owned());
                    }
                }
                if let Some(t) = token_val {
                    access_token = Some(t);
                    let html = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Authentication Successful</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #EDE8DC; margin: 0; }
    h1 { color: #059669; font-size: 2rem; margin-bottom: 8px; font-weight: 700; }
    p { color: #1A1A1A; font-size: 1.1rem; }
    .icon { font-size: 4rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="icon">✅</div>
  <h1>Authentication Successful!</h1>
  <p>You can safely close this tab and return to Tyegit.</p>
  <script>setTimeout(() => window.close(), 2500);</script>
</body>
</html>"#;
                    let mut response = Response::from_string(html);
                    response.add_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
                    let _ = request.respond(response);
                    break;
                } else {
                    let html = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Authentication Failed</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #EDE8DC; margin: 0; }
    h1 { color: #E11D48; font-size: 2rem; margin-bottom: 8px; font-weight: 700; }
    p { color: #1A1A1A; font-size: 1.1rem; }
    .icon { font-size: 4rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="icon">❌</div>
  <h1>Authentication Failed</h1>
  <p>No token was provided. You can close this tab and try again.</p>
</body>
</html>"#;
                    let mut response = Response::from_string(html);
                    response.add_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
                    let _ = request.respond(response);
                    break;
                }
            }
        }
    }

    drop(server); // explicitly free the port
    let access_token = access_token.ok_or_else(|| HostingError::OAuth("Authentication timed out or no token received from proxy".into()))?;

    // Fetch user profile based on provider
    let http_client = reqwest::Client::builder().build()?;
    let mut headers = HeaderMap::new();

    let (username, avatar_url, base_url) = if provider == "gitlab" {
        headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", access_token)).unwrap());
        headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));

        let user_res = http_client.get("https://gitlab.com/api/v4/user")
            .headers(headers)
            .send()
            .await?;

        #[derive(Deserialize)]
        struct GitLabUser {
            username: String,
            avatar_url: Option<String>,
        }

        let user: GitLabUser = user_res.json().await.map_err(|e| HostingError::OAuth(format!("Failed to parse GitLab user: {}", e)))?;
        (user.username, user.avatar_url, "https://gitlab.com".to_string())
    } else if provider == "bitbucket" {
        headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", access_token)).unwrap());
        headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));

        let user_res = http_client.get("https://api.bitbucket.org/2.0/user")
            .headers(headers)
            .send()
            .await?;

        #[derive(Deserialize)]
        struct BitbucketAvatar { href: String }
        #[derive(Deserialize)]
        struct BitbucketLinks { avatar: BitbucketAvatar }
        #[derive(Deserialize)]
        struct BitbucketUser {
            username: String,
            links: Option<BitbucketLinks>,
        }

        let user: BitbucketUser = user_res.json().await.map_err(|e| HostingError::OAuth(format!("Failed to parse Bitbucket user: {}", e)))?;
        let avatar = user.links.map(|l| l.avatar.href);
        (user.username, avatar, "https://bitbucket.org".to_string())
    } else {
        headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("token {}", access_token)).unwrap());
        headers.insert(USER_AGENT, HeaderValue::from_static("tyegit/1.0"));

        let user_res = http_client.get("https://api.github.com/user")
            .headers(headers)
            .send()
            .await?;

        #[derive(Deserialize)]
        struct GitHubUser {
            login: String,
            avatar_url: Option<String>,
        }

        let user: GitHubUser = user_res.json().await.map_err(|e| HostingError::OAuth(format!("Failed to parse GitHub user: {}", e)))?;
        (user.login, user.avatar_url, "https://github.com".to_string())
    };

    // Check if account already exists
    let existing_account: Option<HostingAccount> = sqlx::query_as(
        "SELECT * FROM git_hosting_accounts WHERE provider = ? AND username = ?"
    )
    .bind(provider)
    .bind(&username)
    .fetch_optional(pool)
    .await?;

    let account = if let Some(existing) = existing_account {
        // Update existing
        sqlx::query("UPDATE git_hosting_accounts SET avatar_url = ?, status = 'active' WHERE id = ?")
            .bind(&avatar_url)
            .bind(&existing.id)
            .execute(pool)
            .await?;
            
        HostingAccount {
            id: existing.id,
            provider: provider.to_string(),
            username: username.clone(),
            base_url,
            is_enterprise: false,
            avatar_url: avatar_url.clone(),
            status: "active".to_string(),
        }
    } else {
        // Insert new
        let id = Uuid::new_v4().to_string();
        let new_account = HostingAccount {
            id,
            provider: provider.to_string(),
            username: username.clone(),
            base_url,
            is_enterprise: false,
            avatar_url: avatar_url.clone(),
            status: "active".to_string(),
        };

        sqlx::query(
            "INSERT INTO git_hosting_accounts (id, provider, username, base_url, is_enterprise, avatar_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&new_account.id)
        .bind(&new_account.provider)
        .bind(&new_account.username)
        .bind(&new_account.base_url)
        .bind(new_account.is_enterprise)
        .bind(&new_account.avatar_url)
        .bind(&new_account.status)
        .execute(pool)
        .await?;

        new_account
    };

    // Save token to Vault
    let key = VaultKey {
        module: Module::Git,
        project_id: None,
        key: format!("hosting_token_{}", account.id),
    };
    tye_core_vault::set(&key, &access_token).map_err(|e| HostingError::Vault(e.to_string()))?;

    Ok(account)
}
