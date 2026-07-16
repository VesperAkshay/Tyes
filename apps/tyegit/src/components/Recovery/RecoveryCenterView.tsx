import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RecoveryItem, RecoveryType } from '../../types';
import {
  RiSearchLine,
  RiRefreshLine,
  RiGitCommitLine,
  RiGitBranchLine,
  RiAlertFill,
  RiCheckLine,
  RiArrowGoBackLine,
  RiTimeLine,
  RiFileDamageLine,
} from 'react-icons/ri';

interface RecoveryCenterViewProps {
  repoPath: string;
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

function recoveryTypeIcon(type: RecoveryType) {
  switch (type) {
    case 'LostCommit': return <RiGitCommitLine className="text-amber-600 text-lg flex-shrink-0" />;
    case 'DeletedBranch': return <RiGitBranchLine className="text-rose-600 text-lg flex-shrink-0" />;
    case 'ReflogEntry': return <RiTimeLine className="text-sky-600 text-lg flex-shrink-0" />;
    case 'DanglingBlob': return <RiFileDamageLine className="text-violet-600 text-lg flex-shrink-0" />;
    default: return <RiAlertFill className="text-[var(--tye-ink)] text-lg flex-shrink-0" />;
  }
}

function recoveryTypeBadge(type: RecoveryType): string {
  switch (type) {
    case 'LostCommit': return 'bg-amber-100 text-amber-700 border-amber-300';
    case 'DeletedBranch': return 'bg-rose-100 text-rose-700 border-rose-300';
    case 'ReflogEntry': return 'bg-sky-100 text-sky-700 border-sky-300';
    case 'DanglingBlob': return 'bg-violet-100 text-violet-700 border-violet-300';
    default: return 'bg-gray-100 text-gray-700 border-gray-300';
  }
}

function recoveryTypeLabel(type: RecoveryType): string {
  switch (type) {
    case 'LostCommit': return 'Lost Commit';
    case 'DeletedBranch': return 'Deleted Branch';
    case 'ReflogEntry': return 'Reflog Entry';
    case 'DanglingBlob': return 'Dangling Object';
    default: return type;
  }
}

function recoveryCommand(item: RecoveryItem): string {
  switch (item.recovery_type) {
    case 'LostCommit':
      return `git checkout -b recovered-${item.short_oid} ${item.commit_oid}`;
    case 'DeletedBranch':
      return `git checkout -b ${item.subject} ${item.commit_oid}`;
    case 'ReflogEntry':
      return `git checkout -b reflog-${item.short_oid} ${item.commit_oid}`;
    default:
      return `git cat-file -p ${item.commit_oid}`;
  }
}

export const RecoveryCenterView: React.FC<RecoveryCenterViewProps> = ({ repoPath }) => {
  const [items, setItems] = useState<RecoveryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ text: string; isError?: boolean } | null>(null);
  const [typeFilter, setTypeFilter] = useState<RecoveryType | 'All'>('All');

  const showStatus = (text: string, isError = false) => {
    setStatusBanner({ text, isError });
    setTimeout(() => setStatusBanner(null), 6000);
  };

