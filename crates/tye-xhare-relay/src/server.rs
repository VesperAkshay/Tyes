use tokio::net::TcpStream;
use tokio::sync::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Instant, Duration};
use tokio::io::AsyncWriteExt;
use tye_xhare_core::comm::Comm;
use tye_xhare_core::crypt;
use tye_xhare_core::pake;
use log::{debug, info};

pub struct Server {
    host: String,
    ports: Vec<String>,
    password: String,
    rooms: Arc<Mutex<HashMap<String, RoomInfo>>>,
    room_ttl: Duration,
}

struct RoomInfo {
    first_c: Option<Comm>,
    opened: Instant,
}

impl Server {
    pub fn new(host: String, ports: Vec<String>, password: String) -> Self {
        Self {
            host,
            ports,
            password,
            rooms: Arc::new(Mutex::new(HashMap::new())),
            room_ttl: Duration::from_secs(3 * 60 * 60), // 3 hours
        }
    }

    pub async fn run(&self) -> Result<(), Box<dyn std::error::Error>> {
        let rooms_cleanup = Arc::clone(&self.rooms);
        let ttl = self.room_ttl;
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                let mut guard = rooms_cleanup.lock().await;
                guard.retain(|_, v| v.opened.elapsed() < ttl);
            }
        });

        let mut join_handles = Vec::new();
        let all_ports_csv = self.ports.join(",");

        for port in &self.ports {
            let addr_str = format!("{}:{}", self.host, port);
            let socket_addr: std::net::SocketAddr = addr_str
                .parse()
                .map_err(|e| format!("Invalid socket address {}: {}", addr_str, e))?;

            let socket = if socket_addr.is_ipv6() {
                tokio::net::TcpSocket::new_v6()?
            } else {
                tokio::net::TcpSocket::new_v4()?
            };

            socket.set_reuseaddr(true)?;
            socket.bind(socket_addr)?;
            let listener = socket.listen(1024)?;
            info!("starting TCP server on {}", addr_str);
            
            let rooms = Arc::clone(&self.rooms);
            let password = self.password.clone();
            let all_ports = all_ports_csv.clone();
            
            join_handles.push(tokio::spawn(async move {
                loop {
                    match listener.accept().await {
                        Ok((stream, remote_addr)) => {
                            debug!("client {} connected", remote_addr);
                            let r = Arc::clone(&rooms);
                            let p = password.clone();
                            let ap = all_ports.clone();
                            
                            tokio::spawn(async move {
                                if let Err(e) = handle_client(stream, r, p, ap).await {
                                    debug!("relay error for {}: {}", remote_addr, e);
                                }
                            });
                        }
                        Err(e) => {
                            debug!("accept error: {}", e);
                        }
                    }
                }
            }));
        }

        for handle in join_handles {
            let _ = handle.await;
        }

        Ok(())
    }
}

