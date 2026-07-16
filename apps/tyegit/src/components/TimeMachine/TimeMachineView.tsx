import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CheckpointItem, RollbackResult, RecoveryItem, DeleteCheckpointResult } from '../../types';
import { PinSaveStateModal } from './PinSaveStateModal';
import { SandboxPreviewModal } from './SandboxPreviewModal';
import {
  RiTimeLine,
  RiPushpinLine,
  RiPushpin2Line,
  RiDeleteBin6Line,
  RiRefreshLine,
  RiTerminalBoxLine,
  RiAlertFill,
  RiSearchLine,
  RiArrowGoBackLine,
  RiGitCommitLine,
  RiSettingsLine,
  RiCloseLine,
  RiErrorWarningLine,
} from 'react-icons/ri';

interface TimeMachineViewProps {
  repoPath: string;
}

type TimelineFilter = 'all' | 'pinned' | 'recovery';

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

function operationColor(op: string): string {
  if (op.includes('Rebase')) return 'bg-violet-100 text-violet-700 border-violet-300';
  if (op.includes('Merge')) return 'bg-emerald-100 text-emerald-700 border-emerald-300';
  if (op.includes('Reset')) return 'bg-rose-100 text-rose-700 border-rose-300';
  if (op.includes('External CLI')) return 'bg-amber-100 text-amber-700 border-amber-300';
  if (op.includes('Manual Pin')) return 'bg-[var(--tye-lavender)]/10 text-[var(--tye-lavender)] border-[var(--tye-lavender)]/30';
  if (op.includes('Rollback')) return 'bg-sky-100 text-sky-700 border-sky-300';
  return 'bg-[var(--tye-ink)]/5 text-[var(--tye-ink)]/60 border-[var(--tye-ink)]/15';
}

