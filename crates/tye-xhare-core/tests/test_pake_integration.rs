
use tye_xhare_core::pake;
use tye_xhare_core::crypt;
use rand::RngCore;

#[test]
fn test_pake_and_crypto() {
    let pw = b"1234-radar-transfer";
    
    // Sender init
    let sender_pake = pake::init(pw, true).unwrap();
    let sender_msg = sender_pake.msg.clone();
    
    // Receiver init
    let receiver_pake = pake::init(pw, false).unwrap();
    let receiver_msg = receiver_pake.msg.clone();
    
    // Sender update
    let sender_strong = sender_pake.update(&receiver_msg).unwrap();
    
    // Receiver update
    let receiver_strong = receiver_pake.update(&sender_msg).unwrap();
    
    assert_eq!(sender_strong, receiver_strong, "Strong keys must match");
    
    // Salt
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    
    // Sender derive key
    let (sender_key, _) = crypt::new_key(&sender_strong, Some(&salt)).unwrap();
    
    // Receiver derive key
    let (receiver_key, _) = crypt::new_key(&receiver_strong, Some(&salt)).unwrap();
    
    assert_eq!(sender_key, receiver_key, "Encryption keys must match");
    
    // Encrypt and decrypt
    let plaintext = b"Hello, World!";
    let ciphertext = crypt::encrypt(plaintext, &sender_key).unwrap();
    let decrypted = crypt::decrypt(&ciphertext, &receiver_key).unwrap();
    
    assert_eq!(plaintext, &decrypted[..], "Decryption failed");
    println!("Test passed successfully");
}

