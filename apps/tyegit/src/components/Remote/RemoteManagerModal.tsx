import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RemoteItem, ConnectionTestResult, FetchResult, PullStrategy, PullResult, PushResult } from '../../types';
import {
  RiCloudLine,
  RiAddLine,
  RiDeleteBin2Line,
  RiEditLine,
  RiSpeedUpLine,
  RiDownloadCloud2Line,
  RiUploadCloud2Line,
  RiCloseLine,
  RiRefreshLine,
  RiShieldCheckLine,
} from 'react-icons/ri';

interface RemoteManagerModalProps {
  repoPath: string;
  onClose: () => void;
}

export const RemoteManagerModal: React.FC<RemoteManagerModalProps> = ({ repoPath, onClose }) => {
  const [remotes, setRemotes] = useState<RemoteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({});
  const [testingRemote, setTestingRemote] = useState<string | null>(null);

  // Add Remote form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRemoteName, setNewRemoteName] = useState('origin');
  const [newRemoteUrl, setNewRemoteUrl] = useState('');

  // Edit form
  const [editingRemote, setEditingRemote] = useState<RemoteItem | null>(null);
  const [editUrl, setEditUrl] = useState('');

  // Pull / Push state
  const [actionModal, setActionModal] = useState<'fetch' | 'pull' | 'push' | null>(null);
  const [selectedRemoteName, setSelectedRemoteName] = useState<string>('origin');
  const [targetBranchName, setTargetBranchName] = useState<string>('main');
  const [pullStrategy, setPullStrategy] = useState<PullStrategy>('ff_only');
  const [pushForceLease, setPushForceLease] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const showStatus = (text: string, isError = false) => {
    setStatusMsg({ text, isError });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const fetchRemotes = async () => {
    try {
      setLoading(true);
      const items = await invoke<RemoteItem[]>('git:remote_list', { repoPath });
      setRemotes(items);
      if (items.length > 0 && !selectedRemoteName) {
        setSelectedRemoteName(items[0].name);
      }
    } catch (err: any) {
      showStatus(`Failed to load remotes: ${err}`, true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (repoPath) {
      fetchRemotes();
    }
  }, [repoPath]);

  const handleAddRemote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRemoteName.trim() || !newRemoteUrl.trim()) return;
    try {
      await invoke('git:remote_add', {
        repoPath,
        name: newRemoteName.trim(),
        url: newRemoteUrl.trim(),
      });
      showStatus(`Added remote '${newRemoteName.trim()}'`);
      setNewRemoteName('origin');
      setNewRemoteUrl('');
      setShowAddForm(false);
      fetchRemotes();
    } catch (err: any) {
      showStatus(`Failed to add remote: ${err}`, true);
    }
  };

  const handleRemoveRemote = (name: string) => {
    setConfirmRemove(name);
  };

  const executeRemoveRemote = async (name: string) => {
    setConfirmRemove(null);
    try {
      await invoke('git:remote_remove', { repoPath, name });
      showStatus(`Removed remote '${name}'`);
      fetchRemotes();
    } catch (err: any) {
      showStatus(`Failed to remove remote: ${err}`, true);
    }
  };

  const handleEditRemote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRemote || !editUrl.trim()) return;
    try {
      await invoke('git:remote_edit', {
        repoPath,
        name: editingRemote.name,
        newUrl: editUrl.trim(),
      });
      showStatus(`Updated URL for remote '${editingRemote.name}'`);
      setEditingRemote(null);
      fetchRemotes();
    } catch (err: any) {
      showStatus(`Failed to update URL: ${err}`, true);
    }
  };

  const handlePruneRemote = async (name: string) => {
    try {
      await invoke('git:remote_prune', { repoPath, name });
      showStatus(`Pruned stale remote branches on '${name}' (` + `F-033` + `)`);
    } catch (err: any) {
      showStatus(`Prune failed: ${err}`, true);
    }
  };

  const handleTestConnection = async (name: string) => {
    try {
      setTestingRemote(name);
      const result: ConnectionTestResult = await invoke('git:remote_test', { repoPath, name });
      setTestResults((prev) => ({ ...prev, [name]: result }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [name]: { success: false, latency_ms: 0, message: String(err) },
      }));
    } finally {
      setTestingRemote(null);
    }
  };

  const handleExecuteFetch = async () => {
    try {
      setActionLoading(true);
      const res: FetchResult = await invoke('git:remote_fetch', {
        repoPath,
        remoteName: selectedRemoteName || null,
        prune: true,
        tags: true,
      });
      showStatus(`Fetched ${res.commits_fetched} commits from ${res.remote}: ${res.message}`);
      setActionModal(null);
    } catch (err: any) {
      showStatus(`Fetch error: ${err}`, true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecutePull = async () => {
    try {
      setActionLoading(true);
      const res: PullResult = await invoke('git:branch_pull', {
        repoPath,
        remoteName: selectedRemoteName,
        branchName: targetBranchName.trim() || 'main',
        strategy: pullStrategy,
      });
      showStatus(`Pull complete (${res.strategy_used}): ${res.commits_pulled} commits pulled.`);
      setActionModal(null);
    } catch (err: any) {
      showStatus(`Pull error: ${err}`, true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecutePush = async () => {
    try {
      setActionLoading(true);
      const res: PushResult = await invoke('git:branch_push', {
        repoPath,
        remoteName: selectedRemoteName,
        branchName: targetBranchName.trim() || 'main',
        force: false,
        forceLease: pushForceLease,
        setUpstream: true,
      });
      showStatus(`Push complete to ${res.remote}/${res.branch} ${res.forced ? '(force-with-lease)' : ''}`);
      setActionModal(null);
    } catch (err: any) {
      showStatus(`Push error: ${err}`, true);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="tye-card bg-[var(--tye-cream)] text-[var(--tye-ink)] max-w-3xl w-full p-6 border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-[var(--tye-ink)] mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <RiCloudLine className="w-7 h-7 text-[var(--tye-lavender)]" />
            <div>
              <h2 className="font-pixel text-xl font-bold tracking-tight">
                Remote & Sync Command Center (`F-030` - `F-033`)
              </h2>
              <p className="text-xs font-mono opacity-80 mt-0.5">
                Manage Git remotes, test connection latency, prune stale branches, and execute Fetch/Pull/Push.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--tye-ink)] hover:text-white transition-colors border-2 border-transparent hover:border-[var(--tye-ink)]"
          >
            <RiCloseLine className="w-5 h-5" />
          </button>
        </div>

        {statusMsg && (
          <div
            className={`p-3 mb-4 border-2 font-mono text-xs shadow-[2px_2px_0px_0px_var(--tye-ink)] flex items-center justify-between ${
              statusMsg.isError
                ? 'bg-rose-100 border-rose-800 text-rose-900'
                : 'bg-emerald-100 border-emerald-800 text-emerald-900'
            }`}
          >
            <span>{statusMsg.text}</span>
            <button onClick={() => setStatusMsg(null)} className="font-bold ml-4">✕</button>
          </div>
        )}

        {confirmRemove && (
          <div className="mb-4 p-4 bg-amber-100 border-2 border-amber-800 text-amber-950 font-mono text-xs shadow-[4px_4px_0px_0px_#92400e]">
            <div className="font-pixel text-sm font-bold text-amber-900 mb-1">
              ⚠️ Confirm Remove Remote
            </div>
            <p className="mb-3 font-bold">
              Are you sure you want to remove remote '{confirmRemove}'?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemove(null)}
                className="px-3 py-1 bg-white border-2 border-amber-800 font-pixel text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => executeRemoveRemote(confirmRemove)}
                className="px-3 py-1 bg-amber-600 text-white font-pixel text-xs border-2 border-amber-800 hover:bg-amber-700 font-bold"
              >
                Confirm Remove
              </button>
            </div>
          </div>
        )}

        {/* Quick Action Bars */}
        <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b-2 border-[var(--tye-ink)]/30 flex-shrink-0">
          <button
            onClick={() => setActionModal('fetch')}
            className="tye-btn bg-white border-2 border-[var(--tye-ink)] text-xs flex items-center gap-1.5 hover:bg-[var(--tye-cream)]"
          >
            <RiRefreshLine className="w-4 h-4 text-[var(--tye-lavender)]" />
            <span>Fetch (`F-032`)</span>
          </button>
          <button
            onClick={() => setActionModal('pull')}
            className="tye-btn bg-white border-2 border-[var(--tye-ink)] text-xs flex items-center gap-1.5 hover:bg-[var(--tye-cream)]"
          >
            <RiDownloadCloud2Line className="w-4 h-4 text-emerald-600" />
            <span>Pull (`F-032`)</span>
          </button>
          <button
            onClick={() => setActionModal('push')}
            className="tye-btn bg-white border-2 border-[var(--tye-ink)] text-xs flex items-center gap-1.5 hover:bg-[var(--tye-cream)]"
          >
            <RiUploadCloud2Line className="w-4 h-4 text-amber-600" />
            <span>Push (`F-032`)</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowAddForm(true)}
            className="tye-btn tye-btn-primary text-xs flex items-center gap-1.5"
          >
            <RiAddLine className="w-4 h-4" />
            <span>Add Remote (`F-030`)</span>
          </button>
        </div>

        {/* Remotes List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <div className="p-8 text-center font-mono text-xs opacity-70">Loading configured remotes...</div>
          ) : remotes.length === 0 ? (
            <div className="p-8 text-center bg-white border-2 border-[var(--tye-ink)] font-mono text-xs opacity-70">
              No remote repositories configured yet. Click "Add Remote (`F-030`)" to attach a remote URL.
            </div>
          ) : (
            remotes.map((rem) => {
              const testRes = testResults[rem.name];
              const isTesting = testingRemote === rem.name;
              return (
                <div
                  key={rem.name}
                  className="bg-white border-2 border-[var(--tye-ink)] p-4 shadow-[3px_3px_0px_0px_var(--tye-ink)] flex flex-col gap-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-pixel font-bold text-sm bg-[var(--tye-lavender)] text-white px-2 py-0.5">
                        {rem.name}
                      </span>
                      <span className="font-mono text-xs text-[var(--tye-ink)]/80 truncate max-w-md">
                        {rem.fetch_url}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => handleTestConnection(rem.name)}
                        disabled={isTesting}
                        className="px-2.5 py-1 bg-[var(--tye-cream)] border border-[var(--tye-ink)] text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-[var(--tye-mustard)]/30 transition-colors"
                        title="Test Connection Latency (`F-031`)"
                      >
                        <RiSpeedUpLine className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                        <span>{isTesting ? 'Testing...' : 'Test Connection (`F-031`)'}</span>
                      </button>

                      <button
                        onClick={() => handlePruneRemote(rem.name)}
                        className="px-2.5 py-1 bg-[var(--tye-cream)] border border-[var(--tye-ink)] text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-[var(--tye-mustard)]/30 transition-colors"
                        title="Prune Stale Branches (`F-033`)"
                      >
                        <RiRefreshLine className="w-3.5 h-3.5" />
                        <span>Prune (`F-033`)</span>
                      </button>

                      <button
                        onClick={() => {
                          setEditingRemote(rem);
                          setEditUrl(rem.fetch_url);
                        }}
                        className="p-1 border border-[var(--tye-ink)] hover:bg-[var(--tye-ink)] hover:text-white transition-colors"
                        title="Edit Remote URL"
                      >
                        <RiEditLine className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleRemoveRemote(rem.name)}
                        className="p-1 border border-[var(--tye-ink)] bg-rose-100 text-rose-800 hover:bg-rose-600 hover:text-white transition-colors"
                        title="Remove Remote (`F-030`)"
                      >
                        <RiDeleteBin2Line className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Test Connection Result Box */}
                  {testRes && (
                    <div
                      className={`p-2 border font-mono text-xs flex items-center gap-2 ${
                        testRes.success
                          ? 'bg-emerald-50 border-emerald-700 text-emerald-900'
                          : 'bg-rose-50 border-rose-700 text-rose-900'
                      }`}
                    >
                      <RiShieldCheckLine className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1">{testRes.message}</span>
                      {testRes.success && (
                        <span className="font-bold bg-white px-1.5 py-0.5 border border-emerald-700 text-[10px]">
                          {testRes.latency_ms} ms
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Add Remote Sub-Modal */}
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="tye-card bg-[var(--tye-cream)] text-[var(--tye-ink)] max-w-md w-full p-6 border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)]">
              <h3 className="font-pixel text-lg font-bold mb-3">Add New Remote (`F-030`)</h3>
              <form onSubmit={handleAddRemote} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono font-bold uppercase mb-1">Remote Name</label>
                  <input
                    type="text"
                    value={newRemoteName}
                    onChange={(e) => setNewRemoteName(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-[var(--tye-ink)] font-mono text-sm bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold uppercase mb-1">URL (HTTPS / SSH)</label>
                  <input
                    type="text"
                    placeholder="e.g. git@github.com:user/repo.git"
                    value={newRemoteUrl}
                    onChange={(e) => setNewRemoteUrl(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-[var(--tye-ink)] font-mono text-sm bg-white"
                    required
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 tye-btn bg-white border-2 border-[var(--tye-ink)] text-xs py-2"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 tye-btn tye-btn-primary text-xs py-2">
                    Save Remote
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Remote Sub-Modal */}
        {editingRemote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="tye-card bg-[var(--tye-cream)] text-[var(--tye-ink)] max-w-md w-full p-6 border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)]">
              <h3 className="font-pixel text-lg font-bold mb-3">Edit Remote URL (`F-030`)</h3>
              <form onSubmit={handleEditRemote} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono font-bold uppercase mb-1">Remote Name</label>
                  <input
                    type="text"
                    value={editingRemote.name}
                    disabled
                    className="w-full px-3 py-2 border-2 border-[var(--tye-ink)] font-mono text-sm bg-gray-100 opacity-70 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold uppercase mb-1">New Fetch/Push URL</label>
                  <input
                    type="text"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-[var(--tye-ink)] font-mono text-sm bg-white"
                    required
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingRemote(null)}
                    className="flex-1 tye-btn bg-white border-2 border-[var(--tye-ink)] text-xs py-2"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 tye-btn tye-btn-primary text-xs py-2">
                    Update URL
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Fetch / Pull / Push Action Modal (`F-032`) */}
        {actionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="tye-card bg-[var(--tye-cream)] text-[var(--tye-ink)] max-w-md w-full p-6 border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)]">
              <h3 className="font-pixel text-lg font-bold mb-2 uppercase">
                Remote Action: {actionModal.toUpperCase()} (`F-032`)
              </h3>
              <p className="text-xs font-mono opacity-80 mb-4">
                Execute synchronization against configured remotes.
              </p>

              <div className="space-y-4 font-mono text-xs">
                <div>
                  <label className="block font-bold uppercase mb-1">Target Remote</label>
                  <select
                    value={selectedRemoteName}
                    onChange={(e) => setSelectedRemoteName(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-[var(--tye-ink)] bg-white font-mono text-sm"
                  >
                    {remotes.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.name} ({r.fetch_url})
                      </option>
                    ))}
                  </select>
                </div>

                {actionModal !== 'fetch' && (
                  <div>
                    <label className="block font-bold uppercase mb-1">Branch Name</label>
                    <input
                      type="text"
                      value={targetBranchName}
                      onChange={(e) => setTargetBranchName(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-[var(--tye-ink)] bg-white font-mono text-sm"
                    />
                  </div>
                )}

                {actionModal === 'pull' && (
                  <div>
                    <label className="block font-bold uppercase mb-1">Pull Strategy (`F-032`)</label>
                    <select
                      value={pullStrategy}
                      onChange={(e) => setPullStrategy(e.target.value as PullStrategy)}
                      className="w-full px-3 py-2 border-2 border-[var(--tye-ink)] bg-white font-mono text-sm"
                    >
                      <option value="ff_only">Fast-Forward Only (`--ff-only`)</option>
                      <option value="merge">Merge (`--no-ff`)</option>
                      <option value="rebase">Rebase (`--rebase`)</option>
                    </select>
                  </div>
                )}

                {actionModal === 'push' && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="push-force-lease"
                      checked={pushForceLease}
                      onChange={(e) => setPushForceLease(e.target.checked)}
                      className="w-4 h-4 border-2 border-[var(--tye-ink)]"
                    />
                    <label htmlFor="push-force-lease" className="font-bold text-rose-800">
                      Force with lease (`--force-with-lease` safety guard)
                    </label>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setActionModal(null)}
                    className="flex-1 tye-btn bg-white border-2 border-[var(--tye-ink)] py-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => {
                      if (actionModal === 'fetch') handleExecuteFetch();
                      else if (actionModal === 'pull') handleExecutePull();
                      else if (actionModal === 'push') handleExecutePush();
                    }}
                    className="flex-1 tye-btn tye-btn-primary py-2"
                  >
                    {actionLoading ? 'Executing...' : `Execute ${actionModal.toUpperCase()}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
