use crate::relay_client::connect_to_relay;
use crate::message::{self, Message, MessageType};
use crate::models::{SenderInfo, RemoteFileRequest};
use crate::pake;
use crate::crypt;
use crate::compress;
use std::path::PathBuf;
use tokio::fs::OpenOptions;
use tokio::io::{AsyncWriteExt, AsyncSeekExt, SeekFrom};

pub async fn receive(
    relay_address: &str,
    relay_password: &str,
    room_name: &str,
    shared_secret: &str,
    dest_dir: Option<&str>,
    resume: bool,
    stdout: bool,
    ui: crate::ui_event::EventSender,
) -> Result<(), String> {
    ui.log(format!("Searching for local senders on LAN..."));
    
    // Try Local LAN Discovery First
    let mut local_conn = None;
    if let Ok(udp) = tokio::net::UdpSocket::bind("0.0.0.0:0").await {
        let _ = udp.set_broadcast(true);
        let discovery_msg = format!("tye-xhare-rs-discovery:{}", room_name);
        
        // Broadcast to 255.255.255.255
        if udp.send_to(discovery_msg.as_bytes(), "255.255.255.255:9009").await.is_ok() {
            let mut buf = [0u8; 1024];
            if let Ok(Ok((len, addr))) = tokio::time::timeout(std::time::Duration::from_millis(500), udp.recv_from(&mut buf)).await {
                if let Ok(s) = std::str::from_utf8(&buf[..len]) {
                    if s.starts_with("tye-xhare-rs-reply:") {
                        let port: u16 = s["tye-xhare-rs-reply:".len()..].parse().unwrap_or(0);
                        if port > 0 {
                            let target = format!("{}:{}", addr.ip(), port);
                            if let Ok(stream) = tokio::time::timeout(std::time::Duration::from_secs(2), tokio::net::TcpStream::connect(&target)).await {
                                if let Ok(stream) = stream {
                                    ui.log(format!("Found local sender at {}! Bypassing relay.", target));
                                    local_conn = Some(crate::comm::Comm::new(stream));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    let (mut conn, _banner, _ipaddr) = if let Some(c) = local_conn {
        (c, "".to_string(), "".to_string())
    } else {
        ui.log(format!("No local senders found. Connecting to relay {}...", relay_address));
        let (mut rc, b, ip) = connect_to_relay(relay_address, relay_password, room_name, None)
            .await.map_err(|e| e.to_string())?;
        rc.send(b"handshake").await.map_err(|e| e.to_string())?;
        (rc, b, ip)
    };
    
    ui.log(format!("securing channel..."));
    
    // Initialize PAKE (true for Receiver / role 0)
    let secret = if shared_secret.len() > 5 { &shared_secret[5..] } else { shared_secret };
    let pake = pake::init(secret.as_bytes(), true).map_err(|e| e.to_string())?;
    let pake_msg = pake.msg.clone();
    
    // Send PAKE payload
    let initial_pake_msg = Message {
        msg_type: Some(MessageType::PAKE),
        bytes: Some(pake_msg),
        bytes2: Some(b"p256".to_vec()),
        message: None,
        num: None,
    };
    
    message::send(&mut conn, None, &initial_pake_msg).await.map_err(|e| e.to_string())?;
    
    // Receive Sender's PAKE reply + salt
    let reply_payload = conn.receive().await.map_err(|e| e.to_string())?;
    let reply_msg = message::decode(None, reply_payload).map_err(|e| e.to_string())?;
    
    if reply_msg.msg_type != Some(MessageType::PAKE) {
        return Err("expected PAKE message from sender".into());
    }
    
    let sender_pake_bytes = reply_msg.bytes.ok_or("missing sender pake bytes")?;
    let salt = reply_msg.bytes2.ok_or("missing salt bytes")?;
    
    let strong_key = pake.update(&sender_pake_bytes).map_err(|e| e.to_string())?;
    let (key, _) = crypt::new_key(&strong_key, Some(&salt)).map_err(|e| e.to_string())?;
    
    ui.log(format!("Channel secured!"));
    
    // Receive FileInfo message from Sender
    let info_payload = conn.receive().await.map_err(|e| e.to_string())?;
    let info_msg = message::decode(Some(&key), info_payload).map_err(|e| e.to_string())?;
    
    if info_msg.msg_type != Some(MessageType::FileInfo) {
        return Err("expected FileInfo message from sender".into());
    }
    
    let json_bytes = if let Some(ref b) = info_msg.bytes {
        b.clone()
    } else if let Some(ref m) = info_msg.message {
        m.as_bytes().to_vec()
    } else {
        Vec::new()
    };
    
    let sender_info: SenderInfo = serde_json::from_slice(&json_bytes)
        .map_err(|e| e.to_string())?;
        
    let num_files = sender_info.files_to_transfer.len();
    let total_size: u64 = sender_info.files_to_transfer.iter().map(|f| f.size.unwrap_or(0) as u64).sum();
    let prompt_msg = format!("Accept {} file(s) (Total {} bytes)?", num_files, total_size);
    if !ui.prompt(prompt_msg).await {
        return Err("Transfer rejected by user.".into());
    }
    
    ui.log(format!("Receiving {} file(s)", num_files));
    // Multiplexed data connections are only set up when the relay explicitly advertises
    // extra ports beyond the primary. For a single-port relay or LAN path, data_conns
    // stays empty and all data flows over the main conn sequentially.
    // NOTE: Do NOT connect back to the relay primary port \u2014 that corrupts the relay room.
    let mut data_conns: Vec<crate::comm::Comm> = Vec::new();

    
    // Receive each file
    for (file_idx, file_info) in sender_info.files_to_transfer.iter().enumerate() {
        let name = file_info.name.as_deref().unwrap_or("received_file");
        let size = file_info.size.unwrap_or(0);
        
        let default_out = dirs::download_dir()
            .map(|p| p.join("TyeXhare"))
            .unwrap_or_else(|| PathBuf::from("."));
            
        let out_dir = dest_dir.map(PathBuf::from).unwrap_or(default_out);
        let mut file_path = out_dir.clone();
        
        if let Some(remote_dir) = &file_info.folder_remote {
            if remote_dir != "." {
                file_path.push(remote_dir);
            }
        }
        
        file_path.push(name);
        
        if let Some(parent) = file_path.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
        }
        
        let mut current_file_chunk_ranges = Vec::new();
        let mut pre_existing_bytes = 0u64;
        
        if resume {
            if let Ok(metadata) = tokio::fs::metadata(&file_path).await {
                if metadata.is_file() {
                    let existing_size = metadata.len();
                    if existing_size <= size as u64 && existing_size > 0 {
                        let chunk_size = (crate::models::TCP_BUFFER_SIZE / 2) as u64;
                        // Build contiguous chunk list from the beginning of the file.
                        // This must match the sender's skip_offset computation exactly.
                        let mut pos = 0u64;
                        while pos + chunk_size <= existing_size {
                            current_file_chunk_ranges.push(pos as i64);
                            pos += chunk_size;
                        }
                        // If there's a partial chunk at the end, include it only if the
                        // existing_size is at a chunk boundary; partial tail chunks are
                        // re-sent by the sender from the last clean boundary.
                        pre_existing_bytes = pos; // contiguous safe skip boundary
                    }
                }
            }
        }
        
        ui.log(format!("Receiving file: {} ({} bytes, resuming {} bytes)", name, size, pre_existing_bytes));
        
        // Send RecipientReady message
        let req = RemoteFileRequest {
            current_file_chunk_ranges,
            files_to_transfer_current_num: file_idx as i32,
            machine_id: "rust-cli".to_string(),
            reconnect_version: 0,
        };
        let req_bytes = serde_json::to_vec(&req).map_err(|e| e.to_string())?;
        
        let ready_msg = Message {
            msg_type: Some(MessageType::RecipientReady),
            bytes: Some(req_bytes),
            bytes2: None,
            message: None,
            num: None,
        };
        message::send(&mut conn, Some(&key), &ready_msg).await.map_err(|e| e.to_string())?;
        
        // Open file for writing (append/modify or truncate based on resume flag)
        let mut outfile = if !stdout {
            Some(OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(!resume)
                .open(&file_path)
                .await
                .map_err(|e| e.to_string())?)
        } else {
            None
        };
        let mut stdout_handle = if stdout { Some(tokio::io::stdout()) } else { None };
        let mut next_stdout_pos = 0u64;
        let mut stdout_buffer: std::collections::BTreeMap<u64, Vec<u8>> = std::collections::BTreeMap::new();
            
        let mut bytes_received = pre_existing_bytes as i64;
        
        if data_conns.is_empty() {
            // Receive file data chunks sequentially over the main connection.
            while bytes_received < size {
                let enc_payload = match conn.receive().await {
                    Ok(p) => p,
                    Err(e) => {
                        ui.log(format!("Connection closed during receive: {}", e));
                        break;
                    }
                };
                
                let decrypted = match crypt::decrypt(&enc_payload, &key) {
                    Ok(d) => d,
                    Err(_) => continue,
                };
                let decompressed = compress::decompress(&decrypted);
                if decompressed.len() < 8 { continue; }
                
                let mut pos_bytes = [0u8; 8];
                pos_bytes.copy_from_slice(&decompressed[..8]);
                let pos = u64::from_le_bytes(pos_bytes);
                let chunk_data = decompressed[8..].to_vec();
                
                if let Some(ref mut out) = outfile {
                    out.seek(SeekFrom::Start(pos)).await.map_err(|e| e.to_string())?;
                    out.write_all(&chunk_data).await.map_err(|e| e.to_string())?;
                } else if let Some(ref mut out) = stdout_handle {
                    stdout_buffer.insert(pos, chunk_data.clone());
                    while let Some(data) = stdout_buffer.remove(&next_stdout_pos) {
                        out.write_all(&data).await.map_err(|e| e.to_string())?;
                        next_stdout_pos += data.len() as u64;
                    }
                    out.flush().await.map_err(|e| e.to_string())?;
                }
                
                bytes_received += chunk_data.len() as i64;
                ui.progress(name.to_string(), size as u64, bytes_received as u64);
            }
        } else {
            let (chunk_tx, mut chunk_rx) = tokio::sync::mpsc::channel::<(u64, Vec<u8>)>(data_conns.len() * 4);
            let mut worker_handles = Vec::new();
            
            for mut data_conn in data_conns.drain(..) {
                let tx = chunk_tx.clone();
                let worker_key = key.clone();
                worker_handles.push(tokio::spawn(async move {
                    loop {
                        let enc_payload = match data_conn.receive().await {
                            Ok(p) => p,
                            Err(_) => break, // Connection closed or error
                        };
                        
                        let decrypted = match crypt::decrypt(&enc_payload, &worker_key) {
                            Ok(d) => d,
                            Err(_) => continue,
                        };
                        
                        let decompressed = compress::decompress(&decrypted);
                        if decompressed.len() < 8 { continue; }
                        
                        let mut pos_bytes = [0u8; 8];
                        pos_bytes.copy_from_slice(&decompressed[..8]);
                        let pos = u64::from_le_bytes(pos_bytes);
                        let chunk_data = decompressed[8..].to_vec();
                        
                        if tx.send((pos, chunk_data)).await.is_err() {
                            break;
                        }
                    }
                    data_conn // return the connection to be reused
                }));
            }
            
            drop(chunk_tx); // Drop the main sender so the channel closes when workers finish
            
            // Receive file data chunks
            while bytes_received < size {
                if let Some((pos, chunk_data)) = chunk_rx.recv().await {
                    if let Some(ref mut out) = outfile {
                        out.seek(SeekFrom::Start(pos)).await.map_err(|e| e.to_string())?;
                        out.write_all(&chunk_data).await.map_err(|e| e.to_string())?;
                    } else if let Some(ref mut out) = stdout_handle {
                        stdout_buffer.insert(pos, chunk_data.clone());
                        while let Some(data) = stdout_buffer.remove(&next_stdout_pos) {
                            out.write_all(&data).await.map_err(|e| e.to_string())?;
                            next_stdout_pos += data.len() as u64;
                        }
                        out.flush().await.map_err(|e| e.to_string())?;
                    }
                    
                    bytes_received += chunk_data.len() as i64;
                    ui.progress(name.to_string(), size as u64, bytes_received as u64);
                } else {
                    break; // Channel closed before we got all bytes
                }
            }
            
            // Wait for workers to finish and collect connections
            for handle in worker_handles {
                if let Ok(c) = handle.await {
                    data_conns.push(c);
                }
            }
        }
        
        if let Some(ref mut out) = outfile {
            out.flush().await.map_err(|e| e.to_string())?;
        }
        ui.log(format!("File {} received successfully!", name));
        
        // Send CloseSender message
        let close_msg = Message {
            msg_type: Some(MessageType::CloseSender),
            bytes: None,
            bytes2: None,
            message: None,
            num: None,
        };
        message::send(&mut conn, Some(&key), &close_msg).await.map_err(|e| e.to_string())?;
        
        // Wait for CloseRecipient confirmation
        let conf_payload = conn.receive().await.map_err(|e| e.to_string())?;
        let conf_msg = message::decode(Some(&key), conf_payload).map_err(|e| e.to_string())?;
        if conf_msg.msg_type != Some(MessageType::CloseRecipient) {
            return Err("expected CloseRecipient message".into());
        }
    }
    
    // Send Finished message
    let finished_msg = Message {
        msg_type: Some(MessageType::Finished),
        bytes: None,
        bytes2: None,
        message: None,
        num: None,
    };
    message::send(&mut conn, Some(&key), &finished_msg).await.map_err(|e| e.to_string())?;
    
    // Wait for final Finished message
    let final_payload = conn.receive().await.map_err(|e| e.to_string())?;
    let final_msg = message::decode(Some(&key), final_payload).map_err(|e| e.to_string())?;
    if final_msg.msg_type != Some(MessageType::Finished) {
        return Err("expected final Finished message".into());
    }
    
    ui.log("All files received successfully!");
    ui.done("All files received successfully!");
    Ok(())
}
