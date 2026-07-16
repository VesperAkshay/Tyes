use std::fs;
use std::path::PathBuf;
use tye_git_engine::*;

async fn create_temp_repo(test_name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push(format!("tye_m4a_matrix_{}_{}", test_name, uuid::Uuid::new_v4()));
    let _ = fs::remove_dir_all(&path);
    fs::create_dir_all(&path).expect("Create temp dir");
    git2::Repository::init(&path).expect("Init git repo");

    let repo = git2::Repository::open(&path).expect("Open repo");
    let mut cfg = repo.config().expect("Get config");
    cfg.set_str("user.name", "Tye Test User").expect("Set name");
    cfg.set_str("user.email", "test@tyes.dev").expect("Set email");
    drop(cfg);
    drop(repo);

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
async fn test_stash_lifecycle() {
    let path = create_temp_repo("stash_lifecycle").await;

    // Create a modified file and an untracked file
    let test_file = path.join("README.md");
    fs::write(&test_file, "# Modified for stash\n").expect("Modify file");
    let untracked_file = path.join("untracked.txt");
    fs::write(&untracked_file, "Hello untracked\n").expect("Write untracked");

    // Save stash including untracked
    let saved = save_stash(&path, Some("WIP stash test"), true, false)
        .expect("Save stash");
    assert!(!saved.stash_oid.is_empty(), "Stash message or ID returned");

    // Check status is clean
    let status = get_repository_status(None, &path, false).await.expect("Get status");
    assert!(status.staged.is_empty() && status.unstaged.is_empty(), "Workspace should be clean after stash");

    // List stashes
    let list = list_stashes(&path).expect("List stashes");
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].index, 0);

    // Apply or pop stash
    pop_stash(&path, 0).expect("Pop stash");
    let status_after = get_repository_status(None, &path, false).await.expect("Get status after pop");
    assert!(!status_after.staged.is_empty() || !status_after.unstaged.is_empty() || !status_after.untracked.is_empty(), "Workspace should be dirty again after pop");

    // Check drop stash
    fs::write(&test_file, "# Second stash change\n").expect("Modify file 2");
    save_stash(&path, Some("Second stash"), false, false).expect("Save second stash");
    let list_2 = list_stashes(&path).expect("List 2");
    assert_eq!(list_2.len(), 1);
    drop_stash(&path, 0).expect("Drop stash");
    assert_eq!(list_stashes(&path).expect("List after drop").len(), 0);
}

#[tokio::test]
async fn test_merge_strategies_and_analysis() {
    let path = create_temp_repo("merge_analysis").await;

    // Create a feature branch
    create_branch(&path, "feature/fastforward", None).expect("Create branch");
    checkout_branch(&path, "feature/fastforward", CheckoutStrategy::Clean).expect("Checkout feature branch");

    // Add a commit on feature branch
    let feature_file = path.join("feature.txt");
    fs::write(&feature_file, "Feature data\n").expect("Write feature file");
    stage_all(&path).expect("Stage feature file");
    create_commit(
        None,
        &path,
        CommitRequest {
            message: "Add feature file".to_string(),
            body: None,
            amend: false,
            signoff: false,
            co_authors: vec![],
            commit_type: "feat".to_string(),
        },
    )
    .await
    .expect("Commit feature file");

    // Switch back to main (or master)
    let branches = get_branches(&path).expect("Get branches");
    let main_branch = branches
        .local
        .iter()
        .find(|b| b.shorthand == "main" || b.shorthand == "master")
        .expect("Find main branch");
    let main_name = main_branch.shorthand.clone();
    checkout_branch(&path, &main_name, CheckoutStrategy::Clean).expect("Checkout main");

    // Analyze merge
    let analysis = analyze_merge(&path, "feature/fastforward").expect("Analyze merge");
    assert_eq!(analysis.commits_ahead, 1);
    assert_eq!(analysis.commits_behind, 0);
    assert!(analysis.can_fast_forward);

    // Execute fast-forward merge
    let res = execute_merge(&path, "feature/fastforward", MergeStrategy::FastForward)
        .expect("Execute fast forward merge");
    assert!(!res.has_conflicts);
    assert!(path.join("feature.txt").exists(), "Feature file should exist after merge");
}

