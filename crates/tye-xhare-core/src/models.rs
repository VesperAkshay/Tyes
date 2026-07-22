use std::time::Duration;
use tokio::net::lookup_host;
use serde::{Serialize, Deserialize};
use std::time::SystemTime;

// Max packet size
pub const TCP_BUFFER_SIZE: usize = 1024 * 64;

pub const DEFAULT_RELAY: &str = "tyexhare.tyes.dev";
pub const DEFAULT_RELAY6: &str = "tyexhare.tyes.dev";
pub const DEFAULT_PORT: &str = "9009";
pub const DEFAULT_PASSPHRASE: &str = "pass123";
pub const INTERNAL_DNS: bool = false;

// FileInfo registers the information about the file
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct FileInfo {
    #[serde(rename = "n", skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(rename = "fr", skip_serializing_if = "Option::is_none")]
    pub folder_remote: Option<String>,
    #[serde(rename = "fs", skip_serializing_if = "Option::is_none")]
    pub folder_source: Option<String>,
    #[serde(rename = "h", skip_serializing_if = "Option::is_none")]
    pub hash: Option<Vec<u8>>,
    #[serde(rename = "s", skip_serializing_if = "Option::is_none")]
    pub size: Option<i64>,
    #[serde(rename = "m", skip_serializing_if = "Option::is_none")]
    pub mod_time: Option<SystemTime>,
    #[serde(rename = "c", skip_serializing_if = "Option::is_none")]
    pub is_compressed: Option<bool>,
    #[serde(rename = "e", skip_serializing_if = "Option::is_none")]
    pub is_encrypted: Option<bool>,
    #[serde(rename = "sy", skip_serializing_if = "Option::is_none")]
    pub symlink: Option<String>,
    #[serde(rename = "md", skip_serializing_if = "Option::is_none")]
    pub mode: Option<u32>,
    #[serde(rename = "tf", skip_serializing_if = "Option::is_none")]
    pub temp_file: Option<bool>,
    #[serde(rename = "ig", skip_serializing_if = "Option::is_none")]
    pub is_ignored: Option<bool>,
}

// SenderInfo lists the files to be transferred
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SenderInfo {
    #[serde(rename = "FilesToTransfer")]
    pub files_to_transfer: Vec<FileInfo>,
    #[serde(rename = "EmptyFoldersToTransfer")]
    pub empty_folders_to_transfer: Vec<FileInfo>,
    #[serde(rename = "TotalNumberFolders")]
    pub total_number_folders: i32,
    #[serde(rename = "MachineID")]
    pub machine_id: String,
    #[serde(rename = "Ask")]
    pub ask: bool,
    #[serde(rename = "SendingText")]
    pub sending_text: bool,
    #[serde(rename = "NoCompress")]
    pub no_compress: bool,
    #[serde(rename = "HashAlgorithm")]
    pub hash_algorithm: String,
    #[serde(rename = "ReconnectVersion")]
    pub reconnect_version: i32,
    #[serde(rename = "NextReconnectRoom")]
    pub next_reconnect_room: String,
}

// RemoteFileRequest requests specific bytes
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RemoteFileRequest {
    #[serde(rename = "CurrentFileChunkRanges")]
    pub current_file_chunk_ranges: Vec<i64>,
    #[serde(rename = "FilesToTransferCurrentNum")]
    pub files_to_transfer_current_num: i32,
    #[serde(rename = "MachineID")]
    pub machine_id: String,
    #[serde(rename = "ReconnectVersion")]
    pub reconnect_version: i32,
}

// ... existing code ...
// publicDNS are servers to be queried if a local lookup fails
pub const PUBLIC_DNS: &[&str] = &[
    "1.0.0.1",                // Cloudflare
    "1.1.1.1",                // Cloudflare
    "[2606:4700:4700::1111]", // Cloudflare
    "[2606:4700:4700::1001]", // Cloudflare
    "8.8.4.4",                // Google
    "8.8.8.8",                // Google
    "[2001:4860:4860::8844]", // Google
    "[2001:4860:4860::8888]", // Google
    "9.9.9.9",                // Quad9
    "149.112.112.112",        // Quad9
    "[2620:fe::fe]",          // Quad9
    "[2620:fe::fe:9]",        // Quad9
    "8.26.56.26",             // Comodo
    "8.20.247.20",            // Comodo
    "208.67.220.220",         // Cisco OpenDNS
    "208.67.222.222",         // Cisco OpenDNS
    "[2620:119:35::35]",      // Cisco OpenDNS
    "[2620:119:53::53]",      // Cisco OpenDNS
];

