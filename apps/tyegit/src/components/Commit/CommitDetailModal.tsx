import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CommitDetail } from '../../types';
import {
  RiCloseLine,
  RiGitCommitLine,
  RiFileTextLine,
  RiUserLine,
  RiTimeLine,
  RiLinksLine,
} from 'react-icons/ri';

interface CommitDetailModalProps {
  repoPath: string;
  commitId: string | null;
  onClose: () => void;
  onSelectCommit: (commitId: string) => void;
  onTriggerReset?: (commitId: string, summary: string) => void;
  onTriggerRebase?: (commitId: string) => void;
  onConflictDetected?: () => void;
}

export const CommitDetailModal: React.FC<CommitDetailModalProps> = ({
  repoPath,
  commitId,
  onClose,
  onSelectCommit,
  onTriggerReset,
  onTriggerRebase,
  onConflictDetected,
}) => {
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    if (!commitId) {
      setDetail(null);
      return;
    }
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      setConfirmAction(null);
      try {
        const res: CommitDetail = await invoke('git:commit_details', {
          path: repoPath,
          commitId,
        });
        setDetail(res);
      } catch (err: any) {
        setError(typeof err === 'string' ? err : err.message || 'Failed to load details');
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [repoPath, commitId]);

  if (!commitId) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="bg-white border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_var(--tye-ink)] w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 border-b-2 border-[var(--tye-ink)] bg-[var(--tye-cream)] flex items-center justify-between">
          <div className="flex items-center gap-2 font-pixel font-bold text-sm tracking-wide">
            <RiGitCommitLine className="text-xl text-[var(--tye-lavender)]" />
            <span>COMMIT DETAIL ENGINE (`F-025`)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--tye-ink)] hover:text-white rounded border border-[var(--tye-ink)] transition-colors"
          >
            <RiCloseLine size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 font-mono text-xs">
          {loading ? (
            <div className="p-12 text-center opacity-60">Loading commit detail object...</div>
          ) : error ? (
            <div className="bg-red-50 border border-red-500 p-4 text-red-800">{error}</div>
          ) : detail ? (
            <div className="space-y-6">
              {/* Top Info Grid */}
              <div className="bg-[var(--tye-cream)]/30 border-2 border-[var(--tye-ink)] p-4 space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <h2 className="font-sans font-bold text-base text-[var(--tye-ink)]">
                    {detail.message_subject}
                  </h2>
                  <span className="font-mono font-bold bg-[var(--tye-ink)] text-white px-2 py-0.5 rounded text-xs">
                    {detail.short_id}
                  </span>
                </div>

                {detail.message_body && (
                  <div className="whitespace-pre-wrap bg-white p-3 border border-[var(--tye-ink)]/20 text-gray-700 font-mono text-xs">
                    {detail.message_body}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-gray-600 pt-1">
                  <div className="flex items-center gap-2">
                    <RiUserLine className="text-[var(--tye-ink)]" />
                    <span>Author: <strong className="text-[var(--tye-ink)]">{detail.author_name}</strong> &lt;{detail.author_email}&gt;</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RiTimeLine className="text-[var(--tye-ink)]" />
                    <span>Time: {new Date(detail.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                {/* Parents traverse */}
                {detail.parents.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 border-t border-[var(--tye-ink)]/10">
                    <RiLinksLine className="text-[var(--tye-ink)]" />
                    <span>Parents:</span>
                    <div className="flex items-center gap-1.5">
                      {detail.parents.map((pid, idx) => (
                        <button
                          key={idx}
                          onClick={() => onSelectCommit(pid)}
                          className="bg-white hover:bg-[var(--tye-lavender)] hover:text-white border border-[var(--tye-ink)] px-2 py-0.5 rounded font-bold transition-colors"
                          title="Click to jump to parent commit"
                        >
                          {pid.slice(0, 7)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Changed Files Table (`F-025`) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-pixel font-bold text-xs uppercase tracking-wide flex items-center gap-2">
                    <RiFileTextLine /> Changed Files ({detail.changed_files.length})
                  </h3>
                  <div className="space-x-3 font-bold">
                    <span className="text-green-700">+{detail.insertions} insertions</span>
                    <span className="text-red-700">-{detail.deletions} deletions</span>
                  </div>
                </div>

                <div className="border-2 border-[var(--tye-ink)] rounded overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[var(--tye-cream)] border-b border-[var(--tye-ink)] font-bold">
                        <th className="p-2 w-20">Status</th>
                        <th className="p-2">File Path</th>
                        <th className="p-2 w-28 text-right">Changes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--tye-ink)]/20 bg-white">
                      {detail.changed_files.map((cf, idx) => {
                        const badgeColor =
                          cf.status === 'Added'
                            ? 'bg-green-100 text-green-800'
                            : cf.status === 'Deleted'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800';

                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${badgeColor}`}>
                                {cf.status}
                              </span>
                            </td>
                            <td className="p-2 font-mono truncate max-w-md">{cf.path}</td>
                            <td className="p-2 text-right font-mono">
                              <span className="text-green-700 font-bold">+{cf.insertions}</span>{' '}
                              <span className="text-red-700 font-bold">-{cf.deletions}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {confirmAction && (
          <div className="mx-6 mb-4 p-4 bg-amber-100 border-2 border-amber-800 text-amber-950 font-mono text-xs shadow-[4px_4px_0px_0px_#92400e]">
            <div className="font-pixel text-sm font-bold text-amber-900 mb-1 flex items-center gap-2">
              ⚠️ {confirmAction.title}
            </div>
            <p className="mb-3 leading-relaxed text-amber-950 font-bold">{confirmAction.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1 bg-white border-2 border-amber-800 font-pixel text-xs hover:bg-amber-50 shadow-[2px_2px_0px_0px_#92400e] font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const action = confirmAction.onConfirm;
                  setConfirmAction(null);
                  action();
                }}
                className="px-3 py-1 bg-amber-600 text-white font-pixel text-xs border-2 border-amber-800 hover:bg-amber-700 shadow-[2px_2px_0px_0px_#92400e] font-bold"
              >
                Proceed
              </button>
            </div>
          </div>
        )}

        {/* Footer with Phase 4A Actions (`F-036`-`F-039`) */}
        <div className="p-3 bg-[var(--tye-cream)] border-t-2 border-[var(--tye-ink)] flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={async () => {
                if (!detail) return;
                try {
                  setError(null);
                  const res: any = await invoke('git:commit_cherrypick', {
                    repoPath,
                    commitOids: [detail.id],
                    noCommit: false,
                  });
                  if (res.has_conflicts && onConflictDetected) {
                    onConflictDetected();
                  }
                  onClose();
                } catch (err: any) {
                  setError(`Cherry-pick failed: ${err || 'unknown error'}`);
                }
              }}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-mono text-xs font-bold rounded shadow-[2px_2px_0px_var(--tye-ink)] transition-transform active:scale-95"
              title="Apply changes introduced by this commit onto current branch (F-037)"
            >
              Cherry-Pick (`F-037`)
            </button>

            <button
              onClick={() => {
                if (!detail) return;
                setConfirmAction({
                  title: "Revert Commit",
                  message: `Are you sure you want to revert commit ${detail.id.slice(0, 7)}? A new commit will be created that undoes all changes introduced by this commit.`,
                  onConfirm: async () => {
                    try {
                      setError(null);
                      const res: any = await invoke('git:commit_revert', {
                        repoPath,
                        commitOid: detail.id,
                        mainline: null,
                      });
                      if (res.has_conflicts && onConflictDetected) {
                        onConflictDetected();
                      }
                      onClose();
                    } catch (err: any) {
                      setError(`Revert failed: ${err || 'unknown error'}`);
                    }
                  }
                });
              }}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold rounded shadow-[2px_2px_0px_var(--tye-ink)] transition-transform active:scale-95"
              title="Create new commit reverting changes of this commit (F-038)"
            >
              Revert (`F-038`)
            </button>

            <button
              onClick={() => {
                if (!detail) return;
                if (onTriggerReset) {
                  setConfirmAction({
                    title: "Reset Branch",
                    message: `Are you sure you want to hard reset the current branch to ${detail.id.slice(0, 7)}? All local changes will be lost.`,
                    onConfirm: () => {
                      onTriggerReset(detail.id, detail.message_subject);
                      onClose();
                    }
                  });
                } else {
                  setError('Reset trigger not connected.');
                }
              }}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-mono text-xs font-bold rounded shadow-[2px_2px_0px_var(--tye-ink)] transition-transform active:scale-95"
              title="Reset current branch pointer to this commit (F-039)"
            >
              Reset Here (`F-039`)
            </button>

            <button
              onClick={() => {
                if (!detail) return;
                if (onTriggerRebase) {
                  setConfirmAction({
                    title: "Rebase Onto",
                    message: `Start interactive rebase from commit ${detail.id.slice(0, 7)}?`,
                    onConfirm: () => {
                      onTriggerRebase(detail.id);
                      onClose();
                    }
                  });
                } else {
                  setError('Rebase trigger not connected.');
                }
              }}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs font-bold rounded shadow-[2px_2px_0px_var(--tye-ink)] transition-transform active:scale-95"
              title="Start interactive rebase from this commit (F-036)"
            >
              Rebase Onto (`F-036`)
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-6 py-1.5 bg-[var(--tye-ink)] text-white font-pixel font-bold text-xs rounded hover:bg-gray-800 shadow-[2px_2px_0px_var(--tye-lavender)]"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
