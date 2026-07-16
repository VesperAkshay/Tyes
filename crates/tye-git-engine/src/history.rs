use std::path::Path;
use serde::{Deserialize, Serialize};
use git2::{DiffOptions, Oid, Repository};
use crate::error::GitEngineError;
use crate::graph::{get_commit_graph, GraphNode};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HistorySearchType {
    Message,
    Author,
    Committer,
    FilePath,
    Pickaxe,
    PickaxeRegex,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistorySearchQuery {
    pub query_type: HistorySearchType,
    pub value: String,
    pub branch: Option<String>,
    pub all_branches: bool,
    pub include_merges: bool,
    pub limit: Option<usize>,
}

pub fn search_history(
    repo_path: &Path,
    query: HistorySearchQuery,
) -> Result<Vec<GraphNode>, GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    // Get topological graph view first
    let search_limit = query.limit.unwrap_or(2000);
    let branch_filter = if query.all_branches {
        None
    } else {
        query.branch.as_deref()
    };

    let graph = get_commit_graph(repo_path, search_limit, branch_filter, false)?;
    let val_lower = query.value.to_lowercase();

    let mut matched_nodes = Vec::new();

    for node in graph.nodes {
        if !query.include_merges && node.is_merge {
            continue;
        }

        let is_match = match query.query_type {
            HistorySearchType::Message => {
                if node.subject.to_lowercase().contains(&val_lower) {
                    true
                } else if let Ok(oid) = Oid::from_str(&node.id) {
                    if let Ok(commit) = repo.find_commit(oid) {
                        commit.message().unwrap_or("").to_lowercase().contains(&val_lower)
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            HistorySearchType::Author => {
                node.author_name.to_lowercase().contains(&val_lower)
                    || node.author_email.to_lowercase().contains(&val_lower)
            }
            HistorySearchType::Committer => {
                if let Ok(oid) = Oid::from_str(&node.id) {
                    if let Ok(commit) = repo.find_commit(oid) {
                        let c = commit.committer();
                        c.name().unwrap_or("").to_lowercase().contains(&val_lower)
                            || c.email().unwrap_or("").to_lowercase().contains(&val_lower)
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            HistorySearchType::FilePath => {
                if let Ok(oid) = Oid::from_str(&node.id) {
                    commit_touches_path(&repo, oid, &query.value)
                } else {
                    false
                }
            }
            HistorySearchType::Pickaxe | HistorySearchType::PickaxeRegex => {
                if let Ok(oid) = Oid::from_str(&node.id) {
                    commit_matches_pickaxe(&repo, oid, &query.value, query.query_type == HistorySearchType::PickaxeRegex)
                } else {
                    false
                }
            }
        };

        if is_match {
            matched_nodes.push(node);
        }
    }

    Ok(matched_nodes)
}

fn commit_touches_path(repo: &Repository, oid: Oid, path_filter: &str) -> bool {
    let commit = match repo.find_commit(oid) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let tree = match commit.tree() {
        Ok(t) => t,
        Err(_) => return false,
    };

    let parent_tree = if let Ok(parent) = commit.parent(0) {
        parent.tree().ok()
    } else {
        None
    };

    let mut diff_opts = DiffOptions::new();
    diff_opts.pathspec(path_filter);

    if let Ok(diff) = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut diff_opts)) {
        diff.deltas().count() > 0
    } else {
        false
    }
}

fn commit_matches_pickaxe(repo: &Repository, oid: Oid, pattern: &str, is_regex: bool) -> bool {
    let commit = match repo.find_commit(oid) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let tree = match commit.tree() {
        Ok(t) => t,
        Err(_) => return false,
    };

    let parent_tree = if let Ok(parent) = commit.parent(0) {
        parent.tree().ok()
    } else {
        None
    };

    let mut diff = match repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None) {
        Ok(d) => d,
        Err(_) => return false,
    };

    let mut matched = false;
    let pat_lower = pattern.to_lowercase();

    let _ = diff.find_similar(None);
    let _ = diff.print(git2::DiffFormat::Patch, |_, _, line| {
        if matched {
            return true;
        }
        let origin = line.origin();
        if origin == '+' || origin == '-' {
            if let Ok(content) = std::str::from_utf8(line.content()) {
                if is_regex {
                    if let Ok(re) = regex::Regex::new(pattern) {
                        if re.is_match(content) {
                            matched = true;
                        }
                    }
                } else if content.to_lowercase().contains(&pat_lower) {
                    matched = true;
                }
            }
        }
        true
    });

    matched
}
