use std::fs;
use std::path::PathBuf;
use tye_git_engine::*;

async fn create_temp_repo(test_name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push(format!("tye_m3_matrix_{}_{}", test_name, uuid::Uuid::new_v4()));
    let _ = fs::remove_dir_all(&path);
    fs::create_dir_all(&path).expect("Create temp dir");
    git2::Repository::init(&path).expect("Init git repo");

    // Configure local user so commits succeed
    let repo = git2::Repository::open(&path).expect("Open repo");
    let mut cfg = repo.config().expect("Get config");
    cfg.set_str("user.name", "Tye Test User").expect("Set name");
    cfg.set_str("user.email", "test@tyes.dev").expect("Set email");
    drop(cfg);
    drop(repo);

    // Create initial commit
    let test_file = path.join("README.md");
    fs::write(&test_file, "# Initial Repository\n").expect("Write test file");
    stage_all(&path).expect("Stage initial file");
    create_commit(
        None,
        &path,
        CommitRequest {
            message: "Initial commit".to_string(),
            body: None,
            amend: false,
            signoff: false,
            co_authors: vec![],
            commit_type: "feat".to_string(),
        },
    )
    .await
    .expect("Create initial commit");

    path
}

#[tokio::test]
async fn test_branch_creation_and_listing() {
    let path = create_temp_repo("branch_creation").await;

    let new_branch = create_branch(&path, "feature/auth", None).expect("Create feature/auth branch");
    assert_eq!(new_branch.shorthand, "feature/auth");
    assert!(!new_branch.is_head);

    let list = get_branches(&path).expect("Get branches");
    assert!(list.local.len() >= 2);
    assert!(list.local.iter().any(|b| b.shorthand == "feature/auth"));
    assert!(list.local.iter().any(|b| b.is_head));
}

#[tokio::test]
async fn test_branch_rename_and_delete() {
    let path = create_temp_repo("branch_rename_delete").await;

    create_branch(&path, "feature/old", None).expect("Create branch");
    rename_branch(&path, "feature/old", "feature/new").expect("Rename branch");

    let list = get_branches(&path).expect("Get branches after rename");
    assert!(list.local.iter().any(|b| b.shorthand == "feature/new"));
    assert!(!list.local.iter().any(|b| b.shorthand == "feature/old"));

    delete_branch(&path, "feature/new", false).expect("Delete branch");
    let list_after = get_branches(&path).expect("Get branches after delete");
    assert!(!list_after.local.iter().any(|b| b.shorthand == "feature/new"));
}

#[tokio::test]
async fn test_branch_checkout_clean_and_dirty() {
    let path = create_temp_repo("branch_checkout").await;

    create_branch(&path, "feature/switch", None).expect("Create branch");

    // Clean checkout
    let res = checkout_branch(&path, "feature/switch", CheckoutStrategy::Clean).expect("Checkout clean");
    match res {
        CheckoutResult::Success { branch, stashed } => {
            assert_eq!(branch, "feature/switch");
            assert!(!stashed);
        }
        _ => panic!("Expected successful clean checkout"),
    }

    // Now make working directory dirty
    let test_file = path.join("README.md");
    fs::write(&test_file, "# Modified while on switch\n").expect("Modify file");

    // Try clean checkout back to master/main
    let branches = get_branches(&path).expect("Get branches");
    let main_branch = branches
        .local
        .iter()
        .find(|b| b.shorthand == "master" || b.shorthand == "main")
        .map(|b| b.shorthand.as_str())
        .unwrap_or("master");

    let dirty_res = checkout_branch(&path, main_branch, CheckoutStrategy::Clean).expect("Checkout attempt when dirty");
    match dirty_res {
        CheckoutResult::Dirty { affected_files, .. } => {
            assert!(!affected_files.is_empty());
        }
        _ => panic!("Expected dirty status when checking out with uncommitted changes"),
    }

    // Stash and checkout
    let stash_res = checkout_branch(&path, main_branch, CheckoutStrategy::StashAndCheckout).expect("Stash and checkout");
    match stash_res {
        CheckoutResult::Success { branch, stashed } => {
            assert_eq!(branch, main_branch);
            assert!(stashed);
        }
        _ => panic!("Expected successful stash and checkout"),
    }
}

#[tokio::test]
async fn test_commit_graph_dag() {
    let path = create_temp_repo("commit_graph").await;

    // Add second commit
    fs::write(path.join("second.txt"), "hello graph").unwrap();
    stage_all(&path).unwrap();
    create_commit(
        None,
        &path,
        CommitRequest {
            message: "Add second file".to_string(),
            body: None,
            amend: false,
            signoff: false,
            co_authors: vec![],
            commit_type: "feat".to_string(),
        },
    )
    .await
    .unwrap();

    let graph = get_commit_graph(&path, 100, None, false).expect("Get commit graph");
    assert!(graph.nodes.len() >= 2);
    assert!(!graph.edges.is_empty());

    // Verify lanes
    for node in &graph.nodes {
        assert!(node.lane < 10); // Lanes should be tightly packed around 0
    }
}

#[tokio::test]
async fn test_history_search_queries() {
    let path = create_temp_repo("history_search").await;

    fs::write(path.join("pickaxe.rs"), "fn secret_token_123() {}").unwrap();
    stage_all(&path).unwrap();
    create_commit(
        None,
        &path,
        CommitRequest {
            message: "Implement pickaxe feature".to_string(),
            body: None,
            amend: false,
            signoff: false,
            co_authors: vec![],
            commit_type: "feat".to_string(),
        },
    )
    .await
    .unwrap();

    // Search by message
    let msg_res = search_history(
        &path,
        HistorySearchQuery {
            query_type: HistorySearchType::Message,
            value: "pickaxe".to_string(),
            branch: None,
            all_branches: true,
            include_merges: true,
            limit: None,
        },
    )
    .expect("Search history by message");
    assert!(!msg_res.is_empty());
    assert!(msg_res[0].subject.contains("pickaxe"));

    // Search by Pickaxe (-S)
    let pick_res = search_history(
        &path,
        HistorySearchQuery {
            query_type: HistorySearchType::Pickaxe,
            value: "secret_token_123".to_string(),
            branch: None,
            all_branches: true,
            include_merges: true,
            limit: None,
        },
    )
    .expect("Search history by pickaxe");
    assert!(!pick_res.is_empty());
}

#[tokio::test]
async fn test_remote_crud_and_connection() {
    let path = create_temp_repo("remote_crud").await;

    // Add remote
    let rem = add_remote(&path, "origin", "https://github.com/git/git.git").expect("Add remote");
    assert_eq!(rem.name, "origin");
    assert_eq!(rem.fetch_url, "https://github.com/git/git.git");

    let list = get_remotes(&path).expect("Get remotes");
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].name, "origin");

    // Edit remote
    let edited = edit_remote(&path, "origin", "https://github.com/git/git-renamed.git").expect("Edit remote");
    assert_eq!(edited.fetch_url, "https://github.com/git/git-renamed.git");

    // Test connection latency format (Note: network may or may not be reachable in test env, so we just verify function returns cleanly or handles connection)
    let test_conn = test_remote_connection(&path, "origin");
    assert!(test_conn.is_ok());

    // Remove remote
    remove_remote(&path, "origin").expect("Remove remote");
    let list_empty = get_remotes(&path).expect("Get remotes after remove");
    assert!(list_empty.is_empty());
}
