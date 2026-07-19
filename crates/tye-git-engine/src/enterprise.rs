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
        
        let forbidden_patterns = [
            "AKIA", // AWS key prefix
            "-----BEGIN PRIVATE KEY-----", // Private key
            "github_pat_", // GitHub PAT
        ];

        for pattern in forbidden_patterns.iter() {
            if diff_text.contains(pattern) {
                return Err(format!("DLP Violation: Found potential secret matching '{}'", pattern));
            }
        }
        
        Ok(())
    }
}
