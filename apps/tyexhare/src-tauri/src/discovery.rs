use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::net::UdpSocket;
use std::time::Duration;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Emitter, State};
use rand::Rng;

const DISCOVERY_PORT: u16 = 9020;
const BROADCAST_INTERVAL_SECS: u64 = 3;
const MAGIC_HEADER: &str = "TYEXHARE:v1";
const REPLY_HEADER: &str = "TYEXHARE_REPLY:v1";
const PAIR_HEADER: &str = "TYEXHARE_PAIR:v1";

#[derive(Clone)]
pub struct DiscoveryState {
    pub name: String,
    pub device_id: String,
}

impl Default for DiscoveryState {
    fn default() -> Self {
        let mut rng = rand::rng();
        let id: u32 = rng.random();
        Self {
            name: String::new(),
            device_id: format!("{:08x}", id),
        }
    }
}

pub struct DiscoveryStateWrapper(pub Arc<Mutex<DiscoveryState>>);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiscoveredDevice {
    pub name: String,
    pub os: String,
    pub device_id: String,
    pub code: String,
    pub ip: String,
    pub timestamp: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct IncomingPairRequest {
    pub sender_name: String,
    pub code: String,
    pub ip: String,
}

#[tauri::command]
pub async fn set_discovery_state(
    name: String,
    code: Option<String>,
    state: State<'_, DiscoveryStateWrapper>,
) -> Result<(), String> {
    let _ = code; // Retained for API compatibility
    let mut s = state.0.lock().await;
    s.name = name;
    Ok(())
}

#[tauri::command]
pub async fn send_pair_request(
    target_device_id: String,
    target_ip: String,
    code: String,
    state: State<'_, DiscoveryStateWrapper>,
) -> Result<(), String> {
    let current_state = state.0.lock().await;
    let sender_name = if current_state.name.is_empty() {
        "Anonymous Device".to_string()
    } else {
        current_state.name.clone()
    };

    let payload = format!("{}:{}:{}:{}", PAIR_HEADER, target_device_id, sender_name, code);
    let socket = UdpSocket::bind("0.0.0.0:0").await.map_err(|e| e.to_string())?;
    let _ = socket.set_broadcast(true);
    let _ = socket.send_to(payload.as_bytes(), ("255.255.255.255", DISCOVERY_PORT)).await;
    let _ = socket.send_to(payload.as_bytes(), (target_ip.as_str(), DISCOVERY_PORT)).await;

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
            if current_state.name.is_empty() {
                continue; // Don't broadcast if name is not set
            }

            let os_name = std::env::consts::OS;
            // Broadcast Device ID instead of secret transfer code
            let payload = format!("{}:{}:{}:{}", MAGIC_HEADER, current_state.name, os_name, current_state.device_id);
            
            let _ = socket.send_to(payload.as_bytes(), ("255.255.255.255", DISCOVERY_PORT)).await;
        }
    });

    // 2. Listener Task
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let socket = match (|| -> std::io::Result<tokio::net::UdpSocket> {
            let s2 = socket2::Socket::new(socket2::Domain::IPV4, socket2::Type::DGRAM, Some(socket2::Protocol::UDP))?;
            s2.set_reuse_address(true)?;
            let addr: std::net::SocketAddr = format!("0.0.0.0:{}", DISCOVERY_PORT).parse().unwrap();
            s2.bind(&addr.into())?;
            s2.set_nonblocking(true)?;
            let std_sock: std::net::UdpSocket = s2.into();
            tokio::net::UdpSocket::from_std(std_sock)
        })() {
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
                    if msg.starts_with(PAIR_HEADER) {
                        // Direct pairing request: TYEXHARE_PAIR:v1:<target_device_id>:<sender_name>:<code>
                        let parts: Vec<&str> = msg.splitn(5, ':').collect();
                        if parts.len() >= 5 {
                            let target_device_id = parts[2].to_string();
                            
                            let current_state = state.lock().await;
                            if target_device_id != current_state.device_id {
                                continue;
                            }

                            let sender_name = parts[3].to_string();
                            let code = parts[4].to_string();

                            let pair_req = IncomingPairRequest {
                                sender_name,
                                code,
                                ip: addr.ip().to_string(),
                            };
                            let _ = app_handle_clone.emit("incoming_pair_request", pair_req);
                        }
                    } else {
                        // Broadcast discovery packet: TYEXHARE:v1:<name>:<os>:<device_id>
                        let parts: Vec<&str> = msg.split(':').collect();
                        if parts.len() >= 5 && (parts[0] == "TYEXHARE" || parts[0] == "TYEXHARE_REPLY") && parts[1] == "v1" {
                            let name = parts[2].to_string();
                            let os = parts[3].to_string();
                            let device_id = parts[4..].join(":");

                            let current_state = state.lock().await.clone();
                            if name != current_state.name || device_id != current_state.device_id {
                                let timestamp = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_secs();

                                let device = DiscoveredDevice {
                                    name: name.clone(),
                                    os,
                                    device_id: device_id.clone(),
                                    code: "".to_string(), // Code is not exposed via broadcast
                                    ip: addr.ip().to_string(),
                                    timestamp,
                                };

                                let _ = app_handle_clone.emit("device_discovered", device);

                                // If this was a broadcast (not a reply), send a unicast reply back!
                                // This is the "Ping-Pong" strategy: Android can't receive broadcasts,
                                // but it CAN receive unicast UDP packets!
                                if parts[0] == "TYEXHARE" && !current_state.name.is_empty() {
                                    let my_os = std::env::consts::OS;
                                    let reply_payload = format!("{}:{}:{}:{}", REPLY_HEADER, current_state.name, my_os, current_state.device_id);
                                    let _ = socket.send_to(reply_payload.as_bytes(), addr).await;
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}