  const loadItems = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const data: RecoveryItem[] = await invoke('git:recovery_list', { repoPath });
      setItems(data);
    } catch (err: any) {
      setError(`Failed to scan recovery items: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleCopyCommand = async (item: RecoveryItem) => {
    const cmd = recoveryCommand(item);
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
      showStatus(`Copied recovery command for ${item.short_oid} to clipboard.`);
    } catch {
      showStatus(`Recovery command: ${cmd}`, false);
    }
  };

  const allTypes: (RecoveryType | 'All')[] = ['All', 'LostCommit', 'DeletedBranch', 'ReflogEntry', 'DanglingBlob'];
  const filtered = typeFilter === 'All' ? items : items.filter((i) => i.recovery_type === typeFilter);

  return (
    <div className="flex flex-col h-full w-full bg-[var(--tye-cream)]/20 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b-2 border-[var(--tye-ink)] bg-white px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <RiSearchLine className="text-amber-500 text-lg" />
          <span className="font-pixel font-bold text-sm text-[var(--tye-ink)] tracking-wide uppercase">
            Recovery Center
          </span>
          <span className="font-mono text-[10px] text-[var(--tye-ink)]/40 uppercase tracking-wider bg-[var(--tye-ink)]/5 px-1.5 py-0.5 rounded">
            F-042
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Type filter chips */}
          <div className="flex bg-[var(--tye-cream)] border border-[var(--tye-ink)] p-0.5 font-mono text-xs gap-0">
            {allTypes.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 transition-colors ${
                  typeFilter === t
                    ? 'bg-[var(--tye-ink)] text-white font-bold'
                    : 'hover:bg-white/60 text-[var(--tye-ink)]/70'
                }`}
              >
                {t === 'All' ? 'All' : recoveryTypeLabel(t as RecoveryType)}
              </button>
            ))}
          </div>

          <button
            id="recovery-refresh-btn"
            onClick={loadItems}
            className="flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-xs font-bold bg-amber-500 text-white border border-[var(--tye-ink)] shadow-[2px_2px_0px_var(--tye-ink)] hover:bg-amber-600 transition-colors active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <RiRefreshLine /> Scan Now
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
          <button onClick={() => setStatusBanner(null)} className="font-bold ml-4 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Explainer banner */}
      <div className="flex-shrink-0 mx-4 mt-3 px-3 py-2 bg-amber-50 border-2 border-amber-400 font-mono text-xs text-amber-900 leading-relaxed">
        <span className="font-bold">Recovery Center</span> scans your repository's reflog and object database
        for unreachable commits, dropped branches, and dangling objects that can be restored.
        Click <strong>[ Copy Recovery Command ]</strong> to get the exact git command to restore each item.
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 font-mono text-xs text-[var(--tye-ink)]/40 animate-pulse">
            <RiSearchLine className="text-lg" /> Scanning repository for lost objects…
          </div>
        )}

        {error && (
          <div className="bg-rose-100 border-2 border-rose-700 px-3 py-2 font-mono text-xs text-rose-900 flex items-center gap-2">
            <RiAlertFill /> {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <RiCheckLine className="text-4xl text-emerald-500" />
            <div className="font-pixel font-bold text-sm text-[var(--tye-ink)] uppercase tracking-wide">
              All Clear
            </div>
            <div className="font-mono text-xs text-[var(--tye-ink)]/50 text-center max-w-xs">
              {typeFilter === 'All'
                ? 'No unreachable commits, deleted branches, or dangling objects found in this repository.'
                : `No ${recoveryTypeLabel(typeFilter as RecoveryType).toLowerCase()} items found.`}
            </div>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[11px] text-[var(--tye-ink)]/50 mb-1">
              {filtered.length} recoverable item{filtered.length !== 1 ? 's' : ''} found
            </div>

            {filtered.map((item) => (
              <div
                key={item.id}
                className="bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] px-4 py-3 flex items-start gap-3"
              >
                {/* Icon */}
                <div className="mt-0.5">{recoveryTypeIcon(item.recovery_type)}</div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm text-[var(--tye-ink)] truncate">
                      {item.subject}
                    </span>
                    <span className={`px-1.5 py-0.5 font-mono text-[10px] border rounded font-bold ${recoveryTypeBadge(item.recovery_type)}`}>
                      {recoveryTypeLabel(item.recovery_type)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 font-mono text-[10px] text-[var(--tye-ink)]/50">
                    <span className="bg-[var(--tye-ink)]/5 px-1 py-0.5 rounded font-bold">{item.short_oid}</span>
                    <span>{formatTimestamp(item.timestamp)}</span>
                  </div>

                  <div className="mt-1.5 font-mono text-[11px] text-[var(--tye-ink)]/60 leading-relaxed">
                    {item.details}
                  </div>

                  {/* Recovery command preview */}
                  <div className="mt-2 px-2 py-1.5 bg-[var(--tye-ink)]/5 border border-[var(--tye-ink)]/10 font-mono text-[10px] text-[var(--tye-ink)]/60 truncate">
                    <span className="text-[var(--tye-ink)]/30 mr-1">$</span>
                    {recoveryCommand(item)}
                  </div>
                </div>

                {/* Action */}
                <button
                  id={`recover-btn-${item.short_oid}`}
                  onClick={() => handleCopyCommand(item)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 font-mono text-xs font-bold border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_var(--tye-ink)] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                    copiedId === item.id
                      ? 'bg-emerald-500 text-white'
                      : 'bg-amber-500 text-white hover:bg-amber-600'
                  }`}
                >
                  {copiedId === item.id ? (
                    <><RiCheckLine /> Copied!</>
                  ) : (
                    <><RiArrowGoBackLine /> Copy Recovery Command</>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
