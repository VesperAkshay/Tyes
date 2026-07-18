import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { RiGitPullRequestLine, RiCheckLine, RiTimeLine, RiCloseCircleLine, RiExternalLinkLine, RiRefreshLine } from 'react-icons/ri';
import { PullRequest } from '../../types';

import { CreatePRModal } from './CreatePRModal';

interface PullRequestsViewProps {
  repoPath: string;
}

export const PullRequestsView: React.FC<PullRequestsViewProps> = ({ repoPath }) => {
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchPrs = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await invoke<PullRequest[]>('git:pr_list', { repoPath });
      setPrs(data);
    } catch (err: any) {
      setErrorMsg(`Failed to fetch pull requests: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (repoPath) {
      fetchPrs();
    }
  }, [repoPath]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <RiCheckLine className="text-emerald-600" />;
      case 'pending': return <RiTimeLine className="text-amber-500" />;
      case 'failure': return <RiCloseCircleLine className="text-rose-600" />;
      default: return <RiTimeLine className="text-[var(--tye-ink)] opacity-50" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--tye-cream)] text-[var(--tye-ink)]">
      <div className="p-4 border-b-2 border-[var(--tye-ink)] flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <RiGitPullRequestLine className="w-5 h-5 text-[var(--tye-lavender)]" />
          <h2 className="font-pixel font-bold">Pull Requests (`F-050`)</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3 py-1.5 border-2 border-[var(--tye-ink)] bg-[var(--tye-lavender)] text-white font-bold text-xs uppercase tracking-wider hover:bg-[var(--tye-ink)] transition-colors flex items-center gap-1"
          >
            + Create PR
          </button>
          <button
            onClick={fetchPrs}
            disabled={loading}
            className="p-1.5 border-2 border-[var(--tye-ink)] hover:bg-[var(--tye-ink)] hover:text-white transition-colors disabled:opacity-50"
            title="Refresh PRs"
          >
            <RiRefreshLine className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {errorMsg ? (
          <div className="p-4 border-2 border-rose-800 bg-rose-100 text-rose-900 font-mono text-xs shadow-[3px_3px_0px_0px_#9f1239]">
            <p className="font-bold mb-2">Error loading PRs</p>
            <p>{errorMsg}</p>
            <p className="mt-2 opacity-80">Make sure you have connected your Hosting Account in the Settings page.</p>
          </div>
        ) : loading && prs.length === 0 ? (
          <div className="text-center font-mono text-xs opacity-70 p-8">
            Querying GitHub API...
          </div>
        ) : prs.length === 0 ? (
          <div className="text-center font-mono text-xs opacity-70 p-8 border-2 border-dashed border-[var(--tye-ink)] bg-white">
            No open pull requests found for this repository.
          </div>
        ) : (
          <div className="space-y-4">
            {prs.map(pr => (
              <div key={pr.number} className="bg-white border-2 border-[var(--tye-ink)] p-4 shadow-[4px_4px_0px_0px_var(--tye-ink)] flex flex-col gap-2">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-bold text-sm leading-tight flex-1">
                    <span className="text-[var(--tye-lavender)] font-mono">#{pr.number}</span> {pr.title}
                  </h3>
                  <button
                    onClick={() => open(pr.url)}
                    className="p-1 hover:text-[var(--tye-lavender)] transition-colors"
                    title="Open in Browser"
                  >
                    <RiExternalLinkLine className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="font-mono text-xs opacity-80 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Author: <strong>{pr.author}</strong></span>
                  <div className="flex items-center gap-1 text-[10px] bg-[var(--tye-cream)] px-1.5 border border-[var(--tye-ink)]">
                    <span className="font-bold">{pr.head_branch}</span>
                    <span>→</span>
                    <span className="font-bold">{pr.base_branch}</span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-[var(--tye-ink)]/20 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    {getStatusIcon(pr.checks_status)}
                    <span className="font-bold uppercase tracking-wider text-[10px]">
                      CI: {pr.checks_status}
                    </span>
                  </div>
                  {pr.draft && (
                    <span className="bg-[var(--tye-ink)] text-white px-2 py-0.5 text-[10px] font-bold uppercase">Draft</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <CreatePRModal
        repoPath={repoPath}
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => fetchPrs()}
      />
    </div>
  );
};
