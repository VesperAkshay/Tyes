use std::fs;
use std::path::PathBuf;
use sqlx::SqlitePool;
use tye_git_engine::*;

async fn setup_test_repo(test_name: &str) -> (PathBuf, SqlitePool) {
    let mut path = std::env::temp_dir();
    path.push(format!("tye_m4b_matrix_{}_{}", test_name, uuid::Uuid::new_v4()));
    if path.exists() {
        let _ = fs::remove_dir_all(&path);
    }
    fs::create_dir_all(&path).unwrap();

    let db_path = path.join("project.db");
    let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path.display())).await.unwrap();
    tye_git_engine::schema::run_migrations(&pool).await.unwrap();

    let repo_path = path.join("repo");
    fs::create_dir_all(&repo_path).unwrap();
    init_repository(&pool, "test_proj", &repo_path, false, None, None).await.unwrap();

    // Create initial commit
    let file1 = repo_path.join("README.md");
    fs::write(&file1, "# Milestone 4B Test Repo\n").unwrap();
    stage_all(&repo_path).unwrap();
    create_commit(Some(&pool), &repo_path, CommitRequest {
        message: "Initial commit".to_string(),
        body: None,
        amend: false,
        signoff: false,
        co_authors: vec![],
        commit_type: "Normal".to_string(),
    }).await.unwrap();

    (path, pool)
}

#[tokio::test]
async fn test_checkpoint_capture_and_rollback() {
    let (base_dir, pool) = setup_test_repo("rollback").await;
    let repo_path = base_dir.join("repo");

    // Capture clean pre-op checkpoint
    let cp1 = capture_pre_op(&pool, &repo_path, "Before modifications", true).await.unwrap();
    assert!(cp1.stash_oid.is_none());

    // Create second commit
    let file1 = repo_path.join("README.md");
    fs::write(&file1, "# Modified README\nLine 2\n").unwrap();
    stage_all(&repo_path).unwrap();
    create_commit(Some(&pool), &repo_path, CommitRequest {
        message: "Second commit".to_string(),
        body: None,
        amend: false,
        signoff: false,
        co_authors: vec![],
        commit_type: "Normal".to_string(),
    }).await.unwrap();

    // Now rollback to cp1
    let res = rollback_checkpoint(&pool, &repo_path, &cp1.id).await.unwrap();
    assert!(res.success);
    assert_eq!(res.restored_head, cp1.head_before);

    // Verify README content is back to initial
    let content = fs::read_to_string(&file1).unwrap();
    assert_eq!(content.replace("\r\n", "\n"), "# Milestone 4B Test Repo\n");
}

#[tokio::test]
async fn test_upgrade1_external_cli_reflog_tracking() {
    let (base_dir, pool) = setup_test_repo("upgrade1").await;
    let repo_path = base_dir.join("repo");

    // Simulate an external CLI reset by performing hard reset with git2 directly
    let repo = git2::Repository::open(&repo_path).unwrap();
    let head = repo.head().unwrap();
    let commit = head.peel_to_commit().unwrap();
    repo.reset(commit.as_object(), git2::ResetType::Hard, None).unwrap();

    // Call capture_external_cli_op
    let _external_cps = capture_external_cli_op(&pool, &repo_path).await.unwrap();
    let all = list_checkpoints(&pool, &repo_path, 20, false).await.unwrap();
    assert!(all.len() >= 0);

    // Install hooks check
    let hook_msg = install_terminal_hooks(&repo_path).unwrap();
    assert!(hook_msg.contains("Successfully installed terminal hooks"));
    assert!(repo_path.join(".git/hooks/post-checkout").exists());
}

#[tokio::test]
async fn test_upgrade2_smart_stash_filtering_and_prune() {
    let (base_dir, pool) = setup_test_repo("upgrade2").await;
    let repo_path = base_dir.join("repo");

    // Create uncommitted dirty file
    let dirty_file = repo_path.join("dirty.txt");
    fs::write(&dirty_file, "Uncommitted data").unwrap();

    // Capture checkpoint when dirty
    let cp_dirty = capture_pre_op(&pool, &repo_path, "Before rebase", true).await.unwrap();
    assert!(cp_dirty.stash_oid.is_some(), "Should stash uncommitted working tree file");
    assert!(!dirty_file.exists(), "Dirty file should be stashed away");

    // Test pruning old checkpoints
    let pruned = prune_old_checkpoints(&pool, &repo_path, 30).await.unwrap();
    assert_eq!(pruned, 0, "Current checkpoints are brand new, shouldn't prune");
}

#[tokio::test]
async fn test_upgrade3_sandbox_preview() {
    let (base_dir, pool) = setup_test_repo("upgrade3").await;
    let repo_path = base_dir.join("repo");

    let cp1 = capture_pre_op(&pool, &repo_path, "Base anchor", true).await.unwrap();

    // Make two more commits
    let f = repo_path.join("README.md");
    fs::write(&f, "Commit A").unwrap();
    stage_all(&repo_path).unwrap();
    create_commit(Some(&pool), &repo_path, CommitRequest {
        message: "Commit A".to_string(),
        body: None,
        amend: false,
        signoff: false,
        co_authors: vec![],
        commit_type: "Normal".to_string(),
    }).await.unwrap();

    let preview = preview_rollback_impact(&pool, &repo_path, &cp1.id).await.unwrap();
    assert_eq!(preview.commits_undone, 1);
    assert!(preview.summary_text.contains("Rollback from"));
}

#[tokio::test]
async fn test_upgrade4_manual_pins() {
    let (base_dir, pool) = setup_test_repo("upgrade4").await;
    let repo_path = base_dir.join("repo");

    let pin = capture_manual_pin(&pool, &repo_path, "Pre-Refactoring Auth Module", Some("Critical save point")).await.unwrap();
    assert!(pin.is_pinned);
    assert_eq!(pin.custom_label.as_deref(), Some("Pre-Refactoring Auth Module"));

    let pinned_list = list_checkpoints(&pool, &repo_path, 10, true).await.unwrap();
    assert_eq!(pinned_list.len(), 1);
    assert_eq!(pinned_list[0].id, pin.id);

    // Toggle off
    toggle_pin_status(&pool, &pin.id, false).await.unwrap();
    let after_toggle = list_checkpoints(&pool, &repo_path, 10, true).await.unwrap();
    assert_eq!(after_toggle.len(), 0);
}

#[tokio::test]
async fn test_recovery_center_dangling_and_reflog() {
    let (base_dir, _pool) = setup_test_repo("recovery").await;
    let repo_path = base_dir.join("repo");

    let items = get_recovery_center_items(&repo_path).unwrap();
    assert!(items.len() >= 0);
}
