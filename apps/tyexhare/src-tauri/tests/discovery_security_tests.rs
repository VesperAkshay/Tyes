#[cfg(test)]
mod tests {
    use std::net::UdpSocket;
    use std::time::Duration;

    const DISCOVERY_PORT: u16 = 9020;
    const MAGIC_HEADER: &str = "TYEXHARE:v1";
    const PAIR_HEADER: &str = "TYEXHARE_PAIR:v1";

    #[test]
    fn test_broadcast_payload_does_not_contain_secret_code() {
        // Construct a sample discovery broadcast payload
        let name = "Test-Device";
        let os_name = "windows";
        let device_id = "a1b2c3d4";
        let secret_code = "4521-apple-mango-river";

        let payload = format!("{}:{}:{}:{}", MAGIC_HEADER, name, os_name, device_id);

        // Assert secret code is NOT part of the UDP broadcast payload
        assert!(!payload.contains(secret_code), "Broadcast payload must NOT leak the secret transfer code");
        assert!(payload.starts_with(MAGIC_HEADER));
        assert!(payload.contains(device_id));
    }

    #[test]
    fn test_pair_request_formatting() {
        let sender_name = "Akshay-PC";
        let secret_code = "4521-apple-mango-river";

        let payload = format!("{}:{}:{}", PAIR_HEADER, sender_name, secret_code);

        let parts: Vec<&str> = payload.splitn(4, ':').collect();
        assert_eq!(parts[0], "TYEXHARE_PAIR");
        assert_eq!(parts[1], "v1");
        assert_eq!(parts[2], sender_name);
        assert_eq!(parts[3], secret_code);
    }

    #[tokio::test]
    async fn test_udp_unicast_pairing_flow() {
        // Bind listener mock socket
        let listener = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let sender = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let payload = format!("{}:Akshay-PC:secret-code-1234", PAIR_HEADER);

        sender.send_to(payload.as_bytes(), format!("127.0.0.1:{}", port)).await.unwrap();

        let mut buf = [0u8; 1024];
        let (len, _addr) = tokio::time::timeout(Duration::from_secs(1), listener.recv_from(&mut buf))
            .await
            .expect("Timeout waiting for unicast pair request")
            .unwrap();

        let msg = std::str::from_utf8(&buf[..len]).unwrap();
        assert!(msg.starts_with(PAIR_HEADER));
        assert!(msg.contains("Akshay-PC"));
        assert!(msg.contains("secret-code-1234"));
    }
}
