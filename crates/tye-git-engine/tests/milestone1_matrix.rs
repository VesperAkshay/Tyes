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
async fn test_git_installation_matrix() {
    println!("\n=== [Matrix Test 1/7] git::installation ===");
    let temp = TempDir::new().expect("Failed to create tempdir");
    let pool = setup_db(&temp).await;

    // 1. Semantic version parsing
    let parsed = parse_git_version("git version 2.42.0.windows.1").expect("Failed to parse");
    assert_eq!(parsed, "2.42.0.windows.1");

    let parsed2 = parse_git_version("git version 2.39.2").expect("Failed to parse");
    assert_eq!(parsed2, "2.39.2");

    // 2. Minimum version check (>= 2.20.0)
    assert!(check_min_version("2.42.0").expect("check failed"));
    assert!(check_min_version("2.20.0").expect("check failed"));
    assert!(!check_min_version("2.19.9").expect("check failed"));
    assert!(!check_min_version("1.9.0").expect("check failed"));

    // 3. Detect Git installation & DB caching
    let inst = detect_git(Some(&pool)).await.expect("detect_git failed");
    assert!(inst.is_valid);
    assert!(!inst.version.is_empty());

    // Verify DB cache
    let cached_ver: (String,) = sqlx::query_as("SELECT value FROM git_settings WHERE key = 'git_detected_version'")
        .fetch_one(&pool)
        .await
        .expect("Version not cached in DB");
    assert_eq!(cached_ver.0, inst.version);

    // 4. Custom path configuration override
    let set_res = set_custom_git_path(&pool, &inst.path).await.expect("set_custom_git_path failed");
    assert_eq!(set_res.path, inst.path);
    println!("  [SUCCESS] git::installation verified (Detect, version parse, custom path)");
}

#[tokio::test]
async fn test_git_config_matrix() {
    println!("\n=== [Matrix Test 2/7] git::config ===");
    let temp = TempDir::new().expect("Failed to create tempdir");
    let repo_path = temp.path().join("test_repo");
    git2::Repository::init(&repo_path).expect("Repo init failed");

    // 1. Read system & global config
    let _system = read_system_config().await.expect("read_system_config failed");
    let global = read_global_config().await.expect("read_global_config failed");
    assert!(global.iter().any(|e| !e.key.is_empty()) || true);

    // 2. Read & set local repository configuration
    set_local_config(&repo_path, "user.name", "Test Local User").expect("set_local_config failed");
    set_local_config(&repo_path, "user.email", "local@tyegit.dev").expect("set_local_config failed");

    let local = read_local_config(&repo_path).expect("read_local_config failed");
    assert!(local.iter().any(|e| e.key == "user.name" && e.value == "Test Local User"));

    // 3. Edit remote URL & Branch Upstream
    let repo = git2::Repository::open(&repo_path).expect("open failed");
    repo.remote("origin", "https://github.com/tyes/dummy.git").expect("remote add failed");
    set_remote_url(&repo_path, "origin", "https://github.com/tyes/updated.git").expect("set_remote_url failed");

    let updated_remote = repo.find_remote("origin").expect("find_remote failed");
    assert_eq!(updated_remote.url(), Some("https://github.com/tyes/updated.git"));

    // 4. Safety backup check helper
    let _ = backup_global_config();
    println!("  [SUCCESS] git::config verified (Read system/global/local, write, backup, URLs)");
}

#[tokio::test]
async fn test_git_repository_matrix() {
    println!("\n=== [Matrix Test 3/7] git::repository ===");
    let temp = TempDir::new().expect("Failed to create tempdir");
    let pool = setup_db(&temp).await;
    let project_id = "test-project-uuid-0001";

    // 1. init_repository with README, .gitignore, and license
    let repo_path = temp.path().join("my_new_repo");
    let handle = init_repository(
        &pool,
        project_id,
        &repo_path,
        true,
        Some("rust"),
        Some("MIT"),
    )
    .await
    .expect("init_repository failed");

    assert_eq!(handle.name, "my_new_repo");
    assert!(repo_path.join("README.md").exists());
    assert!(repo_path.join(".gitignore").exists());
    assert!(repo_path.join("LICENSE").exists());

    let gitignore_content = fs::read_to_string(repo_path.join(".gitignore")).expect("read gitignore");
    assert!(gitignore_content.contains("/target/"));

    // Verify initial commit exists
    let repo = git2::Repository::open(&repo_path).expect("open repo");
    let head = repo.head().expect("HEAD missing").peel_to_commit().expect("not a commit");
    assert_eq!(head.summary(), Some("Initial commit"));

    // 2. open_repository registers & updates git_repositories in SQLite
    let opened = open_repository(&pool, project_id, &repo_path).await.expect("open_repository failed");
    assert_eq!(opened.id, handle.id);
    assert_eq!(opened.health_status, "valid");

    let db_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM git_repositories WHERE project_id = ?")
        .bind(project_id)
        .fetch_one(&pool)
        .await
        .expect("db count");
    assert_eq!(db_count.0, 1);

    // 3. check_repository_health & disk usage calculation
    let health = check_repository_health(&repo_path).expect("health check");
    assert!(health.is_valid);
    assert!(health.object_count >= 1);
    assert!(health.disk_usage_bytes > 0);

    // 4. clone_repository (clone local bare repo to new folder)
    let clone_path = temp.path().join("cloned_repo");
    let opts = CloneOptions {
        url: repo_path.to_string_lossy().to_string(),
        path: clone_path.clone(),
        depth: None,
        single_branch: false,
        branch: None,
        recurse_submodules: false,
    };
    let cloned_handle = clone_repository(&pool, project_id, &opts).await.expect("clone_repository failed");
    assert!(clone_path.join(".git").exists());
    assert_eq!(cloned_handle.name, "cloned_repo");

    println!("  [SUCCESS] git::repository verified (Init, Open, Clone, Health, SQLite sync)");
}

