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
async fn test_git_repo_groups_workspaces() {
    println!("\n=== [Matrix Test] git::groups (Workspaces) ===");
    let temp = TempDir::new().expect("Failed to create tempdir");
    let pool = setup_db(&temp).await;
    let project_id = "test_project";

    // 1. Create repositories
    let repo1_path = temp.path().join("repo1");
    let repo1 = init_repository(&pool, project_id, &repo1_path, false, None, None).await.expect("init repo1 failed");

    let repo2_path = temp.path().join("repo2");
    let repo2 = init_repository(&pool, project_id, &repo2_path, false, None, None).await.expect("init repo2 failed");

    // 2. Create Workspace (Group)
    let group = create_group(&pool, "Work").await.expect("create group failed");
    assert_eq!(group.name, "Work");
    assert!(group.repos.is_empty());

    // 3. Add Repo 1 to Workspace
    add_to_group(&pool, &group.id, &repo1.id).await.expect("add to group failed");

    // 4. Fetch groups and verify
    let groups = get_groups(&pool, project_id).await.expect("get groups failed");
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].repos.len(), 1);
    assert_eq!(groups[0].repos[0].id, repo1.id);
    assert_eq!(groups[0].repos[0].name, repo1.name);

    // 5. Add Repo 2 and verify
    add_to_group(&pool, &group.id, &repo2.id).await.expect("add repo 2 failed");
    let groups_after = get_groups(&pool, project_id).await.expect("get groups after failed");
    assert_eq!(groups_after[0].repos.len(), 2);

    // 6. Remove Repo 1 and verify
    remove_from_group(&pool, &group.id, &repo1.id).await.expect("remove repo 1 failed");
    let groups_final = get_groups(&pool, project_id).await.expect("get groups final failed");
    assert_eq!(groups_final[0].repos.len(), 1);
    assert_eq!(groups_final[0].repos[0].id, repo2.id);
}
