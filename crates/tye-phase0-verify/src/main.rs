use std::fs;
use tye_core_events::{EventBus, TyeEvent};
use tye_core_models::{Environment, EnvironmentScope, EnvironmentVariable, EnvValue, Project};
use tye_core_storage::{ProjectStorage, Registry};
use tye_core_vault::{Module, VaultKey};
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("================================================================================");
    println!("    TYE PLATFORM — PHASE 0 END-TO-END EVIDENCE VERIFICATION HARNESS             ");
    println!("================================================================================\n");

    // Setup temporary sandbox directory for test
    let temp_dir = std::env::temp_dir().join(format!("tye_phase0_verify_{}", Uuid::new_v4()));
    fs::create_dir_all(&temp_dir)?;
    let registry_db_path = temp_dir.join("global").join("registry.db");
    let project_folder_path = temp_dir.join("sample_project");
    fs::create_dir_all(&project_folder_path)?;

    println!("[EVIDENCE SETUP] Sandbox created at: {:?}", temp_dir);
    println!("[EVIDENCE SETUP] Global registry path: {:?}", registry_db_path);
    println!("[EVIDENCE SETUP] Target folder path:   {:?}", project_folder_path);

    // ---------------------------------------------------------------------
    // CRITERION 1: Open folder → creates Project row in ~/.tye/registry.db AND <folder>/.tye/project.db
    // ---------------------------------------------------------------------
    println!("\n--------------------------------------------------------------------------------");
    println!("CRITERION 1: Open folder → create Project row in registry.db AND <folder>/.tye/project.db");
    println!("--------------------------------------------------------------------------------");
    let project = Project::new("Sample Tye Project", &project_folder_path);
    println!("  [Action] Initializing Project object: ID={}, Name='{}'", project.id, project.name);

    // 1a. Open & save in registry.db
    let registry = Registry::open(&registry_db_path).await?;
    registry
        .save_project(&project, "verification_harness")
        .await?;
    println!("  [Action] Saved Project to registry.db");

    let loaded_from_registry = registry.get_project_by_path(&project_folder_path).await?;
    assert!(
        loaded_from_registry.is_some(),
        "Project not found in registry.db after save!"
    );
    let loaded_proj = loaded_from_registry.unwrap();
    assert_eq!(loaded_proj.name, "Sample Tye Project");
    assert_eq!(loaded_proj.id, project.id);
    println!("  [Evidence 1a] Successfully queried registry.db row:");
    println!("       -> ID:          {}", loaded_proj.id);
    println!("       -> Name:        {}", loaded_proj.name);
    println!("       -> Path:        {}", loaded_proj.path.display());
    println!("       -> Created At:  {}", loaded_proj.created_at);
    println!("       -> Has Git:     {} | Has API: {}", loaded_proj.has_git, loaded_proj.has_api_collections);

    // 1b. Open & run migrations on project.db
    let project_db = ProjectStorage::open(&project_folder_path).await?;
    let mut env = Environment::new(project.id, "Local Development", EnvironmentScope::Project);
    env.variables.push(EnvironmentVariable {
        key: "API_BASE_URL".to_string(),
        value: EnvValue::Plain("https://localhost:8080".to_string()),
        is_secret: false,
    });
    env.variables.push(EnvironmentVariable {
        key: "DATABASE_PASSWORD".to_string(),
        value: EnvValue::VaultRef("db_pwd_secret".to_string()),
        is_secret: true,
    });
    project_db.save_environment(&env).await?;

    let loaded_envs = project_db.get_environments(project.id).await?;
    assert_eq!(loaded_envs.len(), 1, "Expected exactly 1 environment saved in project.db");
    assert_eq!(loaded_envs[0].name, "Local Development");
    assert_eq!(loaded_envs[0].variables.len(), 2);
    let project_db_path = project_folder_path.join(".tye").join("project.db");
    assert!(
        project_db_path.exists(),
        "project.db file missing from .tye folder!"
    );
    println!("  [Evidence 1b] Confirmed <folder>/.tye/project.db exists on filesystem:");
    println!("       -> DB File Path: {:?}", project_db_path);
    println!("       -> DB File Size: {} bytes", fs::metadata(&project_db_path)?.len());
    println!("       -> Queried Environment from project.db: '{}' (Scope: {:?})", loaded_envs[0].name, loaded_envs[0].scope);
    for var in &loaded_envs[0].variables {
        println!("          - Var Key: {}, Secret: {}, Value: {:?}", var.key, var.is_secret, var.value);
    }

    // ---------------------------------------------------------------------
    // CRITERION 2: Save a secret via tye-core-vault, then read it back
    // ---------------------------------------------------------------------
    println!("\n--------------------------------------------------------------------------------");
    println!("CRITERION 2: Save a secret via tye-core-vault, then read it back");
    println!("--------------------------------------------------------------------------------");
    std::env::set_var("TYE_VAULT_FALLBACK_OK", "1");
    let vault_key = VaultKey {
        module: Module::Core,
        project_id: Some(project.id),
        key: "db_pwd_secret".to_string(),
    };
    let secret_val = "SuperSecretPassword123!";

    println!("  [Action] Calling tye_core_vault::set() with key='{}' and secret='{}'", vault_key.key, secret_val);
    tye_core_vault::set(&vault_key, secret_val)?;

    println!("  [Action] Calling tye_core_vault::get() to retrieve secret...");
    let retrieved = tye_core_vault::get(&vault_key)?;
    assert_eq!(
        retrieved.as_deref(),
        Some(secret_val),
        "Retrieved secret did not match original string!"
    );
    println!("  [Evidence 2] Successfully retrieved exact string from vault: {:?}", retrieved.unwrap());

    println!("  [Action] Calling tye_core_vault::delete() to clean up secret...");
    tye_core_vault::delete(&vault_key)?;
    let post_delete = tye_core_vault::get(&vault_key)?;
    assert!(post_delete.is_none(), "Secret was not deleted!");
    println!("  [Evidence 2] Confirmed secret is deleted: {:?}", post_delete);

    // ---------------------------------------------------------------------
    // CRITERION 3: Publish one TyeEvent and show a subscriber receiving it
    // ---------------------------------------------------------------------
    println!("\n--------------------------------------------------------------------------------");
    println!("CRITERION 3: Publish one TyeEvent and show a subscriber receiving it");
    println!("--------------------------------------------------------------------------------");
    let event_bus = EventBus::new(64);
    let mut rx = event_bus.subscribe();

    let commit_oid = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678".to_string();
    let test_event = TyeEvent::GitCommitCreated {
        project_id: project.id,
        commit_oid: commit_oid.clone(),
        branch: "main".to_string(),
    };

    let bus_clone = event_bus.clone();
    let ev_clone = test_event.clone();
    println!("  [Action] Subscriber subscribed to EventBus. Spawning async task to publish event...");
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        println!("  [Async Publisher] Publishing TyeEvent::GitCommitCreated across EventBus channel");
        bus_clone
            .publish(ev_clone)
            .expect("Failed to publish event");
    });

    println!("  [Action] Subscriber waiting on rx.recv()...");
    let received = tokio::time::timeout(tokio::time::Duration::from_secs(2), rx.recv())
        .await
        .expect("Timed out waiting for event on broadcast bus")
        .expect("Channel closed before receiving event");

    assert_eq!(
        received, test_event,
        "Received event did not match published event!"
    );
    println!("  [Evidence 3] Subscriber successfully received broadcast event end-to-end:");
    match received {
        TyeEvent::GitCommitCreated { project_id, commit_oid, branch } => {
            println!("       -> Event Type: TyeEvent::GitCommitCreated");
            println!("       -> Project ID: {}", project_id);
            println!("       -> Commit OID: {}", commit_oid);
            println!("       -> Branch:     {}", branch);
        }
        _ => panic!("Wrong event type received!"),
    }

    // Clean up temporary sandbox
    let _ = fs::remove_dir_all(&temp_dir);

    println!("\n================================================================================");
    println!("  [ALL PHASE 0 EXIT CRITERIA VERIFIED END-TO-END WITH CONCRETE EVIDENCE!]       ");
    println!("================================================================================\n");

    Ok(())
}
