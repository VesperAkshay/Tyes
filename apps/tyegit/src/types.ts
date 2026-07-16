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

export interface DiffStats {
  insertions: number;
  deletions: number;
  files_changed: number;
}

export interface SubmoduleSummary {
  name: string;
  is_dirty: boolean;
  commits_ahead: number;
  commits_behind: number;
}

export interface FileStatus {
  path: string;
  old_path?: string;
  status: string;
  staged_status?: string;
  unstaged_status?: string;
  is_binary: boolean;
  size_bytes: number;
  diff_stats?: DiffStats;
}

export interface StatusResult {
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: FileStatus[];
  ignored: FileStatus[];
  conflicted: FileStatus[];
  submodule_summary: SubmoduleSummary[];
  total_staged_stats: DiffStats;
  total_unstaged_stats: DiffStats;
}

export type DiscardType = "Unstaged" | "Staged" | "Untracked" | "AllUnstaged";

export interface DiffLine {
  old_lineno?: number;
  new_lineno?: number;
  origin: string;
  content: string;
}

export interface DiffHunk {
  header: string;
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  lines: DiffLine[];
}

export interface DiffView {
  file_path: string;
  is_staged: boolean;
  is_binary: boolean;
  hunks: DiffHunk[];
  insertions: number;
  deletions: number;
}

export interface ImageDiff {
  file_path: string;
  old_data?: string;
  new_data?: string;
  width: number;
  height: number;
  format: string;
}

export interface CommitRequest {
  message: string;
  body?: string;
  amend: boolean;
  signoff: boolean;
  co_authors: string[];
  commit_type: string;
}

export interface CommitListItem {
  id: string;
  short_id: string;
  message_subject: string;
  author_name: string;
  timestamp: string;
  tags: string[];
  branches: string[];
}

export interface ChangedFile {
  path: string;
  status: string;
  insertions: number;
  deletions: number;
}

export interface CommitDetail {
  id: string;
  short_id: string;
  message_subject: string;
  message_body?: string;
  author_name: string;
  author_email: string;
  timestamp: string;
  parents: string[];
  changed_files: ChangedFile[];
  insertions: number;
  deletions: number;
}

export interface HookResult {
  hook_name: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  succeeded: boolean;
}

// --- Milestone 3 Types ---

export interface BranchItem {
  name: string;
  shorthand: string;
  is_head: boolean;
  is_remote: boolean;
  upstream_name?: string;
  last_commit_id: string;
  last_commit_subject: string;
  last_commit_time: number;
  ahead: number;
  behind: number;
}

export interface BranchList {
  local: BranchItem[];
  remote: BranchItem[];
  active_branch: string;
}

export type CheckoutStrategy = 'clean' | 'stash_and_checkout' | 'discard_and_checkout';

export type CheckoutResult =
  | { status: 'success'; branch: string; stashed: boolean }
  | { status: 'dirty'; affected_files: string[]; suggestion: string };

export interface GraphNode {
  id: string;
  short_id: string;
  subject: string;
  author_name: string;
  author_email: string;
  timestamp: number;
  lane: number;
  color: string;
  is_merge: boolean;
  is_head: boolean;
  parent_ids: string[];
  refs: string[];
}

export interface GraphEdge {
  from_id: string;
  to_id: string;
  from_lane: number;
  to_lane: number;
  color: string;
}

export interface GraphView {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type HistorySearchType = 'message' | 'author' | 'committer' | 'file_path' | 'pickaxe' | 'pickaxe_regex';

export interface HistorySearchQuery {
  query_type: HistorySearchType;
  value: string;
  branch?: string;
  all_branches: boolean;
  include_merges: boolean;
  limit?: number;
}

export interface RemoteItem {
  name: string;
  fetch_url: string;
  push_url: string;
}

export interface ConnectionTestResult {
  success: boolean;
  latency_ms: number;
  message: string;
}

export interface FetchResult {
  remote: string;
  commits_fetched: number;
  message: string;
}

export type PullStrategy = 'merge' | 'rebase' | 'ff_only';

export interface PullResult {
  strategy_used: string;
  fast_forwarded: boolean;
  commits_pulled: number;
  message: string;
}

export interface PushResult {
  remote: string;
  branch: string;
  forced: boolean;
  message: string;
}
