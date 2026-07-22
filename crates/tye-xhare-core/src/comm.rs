use bytes::{Buf, BytesMut};
use std::io;
use tokio::net::TcpStream;
use tokio::time::Duration;
use tokio_util::codec::{Decoder, Encoder, Framed};
use futures::{SinkExt, StreamExt};

pub const MAGIC_BYTES: &[u8; 4] = b"croc";
pub const MAX_READ_MESSAGE_SIZE: usize = 64 * 1024 * 1024; // 64 MB
pub const MESSAGE_BODY_READ_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// Custom codec for Croc's TCP framing: `[4 bytes magic][4 bytes len][payload]`
#[derive(Debug, Clone, Default)]
pub struct CrocCodec;

impl Decoder for CrocCodec {
    type Item = Vec<u8>;
    type Error = std::io::Error;

    fn decode(&mut self, src: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        if src.len() < 8 {
            return Ok(None); // Need at least 4 bytes magic + 4 bytes len
        }

        if &src[0..4] != MAGIC_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "initial bytes are not magic",
            ));
        }

        let mut len_bytes = [0u8; 4];
        len_bytes.copy_from_slice(&src[4..8]);
        let length = u32::from_le_bytes(len_bytes) as usize;

        if length > MAX_READ_MESSAGE_SIZE {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("message too large: {} > {}", length, MAX_READ_MESSAGE_SIZE),
            ));
        }

        if src.len() < 8 + length {
            // Reserve space to avoid reallocation overhead as more data arrives
            src.reserve(8 + length - src.len());
            return Ok(None);
        }

        // We have the full payload
        src.advance(8); // Skip the header
        let payload = src.split_to(length).to_vec();

        Ok(Some(payload))
    }
}

// Encoder implementing only for &[u8] to prevent type inference issues
impl<'a> Encoder<&'a [u8]> for CrocCodec {
    type Error = std::io::Error;

    fn encode(&mut self, item: &'a [u8], dst: &mut BytesMut) -> Result<(), Self::Error> {
        let length = item.len() as u32;
        dst.reserve(8 + item.len());
        dst.extend_from_slice(MAGIC_BYTES);
        dst.extend_from_slice(&length.to_le_bytes());
        dst.extend_from_slice(item);
        Ok(())
    }
}

/// The Comm wrapper representing a framed TCP connection
pub struct Comm {
    pub framed: Framed<TcpStream, CrocCodec>,
}

impl Comm {
    pub fn new(stream: TcpStream) -> Self {
        Self {
            framed: Framed::new(stream, CrocCodec::default()),
        }
    }

    pub async fn send(&mut self, msg: &[u8]) -> Result<(), std::io::Error> {
        self.framed.send(msg).await
    }

    pub fn into_inner(self) -> (TcpStream, bytes::BytesMut) {
        let parts = self.framed.into_parts();
        (parts.io, parts.read_buf)
    }

    pub async fn close(mut self) -> Result<(), std::io::Error> {
        <Framed<TcpStream, CrocCodec> as SinkExt<&[u8]>>::close(&mut self.framed).await
    }

    pub async fn receive(&mut self) -> Result<Vec<u8>, std::io::Error> {
        match self.framed.next().await {
            Some(Ok(msg)) => Ok(msg),
            Some(Err(e)) => Err(e),
            None => Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                "connection closed",
            )),
        }
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{thread_rng, RngCore};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn test_comm_end_to_end() {
        let mut token = vec![0u8; 3000];
        thread_rng().fill_bytes(&mut token);
        let token_clone = token.clone();

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        // Spawn relay/receiver server mock
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut comm = Comm::new(stream);
            comm.send(b"hello, world").await.unwrap();

            let data = comm.receive().await.unwrap();
            assert_eq!(data, b"hello, computer");

            let data = comm.receive().await.unwrap();
            assert_eq!(data, b"\x00");

            let data = comm.receive().await.unwrap();
            assert_eq!(data, token_clone);
        });

        // Let the server spin up
        tokio::time::sleep(Duration::from_millis(100)).await;

        let stream = TcpStream::connect(format!("127.0.0.1:{}", port))
            .await
            .unwrap();
        let mut client = Comm::new(stream);

        let data = client.receive().await.unwrap();
        assert_eq!(data, b"hello, world");

        client.send(b"hello, computer").await.unwrap();
        client.send(b"\x00").await.unwrap();
        client.send(&token).await.unwrap();
    }

    #[test]
    fn test_receive_rejects_oversized_message() {
        let mut codec = CrocCodec::default();
        let mut buf = BytesMut::new();

        buf.extend_from_slice(MAGIC_BYTES);
        let oversized = (MAX_READ_MESSAGE_SIZE + 1) as u32;
        buf.extend_from_slice(&oversized.to_le_bytes());
        buf.extend_from_slice(b"fake payload here");

        let res = codec.decode(&mut buf);
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .to_string()
            .contains("message too large"));
    }

    #[test]
    fn test_codec_requires_magic_bytes() {
        let mut codec = CrocCodec::default();
        let mut buf = BytesMut::new();

        buf.extend_from_slice(b"bad!"); // Not "tye-xhare"
        buf.extend_from_slice(&10u32.to_le_bytes());
        buf.extend_from_slice(b"1234567890");

        let res = codec.decode(&mut buf);
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .to_string()
            .contains("initial bytes are not magic"));
    }
}
