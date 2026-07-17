use std::path::PathBuf;
use std::fs;
use tye_git_engine::worktree::{list_worktrees, add_worktree, remove_worktree};
use tye_git_engine::submodule::list_submodules;
use tye_git_engine::hooks::{list_hooks, toggle_hook};
use tye_git_engine::maintenance::{run_git_prune, run_git_pack_refs, run_git_repack, run_git_fsck, run_git_commit_graph};
use tye_git_engine::internals::{git_internals_search_prefix, git_internals_get_object, git_internals_get_tree};
use tye_git_engine::plumbing::git_plumbing_execute_safe;
use git2::Repository;

fn create_temp_repo() -> (PathBuf, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let repo = Repository::init(dir.path()).unwrap();
    
    // Create an initial commit so we have a valid HEAD for branching/worktrees
    let mut index = repo.index().unwrap();
    let id = index.write_tree().unwrap();
    let tree = repo.find_tree(id).unwrap();
    let sig = repo.signature().unwrap();
    repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[]).unwrap();
    
    (dir.path().to_path_buf(), dir)
}

#[test]
fn test_milestone5_worktrees() {
    let (repo_path, _dir) = create_temp_repo();
    
    // Initially no extra worktrees
    let wts = list_worktrees(&repo_path).unwrap();
    assert_eq!(wts.len(), 0);
    
    // Add worktree
    let wt_path = repo_path.parent().unwrap().join("test_wt");
    // Ensure cleanup of the test_wt if it exists from a previous run
    if wt_path.exists() {
        let _ = fs::remove_dir_all(&wt_path);
    }
    
    let added = add_worktree(&repo_path, "test_branch", wt_path.to_str().unwrap()).unwrap();
    assert_eq!(added.name, "test_branch");
    
    // List again
    let wts2 = list_worktrees(&repo_path).unwrap();
    assert_eq!(wts2.len(), 1);
    
    // Remove
    remove_worktree(&repo_path, "test_branch").unwrap();
    let wts3 = list_worktrees(&repo_path).unwrap();
    assert_eq!(wts3.len(), 0);
    
    if wt_path.exists() {
        let _ = fs::remove_dir_all(&wt_path);
    }
}

#[test]
fn test_milestone5_hooks() {
    let (repo_path, _dir) = create_temp_repo();
    
    // Create a dummy hook sample
    let hooks_dir = repo_path.join(".git").join("hooks");
    fs::create_dir_all(&hooks_dir).unwrap();
    fs::write(hooks_dir.join("pre-commit.sample"), "echo test").unwrap();
    
    let hooks = list_hooks(&repo_path).unwrap();
    let pre_commit = hooks.iter().find(|h| h.name == "pre-commit").unwrap();
    assert_eq!(pre_commit.is_enabled, false);
    
    // Toggle on
    toggle_hook(&repo_path, "pre-commit", true).unwrap();
    let hooks2 = list_hooks(&repo_path).unwrap();
    let pre_commit2 = hooks2.iter().find(|h| h.name == "pre-commit").unwrap();
    assert_eq!(pre_commit2.is_enabled, true);
    
    // Toggle off
    toggle_hook(&repo_path, "pre-commit", false).unwrap();
    let hooks3 = list_hooks(&repo_path).unwrap();
    let pre_commit3 = hooks3.iter().find(|h| h.name == "pre-commit").unwrap();
    assert_eq!(pre_commit3.is_enabled, false);
}

#[test]
fn test_milestone5_submodules() {
    let (repo_path, _dir) = create_temp_repo();
    let subs = list_submodules(&repo_path).unwrap();
    assert_eq!(subs.len(), 0);
}

#[tokio::test]
async fn test_milestone5_maintenance() {
    let (repo_path, _dir) = create_temp_repo();
    
    let res = run_git_pack_refs(&repo_path).await;
    assert!(res.is_ok(), "pack-refs failed: {:?}", res);
    
    let res = run_git_prune(&repo_path).await;
    assert!(res.is_ok(), "prune failed: {:?}", res);
    
    let res = run_git_repack(&repo_path).await;
    assert!(res.is_ok(), "repack failed: {:?}", res);
    
    let res = run_git_fsck(&repo_path).await;
    assert!(res.is_ok(), "fsck failed: {:?}", res);
    
    let res = run_git_commit_graph(&repo_path).await;
    assert!(res.is_ok(), "commit-graph failed: {:?}", res);
}

#[test]
fn test_milestone5_internals() {
    let (repo_path, _dir) = create_temp_repo();
    
    let repo = Repository::open(&repo_path).unwrap();
    let head = repo.head().unwrap();
    let head_commit = head.peel_to_commit().unwrap();
    let head_oid = head_commit.id().to_string();
    let tree_oid = head_commit.tree_id().to_string();
    
    // search prefix
    let short_oid = &head_oid[0..6];
    let resolved = git_internals_search_prefix(&repo_path, short_oid).unwrap();
    assert_eq!(resolved, head_oid);
    
    // get object
    let obj = git_internals_get_object(&repo_path, &head_oid).unwrap();
    assert_eq!(obj.kind, "Commit");
    
    // get tree
    let tree = git_internals_get_tree(&repo_path, &tree_oid).unwrap();
    // initial commit tree is likely empty in our test setup, but it shouldn't error
    assert!(tree.is_empty());
}

#[tokio::test]
async fn test_milestone5_plumbing() {
    let (repo_path, _dir) = create_temp_repo();
    
    let args = vec!["rev-parse".to_string(), "HEAD".to_string()];
    let output = git_plumbing_execute_safe(&repo_path, args).await.unwrap();
    assert!(!output.is_empty());
}