#[tokio::test]
async fn test_conflict_resolver_three_way() {
    let path = create_temp_repo("conflict_three_way").await;

    // We will create a conflict manually using branches
    let file_path = path.join("shared.txt");
    fs::write(&file_path, "Base Line 1\nBase Line 2\n").expect("Write base");
    stage_all(&path).expect("Stage base");
    create_commit(
        None,
        &path,
        CommitRequest {
            message: "Base commit".to_string(),
            body: None,
            amend: false,
            signoff: false,
            co_authors: vec![],
            commit_type: "feat".to_string(),
        },
    )
    .await
    .expect("Commit base");

    create_branch(&path, "branch_ours", None).expect("Create branch_ours");
    create_branch(&path, "branch_theirs", None).expect("Create branch_theirs");

    // Commit change on branch_ours
    checkout_branch(&path, "branch_ours", CheckoutStrategy::Clean).expect("Checkout ours");
    fs::write(&file_path, "Ours Line 1\nBase Line 2\n").expect("Write ours");
    stage_all(&path).expect("Stage ours");
    create_commit(
        None,
        &path,
        CommitRequest {
            message: "Ours commit".to_string(),
            body: None,
            amend: false,
            signoff: false,
            co_authors: vec![],
            commit_type: "feat".to_string(),
        },
    )
    .await
    .expect("Commit ours");

    // Commit conflicting change on branch_theirs
    checkout_branch(&path, "branch_theirs", CheckoutStrategy::Clean).expect("Checkout theirs");
    fs::write(&file_path, "Theirs Line 1\nBase Line 2\n").expect("Write theirs");
    stage_all(&path).expect("Stage theirs");
    create_commit(
        None,
        &path,
        CommitRequest {
            message: "Theirs commit".to_string(),
            body: None,
            amend: false,
            signoff: false,
            co_authors: vec![],
            commit_type: "feat".to_string(),
        },
    )
    .await
    .expect("Commit theirs");

    // Checkout ours and attempt merge with theirs using NoFastForward or normal merge
    checkout_branch(&path, "branch_ours", CheckoutStrategy::Clean).expect("Checkout ours again");
    let merge_res = execute_merge(&path, "branch_theirs", MergeStrategy::NoFastForward)
        .expect("Execute merge producing conflict");
    assert!(merge_res.has_conflicts, "Merge should produce index conflict");

    // Check conflicted files list
    let conflicts = get_conflicted_files(&path).expect("Get conflicted files");
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].file_path, "shared.txt");

    // Check 3-way content extraction
    let three_way = get_three_way_content(&path, "shared.txt").expect("Get 3-way content");
    assert!(three_way.base_content.contains("Base Line 1"));
    assert!(three_way.ours_content.contains("Ours Line 1"));
    assert!(three_way.theirs_content.contains("Theirs Line 1"));

    // Resolve the conflict
    let resolved_text = "Resolved Line 1\nBase Line 2\n";
    resolve_conflict_file(&path, "shared.txt", resolved_text).expect("Resolve conflict file");

    // Check conflicted list is empty now
    let conflicts_after = get_conflicted_files(&path).expect("Get after resolve");
    assert!(conflicts_after.is_empty(), "All conflicts resolved in index stage 0");
    assert_eq!(fs::read_to_string(&file_path).unwrap(), resolved_text);
}

