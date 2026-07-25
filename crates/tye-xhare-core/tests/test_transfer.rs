
use tye_xhare_core::models::{DEFAULT_RELAY, DEFAULT_PORT, DEFAULT_PASSPHRASE};
use std::time::Duration;

#[tokio::main]
async fn main() {
    let code = "1234-test";
    
    // Spawn Sender
    tokio::spawn(async move {
        println!("Sender: Starting...");
        let files = vec!["Cargo.toml".to_string()];
        match tye_xhare_core::sender::start_send(&files, None, code.to_string(), None, None).await {
            Ok(_) => println!("Sender: Complete!"),
            Err(e) => println!("Sender: Error: {}", e),
        }
    });

    // Wait a sec for sender to create the room
    tokio::time::sleep(Duration::from_millis(1500)).await;

    // Spawn Receiver
    println!("Receiver: Starting...");
    let dest = std::env::temp_dir().to_str().unwrap().to_string();
    match tye_xhare_core::receiver::start_receive(code.to_string(), None, None, Some(dest), None).await {
        Ok(_) => println!("Receiver: Complete!"),
        Err(e) => println!("Receiver: Error: {}", e),
    }
}

