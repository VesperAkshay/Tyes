use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::net::UdpSocket;
use std::time::Duration;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Emitter, State};

const DISCOVERY_PORT: u16 = 9020;
const BROADCAST_INTERVAL_SECS: u64 = 3;
const MAGIC_HEADER: &str = "TYEXHARE:v1";

#[derive(Default, Clone)]
pub struct DiscoveryState {
    pub name: String,
    pub code: String,
}

pub struct DiscoveryStateWrapper(pub Arc<Mutex<DiscoveryState>>);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiscoveredDevice {
    pub name: String,
    pub os: String,
    pub code: String,
    pub ip: String,
    pub timestamp: u64,
}

#[tauri::command]
pub async fn set_discovery_state(
    name: String,
    code: String,
    state: State<'_, DiscoveryStateWrapper>,
) -> Result<(), String> {
    let mut s = state.0.lock().await;
    s.name = name;
    s.code = code;
    Ok(())
}

pub fn start_discovery_service(app_handle: AppHandle, state: Arc<Mutex<DiscoveryState>>) {
    // 1. Broadcaster Task
    let state_clone = state.clone();
    tauri::async_runtime::spawn(async move {
        let socket = match UdpSocket::bind("0.0.0.0:0").await {
            Ok(s) => s,
            Err(_) => return,
        };
        let _ = socket.set_broadcast(true);

        loop {
            tokio::time::sleep(Duration::from_secs(BROADCAST_INTERVAL_SECS)).await;
            
            let current_state = state_clone.lock().await.clone();
            if current_state.name.is_empty() || current_state.code.is_empty() {
                continue; // Don't broadcast if not fully initialized
            }

            let os_name = std::env::consts::OS;
            let payload = format!("{}:{}:{}:{}", MAGIC_HEADER, current_state.name, os_name, current_state.code);
            
            // Broadcast to 255.255.255.255
            let _ = socket.send_to(payload.as_bytes(), ("255.255.255.255", DISCOVERY_PORT)).await;
        }
    });

    // 2. Listener Task
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        // We bind to 0.0.0.0:DISCOVERY_PORT.
        let socket = match UdpSocket::bind(format!("0.0.0.0:{}", DISCOVERY_PORT)).await {
            Ok(s) => s,
            Err(e) => {
                log::error!("Failed to bind discovery socket: {}", e);
                return;
            }
        };

        let mut buf = [0u8; 1024];

        loop {
            if let Ok((len, addr)) = socket.recv_from(&mut buf).await {
                if let Ok(msg) = std::str::from_utf8(&buf[..len]) {
                    let parts: Vec<&str> = msg.split(':').collect();
                    if parts.len() >= 5 && parts[0] == "TYEXHARE" && parts[1] == "v1" {
                        let name = parts[2].to_string();
                        let os = parts[3].to_string();
                        let code = parts[4..].join(":"); // In case code has colons

                        // Ignore our own broadcasts
                        let current_state = state.lock().await;
                        if name != current_state.name || code != current_state.code {
                            let timestamp = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs();

                            let device = DiscoveredDevice {
                                name,
                                os,
                                code,
                                ip: addr.ip().to_string(),
                                timestamp,
                            };

                            let _ = app_handle_clone.emit("device_discovered", device);
                        }
                    }
                }
            }
        }
    });
}
