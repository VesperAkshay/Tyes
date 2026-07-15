import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RepoCard } from '../types';
import { RiPushpin2Line, RiFolderOpenLine, RiGitBranchLine, RiErrorWarningLine, RiAddLine, RiDownload2Line, RiSearchLine, RiCheckDoubleLine } from 'react-icons/ri';

interface DashboardProps {
  onOpenRepo: (path: string) => void;
  onInitClick: () => void;
  onCloneClick: () => void;
  onScanClick: () => void;
  refreshTrigger?: number;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onOpenRepo,
  onInitClick,
  onCloneClick,
  onScanClick,
  refreshTrigger = 0,
}) => {
  const [repos, setRepos] = useState<RepoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchRepos = async () => {
    try {
      setLoading(true);
      const data: RepoCard[] = await invoke('git:dashboard_get_repos');
      setRepos(data);
      setError(null);
    } catch (err: any) {
      setError(err?.toString() || 'Failed to fetch repositories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, [refreshTrigger]);

  const handleTogglePin = async (e: React.MouseEvent, repoId: string, currentPin: boolean) => {
    e.stopPropagation();
    try {
      await invoke('git:dashboard_pin_repo', { repoId, pinned: !currentPin });
      fetchRepos();
    } catch (err: any) {
      alert(`Failed to pin repository: ${err}`);
    }
  };

  const filteredRepos = repos.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinnedRepos = filteredRepos.filter(r => r.is_pinned);
  const unpinnedRepos = filteredRepos.filter(r => !r.is_pinned);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 bg-[var(--tye-cream)] text-[var(--tye-ink)]">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-[var(--tye-ink)]">
        <div>
          <h1 className="text-3xl font-bold font-pixel tracking-tight">Repositories</h1>
          <p className="text-sm opacity-80 mt-1 font-mono">
            Tyegit Repository & Configuration Engine ({repos.length} managed)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={onInitClick} className="tye-btn text-xs bg-white flex items-center gap-1.5 shadow-[2px_2px_0px_0px_var(--tye-ink)]">
            <RiAddLine className="w-3.5 h-3.5 text-[var(--tye-lavender)]" /> Init (`F-008`)
          </button>
          <button onClick={onCloneClick} className="tye-btn text-xs bg-white flex items-center gap-1.5 shadow-[2px_2px_0px_0px_var(--tye-ink)]">
            <RiDownload2Line className="w-3.5 h-3.5 text-[var(--tye-lavender)]" /> Clone (`F-009`)
          </button>
          <button onClick={onScanClick} className="tye-btn tye-btn-primary text-xs flex items-center gap-1.5">
            <RiFolderOpenLine className="w-3.5 h-3.5" /> Auto-Discover (`F-007`)
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6 relative">
        <RiSearchLine className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--tye-ink)]/50" />
        <input
          type="text"
          placeholder="Search repositories by name or path (`F-006` filter)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm shadow-[3px_3px_0px_0px_var(--tye-ink)] focus:outline-none focus:translate-x-0.5 focus:translate-y-0.5 focus:shadow-[1px_1px_0px_0px_var(--tye-ink)] transition-all"
        />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 border-2 border-[var(--tye-ink)] text-red-900 font-mono text-xs flex items-center gap-2">
          <RiErrorWarningLine className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && repos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center font-mono text-sm opacity-60">
          Loading repositories from `project.db`...
        </div>
      ) : filteredRepos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] text-center font-mono">
          <RiFolderOpenLine className="w-12 h-12 text-[var(--tye-lavender)] mb-3" />
          <h3 className="font-bold text-lg mb-1">No Repositories Index</h3>
          <p className="text-xs opacity-70 max-w-sm mb-6">
            You haven't registered any repositories yet. Use Auto-Discovery (`F-007`) to scan your disk, or initialize/clone a new one.
          </p>
          <button onClick={onScanClick} className="tye-btn tye-btn-primary flex items-center gap-2 text-xs">
            <RiFolderOpenLine className="w-4 h-4" /> Scan Folders Now
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pinned Repos */}
          {pinnedRepos.length > 0 && (
            <div>
              <h3 className="font-pixel text-xs uppercase tracking-wider opacity-60 mb-3 flex items-center gap-1.5">
                <RiPushpin2Line className="w-3.5 h-3.5 text-[var(--tye-lavender)]" /> Pinned Repositories (`F-006`)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pinnedRepos.map((repo) => (
                  <RepoCardView key={repo.id} repo={repo} onOpen={onOpenRepo} onTogglePin={(e) => handleTogglePin(e, repo.id, repo.is_pinned)} />
                ))}
              </div>
            </div>
          )}

          {/* Unpinned Repos */}
          {unpinnedRepos.length > 0 && (
            <div>
              <h3 className="font-pixel text-xs uppercase tracking-wider opacity-60 mb-3 flex items-center gap-1.5">
                <RiFolderOpenLine className="w-3.5 h-3.5 text-[var(--tye-ink)]/60" /> All Repositories ({unpinnedRepos.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {unpinnedRepos.map((repo) => (
                  <RepoCardView key={repo.id} repo={repo} onOpen={onOpenRepo} onTogglePin={(e) => handleTogglePin(e, repo.id, repo.is_pinned)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const RepoCardView: React.FC<{
  repo: RepoCard;
  onOpen: (path: string) => void;
  onTogglePin: (e: React.MouseEvent) => void;
}> = ({ repo, onOpen, onTogglePin }) => {
  return (
    <div
      onClick={() => onOpen(repo.path)}
      className="tye-card p-4 bg-white border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_var(--tye-ink)] transition-all cursor-pointer flex flex-col justify-between group"
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="font-bold font-pixel text-base truncate group-hover:text-[var(--tye-lavender)] transition-colors">
            {repo.name}
          </h4>
          <button
            onClick={onTogglePin}
            className={`p-1 border transition-all ${
              repo.is_pinned
                ? 'bg-[var(--tye-lavender)] text-white border-[var(--tye-ink)] shadow-[1px_1px_0px_0px_var(--tye-ink)]'
                : 'bg-[var(--tye-cream)] text-[var(--tye-ink)]/60 border-transparent hover:border-[var(--tye-ink)]'
            }`}
            title={repo.is_pinned ? 'Unpin repository' : 'Pin repository'}
          >
            <RiPushpin2Line className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="font-mono text-xs opacity-60 truncate mb-4" title={repo.path}>
          {repo.path}
        </p>

        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="flex items-center gap-1 px-2 py-0.5 bg-[var(--tye-cream)] border border-[var(--tye-ink)] font-bold">
            <RiGitBranchLine className="w-3 h-3 text-[var(--tye-lavender)]" />
            {repo.branch}
          </span>

          {repo.uncommitted_count > 0 ? (
            <span className="px-2 py-0.5 bg-[var(--tye-mustard)]/30 border border-[var(--tye-ink)] font-bold text-[var(--tye-ink)]">
              {repo.uncommitted_count} dirty
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 border border-[var(--tye-ink)] text-green-800 font-bold">
              <RiCheckDoubleLine className="w-3 h-3 text-green-700" /> clean
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-[var(--tye-ink)]/20 flex items-center justify-between text-[11px] font-mono opacity-60">
        <span className="truncate max-w-[200px]" title={repo.last_commit_subject}>
          {repo.last_commit_subject || 'No commits'}
        </span>
        <span className="flex-shrink-0 ml-2">Open →</span>
      </div>
    </div>
  );
};
