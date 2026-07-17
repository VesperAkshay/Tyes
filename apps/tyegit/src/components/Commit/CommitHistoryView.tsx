import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CommitListItem } from '../../types';
import {
  RiHistoryLine,
  RiGitBranchLine,
  RiPriceTag3Line,
  RiRefreshLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiFileCopyLine,
} from 'react-icons/ri';

interface CommitHistoryViewProps {
  repoPath: string;
  onSelectCommit: (commitId: string) => void;
  refreshTrigger: number;
}

export const CommitHistoryView: React.FC<CommitHistoryViewProps> = ({
  repoPath,
  onSelectCommit,
  refreshTrigger,
}) => {
  const [commits, setCommits] = useState<CommitListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [offset, setOffset] = useState<number>(0);
  const limit = 30; // Paginated (`F-024`)

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const data: CommitListItem[] = await invoke('git:commit_history', {
        path: repoPath,
        offset,
        limit,
      });
      setCommits(data);
    } catch (err) {
      console.error('Failed to fetch commit history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (repoPath) {
      fetchHistory();
    }
  }, [repoPath, offset, refreshTrigger]);

  const formatTime = (ts: string) => {
    try {
      const dt = new Date(ts);
      return dt.toLocaleString([], {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white select-none">
      {/* Header Bar */}
      <div className="p-3 border-b-2 border-[var(--tye-ink)] bg-[var(--tye-cream)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RiHistoryLine className="text-lg text-[var(--tye-lavender)]" />
          <h3 className="font-pixel font-bold text-sm tracking-wide">COMMIT HISTORY ENGINE</h3>
          <span className="text-xs font-mono opacity-60">(Showing {offset + 1} - {offset + commits.length})</span>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0 || loading}
            className="p-1 bg-white hover:bg-[var(--tye-ink)] hover:text-white rounded border border-[var(--tye-ink)] disabled:opacity-40 transition-colors"
          >
            <RiArrowLeftSLine />
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={commits.length < limit || loading}
            className="p-1 bg-white hover:bg-[var(--tye-ink)] hover:text-white rounded border border-[var(--tye-ink)] disabled:opacity-40 transition-colors"
          >
            <RiArrowRightSLine />
          </button>
          <button
            onClick={fetchHistory}
            title="Refresh history"
            className="p-1 bg-white hover:bg-[var(--tye-cream)] rounded border border-[var(--tye-ink)] ml-1"
          >
            <RiRefreshLine />
          </button>
        </div>
      </div>

      {/* Table List */}
      <div className="flex-1 overflow-y-auto">
        {loading && commits.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs opacity-50">Loading commit graph...</div>
        ) : commits.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs opacity-50 italic">No commit history found on HEAD.</div>
        ) : (
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="bg-[var(--tye-cream)]/40 border-b-2 border-[var(--tye-ink)] text-gray-700 select-none sticky top-0 bg-white z-10">
                <th className="py-2 px-4 w-24">Commit</th>
                <th className="py-2 px-3">Message Subject</th>
                <th className="py-2 px-3 w-40">Author</th>
                <th className="py-2 px-4 w-36 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {commits.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onSelectCommit(c.id)}
                  className="hover:bg-[var(--tye-lavender)]/10 cursor-pointer transition-colors group"
                >
                  <td className="py-2.5 px-4 font-bold text-[var(--tye-lavender)]">
                    <div className="flex items-center gap-2">
                      <span className="hover:underline">{c.short_id}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(c.id);
                        }}
                        title="Copy full SHA"
                        className="opacity-0 group-hover:opacity-100 hover:text-[var(--tye-ink)] transition-opacity"
                      >
                        <RiFileCopyLine />
                      </button>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-sans font-medium text-gray-900 truncate max-w-xl">
                        {c.message_subject}
                      </span>
                      {c.branches && c.branches.length > 0 && (
                        <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 border border-blue-300 px-1.5 py-0.2 rounded text-[10px]">
                          <RiGitBranchLine /> {c.branches.join(', ')}
                        </span>
                      )}
                      {c.tags && c.tags.length > 0 && (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded text-[10px]">
                          <RiPriceTag3Line /> {c.tags.join(', ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 truncate max-w-[140px]" title={c.author_name}>
                    {c.author_name}
                  </td>
                  <td className="py-2.5 px-4 text-right text-gray-400 whitespace-nowrap">
                    {formatTime(c.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