/// Resolves a hostname to an IP address using the system's local DNS configuration.
/// Similar to the Go `localLookupIP` function.
pub async fn local_lookup_ip(address: &str) -> Result<String, String> {
    // Add a dummy port because `tokio::net::lookup_host` requires host:port format
    let addr_with_port = format!("{}:0", address);
    
    // Create a 500ms timeout matching the Go implementation
    let lookup_future = lookup_host(addr_with_port);
    let result = tokio::time::timeout(Duration::from_millis(500), lookup_future).await;

    match result {
        Ok(Ok(mut addrs)) => {
            if let Some(addr) = addrs.next() {
                Ok(addr.ip().to_string())
            } else {
                Err("No IP found".to_string())
            }
        }
        Ok(Err(e)) => Err(format!("Lookup failed: {}", e)),
        Err(_) => Err("Timeout during lookup".to_string()),
    }
}

/// Fallback wrapper for lookup. For now, we rely primarily on `local_lookup_ip`.
/// In a complete production build mimicking Go's fallback, this would use a crate
/// like `hickory-resolver` to query `PUBLIC_DNS`.
pub async fn lookup(address: &str) -> Result<String, String> {
    local_lookup_ip(address).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::IpAddr;

    #[test]
    fn test_constants() {
        assert_eq!(TCP_BUFFER_SIZE, 1024 * 64, "TCP_BUFFER_SIZE mismatch");
        assert_eq!(DEFAULT_PORT, "9009", "DEFAULT_PORT mismatch");
        assert_eq!(DEFAULT_PASSPHRASE, "pass123", "DEFAULT_PASSPHRASE mismatch");
    }

    #[test]
    fn test_public_dns_servers() {
        assert!(!PUBLIC_DNS.is_empty(), "PUBLIC_DNS list should not be empty");

        let mut has_ipv4 = false;
        let mut has_ipv6 = false;

        for dns in PUBLIC_DNS {
            if dns.contains('[') {
                has_ipv6 = true;
            } else {
                has_ipv4 = true;
            }
        }

        assert!(has_ipv4, "PUBLIC_DNS should contain IPv4 servers");
        assert!(has_ipv6, "PUBLIC_DNS should contain IPv6 servers");

        // Verify known DNS servers are present
        let expected_servers = ["1.1.1.1", "8.8.8.8", "9.9.9.9", "208.67.220.220"];

        for expected in expected_servers {
            assert!(
                PUBLIC_DNS.contains(&expected),
                "Expected DNS server {} not found in PUBLIC_DNS",
                expected
            );
        }
    }

    #[tokio::test]
    async fn test_local_lookup_ip() {
        // Test localhost
        let result = local_lookup_ip("localhost").await;
        assert!(result.is_ok(), "localhost lookup failed");
        
        let ip = result.unwrap();
        assert!(
            ip.parse::<IpAddr>().is_ok(),
            "local_lookup_ip returned invalid IP format: {}",
            ip
        );

        // Test an invalid hostname that should fail
        let result = local_lookup_ip("this-hostname-should-not-exist-12345").await;
        assert!(result.is_err(), "lookup should fail for invalid hostname");
    }

    #[tokio::test]
    async fn test_lookup_function() {
        // Test localhost
        let result = lookup("localhost").await;
        assert!(result.is_ok(), "localhost lookup failed");
        
        let ip = result.unwrap();
        assert!(
            ip.parse::<IpAddr>().is_ok(),
            "lookup returned invalid IP format: {}",
            ip
        );

        // Test invalid hostname
        let result = lookup("this-hostname-should-definitely-not-exist-98765").await;
        assert!(result.is_err(), "lookup should fail for invalid hostname");
    }
}
