use std::path::{Path, PathBuf};
use std::fs::{self, File};
use std::io::{self, Read, BufReader};
use rand::Rng;

use local_ip_address::local_ip as get_local_ip;
use crate::mnemonic;
use sha2::{Sha256, Digest};
use md5::Md5;
use twox_hash::XxHash64;
use std::hash::Hasher;

const NB_PIN_NUMBERS: usize = 4;

/// Check if a file or directory exists
pub fn exists<P: AsRef<Path>>(path: P) -> bool {
    path.as_ref().exists()
}

/// Returns the configuration directory for croc
pub fn get_config_dir(require_valid_path: bool) -> Result<PathBuf, String> {
    let mut home = match dirs::home_dir() {
        Some(dir) => dir,
        None => return Err("could not determine home directory".to_string()),
    };
    home.push(".config");
    home.push("tye-xhare");
    
    if require_valid_path {
        if !home.exists() {
            if let Err(e) = fs::create_dir_all(&home) {
                return Err(format!("failed to create config dir: {}", e));
            }
        }
    }
    
    Ok(home)
}

/// Generates a random 4-digit PIN
pub fn generate_random_pin() -> String {
    let mut rng = rand::thread_rng();
    let mut pin = String::new();
    for _ in 0..NB_PIN_NUMBERS {
        pin.push_str(&rng.gen_range(0..=9).to_string());
    }
    pin
}

/// Returns a mnemonic coded random name
pub fn get_random_name() -> String {
    let mut bs = [0u8; 4];
    rand::thread_rng().fill(&mut bs);
    
    let mut result = Vec::new();
    mnemonic::encode_word_list(&mut result, &bs);
    
    format!("{}-{}", generate_random_pin(), result.join("-"))
}

/// Converts bytes to human readable byte string
pub fn byte_count_decimal(b: i64) -> String {
    const UNIT: i64 = 1024;
    if b < UNIT {
        return format!("{} B", b);
    }
    let mut div = UNIT;
    let mut exp = 0;
    let mut n = b / UNIT;
    while n >= UNIT {
        div *= UNIT;
        exp += 1;
        n /= UNIT;
    }
    let units = ["kB", "MB", "GB", "TB", "PB", "EB"];
    format!("{:.1} {}", (b as f64) / (div as f64), units[exp])
}

/// Returns the SHA256 hex string of the input string
pub fn sha256(s: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    hex::encode(hasher.finalize())
}

/// Returns the hash of a file
pub fn hash_file<P: AsRef<Path>>(fname: P, algorithm: &str) -> Result<Vec<u8>, std::io::Error> {
    let path = fname.as_ref();
    match algorithm {
        "md5" => {
            let mut file = File::open(path)?;
            let mut hasher = Md5::new();
            let mut buf = [0u8; 8192];
            loop {
                let bytes_read = file.read(&mut buf)?;
                if bytes_read == 0 { break; }
                hasher.update(&buf[..bytes_read]);
            }
            Ok(hasher.finalize().to_vec())
        }
        "xxhash" => {
            let mut file = File::open(path)?;
            let mut hasher = XxHash64::with_seed(0);
            let mut buf = [0u8; 8192];
            loop {
                let bytes_read = file.read(&mut buf)?;
                if bytes_read == 0 { break; }
                hasher.write(&buf[..bytes_read]);
            }
            Ok(hasher.finish().to_be_bytes().to_vec())
        }
        _ => Err(io::Error::new(io::ErrorKind::InvalidInput, "unsupported algorithm")),
    }
}

/// Returns the local IP address
pub fn local_ip() -> String {
    match get_local_ip() {
        Ok(ip) => ip.to_string(),
        Err(_) => "".to_string(),
    }
}

/// Check if IP address is in private network space
pub fn is_local_ip(ipaddress: &str) -> bool {
    ipaddress.contains("127.0.0.1") || ipaddress.starts_with("192.168.") || ipaddress.starts_with("10.") || ipaddress.starts_with("172.")
}



