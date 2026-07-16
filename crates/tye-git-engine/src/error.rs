use thiserror::Error;

#[derive(Error, Debug)]
pub enum GitEngineError {
    #[error("Git executable not found in PATH or custom path: {0}")]
    GitNotFound(String),

    #[error("Git version {0} is lower than minimum required version 2.20.0")]
    VersionTooLow(String),

    #[error("Failed to parse git version string: {0}")]
    VersionParseError(String),

    #[error("Git config error ({level}): {message}")]
    ConfigError { level: String, message: String },

    #[error("Repository error at {path}: {message}")]
    RepositoryError { path: String, message: String },

    #[error("Not a valid Git repository: {0}")]
    NotAGitRepo(String),

    #[error("SSH error: {0}")]
    SshError(String),

    #[error("Group not found: {0}")]
    GroupNotFound(String),

    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),

    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("git2 libgit2 error: {0}")]
    Git2Error(#[from] git2::Error),

    #[error("Vault error: {0}")]
    VaultError(#[from] tye_core_vault::VaultError),

    #[error("Working tree is dirty: {0}")]
    DirtyWorktree(String),

    #[error("Branch operation error: {0}")]
    BranchError(String),

    #[error("Remote operation error: {0}")]
    RemoteError(String),

    #[error("Sync operation error: {0}")]
    SyncError(String),
}
