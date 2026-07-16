pub mod error;
pub mod schema;
pub mod installation;
pub mod config;
pub mod ssh;
pub mod repository;
pub mod discovery;
pub mod dashboard;
pub mod groups;

pub use error::GitEngineError;
pub use installation::{GitInstallation, detect_git, set_custom_git_path, parse_git_version, check_min_version};
pub use config::{GitConfigLevel, GitConfigEntry, read_system_config, read_global_config, set_global_config, read_local_config, set_local_config, set_remote_url, set_branch_upstream, backup_global_config};
pub use ssh::{SshKey, SshConfigHost, list_ssh_keys, read_ssh_config, generate_ed25519_key, compute_fingerprint};
pub use repository::{RepositoryHandle, CloneOptions, RepoHealth, open_repository, init_repository, clone_repository, check_repository_health};
pub use discovery::scan_directories;
pub use dashboard::{RepoCard, get_dashboard_cards, pin_repository};
pub use groups::{RepoGroup, create_group, add_to_group, remove_from_group, get_groups, bulk_fetch_group};
