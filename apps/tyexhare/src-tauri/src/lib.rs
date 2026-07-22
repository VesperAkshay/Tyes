use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex};
use tauri::{Emitter, State};
use tye_xhare_core::ui_event::{EventSender, UiEvent};
use tye_xhare_core::utils::{get_random_name, sha256};
use tye_xhare_core::models::{DEFAULT_RELAY, DEFAULT_PORT, DEFAULT_PASSPHRASE};

#[derive(Clone, serde::Serialize)]
#[serde(tag = "type", content = "data")]
pub enum TransferPayload {
    Log { message: String },
    Progress { filename: String, total: u64, current: u64 },
    Prompt { message: String },
    Done { message: String },
    Error { message: String },
    CodeGenerated { code: String },
    RelayStatus { running: bool, ports: String },
}

pub struct AppState {
    pub active_task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    pub relay_task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    pub prompt_tx: Arc<Mutex<Option<oneshot::Sender<bool>>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            active_task: Arc::new(Mutex::new(None)),
            relay_task: Arc::new(Mutex::new(None)),
            prompt_tx: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
async fn pick_files() -> Result<Vec<String>, String> {
    let files = rfd::AsyncFileDialog::new()
        .set_title("Select Files to Send")
        .pick_files()
        .await;

    if let Some(files) = files {
        Ok(files.into_iter().map(|f| f.path().to_string_lossy().to_string()).collect())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
async fn generate_qr_code(code: String) -> Result<String, String> {
    tye_xhare_core::qr_utils::generate_qr_svg(&code)
}

#[tauri::command]
async fn pick_folder() -> Result<Option<String>, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_title("Select Folder to Send or Receive")
        .pick_folder()
        .await;

    if let Some(folder) = folder {
        Ok(Some(folder.path().to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn respond_prompt(state: State<'_, AppState>, accepted: bool) -> Result<(), String> {
    let mut guard = state.prompt_tx.lock().await;
    if let Some(tx) = guard.take() {
        let _ = tx.send(accepted);
    }
    Ok(())
}

#[tauri::command]
async fn cancel_transfer(state: State<'_, AppState>) -> Result<(), String> {
    let mut task_guard = state.active_task.lock().await;
    if let Some(handle) = task_guard.take() {
        handle.abort();
    }
    let mut prompt_guard = state.prompt_tx.lock().await;
    if let Some(tx) = prompt_guard.take() {
        let _ = tx.send(false);
    }
    Ok(())
}

#[tauri::command]
async fn start_local_relay(
    _app_handle: tauri::AppHandle,
    _state: State<'_, AppState>,
    _ports: Option<String>,
    _pass: Option<String>,
) -> Result<String, String> {
    Err("Local relay is not bundled in this version of TyeXhare.".into())
}

#[tauri::command]
async fn stop_local_relay(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut guard = state.relay_task.lock().await;
    if let Some(handle) = guard.take() {
        handle.abort();
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    let _ = app_handle.emit("transfer-event", TransferPayload::RelayStatus { running: false, ports: "".to_string() });
    Ok(())
}

#[tauri::command]
async fn start_send(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    files: Vec<String>,
    text: Option<String>,
    custom_code: Option<String>,
    relay: Option<String>,
    pass: Option<String>,
) -> Result<String, String> {
    let relay_addr = relay.unwrap_or_else(|| format!("{}:{}", DEFAULT_RELAY, DEFAULT_PORT));
    let relay_pass = pass.unwrap_or_else(|| DEFAULT_PASSPHRASE.to_string());
    
    let shared_secret = custom_code.unwrap_or_else(get_random_name);
    let prefix = if shared_secret.len() >= 4 { &shared_secret[..4] } else { &shared_secret };
    let room_name = sha256(&format!("{}croc", prefix));

    let _ = app_handle.emit("transfer-event", TransferPayload::CodeGenerated { code: shared_secret.clone() });

    let (tx, mut rx) = mpsc::channel::<UiEvent>(100);
    let ui = EventSender::new(Some(tx));

    let prompt_state = state.prompt_tx.clone();
    let app = app_handle.clone();

    // Event forwarding task
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                UiEvent::Log(message) => {
                    let _ = app.emit("transfer-event", TransferPayload::Log { message });
                }
                UiEvent::Progress { filename, total, current } => {
                    let _ = app.emit("transfer-event", TransferPayload::Progress { filename, total, current });
                }
                UiEvent::Prompt { msg, reply } => {
                    {
                        let mut guard = prompt_state.lock().await;
                        *guard = Some(reply);
                    }
                    let _ = app.emit("transfer-event", TransferPayload::Prompt { message: msg });
                }
                UiEvent::Done(message) => {
                    let _ = app.emit("transfer-event", TransferPayload::Done { message });
                }
                UiEvent::Error(message) => {
                    let _ = app.emit("transfer-event", TransferPayload::Error { message });
                }
            }
        }
    });

    let send_secret = shared_secret.clone();
    let send_room = room_name.clone();
    let send_app = app_handle.clone();

    let task_handle = tokio::spawn(async move {
        if let Err(e) = tye_xhare_core::sender::send(
            files,
            text,
            &relay_addr,
            &relay_pass,
            &send_room,
            &send_secret,
            ui,
        ).await {
            let _ = send_app.emit("transfer-event", TransferPayload::Error { message: e });
        }
    });

    let mut guard = state.active_task.lock().await;
    *guard = Some(task_handle);

    Ok(shared_secret)
}

#[tauri::command]
async fn start_receive(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    code: String,
    relay: Option<String>,
    pass: Option<String>,
    out_dir: Option<String>,
    resume: Option<bool>,
    auto_accept: Option<bool>,
) -> Result<(), String> {
    let relay_addr = relay.unwrap_or_else(|| format!("{}:{}", DEFAULT_RELAY, DEFAULT_PORT));
    let relay_pass = pass.unwrap_or_else(|| DEFAULT_PASSPHRASE.to_string());
    
    let shared_secret = code.trim().to_string();
    if shared_secret.is_empty() {
        return Err("Secret code cannot be empty".to_string());
    }

    let prefix = if shared_secret.len() >= 4 { &shared_secret[..4] } else { &shared_secret };
    let room_name = sha256(&format!("{}croc", prefix));

    let (tx, mut rx) = mpsc::channel::<UiEvent>(100);
    let mut ui = EventSender::new(Some(tx));
    if auto_accept.unwrap_or(false) {
        ui.auto_accept = true;
    }

    let prompt_state = state.prompt_tx.clone();
    let app = app_handle.clone();

    // Event forwarding task
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                UiEvent::Log(message) => {
                    let _ = app.emit("transfer-event", TransferPayload::Log { message });
                }
                UiEvent::Progress { filename, total, current } => {
                    let _ = app.emit("transfer-event", TransferPayload::Progress { filename, total, current });
                }
                UiEvent::Prompt { msg, reply } => {
                    {
                        let mut guard = prompt_state.lock().await;
                        *guard = Some(reply);
                    }
                    let _ = app.emit("transfer-event", TransferPayload::Prompt { message: msg });
                }
                UiEvent::Done(message) => {
                    let _ = app.emit("transfer-event", TransferPayload::Done { message });
                }
                UiEvent::Error(message) => {
                    let _ = app.emit("transfer-event", TransferPayload::Error { message });
                }
            }
        }
    });

    let recv_secret = shared_secret.clone();
    let recv_room = room_name.clone();
    let recv_app = app_handle.clone();
    let is_resume = resume.unwrap_or(true);

    let task_handle = tokio::spawn(async move {
        if let Err(e) = tye_xhare_core::receiver::receive(
            &relay_addr,
            &relay_pass,
            &recv_room,
            &recv_secret,
            out_dir.as_deref(),
            is_resume,
            false,
            ui,
        ).await {
            let _ = recv_app.emit("transfer-event", TransferPayload::Error { message: e });
        }
    });

    let mut guard = state.active_task.lock().await;
    *guard = Some(task_handle);

    Ok(())
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
    }
    Ok(())
}

