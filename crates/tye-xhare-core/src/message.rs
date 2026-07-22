use serde::{Serialize, Deserialize};
use std::error::Error;
use crate::{comm::Comm, compress, crypt};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub enum MessageType {
    #[serde(rename = "pake")]
    PAKE,
    #[serde(rename = "externalip")]
    ExternalIP,
    #[serde(rename = "finished")]
    Finished,
    #[serde(rename = "error")]
    Error,
    #[serde(rename = "close-recipient")]
    CloseRecipient,
    #[serde(rename = "close-sender")]
    CloseSender,
    #[serde(rename = "recipientready")]
    RecipientReady,
    #[serde(rename = "fileinfo")]
    FileInfo,
    #[serde(rename = "message")]
    Message, // For tests primarily
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct Message {
    #[serde(rename = "t", skip_serializing_if = "Option::is_none")]
    pub msg_type: Option<MessageType>,
    #[serde(rename = "m", skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(rename = "b", skip_serializing_if = "Option::is_none")]
    pub bytes: Option<Vec<u8>>,
    #[serde(rename = "b2", skip_serializing_if = "Option::is_none")]
    pub bytes2: Option<Vec<u8>>,
    #[serde(rename = "n", skip_serializing_if = "Option::is_none")]
    pub num: Option<i32>,
}

impl Message {
    pub fn to_string(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }
}

pub async fn send(c: &mut Comm, key: Option<&[u8]>, m: &Message) -> Result<(), Box<dyn Error>> {
    let m_send = encode(key, m)?;
    c.send(&m_send).await?;
    Ok(())
}

pub fn encode(key: Option<&[u8]>, m: &Message) -> Result<Vec<u8>, Box<dyn Error>> {
    let mut b = serde_json::to_vec(m)?;
    b = compress::compress(&b);
    
    if let Some(k) = key {
        b = crypt::encrypt(&b, k)?;
    }
    
    Ok(b)
}

pub fn decode(key: Option<&[u8]>, mut b: Vec<u8>) -> Result<Message, Box<dyn Error>> {
    if let Some(k) = key {
        b = crypt::decrypt(&b, k)?;
    }
    
    b = compress::decompress(&b);
    let m: Message = serde_json::from_slice(&b)?;
    
    Ok(m)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::{TcpListener, TcpStream};
    
    #[test]
    fn test_message() {
        let m = Message {
            msg_type: Some(MessageType::Message),
            message: Some("hello, world".to_string()),
            bytes: None,
            bytes2: None,
            num: None,
        };
        
        let (key, _salt) = crypt::new_key(b"pass", None).unwrap();
        
        let b = encode(Some(&key), &m).unwrap();
        let m2 = decode(Some(&key), b.clone()).unwrap();
        
        assert_eq!(m, m2);
        assert_eq!(r#"{"t":"message","m":"hello, world"}"#, m.to_string());
        
        let err = decode(Some(b"not pass"), b.clone());
        assert!(err.is_err());
        
        let err = encode(Some(b"0"), &m);
        assert!(err.is_err()); // invalid key length
    }
    
    #[test]
    fn test_message_no_pass() {
        let m = Message {
            msg_type: Some(MessageType::Message),
            message: Some("hello, world".to_string()),
            bytes: None,
            bytes2: None,
            num: None,
        };
        
        let b = encode(None, &m).unwrap();
        let m2 = decode(None, b).unwrap();
        
        assert_eq!(m, m2);
    }
    
    #[tokio::test]
    async fn test_send() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        
        let (key, _) = crypt::new_key(b"pass", None).unwrap();
        let key_clone = key.clone();
        
        let want = Message {
            msg_type: Some(MessageType::Message),
            message: Some("hello, world".to_string()),
            bytes: None,
            bytes2: None,
            num: None,
        };
        let want_clone = want.clone();
        
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut server = Comm::new(stream);
            
            let data = server.receive().await.unwrap();
            let got = decode(Some(&key_clone), data).unwrap();
            assert_eq!(got, want_clone);
        });
        
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        
        let stream = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
        let mut client = Comm::new(stream);
        
        send(&mut client, Some(&key), &want).await.unwrap();
    }
}
