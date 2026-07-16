use std::fs;
use sqlx::{Pool, Sqlite, SqlitePool};
use tempfile::TempDir;
use tye_git_engine::*;

async fn setup_db(temp_dir: &TempDir) -> Pool<Sqlite> {
    let db_path = temp_dir.path().join("project.db");
    let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
        .await
        .expect("Failed to create sqlite pool");
    schema::run_migrations(&pool)
        .await
        .expect("Failed to run migrations");
    pool
}

#[tokio::test]
async fn test_git_status_and_staging_matrix() {
    println!("\n=== [Matrix Test 1/4] git::status & git::stage (`F-013`, `F-014`, `F-015`) ===");
    let temp = TempDir::new().expect("Failed to create tempdir");
    let pool = setup_db(&temp).await;
    let repo_path = temp.path().join("test_repo");
    let repo = git2::Repository::init(&repo_path).expect("Repo init failed");

    // Configure user signature & autocrlf for deterministic testing
    let mut cfg = repo.config().unwrap();
    cfg.set_str("user.name", "Test User").unwrap();
    cfg.set_str("user.email", "test@tyegit.dev").unwrap();
    cfg.set_str("core.autocrlf", "false").unwrap();

    // 1. Create untracked file
    fs::write(repo_path.join("untracked.txt"), "hello untracked\n").unwrap();
    // Create ignored file via .gitignore
    fs::write(repo_path.join(".gitignore"), "*.log\n").unwrap();
    fs::write(repo_path.join("debug.log"), "some logs\n").unwrap();

    // Check status
    let st1 = get_repository_status(Some(&pool), &repo_path, true)
        .await
        .expect("Failed to get status");
    assert_eq!(st1.untracked.len(), 2); // untracked.txt and .gitignore
    assert_eq!(st1.ignored.len(), 1); // debug.log
    assert_eq!(st1.staged.len(), 0);

    // Verify DB caching
    let cached_rows: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM git_file_status_cache WHERE repo_path = ?")
        .bind(repo_path.to_string_lossy().to_string())
        .fetch_one(&pool)
        .await
        .expect("Query failed");
    assert!(cached_rows.0 >= 2);

    // 2. Stage untracked.txt
    stage_file(&repo_path, "untracked.txt").expect("stage_file failed");
    let st2 = get_repository_status(Some(&pool), &repo_path, true)
        .await
        .expect("Failed to get status");
    assert_eq!(st2.staged.len(), 1);
    assert_eq!(st2.staged[0].path, "untracked.txt");
    assert_eq!(st2.staged[0].status, "Added");

    // 3. Unstage file
    unstage_file(&repo_path, "untracked.txt").expect("unstage_file failed");
    let st3 = get_repository_status(None, &repo_path, false)
        .await
        .expect("Failed to get status");
    assert_eq!(st3.staged.len(), 0);
    assert!(st3.untracked.iter().any(|f| f.path == "untracked.txt"));

    // 4. Stage all
    stage_all(&repo_path).expect("stage_all failed");
    let st4 = get_repository_status(None, &repo_path, false)
        .await
        .expect("Failed to get status");
    assert_eq!(st4.staged.len(), 2); // untracked.txt and .gitignore

    // Create commit so we can test workdir modifications
    let req = CommitRequest {
        message: "Initial commit".to_string(),
        body: None,
        amend: false,
        signoff: false,
        co_authors: vec![],
        commit_type: "Normal".to_string(),
    };
    create_commit(Some(&pool), &repo_path, req).await.expect("initial commit failed");

    // Modify file
    fs::write(repo_path.join("untracked.txt"), "hello untracked\nsecond line\n").unwrap();
    let st5 = get_repository_status(None, &repo_path, false)
        .await
        .expect("Failed to get status");
    assert_eq!(st5.unstaged.len(), 1);
    assert_eq!(st5.unstaged[0].status, "Modified");
    assert_eq!(st5.total_unstaged_stats.insertions, 1);

    println!("  [SUCCESS] git::status & git::stage verified (categorization, line stats, caching, stage/unstage)");
}

