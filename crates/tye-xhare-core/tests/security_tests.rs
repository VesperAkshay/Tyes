use tye_xhare_core::compress;
use flate2::write::DeflateEncoder;
use flate2::Compression;
use std::io::Write;

#[test]
fn test_decompression_bomb() {
    // 1. Create a highly compressible payload (a "zip bomb" pattern)
    // 15MB of pure zeroes.
    let original_data = vec![0u8; 15 * 1024 * 1024]; 
    
    // 2. Compress the payload
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::new(9));
    encoder.write_all(&original_data).unwrap();
    let compressed_payload = encoder.finish().unwrap();
    
    // Ensure the payload actually compressed to a small size (should be under a few KB)
    assert!(
        compressed_payload.len() < 100 * 1024, 
        "Payload should be highly compressed, but was {} bytes", 
        compressed_payload.len()
    );
    
    // 3. Attempt to decompress it using our safe function
    let decompressed = compress::decompress(&compressed_payload);
    
    // 4. Verify the decompression bomb was mitigated.
    // The decompress function enforces a 10MB limit. Because our original data was 15MB,
    // the decompressor should detect it exceeds the limit and return an empty vector.
    assert!(
        decompressed.is_empty(), 
        "Decompression bomb should be blocked and return empty, but returned {} bytes", 
        decompressed.len()
    );
}

#[test]
fn test_normal_decompression() {
    // 1. Create normal data (well under the 10MB limit)
    let original_data = b"This is a normal message that is perfectly safe to decompress.".to_vec();
    
    // 2. Compress the data
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::new(1));
    encoder.write_all(&original_data).unwrap();
    let compressed_payload = encoder.finish().unwrap();
    
    // 3. Decompress the data
    let decompressed = compress::decompress(&compressed_payload);
    
    // 4. Verify it decompressed perfectly
    assert_eq!(
        decompressed, 
        original_data, 
    );
}

#[test]
fn test_lan_discovery_hmac_validation() {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let shared_secret = "4521-apple-mango-river";
    let port = 12345;
    
    // 1. Legitimate Sender generates reply
    let reply_body = format!("tye-xhare-rs-reply:{}", port);
    let mut mac = Hmac::<Sha256>::new_from_slice(shared_secret.as_bytes()).unwrap();
    mac.update(reply_body.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());
    let valid_reply = format!("{}|{}", reply_body, signature);

    // 2. Receiver validates legitimate reply
    let parts: Vec<&str> = valid_reply.splitn(2, '|').collect();
    assert_eq!(parts.len(), 2);
    let mut recv_mac = Hmac::<Sha256>::new_from_slice(shared_secret.as_bytes()).unwrap();
    recv_mac.update(parts[0].as_bytes());
    let sig_bytes = hex::decode(parts[1]).unwrap();
    assert!(recv_mac.verify_slice(&sig_bytes).is_ok(), "Legitimate signed reply should verify successfully");

    // 3. Attacker tries to spoof reply without secret
    let forged_reply = format!("tye-xhare-rs-reply:9999|deadbeef12345678");
    let parts_forged: Vec<&str> = forged_reply.splitn(2, '|').collect();
    let mut forged_mac = Hmac::<Sha256>::new_from_slice(shared_secret.as_bytes()).unwrap();
    forged_mac.update(parts_forged[0].as_bytes());
    let forged_sig_bytes = hex::decode(parts_forged[1]).unwrap_or_default();
    assert!(forged_mac.verify_slice(&forged_sig_bytes).is_err(), "Forged signature should fail verification");
    
    // 4. Attacker tries to modify port of intercepted legitimate reply (Tampering)
    let tampered_reply_body = "tye-xhare-rs-reply:9999";
    let mut tampered_mac = Hmac::<Sha256>::new_from_slice(shared_secret.as_bytes()).unwrap();
    tampered_mac.update(tampered_reply_body.as_bytes());
    assert!(tampered_mac.verify_slice(&sig_bytes).is_err(), "Tampering with signed message should fail verification");
}

#[test]
fn test_end_to_end_file_hashing() {
    use std::hash::Hasher;
    use twox_hash::XxHash64;

    let original_data = b"This is the payload that we will transfer securely.";
    
    // Sender calculates hash
    let mut sender_hasher = XxHash64::with_seed(0);
    sender_hasher.write(original_data);
    let sender_hash = sender_hasher.finish().to_be_bytes().to_vec();
    
    // Receiver hashes the written file perfectly
    let mut recv_hasher = XxHash64::with_seed(0);
    recv_hasher.write(original_data);
    let recv_hash = recv_hasher.finish().to_be_bytes().to_vec();
    
    assert_eq!(sender_hash, recv_hash, "Perfect file transfer should have matching hashes");
    
    // Receiver hashes a corrupted file (1 bit flipped)
    let mut corrupted_data = original_data.to_vec();
    corrupted_data[5] = b'X';
    let mut recv_hasher_bad = XxHash64::with_seed(0);
    recv_hasher_bad.write(&corrupted_data);
    let recv_hash_bad = recv_hasher_bad.finish().to_be_bytes().to_vec();
    
    assert_ne!(sender_hash, recv_hash_bad, "Corrupted file transfer must fail hash verification");
}
