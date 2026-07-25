
use tye_xhare_core::message::{Message, MessageType, encode, decode};
use tye_xhare_core::crypt;

#[test]
fn test_it() {
    let (key, _) = crypt::new_key(b"testpass", None).unwrap();
    let info = Message {
        msg_type: Some(MessageType::FileInfo),
        bytes: Some(vec![1, 2, 3, 4]),
        bytes2: None,
        message: None,
        num: None,
    };
    let enc = encode(Some(&key), &info).unwrap();
    let dec = decode(Some(&key), enc).unwrap();
    println!("Decoded: {:?}", dec);
}

