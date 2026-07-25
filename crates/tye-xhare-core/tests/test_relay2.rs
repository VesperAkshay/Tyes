
use tye_xhare_core::relay_client::connect_to_relay;
use tye_xhare_core::models::{DEFAULT_RELAY, DEFAULT_PORT, DEFAULT_PASSPHRASE};

#[tokio::test]
async fn test_it() {
    let addr = format!("{}:{}", DEFAULT_RELAY, DEFAULT_PORT);
    println!("Connecting to {}...", addr);
    match connect_to_relay(&addr, DEFAULT_PASSPHRASE, "test_room", None).await {
        Ok(_) => println!("Connection successful!"),
        Err(e) => println!("Connection failed: {:?}", e),
    }
}

