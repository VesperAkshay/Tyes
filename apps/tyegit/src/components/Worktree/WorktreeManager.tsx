import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiAddLine, RiDeleteBinLine, RiLockLine, RiLockUnlockLine, RiGitBranchLine } from 'react-icons/ri';

interface WorktreeInfo {
  name: string;
  path: string;
  is_locked: boolean;
  is_prunable: boolean;
}

interface WorktreeManagerProps {
  repoPath: string;
}

export const WorktreeManager: React.FC<WorktreeManagerProps> = ({ repoPath }) => {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorktrees = async () => {
    try {
      setLoading(true);
      setError(null);
      const data: WorktreeInfo[] = await invoke('git:worktree_list', { repoPath });
      setWorktrees(data);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorktrees();
  }, [repoPath]);

  const handleAdd = async () => {
    // Basic implementation; a modal is better for the actual product to ask for branch & path
    const name = prompt("Enter new worktree name/branch:");
    if (!name) return;
    const path = prompt("Enter absolute path for new worktree:");
    if (!path) return;

    try {
      await invoke('git:worktree_add', { repoPath, name, path });
      fetchWorktrees();
    } catch (err: any) {
      alert(`Failed to add worktree: ${err}`);
    }
  };

  const handleRemove = async (name: string) => {
    if (!confirm(`Are you sure you want to remove worktree '${name}'?`)) return;
    try {
      await invoke('git:worktree_remove', { repoPath, name });
      fetchWorktrees();
    } catch (err: any) {
      alert(`Failed to remove worktree: ${err}`);
    }
  };

  const handleToggleLock = async (wt: WorktreeInfo) => {
    try {
      if (wt.is_locked) {
        await invoke('git:worktree_unlock', { repoPath, name: wt.name });
      } else {
        const reason = prompt("Enter lock reason:");
        if (!reason) return;
        await invoke('git:worktree_lock', { repoPath, name: wt.name, reason });
      }
      fetchWorktrees();
    } catch (err: any) {
      alert(`Failed to toggle lock: ${err}`);
    }
  };

  if (loading) {
    return <div className="p-8 text-[var(--tye-ink)] font-mono">Loading Worktrees...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[var(--tye-cream)] p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6 border-b-2 border-[var(--tye-ink)] pb-4">
        <h2 className="font-pixel text-2xl text-[var(--tye-ink)]">Worktree Manager</h2>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-[var(--tye-lavender)] text-white hover:bg-[var(--tye-ink)] shadow-[2px_2px_0px_var(--tye-ink)] font-mono text-sm font-bold flex items-center gap-2 transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <RiAddLine /> Add Worktree
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-900 border-2 border-red-900 font-mono text-sm shadow-[2px_2px_0px_red]">
          {error}
        </div>
      )}

      {worktrees.length === 0 ? (
        <div className="text-gray-500 font-mono text-sm">No additional worktrees found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {worktrees.map((wt, i) => (
            <div key={i} className="border-2 border-[var(--tye-ink)] bg-white p-4 shadow-[4px_4px_0px_var(--tye-ink)] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold font-mono text-lg text-[var(--tye-ink)]">
                  <RiGitBranchLine className="text-[var(--tye-lavender)]" />
                  {wt.name || 'Main Repository'}
                </div>
                {wt.is_locked && <RiLockLine className="text-amber-600" title="Locked" />}
              </div>
              <div className="font-mono text-xs text-gray-600 break-all bg-gray-100 p-2 border border-gray-300">
                {wt.path}
              </div>
              
              {wt.name && ( // Only allow actions on linked worktrees, not the main repo which may show up depending on libgit2 implementation
                <div className="flex items-center justify-end gap-2 mt-auto pt-2">
                  <button
                    onClick={() => handleToggleLock(wt)}
                    className="p-2 border border-[var(--tye-ink)] hover:bg-gray-100 transition-colors"
                    title={wt.is_locked ? "Unlock" : "Lock"}
                  >
                    {wt.is_locked ? <RiLockUnlockLine /> : <RiLockLine />}
                  </button>
                  <button
                    onClick={() => handleRemove(wt.name)}
                    className="p-2 border border-[var(--tye-ink)] bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                    title="Remove Worktree"
                  >
                    <RiDeleteBinLine />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
