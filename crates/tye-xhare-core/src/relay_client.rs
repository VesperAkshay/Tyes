use std::time::Duration;
use tokio::net::TcpStream;
use crate::comm::Comm;
use crate::crypt;
use crate::pake;
use rand::RngCore;
use std::error::Error;

/// Connects to the relay server and performs the PAKE handshake.
/// Returns the authenticated Comm stream, the server banner, and the client's public IP as seen by the server.
pub async fn connect_to_relay(
    address: &str,
    password: &str,
    room: &str,
    _timeout: Option<Duration>,
) -> Result<(Comm, String, String), Box<dyn Error + Send + Sync>> {
    // In a real implementation, we would apply the timeout to the connection attempt.
    let stream = TcpStream::connect(address).await?;
    let mut c = Comm::new(stream);
    
    let relay_key = if password.is_empty() { b"default_relay_key".to_vec() } else { password.as_bytes().to_vec() };
    let pake = pake::init(&relay_key, true).map_err(|e| e.to_string())?;
    
    // send A_bytes
    c.send(&pake.msg).await?;
    
    // receive B_bytes
    let b_bytes = c.receive().await?;
    
    let strong_key = pake.update(&b_bytes).map_err(|e| e.to_string())?;
    
    // send salt
    let mut salt = [0u8; 16]; // 128-bit salt
    rand::thread_rng().fill_bytes(&mut salt);
    c.send(&salt).await?;
    
    let (encryption_key, _) = crypt::new_key(&strong_key, Some(&salt)).map_err(|e| e.to_string())?;
    
    // send password
    let pw_enc = crypt::encrypt(password.as_bytes(), &encryption_key).map_err(|e| e.to_string())?;
    c.send(&pw_enc).await?;
    
    // receive banner
    let banner_enc = c.receive().await?;
    let banner_bytes = crypt::decrypt(&banner_enc, &encryption_key).map_err(|e| e.to_string())?;
    let banner_full = String::from_utf8(banner_bytes).map_err(|e| e.to_string())?;
    
    let parts: Vec<&str> = banner_full.split("|||").collect();
    if parts.len() < 2 {
        return Err(format!("bad response from server: {}", banner_full).into());
    }
    let banner = parts[0].to_string();
    let ipaddr = parts[1].to_string();
    
    // send room
    let room_enc = crypt::encrypt(room.as_bytes(), &encryption_key).map_err(|e| e.to_string())?;
    c.send(&room_enc).await?;
    
    // receive ok
    let ok_enc = c.receive().await?;
    let ok_bytes = crypt::decrypt(&ok_enc, &encryption_key).map_err(|e| e.to_string())?;
    if ok_bytes != b"ok" {
        return Err(format!("expected 'ok', got {:?}", ok_bytes).into());
    }
    
    Ok((c, banner, ipaddr))
}
