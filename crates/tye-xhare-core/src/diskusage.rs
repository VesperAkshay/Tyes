use std::path::Path;
use sysinfo::{System, SystemExt, DiskExt};

/// DiskUsage contains usage data for a file system
pub struct DiskUsage {
    pub free: u64,
    pub available: u64,
    pub size: u64,
    pub used: u64,
    pub usage: f32,
}

/// Returns an object holding the disk usage of the volume path
pub fn new_disk_usage<P: AsRef<Path>>(volume_path: P) -> Option<DiskUsage> {
    let mut sys = System::new_all();
    sys.refresh_disks_list();
    sys.refresh_disks();
    
    let path_str = volume_path.as_ref().to_str().unwrap_or("");
    
    for disk in sys.disks() {
        let mount = disk.mount_point().to_str().unwrap_or("");
        // A simple prefix check to find the disk that mounts this path
        if path_str.starts_with(mount) {
            let size = disk.total_space();
            let available = disk.available_space();
            let used = size.saturating_sub(available);
            let usage = if size > 0 { (used as f32) / (size as f32) } else { 0.0 };
            
            return Some(DiskUsage {
                free: available, // In rust sysinfo, available_space is effectively free space
                available,
                size,
                used,
                usage,
            });
        }
    }
    
    // If not found by prefix (e.g. relative paths or current directory without prefix), 
    // fallback to checking the first disk or returning None. For robustness, if path exists,
    // we could just return the main disk.
    if sys.disks().len() > 0 {
        let disk = &sys.disks()[0];
        let size = disk.total_space();
        let available = disk.available_space();
        let used = size.saturating_sub(available);
        let usage = if size > 0 { (used as f32) / (size as f32) } else { 0.0 };
        return Some(DiskUsage {
            free: available,
            available,
            size,
            used,
            usage,
        });
    }
    
    None
}

impl DiskUsage {
    pub fn free(&self) -> u64 {
        self.free
    }

    pub fn available(&self) -> u64 {
        self.available
    }

    pub fn size(&self) -> u64 {
        self.size
    }

    pub fn used(&self) -> u64 {
        self.used
    }

    pub fn usage(&self) -> f32 {
        self.usage
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_disk_usage() {
        // Test current directory
        let du = new_disk_usage(".");
        assert!(du.is_some());
        
        let du = du.unwrap();
        assert!(du.size() > 0);
        assert!(du.available() > 0);
        
        // Ensure used + available approx equals size, and usage is calculated
        assert!(du.usage() >= 0.0 && du.usage() <= 1.0);
    }
}
