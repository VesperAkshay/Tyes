#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::sync::Arc;
use sqlx::{Pool, Sqlite, SqlitePool};
use tauri::State;
use tokio::sync::Mutex;
use tye_git_engine::*;
use tye_git_engine::maintenance::GcResult;
use tye_git_engine::internals::{git_internals_get_object, git_internals_search_prefix, git_internals_get_tree, GitObjectInfo, GitTreeEntry};
use tye_git_engine::plumbing::{git_plumbing_execute_safe, git_plumbing_execute_dangerous};
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

#[tauri::command(rename = "git:dashboard_remove_repo")]
async fn git_dashboard_remove_repo(repo_id: String, state: State<'_, AppState>) -> Result<(), String> {
    remove_repository(&state.pool, &repo_id).await.map_err(|e| e.to_string())
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

#[tauri::command(rename = "git:group_delete")]
async fn git_group_delete(group_id: String, state: State<'_, AppState>) -> Result<(), String> {
    delete_group(&state.pool, &group_id).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:group_add_repo")]
async fn git_group_add_repo(group_id: String, repo_id: String, state: State<'_, AppState>) -> Result<(), String> {
    add_to_group(&state.pool, &group_id, &repo_id).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:group_remove_repo")]
async fn git_group_remove_repo(group_id: String, repo_id: String, state: State<'_, AppState>) -> Result<(), String> {
    remove_from_group(&state.pool, &group_id, &repo_id).await.map_err(|e| e.to_string())
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

#[tauri::command(rename = "git:ignore_file")]
async fn git_ignore_file(path: String, file_path: String) -> Result<(), String> {
    ignore_file(&PathBuf::from(path), &file_path).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:unignore_file")]
async fn git_unignore_file(path: String, file_path: String) -> Result<(), String> {
    unignore_file(&PathBuf::from(path), &file_path).map_err(|e| e.to_string())
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
    // 1. Get the actual git diff of staged changes
    let output = std::process::Command::new("git")
        .arg("diff")
        .arg("--cached")
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;
        
    let diff_text = String::from_utf8_lossy(&output.stdout).to_string();

    // 2. Pass the real diff to the Plugin System (pre_commit hook)
    tye_core_plugin_host::execute_pre_commit_hooks(&diff_text)?;

    // 3. Pass the commit message to the Plugin System (commit_msg hook)
    tye_core_plugin_host::execute_commit_msg_hooks(&req.message)?;

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

// --- Milestone 3 Handlers ---

#[tauri::command(rename = "git:get_branches")]
async fn git_get_branches(repo_path: String) -> Result<BranchList, String> {
    get_branches(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_create")]
async fn git_branch_create(repo_path: String, name: String, target_commit: Option<String>) -> Result<BranchItem, String> {
    create_branch(&PathBuf::from(repo_path), &name, target_commit.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_delete")]
async fn git_branch_delete(repo_path: String, name: String, force: bool) -> Result<(), String> {
    delete_branch(&PathBuf::from(repo_path), &name, force).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_rename")]
async fn git_branch_rename(repo_path: String, old_name: String, new_name: String) -> Result<(), String> {
    rename_branch(&PathBuf::from(repo_path), &old_name, &new_name).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_set_upstream")]
async fn git_branch_set_upstream(repo_path: String, branch_name: String, upstream_name: Option<String>) -> Result<(), String> {
    branch_set_upstream(&PathBuf::from(repo_path), &branch_name, upstream_name.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_checkout")]
async fn git_branch_checkout(repo_path: String, name: String, strategy: CheckoutStrategy) -> Result<CheckoutResult, String> {
    checkout_branch(&PathBuf::from(repo_path), &name, strategy).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:get_commit_graph")]
async fn git_get_commit_graph(repo_path: String, limit: Option<usize>, branch_filter: Option<String>, first_parent_only: Option<bool>) -> Result<GraphView, String> {
    get_commit_graph(&PathBuf::from(repo_path), limit.unwrap_or(2000), branch_filter.as_deref(), first_parent_only.unwrap_or(false)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:search_history")]
async fn git_search_history(repo_path: String, query: HistorySearchQuery) -> Result<Vec<GraphNode>, String> {
    search_history(&PathBuf::from(repo_path), query).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:get_remotes")]
async fn git_get_remotes(repo_path: String) -> Result<Vec<RemoteItem>, String> {
    get_remotes(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:remote_list")]
async fn git_remote_list(repo_path: String) -> Result<Vec<RemoteItem>, String> {
    get_remotes(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:remote_add")]
async fn git_remote_add(repo_path: String, name: String, url: String) -> Result<RemoteItem, String> {
    add_remote(&PathBuf::from(repo_path), &name, &url).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:remote_remove")]
async fn git_remote_remove(repo_path: String, name: String) -> Result<(), String> {
    remove_remote(&PathBuf::from(repo_path), &name).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:remote_edit")]
async fn git_remote_edit(repo_path: String, name: String, new_url: String) -> Result<RemoteItem, String> {
    edit_remote(&PathBuf::from(repo_path), &name, &new_url).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:remote_prune")]
async fn git_remote_prune(repo_path: String, name: String) -> Result<(), String> {
    prune_remote(&PathBuf::from(repo_path), &name).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:remote_test")]
async fn git_remote_test(repo_path: String, name: String) -> Result<ConnectionTestResult, String> {
    test_remote_connection(&PathBuf::from(repo_path), &name).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:remote_fetch")]
async fn git_remote_fetch(repo_path: String, remote_name: Option<String>, prune: Option<bool>, tags: Option<bool>) -> Result<FetchResult, String> {
    fetch_remote(&PathBuf::from(repo_path), remote_name.as_deref(), prune.unwrap_or(false), tags.unwrap_or(false)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_pull")]
async fn git_branch_pull(repo_path: String, remote_name: String, branch_name: String, strategy: PullStrategy) -> Result<PullResult, String> {
    pull_branch(&PathBuf::from(repo_path), &remote_name, &branch_name, strategy).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_push")]
async fn git_branch_push(repo_path: String, remote_name: String, branch_name: String, force: Option<bool>, force_lease: Option<bool>, set_upstream: Option<bool>) -> Result<PushResult, String> {
    push_branch(&PathBuf::from(repo_path), &remote_name, &branch_name, force.unwrap_or(false), force_lease.unwrap_or(false), set_upstream.unwrap_or(false)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:conflict_list")]
async fn git_conflict_list(repo_path: String) -> Result<Vec<ConflictFileItem>, String> {
    get_conflicted_files(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:conflict_get_panes")]
async fn git_conflict_get_panes(repo_path: String, file_path: String) -> Result<ThreeWayPanes, String> {
    get_three_way_content(&PathBuf::from(repo_path), &file_path).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:conflict_resolve")]
async fn git_conflict_resolve(repo_path: String, file_path: String, resolved_content: String) -> Result<(), String> {
    resolve_conflict_file(&PathBuf::from(repo_path), &file_path, &resolved_content).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:conflict_continue")]
async fn git_conflict_continue(repo_path: String) -> Result<String, String> {
    continue_merge_or_rebase(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:conflict_abort")]
async fn git_conflict_abort(repo_path: String) -> Result<(), String> {
    abort_merge_or_rebase(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:stash_list")]
async fn git_stash_list(repo_path: String) -> Result<Vec<StashItem>, String> {
    list_stashes(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:stash_save")]
async fn git_stash_save(repo_path: String, message: Option<String>, include_untracked: Option<bool>, keep_index: Option<bool>) -> Result<StashItem, String> {
    save_stash(&PathBuf::from(repo_path), message.as_deref(), include_untracked.unwrap_or(false), keep_index.unwrap_or(false)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:stash_apply")]
async fn git_stash_apply(repo_path: String, index: usize) -> Result<String, String> {
    apply_stash(&PathBuf::from(repo_path), index).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:stash_pop")]
async fn git_stash_pop(repo_path: String, index: usize) -> Result<String, String> {
    pop_stash(&PathBuf::from(repo_path), index).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:stash_drop")]
async fn git_stash_drop(repo_path: String, index: usize) -> Result<(), String> {
    drop_stash(&PathBuf::from(repo_path), index).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_merge_analyze")]
async fn git_branch_merge_analyze(repo_path: String, source_branch: String) -> Result<MergeAnalysisResult, String> {
    analyze_merge(&PathBuf::from(repo_path), &source_branch).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_merge")]
async fn git_branch_merge(repo_path: String, source_branch: String, strategy: MergeStrategy) -> Result<MergeExecuteResult, String> {
    execute_merge(&PathBuf::from(repo_path), &source_branch, strategy).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_rebase_start")]
async fn git_branch_rebase_start(repo_path: String, upstream_ref: String, plan: Vec<RebasePlanItem>) -> Result<RebaseStatus, String> {
    start_interactive_rebase(&PathBuf::from(repo_path), &upstream_ref, plan).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_rebase_continue")]
async fn git_branch_rebase_continue(repo_path: String) -> Result<RebaseStatus, String> {
    continue_rebase(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_rebase_abort")]
async fn git_branch_rebase_abort(repo_path: String) -> Result<(), String> {
    abort_rebase(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:commit_cherrypick")]
async fn git_commit_cherrypick(repo_path: String, commit_oids: Vec<String>, no_commit: Option<bool>) -> Result<CherryPickResult, String> {
    execute_cherrypick(&PathBuf::from(repo_path), commit_oids, no_commit.unwrap_or(false)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:commit_revert")]
async fn git_commit_revert(repo_path: String, commit_oid: String, mainline: Option<u32>) -> Result<RevertResult, String> {
    execute_revert(&PathBuf::from(repo_path), &commit_oid, mainline).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:branch_reset")]
async fn git_branch_reset(repo_path: String, target_oid: String, mode: ResetMode) -> Result<ResetResult, String> {
    execute_reset(&PathBuf::from(repo_path), &target_oid, mode).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:checkpoint_list")]
async fn git_checkpoint_list(repo_path: String, limit: usize, only_pinned: bool, state: State<'_, AppState>) -> Result<Vec<CheckpointItem>, String> {
    list_checkpoints(&state.pool, &PathBuf::from(repo_path), limit, only_pinned).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:checkpoint_capture_manual")]
async fn git_checkpoint_capture_manual(repo_path: String, custom_label: String, explanation: Option<String>, state: State<'_, AppState>) -> Result<CheckpointItem, String> {
    capture_manual_pin(&state.pool, &PathBuf::from(repo_path), &custom_label, explanation.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:checkpoint_toggle_pin")]
async fn git_checkpoint_toggle_pin(checkpoint_id: String, is_pinned: bool, state: State<'_, AppState>) -> Result<(), String> {
    toggle_pin_status(&state.pool, &checkpoint_id, is_pinned).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:checkpoint_capture_external")]
async fn git_checkpoint_capture_external(repo_path: String, state: State<'_, AppState>) -> Result<Vec<CheckpointItem>, String> {
    capture_external_cli_op(&state.pool, &PathBuf::from(repo_path)).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:checkpoint_install_hooks")]
async fn git_checkpoint_install_hooks(repo_path: String) -> Result<String, String> {
    install_terminal_hooks(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:checkpoint_preview")]
async fn git_checkpoint_preview(repo_path: String, checkpoint_id: String, state: State<'_, AppState>) -> Result<RollbackPreview, String> {
    preview_rollback_impact(&state.pool, &PathBuf::from(repo_path), &checkpoint_id).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:checkpoint_rollback")]
async fn git_checkpoint_rollback(repo_path: String, checkpoint_id: String, state: State<'_, AppState>) -> Result<RollbackResult, String> {
    rollback_checkpoint(&state.pool, &PathBuf::from(repo_path), &checkpoint_id).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:checkpoint_prune")]
async fn git_checkpoint_prune(repo_path: String, retention_days: i64, state: State<'_, AppState>) -> Result<usize, String> {
    prune_old_checkpoints(&state.pool, &PathBuf::from(repo_path), retention_days).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:recovery_list")]
async fn git_recovery_list(repo_path: String) -> Result<Vec<RecoveryItem>, String> {
    get_recovery_center_items(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:checkpoint_delete")]
async fn git_checkpoint_delete(checkpoint_id: String, state: State<'_, AppState>) -> Result<DeleteCheckpointResult, String> {
    delete_checkpoint(&state.pool, &checkpoint_id).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:repo_optimize")]
async fn git_repo_optimize(repo_path: String) -> Result<GcResult, String> {
    run_git_gc(&PathBuf::from(repo_path)).await.map_err(|e| e.to_string())
}

// Worktrees
#[tauri::command(rename = "git:worktree_list")]
async fn git_worktree_list(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    list_worktrees(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:worktree_add")]
async fn git_worktree_add(repo_path: String, name: String, path: String) -> Result<WorktreeInfo, String> {
    add_worktree(&PathBuf::from(repo_path), &name, &path).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:worktree_remove")]
async fn git_worktree_remove(repo_path: String, name: String) -> Result<(), String> {
    remove_worktree(&PathBuf::from(repo_path), &name).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:worktree_lock")]
async fn git_worktree_lock(repo_path: String, name: String, reason: String) -> Result<(), String> {
    lock_worktree(&PathBuf::from(repo_path), &name, &reason).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:worktree_unlock")]
async fn git_worktree_unlock(repo_path: String, name: String) -> Result<(), String> {
    unlock_worktree(&PathBuf::from(repo_path), &name).map_err(|e| e.to_string())
}

// Submodules
#[tauri::command(rename = "git:submodule_list")]
async fn git_submodule_list(repo_path: String) -> Result<Vec<SubmoduleInfo>, String> {
    list_submodules(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:submodule_init")]
async fn git_submodule_init(repo_path: String, name: String) -> Result<(), String> {
    init_submodule(&PathBuf::from(repo_path), &name).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:submodule_update")]
async fn git_submodule_update(repo_path: String, name: String) -> Result<(), String> {
    update_submodule(&PathBuf::from(repo_path), &name).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:submodule_sync")]
async fn git_submodule_sync(repo_path: String, name: String) -> Result<(), String> {
    sync_submodule(&PathBuf::from(repo_path), &name).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:submodule_add")]
async fn git_submodule_add(repo_path: String, url: String, path: Option<String>) -> Result<(), String> {
    add_submodule(&PathBuf::from(repo_path), &url, path.as_deref()).map_err(|e| e.to_string())
}

// Hooks
#[tauri::command(rename = "git:hook_list")]
async fn git_hook_list(repo_path: String) -> Result<Vec<Hook>, String> {
    list_hooks(&PathBuf::from(repo_path)).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:hook_toggle")]
async fn git_hook_toggle(repo_path: String, name: String, enable: bool) -> Result<(), String> {
    toggle_hook(&PathBuf::from(repo_path), &name, enable).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:hook_edit")]
async fn git_hook_edit(repo_path: String, name: String, content: String) -> Result<(), String> {
    edit_hook_script(&PathBuf::from(repo_path), &name, &content).map_err(|e| e.to_string())
}

// Maintenance (Extended)
#[tauri::command(rename = "git:repo_prune")]
async fn git_repo_prune(repo_path: String) -> Result<String, String> {
    run_git_prune(&PathBuf::from(repo_path)).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:repo_pack_refs")]
async fn git_repo_pack_refs(repo_path: String) -> Result<String, String> {
    run_git_pack_refs(&PathBuf::from(repo_path)).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:repo_repack")]
async fn git_repo_repack(repo_path: String) -> Result<String, String> {
    run_git_repack(&PathBuf::from(repo_path)).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:repo_fsck")]
async fn git_repo_fsck(repo_path: String) -> Result<String, String> {
    run_git_fsck(&PathBuf::from(repo_path)).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:repo_commit_graph")]
async fn git_repo_commit_graph(repo_path: String) -> Result<String, String> {
    run_git_commit_graph(&PathBuf::from(repo_path)).await.map_err(|e| e.to_string())
}

// Internals
#[tauri::command(rename = "git:internals_get_object")]
async fn tauri_git_internals_get_object(repo_path: String, oid_hex: String) -> Result<GitObjectInfo, String> {
    git_internals_get_object(&PathBuf::from(repo_path), &oid_hex).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:internals_search_prefix")]
async fn tauri_git_internals_search_prefix(repo_path: String, prefix: String) -> Result<String, String> {
    git_internals_search_prefix(&PathBuf::from(repo_path), &prefix).map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:internals_get_tree")]
async fn tauri_git_internals_get_tree(repo_path: String, tree_oid_hex: String) -> Result<Vec<GitTreeEntry>, String> {
    git_internals_get_tree(&PathBuf::from(repo_path), &tree_oid_hex).map_err(|e| e.to_string())
}

// Plumbing
#[tauri::command(rename = "git:plumbing_execute_safe")]
async fn tauri_git_plumbing_execute_safe(repo_path: String, args: Vec<String>) -> Result<String, String> {
    git_plumbing_execute_safe(&PathBuf::from(repo_path), args).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:plumbing_execute_dangerous")]
async fn tauri_git_plumbing_execute_dangerous(repo_path: String, args: Vec<String>, state: State<'_, AppState>) -> Result<String, String> {
    git_plumbing_execute_dangerous(&state.pool, &PathBuf::from(repo_path), args).await.map_err(|e| e.to_string())
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

// --- MILESTONE 6 ---
#[tauri::command(rename = "git:hosting_list_accounts")]
async fn git_hosting_list_accounts(state: tauri::State<'_, AppState>) -> Result<Vec<HostingAccount>, String> {
    tye_git_engine::list_accounts(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:hosting_remove_account")]
async fn git_hosting_remove_account(state: tauri::State<'_, AppState>, account_id: String) -> Result<(), String> {
    tye_git_engine::remove_account(&state.pool, &account_id).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:hosting_start_oauth")]
async fn git_hosting_start_oauth(state: tauri::State<'_, AppState>, provider: String) -> Result<HostingAccount, String> {
    tye_git_engine::start_oauth_flow(&state.pool, &provider).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:pr_list")]
async fn git_pr_list(state: tauri::State<'_, AppState>, repo_path: String) -> Result<Vec<PullRequest>, String> {
    tye_git_engine::list_pull_requests(&state.pool, Path::new(&repo_path)).await.map_err(|e| e.to_string())
}

use tye_core_plugin_host::{PluginManifest, registry::PluginRegistry};

#[tauri::command(rename = "git:plugin_list")]
async fn git_plugin_list(_state: tauri::State<'_, AppState>) -> Result<Vec<PluginManifest>, String> {
    let home_path = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Could not find home directory")?;
        
    let plugin_dir = std::path::PathBuf::from(home_path).join(".tyegit").join("plugins");

    if !plugin_dir.exists() {
        std::fs::create_dir_all(&plugin_dir).map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }

    PluginRegistry::scan_plugins(&plugin_dir)
}

#[tauri::command(rename = "git:plugin_marketplace_list")]
async fn git_plugin_marketplace_list() -> Result<Vec<tye_core_plugin_host::marketplace::RemotePluginManifest>, String> {
    tye_core_plugin_host::marketplace::fetch_marketplace_plugins().await
}

#[tauri::command(rename = "git:plugin_install")]
async fn git_plugin_install(id: String, download_url: String) -> Result<(), String> {
    // We need to fetch the plugin manifest from the list again or pass it directly.
    // For this refactor, we will pass a minimal mock RemotePluginManifest to install_plugin, 
    // or ideally the frontend would just pass the whole object.
    // Let's adapt it to use the id and download_url and fetch the rest from the marketplace list for safety.
    let plugins = tye_core_plugin_host::marketplace::fetch_marketplace_plugins().await?;
    let plugin = plugins.into_iter().find(|p| p.id == id).ok_or("Plugin not found in marketplace")?;
    
    tye_core_plugin_host::marketplace::install_plugin(plugin).await
}

#[tauri::command(rename = "git:plugin_uninstall")]
async fn git_plugin_uninstall(id: String) -> Result<(), String> {
    tye_core_plugin_host::marketplace::uninstall_plugin(&id).await
}

#[tauri::command(rename = "git:open_plugins_folder")]
async fn git_open_plugins_folder() -> Result<(), String> {
    let home_path = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Could not find home directory")?;
        
    let plugin_dir = std::path::PathBuf::from(home_path).join(".tyegit").join("plugins");

    if !plugin_dir.exists() {
        std::fs::create_dir_all(&plugin_dir).map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(&plugin_dir).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&plugin_dir).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&plugin_dir).spawn().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command(rename = "git:hosting_create_pull_request")]
async fn git_hosting_create_pull_request(
    state: tauri::State<'_, AppState>, 
    repo_path: String,
    title: String,
    description: String,
    head_branch: String,
    base_branch: String
) -> Result<PullRequest, String> {
    tye_git_engine::create_pull_request(&state.pool, Path::new(&repo_path), &title, &description, &head_branch, &base_branch)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:dashboard_aggregate")]
async fn git_dashboard_aggregate(state: tauri::State<'_, AppState>, project_id: String, group_id: String) -> Result<DashboardAggregate, String> {
    tye_git_engine::get_dashboard_aggregate(&state.pool, &project_id, &group_id).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:cicd_get_runs")]
async fn git_cicd_get_runs(state: tauri::State<'_, AppState>, repo_path: String) -> Result<Vec<tye_git_engine::CicdRun>, String> {
    tye_git_engine::get_pipeline_runs(&state.pool, Path::new(&repo_path)).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:cicd_get_jobs")]
async fn git_cicd_get_jobs(state: tauri::State<'_, AppState>, repo_path: String, run_id: String) -> Result<Vec<tye_git_engine::CicdJob>, String> {
    tye_git_engine::get_pipeline_jobs(&state.pool, Path::new(&repo_path), &run_id).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:cicd_get_log")]
async fn git_cicd_get_log(state: tauri::State<'_, AppState>, repo_path: String, job_id: String) -> Result<String, String> {
    tye_git_engine::get_pipeline_log(&state.pool, Path::new(&repo_path), &job_id).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:cicd_get_environments")]
async fn git_cicd_get_environments(state: tauri::State<'_, AppState>, repo_path: String) -> Result<Vec<tye_git_engine::CicdEnvironment>, String> {
    tye_git_engine::get_pipeline_environments(&state.pool, Path::new(&repo_path)).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:cicd_get_secrets")]
async fn git_cicd_get_secrets(state: tauri::State<'_, AppState>, repo_path: String) -> Result<Vec<tye_git_engine::CicdSecret>, String> {
    tye_git_engine::get_pipeline_secrets(&state.pool, Path::new(&repo_path)).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:cicd_get_variables")]
async fn git_cicd_get_variables(state: tauri::State<'_, AppState>, repo_path: String) -> Result<Vec<tye_git_engine::CicdVariable>, String> {
    tye_git_engine::get_pipeline_variables(&state.pool, Path::new(&repo_path)).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:cicd_add_variable")]
async fn git_cicd_add_variable(state: tauri::State<'_, AppState>, repo_path: String, name: String, value: String) -> Result<(), String> {
    tye_git_engine::add_pipeline_variable(&state.pool, Path::new(&repo_path), &name, &value).await.map_err(|e| e.to_string())
}

#[tauri::command(rename = "git:cicd_add_secret")]
async fn git_cicd_add_secret(state: tauri::State<'_, AppState>, repo_path: String, name: String, value: String) -> Result<(), String> {
    tye_git_engine::add_pipeline_secret(&state.pool, Path::new(&repo_path), &name, &value).await.map_err(|e| e.to_string())
}


fn main() {
    let rt = tokio::runtime::Runtime::new().expect("Failed to start tokio runtime");
    let pool = rt.block_on(initialize_db());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::init())
        .plugin(tauri_plugin_process::init())
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
            git_dashboard_remove_repo,
            git_discovery_scan,
            git_repo_init,
            git_repo_clone,
            git_repo_open,
            git_repo_check_health,
            git_repo_optimize,
            git_group_create,
            git_group_list,
            git_group_delete,
            git_group_add_repo,
            git_group_remove_repo,
            git_status_get,
            git_stage_file,
            git_unstage_file,
            git_ignore_file,
            git_unignore_file,
            git_stage_all,
            git_unstage_all,
            git_stage_patch,
            git_discard_changes,
            git_diff_get_file,
            git_diff_get_image,
            git_commit_create,
            git_commit_history,
            git_commit_details,
            git_hook_execute,
            git_get_branches,
            git_branch_create,
            git_branch_delete,
            git_branch_rename,
            git_branch_set_upstream,
            git_branch_checkout,
            git_get_commit_graph,
            git_search_history,
            git_get_remotes,
            git_remote_list,
            git_remote_add,
            git_remote_remove,
            git_remote_edit,
            git_remote_prune,
            git_remote_test,
            git_remote_fetch,
            git_branch_pull,
            git_branch_push,
            git_conflict_list,
            git_conflict_get_panes,
            git_conflict_resolve,
            git_conflict_continue,
            git_conflict_abort,
            git_stash_list,
            git_stash_save,
            git_stash_apply,
            git_stash_pop,
            git_stash_drop,
            git_branch_merge_analyze,
            git_branch_merge,
            git_branch_rebase_start,
            git_branch_rebase_continue,
            git_branch_rebase_abort,
            git_commit_cherrypick,
            git_commit_revert,
            git_branch_reset,
            git_checkpoint_list,
            git_checkpoint_capture_manual,
            git_checkpoint_toggle_pin,
            git_checkpoint_capture_external,
            git_checkpoint_install_hooks,
            git_checkpoint_preview,
            git_checkpoint_rollback,
            git_checkpoint_prune,
            git_checkpoint_delete,
            git_recovery_list,
            git_repo_prune,
            git_repo_pack_refs,
            git_repo_repack,
            git_repo_fsck,
            git_repo_commit_graph,
            git_worktree_list,
            git_worktree_add,
            git_worktree_remove,
            git_worktree_lock,
            git_worktree_unlock,
            git_submodule_list,
            git_submodule_init,
            git_submodule_update,
            git_submodule_sync,
            git_submodule_add,
            git_hook_list,
            git_hook_toggle,
            git_hook_edit,
            git_hosting_list_accounts,
            git_hosting_remove_account,
            git_hosting_start_oauth,
            git_pr_list,
            git_plugin_list,
            git_plugin_marketplace_list,
            git_plugin_install,
            git_plugin_uninstall,
            git_open_plugins_folder,
            git_hosting_create_pull_request,
            git_dashboard_aggregate,
            git_cicd_get_runs,
            git_cicd_get_jobs,
            git_cicd_get_log,
            git_cicd_get_environments,
            git_cicd_get_secrets,
            git_cicd_get_variables,
            git_cicd_add_variable,
            git_cicd_add_secret,
            tauri_git_internals_get_object,
            tauri_git_internals_search_prefix,
            tauri_git_internals_get_tree,
            tauri_git_plumbing_execute_safe,
            tauri_git_plumbing_execute_dangerous,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