#[tauri::command]
async fn open_download_folder(path: Option<String>) -> Result<(), String> {
    let target_dir = if let Some(p) = path {
        if !p.is_empty() {
            std::path::PathBuf::from(p)
        } else {
            dirs::download_dir().unwrap_or_default().join("TyeXhare")
        }
    } else {
        dirs::download_dir().unwrap_or_default().join("TyeXhare")
    };

    let _ = std::fs::create_dir_all(&target_dir);

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&target_dir).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&target_dir).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&target_dir).spawn();
    }
    Ok(())
}

pub mod discovery;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let discovery_state = std::sync::Arc::new(tokio::sync::Mutex::new(discovery::DiscoveryState::default()));
    let discovery_state_wrapper = discovery::DiscoveryStateWrapper(discovery_state.clone());

    tauri::Builder::default()
        .manage(AppState::default())
        .manage(discovery_state_wrapper)
        .invoke_handler(tauri::generate_handler![
            start_send,
            start_receive,
            cancel_transfer,
            respond_prompt,
            start_local_relay,
            stop_local_relay,
            pick_files,
            pick_folder,
            generate_qr_code,
            open_url,
            open_download_folder,
            discovery::set_discovery_state
        ])
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            discovery::start_discovery_service(app.handle().clone(), discovery_state.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