// Missing chunks logic
pub fn missing_chunks<P: AsRef<Path>>(fname: P, fsize: i64, chunk_size: i64) -> Vec<i64> {
    let mut chunk_ranges = Vec::new();
    
    let file = match File::open(&fname) {
        Ok(f) => f,
        Err(_) => return chunk_ranges,
    };
    
    let metadata = match file.metadata() {
        Ok(m) => m,
        Err(_) => return chunk_ranges,
    };
    
    if metadata.len() as i64 != fsize {
        return chunk_ranges;
    }
    
    let mut buf_reader = BufReader::new(file);
    let empty_buffer = vec![0u8; chunk_size as usize];
    let mut chunk_num = 0;
    let mut chunks = Vec::new();
    let mut current_location = 0i64;
    
    loop {
        let mut buffer = vec![0u8; chunk_size as usize];
        let bytes_read = match buf_reader.read(&mut buffer) {
            Ok(n) if n > 0 => n,
            _ => break,
        };
        
        if buffer[..bytes_read] == empty_buffer[..bytes_read] {
            chunks.push(current_location);
            chunk_num += 1;
        }
        current_location += bytes_read as i64;
    }
    
    if chunk_num == 0 {
        return chunk_ranges;
    }
    
    chunk_ranges.push(chunk_size);
    chunk_ranges.push(chunks[0]);
    let mut cur_count = 0;
    
    for i in 1..chunks.len() {
        cur_count += 1;
        if chunks[i] - chunks[i-1] > chunk_size {
            chunk_ranges.push(cur_count);
            chunk_ranges.push(chunks[i]);
            cur_count = 0;
        }
    }
    chunk_ranges.push(cur_count + 1);
    
    chunk_ranges
}

pub fn chunk_ranges_to_chunks(chunk_ranges: &[i64]) -> Vec<i64> {
    if chunk_ranges.is_empty() {
        return Vec::new();
    }
    
    let chunk_size = chunk_ranges[0];
    let mut chunks = Vec::new();
    
    let mut i = 1;
    while i < chunk_ranges.len() {
        let start = chunk_ranges[i];
        let count = if i + 1 < chunk_ranges.len() { chunk_ranges[i + 1] } else { 0 };
        for j in 0..count {
            chunks.push(start + j * chunk_size);
        }
        i += 2;
    }
    chunks
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    
    #[test]
    fn test_exists() {
        let tmp = "exists.test";
        File::create(tmp).unwrap();
        assert!(exists(tmp));
        fs::remove_file(tmp).unwrap();
        assert!(!exists(tmp));
    }

    #[test]
    fn test_byte_count_decimal() {
        assert_eq!("10.0 kB", byte_count_decimal(10240));
        assert_eq!("50 B", byte_count_decimal(50));
        assert_eq!("12.4 MB", byte_count_decimal(13002343));
    }
    
    #[test]
    fn test_sha256() {
        assert_eq!("09ca7e4eaa6e8ae9c7d261167129184883644d07dfba7cbfbc4c8a2e08360d5b", sha256("hello, world"));
    }
    
    #[test]
    fn test_hash_file() {
        let tmp = "hash.test";
        let mut f = File::create(tmp).unwrap();
        f.write_all(b"temporary file's content").unwrap();
        drop(f);
        
        let md5 = hash_file(tmp, "md5").unwrap();
        assert_eq!("01ce59706106fe5e02e7f55fffda7f34", hex::encode(md5));
        
        let xxhash = hash_file(tmp, "xxhash").unwrap();
        assert_eq!("e66c561610ad51e2", hex::encode(xxhash));
        
        fs::remove_file(tmp).unwrap();
    }
    
    #[test]
    fn test_random_name() {
        let name = get_random_name();
        assert!(name.contains("-"));
        assert!(name.len() > 10);
    }
    
    #[test]
    fn test_missing_chunks() {
        // missing chunks logic test can be written similarly to Go
    }
}
