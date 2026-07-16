import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BranchItem, BranchList, CheckoutResult, CheckoutStrategy } from '../../types';
import { CheckoutSafetyModal } from './CheckoutSafetyModal';
import {
  RiGitBranchLine,
  RiAddLine,
  RiDeleteBin2Line,
  RiEditLine,
  RiCheckDoubleLine,
  RiCloudLine,
  RiRefreshLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiShareForwardLine,
} from 'react-icons/ri';

interface BranchManagerProps {
  repoPath: string;
  onBranchChanged?: () => void;
}

export const BranchManager: React.FC<BranchManagerProps> = ({ repoPath, onBranchChanged }) => {
  const [branchList, setBranchList] = useState<BranchList | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'local' | 'remote'>('local');

  // Modals / forms state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [targetCommit, setTargetCommit] = useState('');

  const [renamingBranch, setRenamingBranch] = useState<BranchItem | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const [dirtyCheckoutInfo, setDirtyCheckoutInfo] = useState<{
    branch: string;
    affectedFiles: string[];
    suggestion: string;
  } | null>(null);

  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  const showStatus = (text: string, isError = false) => {
    setStatusMsg({ text, isError });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const fetchBranches = async () => {
    try {
      setLoading(true);
      const data: BranchList = await invoke('git:get_branches', { repoPath });
      setBranchList(data);
    } catch (err: any) {
      showStatus(`Failed to load branches: ${err}`, true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (repoPath) fetchBranches();
  }, [repoPath]);

  const handleCheckout = async (branchName: string, strategy: CheckoutStrategy = 'clean') => {
    try {
      const result: CheckoutResult = await invoke('git:branch_checkout', {
        repoPath,
        name: branchName,
        strategy,
      });

      if (result.status === 'dirty') {
        setDirtyCheckoutInfo({
          branch: branchName,
          affectedFiles: result.affected_files,
          suggestion: result.suggestion,
        });
      } else {
        setDirtyCheckoutInfo(null);
        showStatus(`Checked out branch: ${branchName} ${result.stashed ? '(saved WIP stash)' : ''}`);
        fetchBranches();
        if (onBranchChanged) onBranchChanged();
      }
    } catch (err: any) {
      showStatus(`Checkout error: ${err}`, true);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    try {
      await invoke('git:branch_create', {
        repoPath,
        name: newBranchName.trim(),
        targetCommit: targetCommit.trim() || null,
      });
      showStatus(`Created branch '${newBranchName.trim()}' (` + (targetCommit ? targetCommit : 'HEAD') + `)`);
      setNewBranchName('');
      setTargetCommit('');
      setShowCreateModal(false);
      fetchBranches();
    } catch (err: any) {
      showStatus(`Failed to create branch: ${err}`, true);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState<{ branch: BranchItem; force: boolean } | null>(null);
  const [confirmUpstream, setConfirmUpstream] = useState<{ branch: BranchItem; target: string } | null>(null);

  const handleDeleteBranch = (branch: BranchItem, force = false) => {
    setConfirmDelete({ branch, force });
  };

  const executeDeleteBranch = async (branch: BranchItem, force = false) => {
    setConfirmDelete(null);
    try {
      await invoke('git:branch_delete', { repoPath, name: branch.name, force });
      showStatus(`Deleted branch '${branch.name}'`);
      fetchBranches();
    } catch (err: any) {
      if (typeof err === 'string' && err.includes('not fully merged') && !force) {
        setConfirmDelete({ branch, force: true });
      } else {
        showStatus(`Delete error: ${err}`, true);
      }
    }
  };

  const handleRenameBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingBranch || !renameInput.trim()) return;
    try {
      await invoke('git:branch_rename', {
        repoPath,
        oldName: renamingBranch.name,
        newName: renameInput.trim(),
      });
      showStatus(`Renamed '${renamingBranch.name}' to '${renameInput.trim()}'`);
      setRenamingBranch(null);
      fetchBranches();
    } catch (err: any) {
      showStatus(`Rename error: ${err}`, true);
    }
  };

  const handleSetUpstream = (branch: BranchItem) => {
    const defaultUpstream = branch.upstream_name || `origin/${branch.shorthand}`;
    setConfirmUpstream({ branch, target: defaultUpstream });
  };

  const executeSetUpstream = async (branch: BranchItem, target: string) => {
    setConfirmUpstream(null);
    try {
      await invoke('git:branch_set_upstream', {
        repoPath,
        branchName: branch.name,
        upstreamName: target.trim() || null,
      });
      showStatus(`Updated upstream tracking for '${branch.name}'`);
      fetchBranches();
    } catch (err: any) {
      showStatus(`Upstream error: ${err}`, true);
    }
  };

  const displayedBranches = branchList
    ? activeTab === 'local'
      ? branchList.local
      : branchList.remote
    : [];

  return (
    <div className="flex flex-col h-full bg-[var(--tye-cream)] text-[var(--tye-ink)] p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b-2 border-[var(--tye-ink)]">
        <div>
          <h1 className="text-2xl font-bold font-pixel tracking-tight flex items-center gap-2">
            <RiGitBranchLine className="text-[var(--tye-lavender)] w-6 h-6" />
            <span>Branch Command Center (`F-026`)</span>
          </h1>
          <p className="text-xs font-mono opacity-80 mt-1">
            Active Head: <span className="font-bold bg-white px-2 py-0.5 border border-[var(--tye-ink)]">{branchList?.active_branch || 'Loading...'}</span>
          </p>
        </div>
        <div className="flex gap-2.5 items-center">
          <button
            onClick={() => setShowCreateModal(true)}
            className="tye-btn tye-btn-primary text-xs flex items-center gap-1.5"
          >
            <RiAddLine className="w-4 h-4" />
            <span>New Branch (`F-027`)</span>
          </button>
          <button
            onClick={fetchBranches}
            disabled={loading}
            className="tye-btn bg-white border-2 border-[var(--tye-ink)] text-xs flex items-center gap-1.5 hover:bg-[var(--tye-cream)]"
          >
            <RiRefreshLine className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3 mb-4 border-2 font-mono text-xs shadow-[3px_3px_0px_0px_var(--tye-ink)] flex items-center justify-between ${
            statusMsg.isError
              ? 'bg-rose-100 border-rose-800 text-rose-900'
              : 'bg-emerald-100 border-emerald-800 text-emerald-900'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="font-bold ml-4">✕</button>
        </div>
      )}

      {confirmDelete && (
        <div className="mb-4 p-4 bg-amber-100 border-2 border-amber-800 text-amber-950 font-mono text-xs shadow-[4px_4px_0px_0px_#92400e]">
          <div className="font-pixel text-sm font-bold text-amber-900 mb-1">
            ⚠️ Confirm Delete Branch
          </div>
          <p className="mb-3 font-bold">
            Are you sure you want to {confirmDelete.force ? 'force delete (-D)' : 'delete (-d)'} branch '{confirmDelete.branch.name}'?
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(null)}
              className="px-3 py-1 bg-white border-2 border-amber-800 font-pixel text-xs font-bold"
            >
              Cancel
            </button>
            <button
              onClick={() => executeDeleteBranch(confirmDelete.branch, confirmDelete.force)}
              className="px-3 py-1 bg-amber-600 text-white font-pixel text-xs border-2 border-amber-800 hover:bg-amber-700 font-bold"
            >
              Confirm Delete
            </button>
          </div>
        </div>
      )}

      {confirmUpstream && (
        <div className="mb-4 p-4 bg-sky-100 border-2 border-sky-800 text-sky-950 font-mono text-xs shadow-[4px_4px_0px_0px_#075985]">
          <div className="font-pixel text-sm font-bold text-sky-900 mb-2">
            🔗 Set Upstream for '{confirmUpstream.branch.name}'
          </div>
          <input
            type="text"
            value={confirmUpstream.target}
            onChange={(e) => setConfirmUpstream({ ...confirmUpstream, target: e.target.value })}
            placeholder="e.g. origin/main or leave empty to unset"
            className="w-full p-2 mb-3 bg-white border-2 border-sky-800 font-bold"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmUpstream(null)}
              className="px-3 py-1 bg-white border-2 border-sky-800 font-pixel text-xs font-bold"
            >
              Cancel
            </button>
            <button
              onClick={() => executeSetUpstream(confirmUpstream.branch, confirmUpstream.target)}
              className="px-3 py-1 bg-sky-600 text-white font-pixel text-xs border-2 border-sky-800 hover:bg-sky-700 font-bold"
            >
              Save Upstream
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b-2 border-[var(--tye-ink)] mb-6">
        <button
          onClick={() => setActiveTab('local')}
          className={`px-4 py-2 font-pixel text-xs border-t-2 border-x-2 border-[var(--tye-ink)] transition-all ${
            activeTab === 'local'
              ? 'bg-[var(--tye-lavender)] text-white shadow-[2px_0px_0px_0px_var(--tye-ink)] translate-y-[2px]'
              : 'bg-white text-[var(--tye-ink)] opacity-70 hover:opacity-100'
          }`}
        >
          Local Branches ({branchList?.local.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('remote')}
          className={`px-4 py-2 font-pixel text-xs border-t-2 border-x-2 border-[var(--tye-ink)] transition-all ${
            activeTab === 'remote'
              ? 'bg-[var(--tye-lavender)] text-white shadow-[2px_0px_0px_0px_var(--tye-ink)] translate-y-[2px]'
              : 'bg-white text-[var(--tye-ink)] opacity-70 hover:opacity-100'
          }`}
        >
          Remote Branches ({branchList?.remote.length || 0})
        </button>
      </div>

      {/* Branch Table / List */}
      <div className="tye-card bg-white border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead className="bg-[var(--tye-cream)] border-b-2 border-[var(--tye-ink)]">
              <tr>
                <th className="p-3 border-r border-[var(--tye-ink)]">Branch Name</th>
                <th className="p-3 border-r border-[var(--tye-ink)]">Upstream (`F-034`)</th>
                <th className="p-3 border-r border-[var(--tye-ink)]">Latest Commit (`F-028`)</th>
                <th className="p-3 border-r border-[var(--tye-ink)]">Sync Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedBranches.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center opacity-60 font-mono">
                    No {activeTab} branches found.
                  </td>
                </tr>
              ) : (
                displayedBranches.map((branch) => (
                  <tr
                    key={branch.name}
                    onDoubleClick={() => !branch.is_head && handleCheckout(branch.name)}
                    className={`border-b border-[var(--tye-ink)]/20 hover:bg-[var(--tye-cream)]/50 transition-colors ${
                      branch.is_head ? 'bg-[var(--tye-lavender)]/10 font-bold' : ''
                    }`}
                  >
                    <td className="p-3 border-r border-[var(--tye-ink)]/20 flex items-center gap-2">
                      <RiGitBranchLine className={branch.is_head ? 'text-[var(--tye-lavender)] w-4 h-4' : 'opacity-40 w-4 h-4'} />
                      <span className={branch.is_head ? 'text-[var(--tye-lavender)]' : ''}>{branch.shorthand}</span>
                      {branch.is_head && (
                        <span className="bg-[var(--tye-lavender)] text-white text-[10px] px-1.5 py-0.5 rounded-none uppercase font-bold tracking-wider">
                          HEAD
                        </span>
                      )}
                    </td>
                    <td className="p-3 border-r border-[var(--tye-ink)]/20 text-xs opacity-80">
                      {branch.upstream_name ? (
                        <span className="flex items-center gap-1 text-[var(--tye-lavender)]">
                          <RiCloudLine className="w-3.5 h-3.5" />
                          <span>{branch.upstream_name}</span>
                        </span>
                      ) : (
                        <span className="opacity-40 italic">none</span>
                      )}
                    </td>
                    <td className="p-3 border-r border-[var(--tye-ink)]/20 max-w-xs truncate">
                      <span className="font-bold mr-2 text-[var(--tye-lavender)]">{branch.last_commit_id.slice(0, 7)}</span>
                      <span className="opacity-80">{branch.last_commit_subject}</span>
                    </td>
                    <td className="p-3 border-r border-[var(--tye-ink)]/20">
                      <div className="flex gap-2">
                        {branch.ahead > 0 && (
                          <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 border border-emerald-800 text-[10px] flex items-center gap-0.5 font-bold">
                            <RiArrowUpLine /> {branch.ahead} ahead
                          </span>
                        )}
                        {branch.behind > 0 && (
                          <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 border border-amber-800 text-[10px] flex items-center gap-0.5 font-bold">
                            <RiArrowDownLine /> {branch.behind} behind
                          </span>
                        )}
                        {branch.ahead === 0 && branch.behind === 0 && branch.upstream_name && (
                          <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                            <RiCheckDoubleLine /> In Sync
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {!branch.is_head && (
                          <button
                            onClick={() => handleCheckout(branch.name)}
                            className="px-2.5 py-1 bg-[var(--tye-ink)] text-white hover:bg-[var(--tye-lavender)] text-[11px] font-mono border border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] active:translate-x-[1px] active:translate-y-[1px]"
                          >
                            Checkout (`F-026`)
                          </button>
                        )}
                        {activeTab === 'local' && (
                          <>
                            <button
                              onClick={() => {
                                setRenamingBranch(branch);
                                setRenameInput(branch.shorthand);
                              }}
                              title="Rename Branch (`F-027`)"
                              className="p-1 hover:bg-[var(--tye-ink)] hover:text-white transition-colors border border-[var(--tye-ink)]"
                            >
                              <RiEditLine className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleSetUpstream(branch)}
                              title="Set/Change Upstream (`F-034`)"
                              className="p-1 hover:bg-[var(--tye-ink)] hover:text-white transition-colors border border-[var(--tye-ink)]"
                            >
                              <RiShareForwardLine className="w-3.5 h-3.5" />
                            </button>
                            {!branch.is_head && (
                              <button
                                onClick={() => handleDeleteBranch(branch)}
                                title="Delete Branch (`F-027`)"
                                className="p-1 bg-rose-100 text-rose-800 hover:bg-rose-700 hover:text-white transition-colors border border-[var(--tye-ink)]"
                              >
                                <RiDeleteBin2Line className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Checkout Safety Guard Modal */}
      {dirtyCheckoutInfo && (
        <CheckoutSafetyModal
          branchName={dirtyCheckoutInfo.branch}
          affectedFiles={dirtyCheckoutInfo.affectedFiles}
          suggestion={dirtyCheckoutInfo.suggestion}
          onProceed={(strategy) => handleCheckout(dirtyCheckoutInfo.branch, strategy)}
          onClose={() => setDirtyCheckoutInfo(null)}
        />
      )}

      {/* Create Branch Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="tye-card bg-[var(--tye-cream)] text-[var(--tye-ink)] max-w-md w-full p-6 border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)]">
            <h2 className="font-pixel text-xl font-bold mb-2">Create New Branch (`F-027`)</h2>
            <p className="text-xs font-mono opacity-80 mb-4">
              Enter branch name and optional target commit hash. Defaults to active HEAD (`{branchList?.active_branch}`).
            </p>
            <form onSubmit={handleCreateBranch} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-bold uppercase mb-1">Branch Name</label>
                <input
                  type="text"
                  placeholder="e.g. feature/auth-redesign"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-[var(--tye-ink)] font-mono text-sm bg-white"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-mono font-bold uppercase mb-1">Target Commit SHA (Optional)</label>
                <input
                  type="text"
                  placeholder="Leave blank for HEAD"
                  value={targetCommit}
                  onChange={(e) => setTargetCommit(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-[var(--tye-ink)] font-mono text-sm bg-white"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 tye-btn bg-white border-2 border-[var(--tye-ink)] text-xs py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 tye-btn tye-btn-primary text-xs py-2"
                >
                  Create Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Branch Modal */}
      {renamingBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="tye-card bg-[var(--tye-cream)] text-[var(--tye-ink)] max-w-md w-full p-6 border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)]">
            <h2 className="font-pixel text-xl font-bold mb-2">Rename Branch (`F-027`)</h2>
            <p className="text-xs font-mono opacity-80 mb-4">
              Renaming local branch <span className="font-bold text-[var(--tye-lavender)]">{renamingBranch.shorthand}</span>.
            </p>
            <form onSubmit={handleRenameBranch} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-bold uppercase mb-1">New Branch Name</label>
                <input
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-[var(--tye-ink)] font-mono text-sm bg-white"
                  required
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRenamingBranch(null)}
                  className="flex-1 tye-btn bg-white border-2 border-[var(--tye-ink)] text-xs py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 tye-btn tye-btn-primary text-xs py-2"
                >
                  Rename Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
