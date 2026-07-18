use tye_core_vault::{Module, VaultKey, set, get, delete};

#[test]
fn test_os_vault_storage_for_hosting_accounts() {
    let test_account_id = "test-account-123456";
    let token_value = "gho_superSecretOAuthTokenFromGithub999";

    let key = VaultKey {
        module: Module::Git,
        project_id: None,
        key: format!("hosting_token_{}", test_account_id),
    };

    println!("Testing OS Keyring Storage for account ID: {}", test_account_id);

    // 1. Save the token into the actual OS Credential Manager (Vault)
    set(&key, token_value).expect("Failed to save token to the OS Ring");
    println!("✅ Successfully saved token to OS Ring");

    // 2. Retrieve the token from the OS Ring to verify it persists securely
    let retrieved = get(&key).expect("Failed to retrieve token from the OS Ring");
    assert_eq!(
        retrieved,
        Some(token_value.to_string()),
        "The token retrieved from the OS Ring did not match what we saved!"
    );
    println!("✅ Successfully verified token matches exactly: {}", retrieved.unwrap());

    // 3. Delete the token from the OS Ring to clean up after the test
    delete(&key).expect("Failed to delete token from OS Ring");
    let after_delete = get(&key).expect("Failed to query OS Ring after deletion");
    assert_eq!(after_delete, None, "Token should be completely deleted from OS Ring");
    println!("✅ Successfully deleted test token from OS Ring");
}
