pub mod project;
pub mod environment;

pub use project::*;
pub use environment::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_project_new() {
        let p = Project::new("Test Project", "/tmp/test");
        assert_eq!(p.name, "Test Project");
        assert_eq!(p.path.to_string_lossy(), "/tmp/test");
        assert!(p.git.is_none());
    }

    #[test]
    fn test_environment_new() {
        let env = Environment::new(uuid::Uuid::new_v4(), "Dev", EnvironmentScope::Project);
        assert_eq!(env.name, "Dev");
        assert_eq!(env.scope, EnvironmentScope::Project);
    }
}

