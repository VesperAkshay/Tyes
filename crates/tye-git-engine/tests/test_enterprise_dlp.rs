#[test]
fn test_dlp_scanner_blocks_aws_secret() {
    let diff = r#"
--- /dev/null
+++ b/aws-config.txt
@@ -0,0 +1,2 @@
+aws_access_key_id = AKIAIOSFODNN7EXAMPLE
+aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
"#;

    let scanner = tye_git_engine::enterprise::DlpScanner { enabled: true };
    let result = scanner.scan_diff(diff);
    
    assert!(result.is_err(), "DLP Scanner should have blocked the AWS credentials");
    let error_msg = result.unwrap_err();
    assert!(error_msg.contains("DLP Violation: Found"), "Error message should mention DLP Violation");
}

#[test]
fn test_dlp_scanner_allows_clean_code() {
    let diff = r#"
--- /dev/null
+++ b/main.rs
@@ -0,0 +1,3 @@
+fn main() {
+    println!("Hello, World!");
+}
"#;

    let scanner = tye_git_engine::enterprise::DlpScanner { enabled: true };
    let result = scanner.scan_diff(diff);
    
    assert!(result.is_ok(), "DLP Scanner should allow clean code");
}
