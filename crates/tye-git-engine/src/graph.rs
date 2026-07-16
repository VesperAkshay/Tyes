use std::collections::HashMap;
use std::path::Path;
use serde::{Deserialize, Serialize};
use git2::{Oid, Repository, Sort};
use crate::error::GitEngineError;

const POSTER_PALETTE: &[&str] = &[
    "#8B85C4", // lavender
    "#D9A441", // mustard
    "#5C9EAD", // teal accent
    "#D17B88", // rose accent
    "#6D98BA", // steel blue
    "#A3B18A", // sage green
    "#E07A5F", // terracotta
    "#3D405B", // deep ink/navy
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GraphNode {
    pub id: String,
    pub short_id: String,
    pub subject: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub lane: usize,
    pub color: String,
    pub is_merge: bool,
    pub is_head: bool,
    pub parent_ids: Vec<String>,
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GraphEdge {
    pub from_id: String,
    pub to_id: String,
    pub from_lane: usize,
    pub to_lane: usize,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphView {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

pub fn get_commit_graph(
    repo_path: &Path,
    limit: usize,
    branch_filter: Option<&str>,
    first_parent_only: bool,
) -> Result<GraphView, GitEngineError> {
    let repo = Repository::open(repo_path)
        .map_err(|_| GitEngineError::NotAGitRepo(repo_path.display().to_string()))?;

    // Collect all refs mapped to OIDs
    let mut ref_map: HashMap<Oid, Vec<String>> = HashMap::new();
    let mut head_oid: Option<Oid> = None;

    if let Ok(head) = repo.head() {
        if let Some(target) = head.target() {
            head_oid = Some(target);
            if let Some(shorthand) = head.shorthand() {
                if head.is_branch() {
                    ref_map.entry(target).or_default().push(format!("HEAD -> {}", shorthand));
                } else {
                    ref_map.entry(target).or_default().push("HEAD".to_string());
                }
            }
        }
    }

    if let Ok(refs) = repo.references() {
        for reference_res in refs {
            if let Ok(reference) = reference_res {
                if reference.is_branch() || reference.is_remote() || reference.is_tag() {
                    if let Some(target) = reference.target() {
                        let shorthand = reference.shorthand().unwrap_or("").to_string();
                        if !shorthand.is_empty() {
                            let label = if reference.is_tag() {
                                format!("tag: {}", shorthand)
                            } else {
                                shorthand
                            };
                            let list = ref_map.entry(target).or_default();
                            if !list.contains(&label) && !label.starts_with("HEAD ->") {
                                list.push(label);
                            }
                        }
                    }
                }
            }
        }
    }

    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;

    if let Some(filter) = branch_filter {
        if !filter.is_empty() && filter != "ALL" {
            let _ = revwalk.push_ref(filter).or_else(|_| {
                if let Ok(oid) = Oid::from_str(filter) {
                    revwalk.push(oid)
                } else {
                    Err(git2::Error::from_str("Invalid ref/branch filter"))
                }
            });
        } else {
            push_all_branches(&repo, &mut revwalk)?;
        }
    } else {
        push_all_branches(&repo, &mut revwalk)?;
    }

    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut active_lanes: Vec<Option<Oid>> = Vec::new();

    let mut count = 0;
    for oid_res in revwalk {
        if count >= limit {
            break;
        }
        let oid = match oid_res {
            Ok(o) => o,
            Err(_) => continue,
        };

        let commit = match repo.find_commit(oid) {
            Ok(c) => c,
            Err(_) => continue,
        };

        count += 1;

        // Find first lane where this commit is scheduled, clearing any duplicate slots
        let lane = match active_lanes.iter().position(|slot| *slot == Some(oid)) {
            Some(pos) => {
                // Clear any duplicate slots that also pointed to this commit from other merges/forks
                for i in (pos + 1)..active_lanes.len() {
                    if active_lanes[i] == Some(oid) {
                        active_lanes[i] = None;
                    }
                }
                pos
            }
            None => {
                // Allocate first available None slot or push new lane
                match active_lanes.iter().position(|slot| slot.is_none()) {
                    Some(pos) => {
                        active_lanes[pos] = Some(oid);
                        pos
                    }
                    None => {
                        active_lanes.push(Some(oid));
                        active_lanes.len() - 1
                    }
                }
            }
        };

        let color = POSTER_PALETTE[lane % POSTER_PALETTE.len()].to_string();

        let parent_oids: Vec<Oid> = if first_parent_only {
            commit.parent_ids().take(1).collect()
        } else {
            commit.parent_ids().collect()
        };

        let is_merge = parent_oids.len() > 1;
        let is_head = Some(oid) == head_oid;

        let short_id = commit.id().to_string().chars().take(7).collect();
        let subject = commit.summary().unwrap_or("").to_string();
        let author = commit.author();
        let author_name = author.name().unwrap_or("").to_string();
        let author_email = author.email().unwrap_or("").to_string();
        let timestamp = commit.time().seconds();

        let refs = ref_map.get(&oid).cloned().unwrap_or_default();
        let parent_ids_str: Vec<String> = parent_oids.iter().map(|o| o.to_string()).collect();

        nodes.push(GraphNode {
            id: oid.to_string(),
            short_id,
            subject,
            author_name,
            author_email,
            timestamp,
            lane,
            color: color.clone(),
            is_merge,
            is_head,
            parent_ids: parent_ids_str,
            refs,
        });

        // Update active_lanes and create edges for parents
        if parent_oids.is_empty() {
            active_lanes[lane] = None;
        } else {
            let primary_parent = parent_oids[0];
            // Check if primary parent is ALREADY tracked at some other lane (e.g. from an earlier branch fork)
            let existing_primary_lane = active_lanes.iter().position(|slot| *slot == Some(primary_parent));
            match existing_primary_lane {
                Some(existing_lane) => {
                    // This commit merges into an already tracked parent lane
                    edges.push(GraphEdge {
                        from_id: oid.to_string(),
                        to_id: primary_parent.to_string(),
                        from_lane: lane,
                        to_lane: existing_lane,
                        color: color.clone(),
                    });
                    if existing_lane != lane {
                        active_lanes[lane] = None;
                    }
                }
                None => {
                    // Primary parent inherits current lane
                    active_lanes[lane] = Some(primary_parent);
                    edges.push(GraphEdge {
                        from_id: oid.to_string(),
                        to_id: primary_parent.to_string(),
                        from_lane: lane,
                        to_lane: lane,
                        color: color.clone(),
                    });
                }
            }

            // Handle secondary parents (merges)
            for &sec_parent in parent_oids.iter().skip(1) {
                let sec_lane = match active_lanes.iter().position(|slot| *slot == Some(sec_parent)) {
                    Some(pos) => pos,
                    None => {
                        match active_lanes.iter().position(|slot| slot.is_none()) {
                            Some(pos) => {
                                active_lanes[pos] = Some(sec_parent);
                                pos
                            }
                            None => {
                                active_lanes.push(Some(sec_parent));
                                active_lanes.len() - 1
                            }
                        }
                    }
                };

                let sec_color = POSTER_PALETTE[sec_lane % POSTER_PALETTE.len()].to_string();
                edges.push(GraphEdge {
                    from_id: oid.to_string(),
                    to_id: sec_parent.to_string(),
                    from_lane: lane,
                    to_lane: sec_lane,
                    color: sec_color,
                });
            }
        }
    }

    // Clean up empty trailing slots from active_lanes
    while active_lanes.last() == Some(&None) {
        active_lanes.pop();
    }

    Ok(GraphView { nodes, edges })
}

fn push_all_branches(repo: &Repository, revwalk: &mut git2::Revwalk) -> Result<(), git2::Error> {
    let _ = revwalk.push_head();
    if let Ok(branches) = repo.branches(None) {
        for branch_res in branches {
            if let Ok((branch, _)) = branch_res {
                if let Some(target) = branch.get().target() {
                    let _ = revwalk.push(target);
                }
            }
        }
    }
    Ok(())
}
