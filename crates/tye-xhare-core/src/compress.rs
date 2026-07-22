use flate2::write::{DeflateEncoder, DeflateDecoder};
use flate2::Compression;
use std::io::Write;

/// Compresses data using the specified level.
pub fn compress_with_option(src: &[u8], level: u32) -> Vec<u8> {
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::new(level));
    if let Err(e) = encoder.write_all(src) {
        // Log error in a real app, but here we just return the uncompressed or partial data
        // For parity, if it fails we might return empty, but let's safely return empty on error
        eprintln!("error writing data: {}", e);
        return Vec::new();
    }
    encoder.finish().unwrap_or_default()
}

/// Compress returns a compressed byte slice using fast compression.
pub fn compress(src: &[u8]) -> Vec<u8> {
    // In Go, flate.HuffmanOnly is used, which is fast. We use level 1 here.
    compress_with_option(src, 1)
}

/// Decompress returns a decompressed byte slice.
pub fn decompress(src: &[u8]) -> Vec<u8> {
    let mut decoder = DeflateDecoder::new(Vec::new());
    if let Err(e) = decoder.write_all(src) {
        eprintln!("error copying data: {}", e);
        return Vec::new();
    }
    decoder.finish().unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compress_decompress() {
        let msg = b"hello, world, hello, world, hello, world";
        let compressed = compress(msg);
        let decompressed = decompress(&compressed);
        
        assert_eq!(msg.as_slice(), decompressed.as_slice());
    }
}