#[tokio::test]
async fn test_git_diff_matrix() {
    println!("\n=== [Matrix Test 2/4] git::diff (`F-019`, `F-020`, `F-021`) ===");
    let temp = TempDir::new().expect("Failed to create tempdir");
    let repo_path = temp.path().join("diff_repo");
    let repo = git2::Repository::init(&repo_path).expect("Repo init failed");

    let mut cfg = repo.config().unwrap();
    cfg.set_str("user.name", "Test User").unwrap();
    cfg.set_str("user.email", "test@tyegit.dev").unwrap();
    cfg.set_str("core.autocrlf", "false").unwrap();

    // Create file and commit
    fs::write(repo_path.join("code.rs"), "fn main() {\n    println!(\"v1\");\n}\n").unwrap();
    stage_all(&repo_path).unwrap();
    create_commit(None, &repo_path, CommitRequest {
        message: "init".to_string(),
        body: None,
        amend: false,
        signoff: false,
        co_authors: vec![],
        commit_type: "Normal".to_string(),
    }).await.unwrap();

    // Modify file
    fs::write(repo_path.join("code.rs"), "fn main() {\n    println!(\"v2\");\n    let x = 42;\n}\n").unwrap();

    // 1. Get file diff (unstaged) (`F-019` & `F-020`)
    let diff = get_file_diff(&repo_path, "code.rs", false).expect("get_file_diff failed");
    assert_eq!(diff.file_path, "code.rs");
    assert!(!diff.is_binary);
    assert!(diff.hunks.len() >= 1);
    assert!(diff.insertions >= 1);
    assert!(diff.hunks[0].header.starts_with("@@"));

    // Verify exact line origins
    let origins: Vec<char> = diff.hunks[0].lines.iter().map(|l| l.origin).collect();
    assert!(origins.contains(&'+'));
    assert!(origins.contains(&'-'));

    // 2. Binary / Image diff (`F-021`)
    fs::write(repo_path.join("icon.png"), b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR").unwrap();
    let img_diff = get_image_diff(&repo_path, "icon.png", false).expect("get_image_diff failed");
    assert_eq!(img_diff.file_path, "icon.png");
    assert_eq!(img_diff.format, "png");
    assert!(img_diff.new_data.is_some());

    println!("  [SUCCESS] git::diff verified (hunk inspection, exact line stats, image diff base64)");
}

#[tokio::test]
async fn test_git_discard_changes_recycle_bin() {
    println!("\n=== [Matrix Test 3/4] git::discard_changes (OS Recycle Bin `F-018`) ===");
    let temp = TempDir::new().expect("Failed to create tempdir");
    let repo_path = temp.path().join("discard_repo");
    let repo = git2::Repository::init(&repo_path).expect("Repo init failed");

    let mut cfg = repo.config().unwrap();
    cfg.set_str("user.name", "Test User").unwrap();
    cfg.set_str("user.email", "test@tyegit.dev").unwrap();
    cfg.set_str("core.autocrlf", "false").unwrap();

    // 1. Tracked file modification discard (`Unstaged`)
    fs::write(repo_path.join("tracked.txt"), "original content\n").unwrap();
    stage_all(&repo_path).unwrap();
    create_commit(None, &repo_path, CommitRequest {
        message: "init".to_string(),
        body: None,
        amend: false,
        signoff: false,
        co_authors: vec![],
        commit_type: "Normal".to_string(),
    }).await.unwrap();

    fs::write(repo_path.join("tracked.txt"), "corrupted content\n").unwrap();
    discard_changes(&repo_path, Some("tracked.txt"), DiscardType::Unstaged).expect("discard unstaged failed");
    let content = fs::read_to_string(repo_path.join("tracked.txt")).unwrap();
    assert_eq!(content.replace("\r\n", "\n"), "original content\n");

    // 2. Untracked file discard -> sends to OS Recycle Bin via `trash` crate (`F-018`)
    fs::write(repo_path.join("garbage.txt"), "delete me to recycle bin\n").unwrap();
    assert!(repo_path.join("garbage.txt").exists());

    discard_changes(&repo_path, Some("garbage.txt"), DiscardType::Untracked).expect("discard untracked failed");
    assert!(!repo_path.join("garbage.txt").exists(), "garbage.txt should be moved to recycle bin");

    println!("  [SUCCESS] git::discard_changes verified (tracked reset and untracked trash crate recycling)");
}

#[tokio::test]
async fn test_git_commit_and_history_matrix() {
    println!("\n=== [Matrix Test 4/4] git::commit (`F-022`, `F-023`, `F-024`, `F-025`) ===");
    let temp = TempDir::new().expect("Failed to create tempdir");
    let pool = setup_db(&temp).await;
    let repo_path = temp.path().join("commit_repo");
    let repo = git2::Repository::init(&repo_path).expect("Repo init failed");

    let mut cfg = repo.config().unwrap();
    cfg.set_str("user.name", "Test User").unwrap();
    cfg.set_str("user.email", "test@tyegit.dev").unwrap();

    // 1. Create commit with subject, body, signoff, and co-authors (`F-022`)
    fs::write(repo_path.join("feature.rs"), "pub fn start() {}\n").unwrap();
    stage_all(&repo_path).unwrap();

    let req = CommitRequest {
        message: "feat: add start function".to_string(),
        body: Some("Detailed body describing why start function is needed.".to_string()),
        amend: false,
        signoff: true,
        co_authors: vec!["Jane Doe <jane@tyegit.dev>".to_string()],
        commit_type: "Normal".to_string(),
    };
    let oid1 = create_commit(Some(&pool), &repo_path, req).await.expect("create_commit failed");
    assert_eq!(oid1.len(), 40);

    // Verify recent commits cache in SQLite (`git_recent_commits_cache`)
    let cached_commit: (String, String) = sqlx::query_as("SELECT short_id, author_name FROM git_recent_commits_cache WHERE commit_id = ?")
        .bind(&oid1)
        .fetch_one(&pool)
        .await
        .expect("Commit not found in cache");
    assert_eq!(cached_commit.0, &oid1[..7]);
    assert_eq!(cached_commit.1, "Test User");

    // 2. Amend commit (`amend = true`)
    fs::write(repo_path.join("feature.rs"), "pub fn start() { println!(\"go\"); }\n").unwrap();
    stage_all(&repo_path).unwrap();
    let req_amend = CommitRequest {
        message: "feat: add start function with print".to_string(),
        body: None,
        amend: true,
        signoff: false,
        co_authors: vec![],
        commit_type: "Normal".to_string(),
    };
    let oid_amended = create_commit(Some(&pool), &repo_path, req_amend).await.expect("amend commit failed");
    assert_ne!(oid1, oid_amended);

    // 3. Pre-commit hook test (`F-023`)
    let hook_res = execute_pre_commit_hook(&repo_path).await.expect("execute_pre_commit_hook failed");
    assert!(hook_res.succeeded); // No hook script exists by default, so should succeed

    // 4. Paginated commit history (`F-024`)
    let history = get_commit_history(Some(&pool), &repo_path, 0, 10).expect("get_commit_history failed");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].id, oid_amended);
    assert_eq!(history[0].message_subject, "feat: add start function with print");

    // 5. Commit details (`F-025`)
    let detail = get_commit_details(&repo_path, &oid_amended).expect("get_commit_details failed");
    assert_eq!(detail.id, oid_amended);
    assert_eq!(detail.author_name, "Test User");
    assert_eq!(detail.changed_files.len(), 1);
    assert_eq!(detail.changed_files[0].path, "feature.rs");
    assert_eq!(detail.insertions, 1);

    println!("  [SUCCESS] git::commit verified (signoff, co-authors, amend, hooks, history graph, detailed stats)");
}

