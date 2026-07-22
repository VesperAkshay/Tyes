use crate::relay_client::connect_to_relay;
use crate::message::{self, Message, MessageType};
use crate::models::{SenderInfo, FileInfo, TCP_BUFFER_SIZE, RemoteFileRequest};
use crate::pake;
use crate::crypt;
use crate::compress;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use rand::RngCore;

pub async fn send(
    files: Vec<String>,
    text: Option<String>,
    relay_address: &str,
    relay_password: &str,
    room_name: &str,
    shared_secret: &str,
    ui: crate::ui_event::EventSender,
) -> Result<(), String> {
    ui.log(format!("Code is: {}", shared_secret));
    ui.log(format!("On the other computer run:\n    tye-xhare {}", shared_secret));
    
    // Generate and print QR code
    if let Ok(qr) = qrcodegen::QrCode::encode_text(shared_secret, qrcodegen::QrCodeEcc::Low) {
        let mut qr_str = String::new();
        let border: i32 = 2;
        let size = qr.size();
        for y in -border..size + border {
            for x in -border..size + border {
                let color = if qr.get_module(x, y) { "██" } else { "  " };
                qr_str.push_str(color);
            }
            qr_str.push('\n');
        }
        ui.log(format!("Or scan this QR code:\n{}", qr_str));
    }
    
    // Setup UDP Multicast Discovery Listener
    let discovery_room = room_name.to_string();
    let local_listener = tokio::net::TcpListener::bind("0.0.0.0:0").await.ok();
    let local_port = local_listener.as_ref().map(|l| l.local_addr().unwrap().port());
    
    let (local_conn_tx, mut local_conn_rx) = tokio::sync::mpsc::channel(1);
    
    if let Some(listener) = local_listener {
        let port = local_port.unwrap();
        tokio::spawn(async move {
            use tokio::net::UdpSocket;
            if let Ok(udp) = UdpSocket::bind("0.0.0.0:9009").await {
                let mut buf = [0u8; 1024];
                let discovery_msg = format!("tye-xhare-rs-discovery:{}", discovery_room);
                while let Ok((len, addr)) = udp.recv_from(&mut buf).await {
                    if let Ok(s) = std::str::from_utf8(&buf[..len]) {
                        if s == discovery_msg {
                            let reply = format!("tye-xhare-rs-reply:{}", port);
                            let _ = udp.send_to(reply.as_bytes(), addr).await;
                            
                            // Try accepting local LAN connection without permanently exiting on short timeout
                            if let Ok(Ok((stream, _))) = tokio::time::timeout(std::time::Duration::from_secs(10), listener.accept()).await {
                                let _ = local_conn_tx.send(crate::comm::Comm::new(stream)).await;
                                break;
                            }
                        }
                    }
                }
            }
        });
    }

    ui.log(format!("Waiting for receiver to enter code (Room active for 15 minutes)..."));

    // Try relay connection (optional — if relay is down we can still do LAN-only transfers)
    let relay_result = connect_to_relay(relay_address, relay_password, room_name, None).await;
    
    let room_waiting_future = async {
        if let Ok((relay_conn, _banner, _ipaddr)) = relay_result {
            // Relay available — race between LAN direct and relay forwarding.
            // We must send periodic keep-alive pings to prevent the idle TCP socket
            // from being killed by the OS or routers while waiting for the receiver.
            let mut c = relay_conn;
            let mut ping_interval = tokio::time::interval(std::time::Duration::from_secs(10));
            ping_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            ping_interval.tick().await; // consume the immediate first tick

            loop {
                tokio::select! {
                    // LAN peer connected directly
                    Some(local_conn) = local_conn_rx.recv() => {
                        ui.log(format!("Connected directly over Local LAN! Bypassing relay."));
                        return Ok(local_conn);
                    },
                    // Received a message from the relay (expect b"handshake" when receiver joins)
                    result = c.receive() => {
                        match result {
                            Ok(data) if data == b"handshake" => {
                                return Ok(c);
                            },
                            Ok(data) if data == b"\x01" || data == b"ping" => {
                                continue; // server-side keep-alive, ignore
                            },
                            Ok(_) => {
                                return Err("unexpected relay message".to_string());
                            },
                            Err(e) => {
                                return Err(format!("Relay connection lost: {}", e));
                            }
                        }
                    },
                    // Send a keep-alive ping every 10 seconds to keep the TCP socket alive
                    _ = ping_interval.tick() => {
                        if let Err(e) = c.send(b"\x01").await {
                            return Err(format!("Failed to send keep-alive: {}", e));
                        }
                    }
                }
            }
        } else {
            // Relay unavailable — LAN-only mode, wait for direct connection
            ui.log(format!("Relay unavailable, waiting for direct LAN connection..."));
            local_conn_rx.recv().await.ok_or("No connection received (relay down, no LAN peer)".to_string())
        }
    };

    // 15-minute room lifetime window before timing out
    let mut conn = tokio::time::timeout(std::time::Duration::from_secs(15 * 60), room_waiting_future)
        .await
        .map_err(|_| "Room expired (No receiver connected within 15 minutes)".to_string())??;

    
    ui.log(format!("securing channel..."));
    
    // Process PAKE handshake from receiver
    let payload = conn.receive().await.map_err(|e| e.to_string())?;
    let msg = message::decode(None, payload.clone()).or_else(|_| {
        message::decode(None, payload)
    }).map_err(|e| e.to_string())?;
    
    if msg.msg_type != Some(MessageType::PAKE) {
        return Err("expected PAKE message".into());
    }
    
    let pake_bytes = msg.bytes.ok_or("missing pake bytes")?;
    
    // Initialize PAKE (false for Sender / role 1)
    let secret = if shared_secret.len() > 5 { &shared_secret[5..] } else { shared_secret };
    let pake = pake::init(secret.as_bytes(), false).map_err(|e| e.to_string())?;
    let pake_msg = pake.msg.clone();
    
    // Update with receiver's bytes
    let strong_key = pake.update(&pake_bytes).map_err(|e| e.to_string())?;
    
    // Generate salt
    let mut salt = [0u8; 8];
    rand::thread_rng().fill_bytes(&mut salt);
    
    // Send our PAKE bytes + salt
    let reply = Message {
        msg_type: Some(MessageType::PAKE),
        bytes: Some(pake_msg),
        bytes2: Some(salt.to_vec()),
        message: None,
        num: None,
    };
    
    message::send(&mut conn, None, &reply).await.map_err(|e| e.to_string())?;
    
    // Generate final session encryption key
    let (key, _) = crypt::new_key(&strong_key, Some(&salt)).map_err(|e| e.to_string())?;
    
    ui.log(format!("Channel secured!"));
    
    // Prepare files to transfer using dir_utils or text
    let files_to_transfer = if let Some(ref txt) = text {
        let mut hasher = twox_hash::XxHash64::with_seed(0);
        use std::hash::Hasher;
        hasher.write(txt.as_bytes());
        vec![FileInfo {
            name: Some("text.txt".to_string()),
            hash: Some(hasher.finish().to_be_bytes().to_vec()),
            size: Some(txt.len() as i64),
            is_encrypted: Some(true),
            is_compressed: Some(true),
            ..Default::default()
        }]
    } else {
        let mut f_list = crate::dir_utils::get_files_info(&files)
            .map_err(|e| format!("Failed to get files info: {}", e))?;
            
        // Hash each file since get_files_info leaves hash as None
        for file_info in &mut f_list {
            let mut source_path = std::path::PathBuf::from(file_info.folder_source.as_deref().unwrap_or("."));
            if let Some(name) = &file_info.name {
                source_path.push(name);
            }
            
            let mut f = File::open(&source_path).await.map_err(|e| format!("Failed to open {}: {}", source_path.display(), e))?;
            let mut hasher = twox_hash::XxHash64::with_seed(0);
            let mut buf = vec![0u8; 1024 * 64];
            use std::hash::Hasher;
            
            loop {
                let n = f.read(&mut buf).await.map_err(|e| e.to_string())?;
                if n == 0 { break; }
                hasher.write(&buf[..n]);
            }
            
            file_info.hash = Some(hasher.finish().to_be_bytes().to_vec());
        }
        f_list
    };
    
    // Send FileInfo
    let sender_info = SenderInfo {
        files_to_transfer: files_to_transfer.clone(),
        empty_folders_to_transfer: vec![],
        total_number_folders: 0,
        machine_id: "rust-cli".to_string(),
        ask: true,
        sending_text: false,
        no_compress: false,
        hash_algorithm: "xxhash".to_string(),
        reconnect_version: 0,
        next_reconnect_room: "".to_string(),
    };
    
    let info_bytes = serde_json::to_vec(&sender_info).map_err(|e| e.to_string())?;
    
    let file_info_msg = Message {
        msg_type: Some(MessageType::FileInfo),
        bytes: Some(info_bytes),
        bytes2: None,
        message: None,
        num: None,
    };
    
    message::send(&mut conn, Some(&key), &file_info_msg).await.map_err(|e| e.to_string())?;
    
    // Multiplexed data connections — stays empty for single-port relay/LAN path.
    // Only used when relay explicitly provides extra ports (not yet supported).
    let mut data_conns: Vec<crate::comm::Comm> = Vec::new();
    
    ui.log(format!("Sender information sent. Waiting for receiver..."));
    
    // Wait for messages
    loop {
        let payload = conn.receive().await.map_err(|e| e.to_string())?;
        let msg = message::decode(Some(&key), payload).map_err(|e| e.to_string())?;
        
        match msg.msg_type {
            Some(MessageType::RecipientReady) => {
                let remote_file: RemoteFileRequest = serde_json::from_slice(&msg.bytes.unwrap_or_default())
                    .map_err(|e| e.to_string())?;
                
                let file_idx = remote_file.files_to_transfer_current_num as usize;
                if file_idx >= files_to_transfer.len() {
                    return Err("Receiver requested out of bounds file index".into());
                }
                
                ui.log(format!("Receiver ready for file: {}", files_to_transfer[file_idx].name.as_deref().unwrap_or("")));
                
                // Set up multiplexing if not already done (only when relay provides multiple ports)
                // The banner contains the relay's primary port. Additional multiplex data ports
                // would be sent as extra comma-separated values beyond the primary. Since we
                // have a single-port relay, data_conns stays empty → sequential send.
                // NOTE: Do NOT connect back to the primary relay port — that would corrupt
                // the relay room by creating a spurious second-client match.
                if data_conns.is_empty() {
                    // Multiplex ports would be explicitly listed; none here → skip.
                    // data_conns stays empty, falls through to sequential send below.
                }
                
                let file_info = &files_to_transfer[file_idx];
                
                // Compute the resume skip offset: the largest contiguous byte boundary
                // already confirmed received. We seek the file to exactly this point,
                // so only the remaining bytes are transmitted.
                let skip_offset: u64 = {
                    let chunk_size = (TCP_BUFFER_SIZE / 2) as u64;
                    let mut sorted_chunks: Vec<u64> = remote_file.current_file_chunk_ranges
                        .iter().map(|&x| x as u64).collect();
                    sorted_chunks.sort_unstable();
                    let mut expected = 0u64;
                    for chunk_pos in &sorted_chunks {
                        if *chunk_pos == expected {
                            expected += chunk_size;
                        } else {
                            break;
                        }
                    }
                    expected
                };
                
                let mut pos = skip_offset;
                let mut curi = 0;
                let mut buf = vec![0u8; TCP_BUFFER_SIZE / 2];
                let fname = files_to_transfer[file_idx].name.as_deref().unwrap_or("").to_string();
                let fsize = files_to_transfer[file_idx].size.unwrap_or(0);
                
                if data_conns.is_empty() {
                    // Sequential transfer over main connection (LAN path or single-port relay)
                    let mut reader: Box<dyn tokio::io::AsyncRead + Unpin + Send> = if let Some(ref txt) = text {
                        let mut cur = std::io::Cursor::new(txt.clone().into_bytes());
                        if skip_offset > 0 { cur.set_position(skip_offset); }
                        Box::new(cur)
                    } else {
                        let mut source_path = std::path::PathBuf::from(file_info.folder_source.as_deref().unwrap_or("."));
                        if let Some(name) = &file_info.name { source_path.push(name); }
                        let mut f = File::open(&source_path).await.map_err(|e| e.to_string())?;
                        if skip_offset > 0 {
                            f.seek(std::io::SeekFrom::Start(skip_offset)).await.map_err(|e| e.to_string())?;
                        }
                        Box::new(f)
                    };
                    loop {
                        let n = reader.read(&mut buf).await.map_err(|e| e.to_string())?;
                        if n == 0 { break; }
                        
                        let mut chunk_payload = Vec::with_capacity(8 + n);
                        chunk_payload.extend_from_slice(&pos.to_le_bytes());
                        chunk_payload.extend_from_slice(&buf[..n]);
                        
                        let compressed = compress::compress(&chunk_payload);
                        let encrypted = crypt::encrypt(&compressed, &key).unwrap_or_default();
                        if !encrypted.is_empty() {
                            conn.send(&encrypted).await.map_err(|e| e.to_string())?;
                        }
                        
                        pos += n as u64;
                        ui.progress(fname.clone(), fsize as u64, pos);
                    }
                } else {
                    // Multiplexed transfer over multiple relay data connections
                    let mut reader: Box<dyn tokio::io::AsyncRead + Unpin + Send> = if let Some(ref txt) = text {
                        let mut cur = std::io::Cursor::new(txt.clone().into_bytes());
                        if skip_offset > 0 { cur.set_position(skip_offset); }
                        Box::new(cur)
                    } else {
                        let mut source_path = std::path::PathBuf::from(file_info.folder_source.as_deref().unwrap_or("."));
                        if let Some(name) = &file_info.name { source_path.push(name); }
                        let mut f = File::open(&source_path).await.map_err(|e| e.to_string())?;
                        if skip_offset > 0 {
                            f.seek(std::io::SeekFrom::Start(skip_offset)).await.map_err(|e| e.to_string())?;
                        }
                        Box::new(f)
                    };
                    
                    let mut worker_handles = Vec::new();
                    let mut tx_channels = Vec::new();
                    
                    for mut data_conn in data_conns.drain(..) {
                        let (tx, mut rx) = tokio::sync::mpsc::channel::<(u64, Vec<u8>)>(10);
                        tx_channels.push(tx);
                        
                        let worker_key = key.clone();
                        worker_handles.push(tokio::spawn(async move {
                            while let Some((p, buf)) = rx.recv().await {
                                let mut chunk_payload = Vec::with_capacity(8 + buf.len());
                                chunk_payload.extend_from_slice(&p.to_le_bytes());
                                chunk_payload.extend_from_slice(&buf);
                                
                                let compressed = compress::compress(&chunk_payload);
                                let encrypted = crypt::encrypt(&compressed, &worker_key).unwrap_or_default();
                                if encrypted.is_empty() { continue; }
                                
                                if data_conn.send(&encrypted).await.is_err() {
                                    break;
                                }
                            }
                            data_conn
                        }));
                    }
                    
                    loop {
                        let n = reader.read(&mut buf).await.map_err(|e| e.to_string())?;
                        if n == 0 { break; }
                        
                        let conn_idx = curi % tx_channels.len();
                        tx_channels[conn_idx].send((pos, buf[..n].to_vec())).await.map_err(|e| e.to_string())?;
                        curi += 1;
                        
                        pos += n as u64;
                        ui.progress(fname.clone(), fsize as u64, pos);
                    }
                    
                    drop(tx_channels);
                    
                    for handle in worker_handles {
                        if let Ok(returned_conn) = handle.await {
                            data_conns.push(returned_conn);
                        }
                    }
                }
                
                ui.log(format!("File data sent. Waiting for confirmation..."));
            },
            Some(MessageType::CloseSender) => {
                let reply = Message {
                    msg_type: Some(MessageType::CloseRecipient),
                    bytes: None,
                    bytes2: None,
                    message: None,
                    num: None,
                };
                message::send(&mut conn, Some(&key), &reply).await.map_err(|e| e.to_string())?;
            },
            Some(MessageType::Finished) => {
                let final_msg = Message {
                    msg_type: Some(MessageType::Finished),
                    bytes: None,
                    bytes2: None,
                    message: None,
                    num: None,
                };
                message::send(&mut conn, Some(&key), &final_msg).await.map_err(|e| e.to_string())?;
                
                // Wait briefly to ensure receiver reads the final Finished message before socket closes
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                ui.log("Transfer complete!");
                ui.done("Transfer complete!");
                break;
            },
            Some(MessageType::Error) => {
                return Err(format!("Receiver error: {}", msg.message.unwrap_or_default()));
            },
            _ => {
                ui.log(format!("Received unexpected message type: {:?}", msg.msg_type));
            }
        }
    }
    
    Ok(())
}
