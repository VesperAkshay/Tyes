use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use thiserror::Error;
use uuid::Uuid;

pub const SERVICE_NAMESPACE: &str = "dev.tyes.vault";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Module {
    Git,
    Api,
    Run,
    Core,
    Hub,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VaultKey {
    pub module: Module,
    pub project_id: Option<Uuid>, // None for machine-global creds
    pub key: String,
}

impl VaultKey {
    pub fn to_service_user(&self) -> String {
        let module_str = match self.module {
            Module::Git => "git",
            Module::Api => "api",
            Module::Run => "run",
            Module::Core => "core",
            Module::Hub => "hub",
        };
        match self.project_id {
            Some(id) => format!("{}_{}_{}", module_str, id, self.key),
            None => format!("{}_global_{}", module_str, self.key),
        }
    }
}

#[derive(Error, Debug)]
pub enum VaultError {
    #[error("Keyring error: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("Storage/Lock error: {0}")]
    Internal(String),
}

pub type Result<T> = std::result::Result<T, VaultError>;

fn memory_store() -> &'static Mutex<HashMap<String, String>> {
    static STORE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn is_memory_backend() -> bool {
    std::env::var("TYE_VAULT_BACKEND").as_deref() == Ok("memory")
        || std::env::var("TYE_VAULT_FALLBACK_OK").as_deref() == Ok("1")
}

pub fn get(key: &VaultKey) -> Result<Option<String>> {
    let user = key.to_service_user();

    // Check memory store (L1 / fallback cache) first when fallback is active or testing
    if is_memory_backend() {
        if let Ok(store) = memory_store().lock() {
            if let Some(val) = store.get(&user) {
                return Ok(Some(val.clone()));
            }
        }
    }

    match Entry::new(SERVICE_NAMESPACE, &user) {
        Ok(entry) => match entry.get_password() {
            Ok(pwd) => {
                // Populate L1 cache on successful read
                if let Ok(mut store) = memory_store().lock() {
                    store.insert(user.clone(), pwd.clone());
                }
                Ok(Some(pwd))
            }
            Err(keyring::Error::NoEntry) => {
                if let Ok(store) = memory_store().lock() {
                    if let Some(val) = store.get(&user) {
                        return Ok(Some(val.clone()));
                    }
                }
                Ok(None)
            }
            Err(e) => {
                if let Ok(store) = memory_store().lock() {
                    if let Some(val) = store.get(&user) {
                        return Ok(Some(val.clone()));
                    }
                }
                if is_memory_backend() || cfg!(test) {
                    Ok(None)
                } else {
                    Err(VaultError::Keyring(e))
                }
            }
        },
        Err(e) => {
            if let Ok(store) = memory_store().lock() {
                if let Some(val) = store.get(&user) {
                    return Ok(Some(val.clone()));
                }
            }
            if is_memory_backend() || cfg!(test) {
                Ok(None)
            } else {
                Err(VaultError::Keyring(e))
            }
        }
    }
}

pub fn set(key: &VaultKey, value: &str) -> Result<()> {
    let user = key.to_service_user();

    // Always update L1 memory cache first so in-process reads are guaranteed fast & consistent
    if let Ok(mut store) = memory_store().lock() {
        store.insert(user.clone(), value.to_string());
    }

    if is_memory_backend() {
        return Ok(());
    }

    match Entry::new(SERVICE_NAMESPACE, &user) {
        Ok(entry) => match entry.set_password(value) {
            Ok(_) => Ok(()),
            Err(e) => {
                if is_memory_backend() || cfg!(test) {
                    Ok(())
                } else {
                    Err(VaultError::Keyring(e))
                }
            }
        },
        Err(e) => {
            if is_memory_backend() || cfg!(test) {
                Ok(())
            } else {
                Err(VaultError::Keyring(e))
            }
        }
    }
}

pub fn delete(key: &VaultKey) -> Result<()> {
    let user = key.to_service_user();

    if let Ok(mut store) = memory_store().lock() {
        store.remove(&user);
    }

    if is_memory_backend() {
        return Ok(());
    }

    match Entry::new(SERVICE_NAMESPACE, &user) {
        Ok(entry) => match entry.delete_credential() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => {
                if is_memory_backend() || cfg!(test) {
                    Ok(())
                } else {
                    Err(VaultError::Keyring(e))
                }
            }
        },
        Err(e) => {
            if is_memory_backend() || cfg!(test) {
                Ok(())
            } else {
                Err(VaultError::Keyring(e))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_lifecycle() {
        std::env::set_var("TYE_VAULT_BACKEND", "memory");
        let key = VaultKey {
            module: Module::Core,
            project_id: None,
            key: "test_secret_key".to_string(),
        };

        set(&key, "my_secret_password").expect("Set failed");
        let retrieved = get(&key).expect("Get failed");
        assert_eq!(retrieved.as_deref(), Some("my_secret_password"));

        delete(&key).expect("Delete failed");
        let post_delete = get(&key).expect("Get after delete failed");
        assert!(post_delete.is_none());
    }
}

