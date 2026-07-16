#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Arc;
use sqlx::{Pool, Sqlite, SqlitePool};
use tauri::State;
use tokio::sync::Mutex;
use tye_git_engine::*;

pub struct AppState {
    pub pool: Pool<Sqlite>,
    pub current_project_id: Arc<Mutex<String>>,
}

#[tauri::command(rename = "git:installation_detect")]
async fn git_installation_detect(state: State<'_, AppState>) -> Result<GitInstallation, String> {
    detect_git(Some(&state.pool))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:installation_set_path")]
async fn git_installation_set_path(path: String, state: State<'_, AppState>) -> Result<GitInstallation, String> {
    set_custom_git_path(&state.pool, &PathBuf::from(path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:config_get_system")]
async fn git_config_get_system() -> Result<Vec<GitConfigEntry>, String> {
    read_system_config().await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:config_get_global")]
async fn git_config_get_global() -> Result<Vec<GitConfigEntry>, String> {
    read_global_config().await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:config_set_global")]
async fn git_config_set_global(key: String, value: String) -> Result<(), String> {
    set_global_config(&key, &value).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:config_get_local")]
async fn git_config_get_local(path: String) -> Result<Vec<GitConfigEntry>, String> {
    read_local_config(&PathBuf::from(path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:config_set_local")]
async fn git_config_set_local(path: String, key: String, value: String) -> Result<(), String> {
    set_local_config(&PathBuf::from(path), &key, &value).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:ssh_list_keys")]
async fn git_ssh_list_keys() -> Result<Vec<SshKey>, String> {
    list_ssh_keys().await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:ssh_generate_key")]
async fn git_ssh_generate_key(key_name: String, comment: String, passphrase: String) -> Result<SshKey, String> {
    generate_ed25519_key(&key_name, &comment, &passphrase).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:dashboard_get_repos")]
async fn git_dashboard_get_repos(state: State<'_, AppState>) -> Result<Vec<RepoCard>, String> {
    let pid = state.current_project_id.lock().await.clone();
    get_dashboard_cards(&state.pool, &pid).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:dashboard_pin_repo")]
async fn git_dashboard_pin_repo(repo_id: String, pinned: bool, state: State<'_, AppState>) -> Result<(), String> {
    pin_repository(&state.pool, &repo_id, pinned).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:discovery_scan")]
async fn git_discovery_scan(root_dirs: Vec<String>, exclude_patterns: Vec<String>, state: State<'_, AppState>) -> Result<Vec<RepositoryHandle>, String> {
    let pid = state.current_project_id.lock().await.clone();
    let paths = root_dirs.into_iter().map(PathBuf::from).collect::<Vec<_>>();
    scan_directories(&state.pool, &pid, &paths, &exclude_patterns)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:repo_init")]
async fn git_repo_init(
    path: String,
    init_readme: bool,
    gitignore_template: Option<String>,
    license: Option<String>,
    state: State<'_, AppState>,
) -> Result<RepositoryHandle, String> {
    let pid = state.current_project_id.lock().await.clone();
    init_repository(
        &state.pool,
        &pid,
        &PathBuf::from(path),
        init_readme,
        gitignore_template.as_deref(),
        license.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:repo_clone")]
async fn git_repo_clone(url: String, path: String, state: State<'_, AppState>) -> Result<RepositoryHandle, String> {
    let pid = state.current_project_id.lock().await.clone();
    let opts = CloneOptions {
        url,
        path: PathBuf::from(path),
        depth: None,
        single_branch: false,
        branch: None,
        recurse_submodules: false,
    };
    clone_repository(&state.pool, &pid, &opts).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:repo_open")]
async fn git_repo_open(path: String, state: State<'_, AppState>) -> Result<RepositoryHandle, String> {
    let pid = state.current_project_id.lock().await.clone();
    open_repository(&state.pool, &pid, &PathBuf::from(path)).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:repo_check_health")]
async fn git_repo_check_health(path: String) -> Result<RepoHealth, String> {
    check_repository_health(&PathBuf::from(path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:group_create")]
async fn git_group_create(name: String, state: State<'_, AppState>) -> Result<RepoGroup, String> {
    create_group(&state.pool, &name).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:group_list")]
async fn git_group_list(state: State<'_, AppState>) -> Result<Vec<RepoGroup>, String> {
    let pid = state.current_project_id.lock().await.clone();
    get_groups(&state.pool, &pid).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:status_get")]
async fn git_status_get(path: String, include_ignored: bool, state: State<'_, AppState>) -> Result<StatusResult, String> {
    get_repository_status(Some(&state.pool), &PathBuf::from(path), include_ignored)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:stage_file")]
async fn git_stage_file(path: String, file_path: String) -> Result<(), String> {
    stage_file(&PathBuf::from(path), &file_path).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:unstage_file")]
async fn git_unstage_file(path: String, file_path: String) -> Result<(), String> {
    unstage_file(&PathBuf::from(path), &file_path).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:stage_all")]
async fn git_stage_all(path: String) -> Result<(), String> {
    stage_all(&PathBuf::from(path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:unstage_all")]
async fn git_unstage_all(path: String) -> Result<(), String> {
    unstage_all(&PathBuf::from(path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:stage_patch")]
async fn git_stage_patch(path: String, patch_str: String) -> Result<(), String> {
    stage_patch(&PathBuf::from(path), &patch_str).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:discard_changes")]
async fn git_discard_changes(path: String, file_path: Option<String>, discard_type: DiscardType) -> Result<(), String> {
    discard_changes(&PathBuf::from(path), file_path.as_deref(), discard_type).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:diff_get_file")]
async fn git_diff_get_file(path: String, file_path: String, staged: bool) -> Result<DiffView, String> {
    get_file_diff(&PathBuf::from(path), &file_path, staged).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:diff_get_image")]
async fn git_diff_get_image(path: String, file_path: String, staged: bool) -> Result<ImageDiff, String> {
    get_image_diff(&PathBuf::from(path), &file_path, staged).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:commit_create")]
async fn git_commit_create(path: String, req: CommitRequest, state: State<'_, AppState>) -> Result<String, String> {
    create_commit(Some(&state.pool), &PathBuf::from(path), req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:commit_history")]
async fn git_commit_history(path: String, offset: usize, limit: usize, state: State<'_, AppState>) -> Result<Vec<CommitListItem>, String> {
    get_commit_history(Some(&state.pool), &PathBuf::from(path), offset, limit).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:commit_details")]
async fn git_commit_details(path: String, commit_id: String) -> Result<CommitDetail, String> {
    get_commit_details(&PathBuf::from(path), &commit_id).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:hook_execute")]
async fn git_hook_execute(path: String) -> Result<HookResult, String> {
    execute_pre_commit_hook(&PathBuf::from(path)).await.map_err(|e| e.to_string())
}

async fn initialize_db() -> Pool<Sqlite> {
    let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_else(|_| ".".to_string());
    let tye_dir = PathBuf::from(home).join(".tye");
    let _ = std::fs::create_dir_all(&tye_dir);
    let db_path = tye_dir.join("project.db");

    let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
        .await
        .expect("Failed to open ~/.tye/project.db");
    tye_git_engine::schema::run_migrations(&pool)
        .await
        .expect("Failed to migrate project.db");
    pool
}

fn main() {
    let rt = tokio::runtime::Runtime::new().expect("Failed to start tokio runtime");
    let pool = rt.block_on(initialize_db());

    tauri::Builder::default()
        .manage(AppState {
            pool,
            current_project_id: Arc::new(Mutex::new("default-project-uuid".to_string())),
        })
        .invoke_handler(tauri::generate_handler![
            git_installation_detect,
            git_installation_set_path,
            git_config_get_system,
            git_config_get_global,
            git_config_set_global,
            git_config_get_local,
            git_config_set_local,
            git_ssh_list_keys,
            git_ssh_generate_key,
            git_dashboard_get_repos,
            git_dashboard_pin_repo,
            git_discovery_scan,
            git_repo_init,
            git_repo_clone,
            git_repo_open,
            git_repo_check_health,
            git_group_create,
            git_group_list,
            git_status_get,
            git_stage_file,
            git_unstage_file,
            git_stage_all,
            git_unstage_all,
            git_stage_patch,
            git_discard_changes,
            git_diff_get_file,
            git_diff_get_image,
            git_commit_create,
            git_commit_history,
            git_commit_details,
            git_hook_execute
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