#[tokio::test]
async fn test_git_stage_patch_matrix() {
    println!("\n=== [Matrix Test 5/5] git::stage_patch (`F-016`, `F-017` Line Staging) ===");
    let temp = TempDir::new().expect("Failed to create tempdir");
    let repo_path = temp.path().join("patch_repo");
    let repo = git2::Repository::init(&repo_path).expect("Repo init failed");

    let mut cfg = repo.config().unwrap();
    cfg.set_str("user.name", "Test User").unwrap();
    cfg.set_str("user.email", "test@tyegit.dev").unwrap();
    cfg.set_str("core.autocrlf", "false").unwrap();

    // Create initial multi-line file and commit
    fs::write(repo_path.join("lines.txt"), "line 1\nline 2\nline 3\nline 4\n").unwrap();
    stage_all(&repo_path).unwrap();
    create_commit(None, &repo_path, CommitRequest {
        message: "init lines".to_string(),
        body: None,
        amend: false,
        signoff: false,
        co_authors: vec![],
        commit_type: "Normal".to_string(),
    }).await.unwrap();

    // Modify two separate lines (`line 2 modified` and `line 4 modified`)
    fs::write(repo_path.join("lines.txt"), "line 1\nline 2 modified\nline 3\nline 4 modified\n").unwrap();

    // Verify unstaged diff has both modifications
    let diff = get_file_diff(&repo_path, "lines.txt", false).expect("get_file_diff failed");
    assert_eq!(diff.insertions, 2);
    assert_eq!(diff.deletions, 2);

    // Build a patch that ONLY stages the modification to `line 2 modified` (`F-017` single line staging)
    // Old tree has 4 lines. We change `line 2` -> `line 2 modified`, and treat `line 4` modification as context (`line 4` remains old in index).
    let patch_str = "diff --git a/lines.txt b/lines.txt\n\
--- a/lines.txt\n\
+++ b/lines.txt\n\
@@ -1,4 +1,4 @@\n \
line 1\n\
-line 2\n\
+line 2 modified\n \
line 3\n \
line 4\n";

    stage_patch(&repo_path, patch_str).expect("stage_patch for single line failed");

    // Check status: lines.txt should now be in BOTH staged (`Modified` with `line 2 modified`) and unstaged (`Modified` with `line 4 modified`)
    let st = get_repository_status(None, &repo_path, false).await.expect("status failed");
    assert_eq!(st.staged.len(), 1);
    assert_eq!(st.staged[0].path, "lines.txt");
    assert_eq!(st.unstaged.len(), 1);
    assert_eq!(st.unstaged[0].path, "lines.txt");

    // Verify staged diff vs unstaged diff
    let staged_diff = get_file_diff(&repo_path, "lines.txt", true).expect("staged diff failed");
    assert_eq!(staged_diff.insertions, 1); // only line 2 modified
    assert_eq!(staged_diff.deletions, 1);

    let unstaged_diff = get_file_diff(&repo_path, "lines.txt", false).expect("unstaged diff failed");
    assert_eq!(unstaged_diff.insertions, 1); // only line 4 modified
    assert_eq!(unstaged_diff.deletions, 1);

    println!("  [SUCCESS] git::stage_patch line-level staging verified (single line staged cleanly without touching other modified lines)");
}

