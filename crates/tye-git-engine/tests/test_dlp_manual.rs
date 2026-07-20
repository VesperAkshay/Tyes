#[test]
fn test_dlp_detection() {
    let diff = r#"
--- /dev/null
+++ b/aws-config.txt
@@ -0,0 +1,2 @@
+aws_access_key_id = AKIAIOSFODNN7EXAMPLE
+aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
"#;

    let scanner = tye_git_engine::enterprise::DlpScanner { enabled: true };
    match scanner.scan_diff(diff) {
        Ok(_) => panic!("DLP PASSED (this is bad, it should have failed!)"),
        Err(e) => println!("DLP FAILED AS EXPECTED:\n{}", e),
    }
}
