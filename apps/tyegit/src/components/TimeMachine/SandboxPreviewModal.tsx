import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RollbackPreview, ConflictRisk } from '../../types';
import {
  RiTimeLine,
  RiCloseLine,
  RiAlertFill,
  RiCheckLine,
  RiArrowGoBackLine,
  RiFileList2Line,
} from 'react-icons/ri';

interface SandboxPreviewModalProps {
  repoPath: string;
  checkpointId: string;
  checkpointLabel: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirmRollback: () => void;
}

const riskColor = (risk: ConflictRisk) => {
  if (risk === 'High') return 'text-rose-700 bg-rose-100 border-rose-400';
  if (risk === 'Low') return 'text-amber-700 bg-amber-100 border-amber-400';
  return 'text-emerald-700 bg-emerald-100 border-emerald-400';
};

const riskIcon = (risk: ConflictRisk) => {
  if (risk === 'High') return <RiAlertFill className="text-rose-700" />;
  if (risk === 'Low') return <RiAlertFill className="text-amber-700" />;
  return <RiCheckLine className="text-emerald-700" />;
};

export const SandboxPreviewModal: React.FC<SandboxPreviewModalProps> = ({
  repoPath,
  checkpointId,
  checkpointLabel,
  isOpen,
  onClose,
  onConfirmRollback,
}) => {
  const [preview, setPreview] = useState<RollbackPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'files'>('summary');

  useEffect(() => {
    if (!isOpen || !checkpointId) return;
    setLoading(true);
    setPreview(null);
    setError(null);

    invoke<RollbackPreview>('git:checkpoint_preview', { repoPath, checkpointId })
      .then((data) => setPreview(data))
      .catch((err) => setError(`Failed to load rollback preview: ${err}`))
      .finally(() => setLoading(false));
  }, [isOpen, checkpointId, repoPath]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className="w-[580px] max-h-[80vh] flex flex-col bg-[var(--tye-cream)] border-2 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--tye-ink)] bg-[var(--tye-ink)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <RiTimeLine className="text-[var(--tye-cream)] text-lg" />
            <div>
              <div className="font-pixel font-bold text-sm text-[var(--tye-cream)] tracking-wide uppercase">
                Sandbox Rollback Preview
              </div>
              <div className="font-mono text-[11px] text-[var(--tye-cream)]/60 truncate max-w-[360px]">
                {checkpointLabel}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--tye-cream)] hover:text-[var(--tye-rose)] transition-colors">
            <RiCloseLine className="text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
          {loading && (
            <div className="flex items-center gap-2 font-mono text-xs text-[var(--tye-ink)]/60 py-6 justify-center animate-pulse">
              <RiTimeLine className="text-lg" />
              Computing rollback impact…
            </div>
          )}

          {error && (
            <div className="bg-rose-100 border-2 border-rose-700 px-3 py-2 font-mono text-xs text-rose-900">
              {error}
            </div>
          )}

          {preview && (
            <>
              {/* Metrics Row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border-2 border-[var(--tye-ink)] px-3 py-3 text-center shadow-[2px_2px_0_0_var(--tye-ink)]">
                  <div className="font-pixel font-bold text-xl text-[var(--tye-ink)]">
                    -{preview.commits_undone}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--tye-ink)]/60 uppercase tracking-wider mt-0.5">
                    Commits Undone
                  </div>
                </div>
                <div className="bg-white border-2 border-[var(--tye-ink)] px-3 py-3 text-center shadow-[2px_2px_0_0_var(--tye-ink)]">
                  <div className="font-pixel font-bold text-xl text-[var(--tye-ink)]">
                    {preview.files_modified + preview.files_added + preview.files_deleted}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--tye-ink)]/60 uppercase tracking-wider mt-0.5">
                    Files Altered
                  </div>
                </div>
                <div className={`border-2 px-3 py-3 text-center shadow-[2px_2px_0_0_var(--tye-ink)] ${riskColor(preview.conflict_risk)}`}>
                  <div className="font-pixel font-bold text-xl flex items-center justify-center gap-1">
                    {riskIcon(preview.conflict_risk)}
                    {preview.conflict_risk.toUpperCase()}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wider mt-0.5 opacity-70">
                    Conflict Risk
                  </div>
                </div>
              </div>

              {/* Summary text */}
              <div className="bg-white border-2 border-[var(--tye-ink)]/30 px-3 py-2 font-mono text-xs text-[var(--tye-ink)]/70 leading-relaxed">
                {preview.summary_text}
              </div>

              {/* Tabs */}
              <div className="flex border-b-2 border-[var(--tye-ink)]/20 gap-0">
                {(['summary', 'files'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-bold border-b-2 transition-colors capitalize ${
                      activeTab === tab
                        ? 'border-[var(--tye-lavender)] text-[var(--tye-lavender)]'
                        : 'border-transparent text-[var(--tye-ink)]/50 hover:text-[var(--tye-ink)]'
                    }`}
                  >
                    {tab === 'files' ? <RiFileList2Line /> : <RiTimeLine />}
                    {tab === 'summary' ? 'Impact Summary' : `Files (${preview.diff_summaries.length})`}
                  </button>
                ))}
              </div>

              {activeTab === 'summary' && (
                <div className="flex flex-col gap-1.5 font-mono text-xs">
                  <div className="flex items-center justify-between px-2 py-1.5 bg-white border border-[var(--tye-ink)]/20">
                    <span className="text-[var(--tye-ink)]/60">Target commit</span>
                    <span className="font-bold text-[var(--tye-ink)]">{preview.target_commit_short}</span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5 bg-white border border-[var(--tye-ink)]/20">
                    <span className="text-[var(--tye-ink)]/60">Commits undone</span>
                    <span className="font-bold text-[var(--tye-ink)]">{preview.commits_undone}</span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5 bg-white border border-[var(--tye-ink)]/20">
                    <span className="text-[var(--tye-ink)]/60">Files modified</span>
                    <span className="font-bold text-amber-700">{preview.files_modified}</span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5 bg-white border border-[var(--tye-ink)]/20">
                    <span className="text-[var(--tye-ink)]/60">Files added</span>
                    <span className="font-bold text-emerald-700">{preview.files_added}</span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5 bg-white border border-[var(--tye-ink)]/20">
                    <span className="text-[var(--tye-ink)]/60">Files deleted</span>
                    <span className="font-bold text-rose-700">{preview.files_deleted}</span>
                  </div>
                </div>
              )}

              {activeTab === 'files' && (
                <div className="flex flex-col gap-1 font-mono text-xs max-h-52 overflow-y-auto">
                  {preview.diff_summaries.length === 0 ? (
                    <div className="py-4 text-center text-[var(--tye-ink)]/40">No file changes detected.</div>
                  ) : (
                    preview.diff_summaries.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between px-2 py-1.5 bg-white border border-[var(--tye-ink)]/20"
                      >
                        <span className="truncate text-[var(--tye-ink)]/80 max-w-[380px]">{f.path}</span>
                        <span
                          className={`px-1.5 py-0.5 font-bold text-[10px] rounded ${
                            f.status === 'Added'
                              ? 'bg-emerald-100 text-emerald-700'
                              : f.status === 'Deleted'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {f.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t-2 border-[var(--tye-ink)] bg-[var(--tye-cream)]/60 flex-shrink-0">
          <button
            id="sandbox-cancel-btn"
            onClick={onClose}
            className="px-4 py-1.5 font-mono text-xs font-bold border-2 border-[var(--tye-ink)] bg-white hover:bg-[var(--tye-rose)] hover:text-white hover:border-[var(--tye-rose)] transition-colors"
          >
            Cancel
          </button>
          <button
            id="sandbox-rollback-btn"
            onClick={onConfirmRollback}
            disabled={loading || !!error || !preview}
            className="flex items-center gap-1.5 px-4 py-1.5 font-mono text-xs font-bold border-2 border-[var(--tye-ink)] bg-[var(--tye-lavender)] text-white hover:bg-[var(--tye-ink)] transition-colors disabled:opacity-40 shadow-[2px_2px_0px_0px_var(--tye-ink)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
          >
            <RiArrowGoBackLine />
            Confirm & Rollback
          </button>
        </div>
      </div>
    </div>
  );
};
