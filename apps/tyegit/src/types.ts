export interface RepositoryHandle {
  id: string;
  project_id: string;
  name: string;
  path: string;
  is_bare: boolean;
  auto_discovered: boolean;
  is_pinned: boolean;
  last_opened?: string;
  health_status: string;
}

export interface RepoCard {
  id: string;
  name: string;
  path: string;
  branch: string;
  last_commit_subject: string;
  uncommitted_count: number;
  ahead: number;
  behind: number;
  is_pinned: boolean;
  last_opened?: string;
  health_status: string;
}

export interface RepoGroup {
  id: string;
  name: string;
  repos: RepoCard[];
}

export type GitConfigLevel = "System" | "Global" | "Xdg" | "Local";

export interface GitConfigEntry {
  level: GitConfigLevel;
  key: string;
  value: string;
  is_critical: boolean;
}

export interface SshKey {
  path: string;
  public_path?: string;
  key_type: string;
  fingerprint: string;
  size_bits: number;
  is_weak: boolean;
  warning_message?: string;
}

export interface RepoHealth {
  is_valid: boolean;
  corruption_details?: string;
  disk_usage_bytes: number;
  object_count: number;
  large_files: string[];
}

export interface GitInstallation {
  path: string;
  version: string;
  is_portable: boolean;
  is_valid: boolean;
}
