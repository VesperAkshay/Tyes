use std::path::Path;

pub struct BranchPolicy {
    pub require_issue_id: bool,
    pub enforce_no_force_push: bool,
}

impl BranchPolicy {
    pub fn is_branch_name_valid(&self, branch_name: &str) -> bool {
        if self.require_issue_id {
            // Very simple check: must contain a dash and numbers, e.g. feat/123-foo
            branch_name.contains("-") && branch_name.chars().any(|c| c.is_digit(10))
        } else {
            true
        }
    }
}

pub struct DlpScanner {
    pub enabled: bool,
}

impl DlpScanner {
    pub fn scan_diff(&self, diff_text: &str) -> Result<(), String> {
        if !self.enabled {
            return Ok(());
        }
        
        // Use secrets_scanner
        use secrets_scanner::{ScanConfig, Scanner};
        let scanner = Scanner::from_bundled()
            .map_err(|e| format!("Failed to initialize secret scanner: {}", e))?
            .with_config(ScanConfig::proxy());
            
        let matches = scanner.scan_proxy(diff_text.as_bytes())
            .map_err(|e| format!("Scanner error: {}", e))?;
            
        if !matches.findings.is_empty() {
            return Err(format!("DLP Violation: Found {} potential secret(s) in commit diff. Please remove them or disable the DLP scanner.", matches.findings.len()));
        }
        
        Ok(())
    }
}