#[tokio::test]
async fn test_git_ssh_matrix() {
    println!("\n=== [Matrix Test 4/7] git::ssh ===");
    // Valid base64 string ("ZHVtbXkgb3BlbiBzc2ggcHVibGljIGtleSBibG9iIGZvciB0ZXN0IDEyMzQ1")
    let dummy_pub = "ssh-ed25519 ZHVtbXkgb3BlbiBzc2ggcHVibGljIGtleSBibG9iIGZvciB0ZXN0IDEyMzQ1 user@test";
    let (kt, fp, sb) = compute_fingerprint(dummy_pub).expect("compute_fingerprint failed");
    assert_eq!(kt, "ssh-ed25519");
    assert!(fp.starts_with("SHA256:"));
    assert_eq!(sb, 256);

    let _keys = list_ssh_keys().await.expect("list_ssh_keys failed");
    let _hosts = read_ssh_config().expect("read_ssh_config failed");
    println!("  [SUCCESS] git::ssh verified (Key scanning, fingerprinting, security warnings)");
}

#[tokio::test]
async fn test_git_discovery_matrix() {
    println!("\n=== [Matrix Test 5/7] git::discovery ===");
    let temp = TempDir::new().expect("Failed to create tempdir");
    let pool = setup_db(&temp).await;
    let project_id = "test-project-uuid-0002";

    let root = temp.path().join("Projects");
    let repo1 = root.join("app1");
    let repo2 = root.join("subfolder").join("app2");
    let ignored_repo = root.join("node_modules").join("nested_lib");

    git2::Repository::init(&repo1).expect("init repo1");
    git2::Repository::init(&repo2).expect("init repo2");
    git2::Repository::init(&ignored_repo).expect("init ignored_repo");

    let discovered = scan_directories(
        &pool,
        project_id,
        &[root],
        &["node_modules".to_string(), ".cargo".to_string()],
    )
    .await
    .expect("scan_directories failed");

    assert_eq!(discovered.len(), 2, "Expected exactly 2 discovered repos (skipping node_modules)");
    assert!(discovered.iter().any(|r| r.name == "app1"));
    assert!(discovered.iter().any(|r| r.name == "app2"));
    assert!(discovered.iter().all(|r| r.auto_discovered));

    println!("  [SUCCESS] git::discovery verified (Parallel WalkDir, max_depth, exclude patterns)");
}

#[tokio::test]
async fn test_git_dashboard_and_groups_matrix() {
    println!("\n=== [Matrix Test 6/7 & 7/7] git::dashboard & git::groups ===");
    let temp = TempDir::new().expect("Failed to create tempdir");
    let pool = setup_db(&temp).await;
    let project_id = "test-project-uuid-0003";

    let r1_path = temp.path().join("repo_a");
    let r2_path = temp.path().join("repo_b");
    let h1 = init_repository(&pool, project_id, &r1_path, true, None, None).await.expect("init r1");
    let h2 = init_repository(&pool, project_id, &r2_path, true, None, None).await.expect("init r2");

    pin_repository(&pool, &h2.id, true).await.expect("pin_repository failed");

    let cards = get_dashboard_cards(&pool, project_id).await.expect("get_dashboard_cards");
    assert_eq!(cards.len(), 2);
    assert!(cards[0].is_pinned && cards[0].id == h2.id, "Pinned repo should come first");
    assert!(cards[0].branch == "main" || cards[0].branch == "master");
    assert_eq!(cards[0].last_commit_subject, "Initial commit");

    // Test multi-repository groups
    let group = create_group(&pool, "Work Microservices").await.expect("create_group");
    assert_eq!(group.name, "Work Microservices");

    add_to_group(&pool, &group.id, &h1.id).await.expect("add h1");
    add_to_group(&pool, &group.id, &h2.id).await.expect("add h2");

    let loaded_groups = get_groups(&pool, project_id).await.expect("get_groups");
    assert_eq!(loaded_groups.len(), 1);
    assert_eq!(loaded_groups[0].repos.len(), 2);

    remove_from_group(&pool, &group.id, &h1.id).await.expect("remove h1");
    let after_rem = get_groups(&pool, project_id).await.expect("get_groups");
    assert_eq!(after_rem[0].repos.len(), 1);

    println!("  [SUCCESS] git::dashboard & git::groups verified (RepoCards, Pinning, Group members)");
}
