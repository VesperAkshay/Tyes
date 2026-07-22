use qrcodegen::{QrCode, QrCodeEcc};

pub fn generate_qr_svg(content: &str) -> Result<String, String> {
    let qr = QrCode::encode_text(content, QrCodeEcc::Medium)
        .map_err(|e| format!("Failed to generate QR code: {}", e))?;
    let size = qr.size();
    let border = 2;

    let total_size = size + border * 2;
    let mut svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}" stroke="none" width="100%" height="100%">"#,
        s = total_size
    );
    svg.push_str(r##"<rect width="100%" height="100%" fill="#EDE8DC"/>"##);
    svg.push_str(r##"<path d=""##);

    for y in 0..size {
        for x in 0..size {
            if qr.get_module(x, y) {
                let rx = x + border;
                let ry = y + border;
                svg.push_str(&format!("M{},{}h1v1h-1z ", rx, ry));
            }
        }
    }
    svg.push_str(r##"" fill="#1A1A1A"/>"##);
    svg.push_str("</svg>");

    Ok(svg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qr_generation() {
        let svg = generate_qr_svg("8492-apple-banana").unwrap();
        assert!(svg.contains("<svg"));
        assert!(svg.contains("#EDE8DC"));
        assert!(svg.contains("#1A1A1A"));
    }
}