export const TimeMachineView: React.FC<TimeMachineViewProps> = ({ repoPath }) => {
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([]);
  const [recoveryItems, setRecoveryItems] = useState<RecoveryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  const [showPinModal, setShowPinModal] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<{ id: string; label: string } | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<{ id: string; label: string } | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CheckpointItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const showStatus = (text: string, isError = false) => {
    setStatusBanner({ text, isError });
    setTimeout(() => setStatusBanner(null), 6000);
  };

  const loadCheckpoints = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const onlyPinned = filter === 'pinned';
      const data: CheckpointItem[] = await invoke('git:checkpoint_list', {
        repoPath,
        limit: 100,
        onlyPinned,
      });
      setCheckpoints(data);

      if (filter === 'recovery') {
        const rItems: RecoveryItem[] = await invoke('git:recovery_list', { repoPath });
        setRecoveryItems(rItems);
      }
    } catch (err: any) {
      setError(`Failed to load time machine data: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [repoPath, filter]);

  useEffect(() => {
    loadCheckpoints();
  }, [loadCheckpoints]);

  const handleScanExternalCli = async () => {
    try {
      const newCps: CheckpointItem[] = await invoke('git:checkpoint_capture_external', { repoPath });
      showStatus(
        newCps.length > 0
          ? `Imported ${newCps.length} external CLI checkpoint(s) from reflog.`
          : 'No new external CLI transitions detected.'
      );
      loadCheckpoints();
    } catch (err: any) {
      showStatus(`Failed to scan reflog: ${err}`, true);
    }
  };

  const handleInstallHooks = async () => {
    try {
      const msg: string = await invoke('git:checkpoint_install_hooks', { repoPath });
      showStatus(msg);
    } catch (err: any) {
      showStatus(`Failed to install hooks: ${err}`, true);
    }
  };

  const handlePrune = async () => {
    try {
      const pruned: number = await invoke('git:checkpoint_prune', { repoPath, retentionDays: 30 });
      showStatus(`Pruned ${pruned} old checkpoint(s) older than 30 days.`);
      loadCheckpoints();
    } catch (err: any) {
      showStatus(`Prune failed: ${err}`, true);
    }
  };

  const handleTogglePin = async (checkpoint: CheckpointItem) => {
    try {
      await invoke('git:checkpoint_toggle_pin', {
        checkpointId: checkpoint.id,
        isPinned: !checkpoint.is_pinned,
      });
      loadCheckpoints();
    } catch (err: any) {
      showStatus(`Failed to toggle pin: ${err}`, true);
    }
  };

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    setRollingBack(rollbackTarget.id);
    setPreviewTarget(null);
    try {
      const result: RollbackResult = await invoke('git:checkpoint_rollback', {
        repoPath,
        checkpointId: rollbackTarget.id,
      });
      showStatus(result.message);
      loadCheckpoints();
    } catch (err: any) {
      showStatus(`Rollback failed: ${err}`, true);
    } finally {
      setRollingBack(null);
      setRollbackTarget(null);
    }
  };

  const handlePreviewClick = (cp: CheckpointItem) => {
    setPreviewTarget({ id: cp.id, label: cp.custom_label || cp.operation });
    setRollbackTarget({ id: cp.id, label: cp.custom_label || cp.operation });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    try {
      const result: DeleteCheckpointResult = await invoke('git:checkpoint_delete', {
        checkpointId: deleteTarget.id,
      });
      showStatus(`Deleted checkpoint "${result.display_name}".`);
      loadCheckpoints();
    } catch (err: any) {
      showStatus(`Failed to delete checkpoint: ${err}`, true);
    } finally {
      setDeleting(null);
      setDeleteTarget(null);
    }
  };

  // Strict inline delete confirmation modal
  const DeleteConfirmModal = deleteTarget ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[460px] bg-[var(--tye-cream)] border-2 border-rose-700 shadow-[6px_6px_0px_0px_#b91c1c]">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-rose-700 border-b-2 border-rose-900">
          <RiErrorWarningLine className="text-white text-xl flex-shrink-0" />
          <span className="font-pixel font-bold text-sm text-white uppercase tracking-wide">
            {deleteTarget.is_pinned ? '⚠ Deleting Pinned Checkpoint' : 'Delete Checkpoint'}
          </span>
          <button
            onClick={() => setDeleteTarget(null)}
            className="ml-auto text-white/70 hover:text-white transition-colors"
          >
            <RiCloseLine className="text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3">
          {deleteTarget.is_pinned && (
            <div className="bg-rose-100 border-2 border-rose-500 px-3 py-2.5 font-mono text-xs text-rose-900 leading-relaxed">
              <strong>This is a Pinned Recovery Anchor.</strong> Pinned checkpoints are your deliberate
              safety nets. Deleting it means you <strong>cannot roll back</strong> to this exact state.
              This action is <strong>permanent and irreversible</strong>.
            </div>
          )}

          <p className="font-mono text-sm text-[var(--tye-ink)] leading-relaxed">
            You are about to permanently delete:
          </p>
          <div className="bg-white border-2 border-[var(--tye-ink)] px-3 py-2.5 font-mono text-sm">
            <div className="font-bold text-[var(--tye-ink)]">
              {deleteTarget.custom_label || deleteTarget.operation}
            </div>
            <div className="text-[var(--tye-ink)]/50 text-xs mt-1">
              HEAD: {deleteTarget.head_before.slice(0, 7)} · {deleteTarget.timestamp.slice(0, 16)}
            </div>
          </div>

          <p className="font-mono text-xs text-[var(--tye-ink)]/60 leading-relaxed">
            Associated stash entries (if any) will <strong>not</strong> be deleted automatically —
            they remain in your stash list.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t-2 border-[var(--tye-ink)] bg-[var(--tye-cream)]/60">
          <button
            id="delete-cp-cancel-btn"
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-1.5 font-mono text-xs font-bold border-2 border-[var(--tye-ink)] bg-white hover:bg-[var(--tye-cream)] transition-colors"
          >
            Keep It
          </button>
          <button
            id="delete-cp-confirm-btn"
            onClick={handleDelete}
            disabled={!!deleting}
            className="flex items-center gap-1.5 px-4 py-1.5 font-mono text-xs font-bold border-2 border-rose-700 bg-rose-700 text-white hover:bg-rose-900 hover:border-rose-900 transition-colors disabled:opacity-50 shadow-[2px_2px_0px_0px_#991b1b] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
          >
            <RiDeleteBin6Line />
            {deleting ? 'Deleting…' : deleteTarget.is_pinned ? 'Yes, Delete Pinned Checkpoint' : 'Delete Checkpoint'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full w-full bg-[var(--tye-cream)]/20 overflow-hidden">
      {/* Header Toolbar */}
      <div className="flex-shrink-0 border-b-2 border-[var(--tye-ink)] bg-white px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <RiTimeLine className="text-[var(--tye-lavender)] text-lg" />
          <span className="font-pixel font-bold text-sm text-[var(--tye-ink)] tracking-wide uppercase">
            Time Machine & Recovery Center
          </span>
          <span className="font-mono text-[10px] text-[var(--tye-ink)]/40 uppercase tracking-wider bg-[var(--tye-ink)]/5 px-1.5 py-0.5 rounded">
            F-042
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter tabs */}
          <div className="flex bg-[var(--tye-cream)] border border-[var(--tye-ink)] p-0.5 font-mono text-xs">
            {(['all', 'pinned', 'recovery'] as TimelineFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 capitalize transition-colors ${
                  filter === f
                    ? 'bg-[var(--tye-ink)] text-white font-bold'
                    : 'hover:bg-white/60 text-[var(--tye-ink)]/70'
                }`}
              >
                {f === 'all' ? 'All Timeline' : f === 'pinned' ? '📌 Pinned' : '🔍 Recovery'}
              </button>
            ))}
          </div>

          <button
            id="pin-save-state-btn"
            onClick={() => setShowPinModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-bold bg-[var(--tye-lavender)] text-white border border-[var(--tye-ink)] shadow-[2px_2px_0px_var(--tye-ink)] hover:bg-[var(--tye-ink)] transition-colors active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <RiPushpinLine /> + Pin Save State
          </button>

          <button
            id="scan-cli-btn"
            onClick={handleScanExternalCli}
            className="flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-xs font-bold bg-amber-500 text-white border border-[var(--tye-ink)] shadow-[2px_2px_0px_var(--tye-ink)] hover:bg-amber-600 transition-colors active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            title="Scan reflog for external CLI operations (Upgrade 1)"
          >
            <RiSearchLine /> Scan CLI
          </button>

          <button
            id="install-hooks-btn"
            onClick={handleInstallHooks}
            className="flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-xs font-bold bg-white text-[var(--tye-ink)] border border-[var(--tye-ink)] shadow-[2px_2px_0px_var(--tye-ink)] hover:bg-[var(--tye-cream)] transition-colors active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            title="Install post-checkout, pre-rebase, post-merge hooks"
          >
            <RiTerminalBoxLine /> Install Hooks
          </button>

          <button
            id="prune-old-btn"
            onClick={handlePrune}
            className="flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-xs font-bold bg-white text-[var(--tye-ink)]/60 border border-[var(--tye-ink)]/40 hover:border-[var(--tye-ink)] hover:text-[var(--tye-ink)] transition-colors"
            title="Prune unpinned checkpoints older than 30 days"
          >
            <RiDeleteBin6Line /> Prune
          </button>

          <button
            onClick={loadCheckpoints}
            className="p-1.5 bg-white border border-[var(--tye-ink)] hover:bg-[var(--tye-cream)] transition-colors"
          >
            <RiRefreshLine />
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {statusBanner && (
        <div
          className={`flex-shrink-0 mx-4 mt-2 px-3 py-2 border-2 font-mono text-xs flex items-center justify-between ${
            statusBanner.isError
              ? 'bg-rose-100 border-rose-700 text-rose-900'
              : 'bg-emerald-100 border-emerald-700 text-emerald-900'
          }`}
        >
          <span className="font-bold">{statusBanner.text}</span>
          <button onClick={() => setStatusBanner(null)} className="font-bold ml-4 opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 font-mono text-xs text-[var(--tye-ink)]/40 animate-pulse">
            <RiTimeLine className="text-lg" /> Loading time machine…
          </div>
        )}

        {error && (
          <div className="bg-rose-100 border-2 border-rose-700 px-3 py-2 font-mono text-xs text-rose-900 flex items-center gap-2">
            <RiAlertFill /> {error}
          </div>
        )}

        {/* Recovery Center */}
        {filter === 'recovery' && !loading && (
          <div className="flex flex-col gap-2">
            <div className="font-pixel font-bold text-sm text-[var(--tye-ink)] uppercase tracking-wide py-1">
              🔍 Lost Commits & Unreachable Objects
            </div>
            {recoveryItems.length === 0 ? (
              <div className="text-center py-10 font-mono text-xs text-[var(--tye-ink)]/40">
                No unreachable commits found. Your repo is clean. ✓
              </div>
            ) : (
              recoveryItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] px-4 py-3 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <RiGitCommitLine className="text-amber-600 text-lg mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-bold text-[var(--tye-ink)] truncate">
                        {item.subject}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--tye-ink)]/50 mt-0.5">
                        {item.short_oid} · {formatTimestamp(item.timestamp)}
                      </div>
                      <div className="font-mono text-[10px] text-amber-700 mt-1">
                        {item.details}
                      </div>
                    </div>
                  </div>
                  <button
                    className="flex-shrink-0 px-3 py-1.5 font-mono text-xs font-bold bg-amber-500 text-white border border-[var(--tye-ink)] shadow-[2px_2px_0px_var(--tye-ink)] hover:bg-amber-600 transition-colors active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    onClick={() => showStatus(`Recovery tip: git checkout -b recovered-${item.short_oid} ${item.commit_oid}`)}
                  >
                    Recover
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Checkpoint Timeline */}
        {filter !== 'recovery' && !loading && (
          <>
            {checkpoints.length === 0 ? (
              <div className="text-center py-12 font-mono text-xs text-[var(--tye-ink)]/40">
                <RiTimeLine className="text-3xl mx-auto mb-2 opacity-30" />
                {filter === 'pinned'
                  ? 'No pinned checkpoints yet. Click "+ Pin Save State" to create one.'
                  : 'No checkpoints recorded yet. Perform a Git operation to create your first checkpoint.'}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {checkpoints.map((cp) => (
                  <div
                    key={cp.id}
                    className={`bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] px-4 py-3 flex items-start gap-3 transition-all ${
                      cp.is_pinned ? 'ring-2 ring-[var(--tye-lavender)] ring-offset-1' : ''
                    }`}
                  >
                    {/* Left: icon & metadata */}
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      {cp.is_pinned ? (
                        <RiPushpin2Line className="text-[var(--tye-lavender)] text-lg" />
                      ) : (
                        <RiTimeLine className="text-[var(--tye-ink)]/30 text-lg" />
                      )}
                      {cp.stash_oid && (
                        <div className="font-mono text-[9px] bg-amber-100 text-amber-700 border border-amber-300 px-1 py-0.5 rounded whitespace-nowrap">
                          Stashed
                        </div>
                      )}
                    </div>

                    {/* Center: content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {cp.custom_label && (
                          <span className="font-pixel font-bold text-sm text-[var(--tye-ink)]">
                            {cp.custom_label}
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 font-mono text-[10px] border rounded font-bold ${operationColor(cp.operation)}`}
                        >
                          {cp.operation}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-[var(--tye-ink)]/60 mt-1 leading-relaxed">
                        {cp.ai_explanation}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 font-mono text-[10px] text-[var(--tye-ink)]/40">
                        <span>{formatTimestamp(cp.timestamp)}</span>
                        <span className="font-mono bg-[var(--tye-ink)]/5 px-1 py-0.5 rounded">
                          HEAD: {cp.head_before.slice(0, 7)}
                        </span>
                        {cp.head_after && (
                          <>
                            <span>→</span>
                            <span className="font-mono bg-[var(--tye-ink)]/5 px-1 py-0.5 rounded">
                              {cp.head_after.slice(0, 7)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleTogglePin(cp)}
                        className={`p-1.5 border transition-colors text-xs ${
                          cp.is_pinned
                            ? 'border-[var(--tye-lavender)] text-[var(--tye-lavender)] hover:bg-[var(--tye-lavender)]/10'
                            : 'border-[var(--tye-ink)]/30 text-[var(--tye-ink)]/40 hover:border-[var(--tye-ink)] hover:text-[var(--tye-ink)]'
                        }`}
                        title={cp.is_pinned ? 'Unpin checkpoint' : 'Pin checkpoint'}
                      >
                        <RiPushpinLine />
                      </button>
                      <button
                        onClick={() => handlePreviewClick(cp)}
                        className="flex items-center gap-1 px-2.5 py-1.5 font-mono text-xs font-bold bg-white text-[var(--tye-ink)] border border-[var(--tye-ink)] shadow-[2px_2px_0px_var(--tye-ink)] hover:bg-[var(--tye-cream)] transition-colors active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                      >
                        <RiSearchLine /> Preview
                      </button>
                      <button
                        onClick={() => {
                          setRollbackTarget({ id: cp.id, label: cp.custom_label || cp.operation });
                          handleRollback();
                        }}
                        disabled={rollingBack === cp.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 font-mono text-xs font-bold bg-[var(--tye-lavender)] text-white border border-[var(--tye-ink)] shadow-[2px_2px_0px_var(--tye-ink)] hover:bg-[var(--tye-ink)] transition-colors active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-40"
                      >
                        <RiArrowGoBackLine />
                        {rollingBack === cp.id ? 'Rolling…' : 'Rollback'}
                      </button>
                      <button
                        id={`delete-cp-btn-${cp.id.slice(0, 8)}`}
                        onClick={() => setDeleteTarget(cp)}
                        disabled={deleting === cp.id}
                        className={`p-1.5 border-2 transition-colors text-xs ${
                          cp.is_pinned
                            ? 'border-rose-500 text-rose-600 hover:bg-rose-600 hover:text-white'
                            : 'border-[var(--tye-ink)]/30 text-[var(--tye-ink)]/40 hover:border-rose-500 hover:text-rose-600'
                        } disabled:opacity-40`}
                        title="Delete this checkpoint"
                      >
                        <RiDeleteBin6Line />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {DeleteConfirmModal}

      {/* Pin Save State Modal */}
      <PinSaveStateModal
        repoPath={repoPath}
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onPinned={(item) => {
          showStatus(`Pinned recovery anchor: "${item.custom_label}"`);
          loadCheckpoints();
        }}
      />

      {/* Sandbox Preview Modal */}
      {previewTarget && (
        <SandboxPreviewModal
          repoPath={repoPath}
          checkpointId={previewTarget.id}
          checkpointLabel={previewTarget.label}
          isOpen={!!previewTarget}
          onClose={() => setPreviewTarget(null)}
          onConfirmRollback={handleRollback}
        />
      )}
    </div>
  );
};