async fn handle_client(
    stream: TcpStream, 
    rooms: Arc<Mutex<HashMap<String, RoomInfo>>>, 
    password: String,
    port: String,
) -> Result<(), String> {
    let mut c = Comm::new(stream);
    
    let weak_key = if password.is_empty() { b"default_relay_key".to_vec() } else { password.as_bytes().to_vec() };
    let pake = pake::init(&weak_key, false).map_err(|e| e.to_string())?;
    
    let a_bytes = c.receive().await.map_err(|e| e.to_string())?;
    if a_bytes == b"ping" {
        c.send(b"pong").await.map_err(|e| e.to_string())?;
        return Ok(());
    }
    
    c.send(&pake.msg).await.map_err(|e| e.to_string())?;
    let strong_key = pake.update(&a_bytes).map_err(|e| e.to_string())?;
    
    let salt = c.receive().await.map_err(|e| e.to_string())?;
    let (encryption_key, _) = crypt::new_key(&strong_key, Some(&salt)).map_err(|e| e.to_string())?;
    
    let password_bytes_enc = c.receive().await.map_err(|e| e.to_string())?;
    let password_bytes = crypt::decrypt(&password_bytes_enc, &encryption_key).map_err(|e| e.to_string())?;
    
    if password_bytes != password.as_bytes() {
        let err_msg = crypt::encrypt(b"bad password", &encryption_key).map_err(|e| e.to_string())?;
        c.send(&err_msg).await.map_err(|e| e.to_string())?;
        return Err("bad password".into());
    }
    
    // Send "ok" banner and client's remote address
    let remote_ip = c.framed.get_ref().peer_addr().map_err(|e| e.to_string())?.ip().to_string();
    let banner = format!("{}|||{}", port, remote_ip);
    let banner_enc = crypt::encrypt(banner.as_bytes(), &encryption_key).map_err(|e| e.to_string())?;
    c.send(&banner_enc).await.map_err(|e| e.to_string())?;
    
    let room_enc = c.receive().await.map_err(|e| e.to_string())?;
    let room_bytes = crypt::decrypt(&room_enc, &encryption_key).map_err(|e| e.to_string())?;
    let room = String::from_utf8(room_bytes).map_err(|e| e.to_string())?;
    
    let first_c_opt;
    
    {
        let mut rooms_guard = rooms.lock().await;
        if let Some(mut room_info) = rooms_guard.remove(&room) {
            // Room exists
            if let Some(first_c) = room_info.first_c.take() {
                first_c_opt = Some(first_c);
            } else {
                // Room full (shouldn't happen since we remove the room, but just in case)
                rooms_guard.insert(room, room_info);
                let full_enc = crypt::encrypt(b"room full", &encryption_key).map_err(|e| e.to_string())?;
                c.send(&full_enc).await.map_err(|e| e.to_string())?;
                return Ok(());
            }
        } else {
            // New room, we are the first client
            let ok_enc = crypt::encrypt(b"ok", &encryption_key).map_err(|e| e.to_string())?;
            c.send(&ok_enc).await.map_err(|e| e.to_string())?;
            
            rooms_guard.insert(room.clone(), RoomInfo {
                first_c: Some(c),
                opened: Instant::now(),
            });
            return Ok(()); // Task finishes, but `c` lives on in the HashMap!
        }
    }
    
    if let Some(first_c) = first_c_opt {
        // Second client is here, send OK to second client
        let ok_enc2 = crypt::encrypt(b"ok", &encryption_key).map_err(|e| e.to_string())?;
        c.send(&ok_enc2).await.map_err(|e| e.to_string())?;
        
        let (mut stream1, buf1) = first_c.into_inner();
        let (mut stream2, buf2) = c.into_inner();
        
        // Write any leftover buffer
        if !buf1.is_empty() {
            stream2.write_all(&buf1).await.map_err(|e| e.to_string())?;
        }
        if !buf2.is_empty() {
            stream1.write_all(&buf2).await.map_err(|e| e.to_string())?;
        }
        
        // Full-duplex pipe
        tokio::io::copy_bidirectional(&mut stream1, &mut stream2).await.map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    use tye_xhare_core::relay_client::connect_to_relay;

    #[tokio::test]
    async fn test_relay_end_to_end() {
        let password = "test_password".to_string();
        let server = Server::new("127.0.0.1".to_string(), vec!["0".to_string()], password.clone());
        
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap().to_string();
        
        let rooms_cleanup = Arc::clone(&server.rooms);
        
        tokio::spawn(async move {
            loop {
                if let Ok((stream, _)) = listener.accept().await {
                    let r = Arc::clone(&rooms_cleanup);
                    let p = password.clone();
                    let pt = "0".to_string();
                    tokio::spawn(async move {
                        let _ = handle_client(stream, r, p, pt).await;
                    });
                }
            }
        });
        
        let addr_c = addr.clone();
        
        let client1_task = tokio::spawn(async move {
            let (c, _, _) = connect_to_relay(&addr_c, "test_password", "room1", None).await.unwrap();
            let (mut stream, _) = c.into_inner();
            stream.write_all(b"hello from client 1").await.unwrap();
            
            let mut buf = vec![0u8; 128];
            let n = stream.read(&mut buf).await.unwrap();
            String::from_utf8(buf[..n].to_vec()).unwrap()
        });
        
        let client2_task = tokio::spawn(async move {
            let (c, _, _) = connect_to_relay(&addr, "test_password", "room1", None).await.unwrap();
            let (mut stream, _) = c.into_inner();
            
            let mut buf = vec![0u8; 128];
            let n = stream.read(&mut buf).await.unwrap();
            let received = String::from_utf8(buf[..n].to_vec()).unwrap();
            
            stream.write_all(b"hello from client 2").await.unwrap();
            received
        });
        
        let (res1, res2) = tokio::join!(client1_task, client2_task);
        assert_eq!(res1.unwrap(), "hello from client 2");
        assert_eq!(res2.unwrap(), "hello from client 1");
    }

    #[tokio::test]
    async fn test_server_binds_and_accepts_on_all_5_ports() {
        let ports = vec![
            "19009".to_string(),
            "19010".to_string(),
            "19011".to_string(),
            "19012".to_string(),
            "19013".to_string(),
        ];
        let server = Arc::new(Server::new("127.0.0.1".to_string(), ports.clone(), "testpass".to_string()));

        let server_clone = Arc::clone(&server);
        tokio::spawn(async move {
            let _ = server_clone.run().await;
        });

        tokio::time::sleep(Duration::from_millis(150)).await;

        for port in &ports {
            let addr = format!("127.0.0.1:{}", port);
            let stream = TcpStream::connect(&addr).await;
            assert!(
                stream.is_ok(),
                "Failed to connect to embedded relay on port {}",
                port
            );
        }
    }
}