#[tokio::test]
async fn test_reset_modes_soft_mixed_hard() {
    let path = create_temp_repo("reset_modes").await;

    // Get initial commit OID
    let commits = search_history(&path, HistorySearchQuery { query_type: HistorySearchType::Message, value: "".into(), branch: None, all_branches: true, include_merges: true, limit: Some(50) })
        .expect("Search history");
    let initial_oid = commits[0].id.clone();

    // Create commit 2
    let file2 = path.join("file2.txt");
    fs::write(&file2, "Commit 2\n").expect("Write file2");
    stage_all(&path).expect("Stage file2");
    create_commit(
        None,
        &path,
        CommitRequest {
            message: "Second commit".to_string(),
            body: None,
            amend: false,
            signoff: false,
            co_authors: vec![],
            commit_type: "feat".to_string(),
        },
    )
    .await
    .expect("Create second commit");

    // Test Soft Reset back to initial_oid
    execute_reset(&path, &initial_oid, ResetMode::Soft).expect("Execute soft reset");
    let status_soft = get_repository_status(None, &path, false).await.expect("Get status after soft reset");
    assert!(!status_soft.staged.is_empty(), "Soft reset leaves changes staged in index");

    // Re-commit for mixed reset test
    create_commit(
        None,
        &path,
        CommitRequest {
            message: "Recommit 2".to_string(),
            body: None,
            amend: false,
            signoff: false,
            co_authors: vec![],
            commit_type: "feat".to_string(),
        },
    )
    .await
    .expect("Recommit");

    // Test Mixed Reset back to initial_oid
    execute_reset(&path, &initial_oid, ResetMode::Mixed).expect("Execute mixed reset");
    let status_mixed = get_repository_status(None, &path, false).await.expect("Get status after mixed reset");
    assert!(status_mixed.staged.is_empty(), "Mixed reset clears staged index");
    assert!(!status_mixed.unstaged.is_empty() || !status_mixed.untracked.is_empty(), "Mixed reset leaves modifications in working dir");

    // Test Hard Reset on tracked file modifications
    let readme_path = path.join("README.md");
    fs::write(&readme_path, "# Corrupted README before hard reset\n").expect("Modify tracked file");
    execute_reset(&path, &initial_oid, ResetMode::Hard).expect("Execute hard reset");
    let status_hard = get_repository_status(None, &path, false).await.expect("Get status after hard reset");
    assert!(status_hard.staged.is_empty() && status_hard.unstaged.is_empty(), "Hard reset completely cleans working dir and index");
    assert_eq!(fs::read_to_string(&readme_path).unwrap().replace("\r\n", "\n"), "# Initial Repository\n", "README restored to initial content");
}

#[tokio::test]
async fn test_cherrypick_and_revert() {
    let path = create_temp_repo("cherry_revert").await;

    // Create feature branch and a commit
    create_branch(&path, "feature/cherry", None).expect("Create branch");
    checkout_branch(&path, "feature/cherry", CheckoutStrategy::Clean).expect("Checkout feature");
    let cherry_file = path.join("cherry.txt");
    fs::write(&cherry_file, "Sweet cherry\n").expect("Write cherry file");
    stage_all(&path).expect("Stage cherry");
    create_commit(
        None,
        &path,
        CommitRequest {
            message: "Add cherry".to_string(),
            body: None,
            amend: false,
            signoff: false,
            co_authors: vec![],
            commit_type: "feat".to_string(),
        },
    )
    .await
    .expect("Commit cherry");

    let commits = search_history(&path, HistorySearchQuery { query_type: HistorySearchType::Message, value: "Add cherry".into(), branch: None, all_branches: true, include_merges: true, limit: Some(50) })
        .expect("Find cherry commit");
    let cherry_oid = commits[0].id.clone();

    // Switch to main
    let branches = get_branches(&path).expect("Get branches");
    let main_name = branches.local.iter().find(|b| b.shorthand == "main" || b.shorthand == "master").unwrap().shorthand.clone();
    checkout_branch(&path, &main_name, CheckoutStrategy::Clean).expect("Checkout main");
    assert!(!cherry_file.exists());

    // Execute Cherry-Pick onto main
    let pick_res = execute_cherrypick(&path, vec![cherry_oid.clone()], false).expect("Execute cherry-pick");
    assert!(!pick_res.has_conflicts);
    assert!(cherry_file.exists(), "Cherry picked file should exist on main now");

    // Execute Revert of the cherry-picked commit
    let head_commit = search_history(&path, HistorySearchQuery { query_type: HistorySearchType::Message, value: "Add cherry".into(), branch: None, all_branches: true, include_merges: true, limit: Some(50) })
        .expect("Find cherry commit on main")[0].id.clone();
    let revert_res = execute_revert(&path, &head_commit, None).expect("Execute revert");
    assert!(!revert_res.has_conflicts);
    assert!(!cherry_file.exists(), "Reverted file should be gone from main");
}
