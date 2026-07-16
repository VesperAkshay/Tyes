import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { RepoCard } from '../types';
import { 
  RiPushpin2Line, RiFolderOpenLine, RiGitBranchLine, RiErrorWarningLine, 
  RiAddLine, RiDownload2Line, RiSearchLine, RiCheckDoubleLine,
  RiLayoutGridFill, RiListCheck, RiDeleteBin6Line, RiCloseLine, RiTimeLine
} from 'react-icons/ri';

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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [repoToDelete, setRepoToDelete] = useState<RepoCard | null>(null);

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

  useEffect(() => {
    let unlisten: UnlistenFn;
    listen('tauri://drop', async (event: any) => {
      const paths = event.payload as string[];
      if (paths && paths.length > 0) {
        for (const path of paths) {
          try {
            await invoke('git:repo_init', {
              path: path,
              initReadme: false,
              gitignoreTemplate: null,
              license: null
            });
          } catch (err: any) {
            console.error(`Failed to register dropped repo ${path}:`, err);
          }
        }
        fetchRepos();
      }
    }).then(fn => { unlisten = fn });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleTogglePin = async (e: React.MouseEvent, repoId: string, currentPin: boolean) => {
    e.stopPropagation();
    try {
      await invoke('git:dashboard_pin_repo', { repoId, pinned: !currentPin });
      fetchRepos();
    } catch (err: any) {
      setError(`Failed to pin repository: ${err}`);
    }
  };

  const handleRemoveRepo = async () => {
    if (!repoToDelete) return;
    try {
      await invoke('git:dashboard_remove_repo', { repoId: repoToDelete.id });
      fetchRepos();
    } catch (err: any) {
      setError(`Failed to remove repo: ${err}`);
    } finally {
      setRepoToDelete(null);
    }
  };

  const filteredRepos = repos.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinnedRepos = filteredRepos.filter(r => r.is_pinned);
  const unpinnedRepos = filteredRepos.filter(r => !r.is_pinned);

  // Group unpinned repos chronologically
  const isToday = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    return d.getDate() === today.getDate() &&
           d.getMonth() === today.getMonth() &&
           d.getFullYear() === today.getFullYear();
  };

  const isThisWeek = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - d.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7 && !isToday(dateStr);
  };

  const todayRepos = unpinnedRepos.filter(r => r.last_opened && isToday(r.last_opened));
  const weekRepos = unpinnedRepos.filter(r => r.last_opened && isThisWeek(r.last_opened));
  const olderRepos = unpinnedRepos.filter(r => !r.last_opened || (!isToday(r.last_opened) && !isThisWeek(r.last_opened)));

  const DeleteConfirmModal = repoToDelete ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[400px] bg-[var(--tye-cream)] border-2 border-[var(--tye-ink)] shadow-[6px_6px_0px_0px_var(--tye-ink)]">
        <div className="flex items-center justify-between px-4 py-3 bg-[var(--tye-ink)] text-white">
          <span className="font-pixel font-bold text-sm tracking-wide">Remove Repository</span>
          <button onClick={() => setRepoToDelete(null)} className="hover:text-[var(--tye-lavender)]">
            <RiCloseLine className="text-lg" />
          </button>
        </div>
        <div className="p-5 font-mono text-sm flex flex-col gap-3 text-[var(--tye-ink)]">
          <p>Are you sure you want to remove <strong>{repoToDelete.name}</strong> from Tyegit?</p>
          <div className="bg-amber-100 border border-amber-500 text-amber-900 px-3 py-2 text-xs flex items-start gap-2">
            <RiErrorWarningLine className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>This will only remove the repository from the Tyegit dashboard. It will <strong>NOT</strong> delete your actual files on disk.</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t-2 border-[var(--tye-ink)] bg-[var(--tye-cream)]/50">
          <button onClick={() => setRepoToDelete(null)} className="tye-btn bg-white">Cancel</button>
          <button onClick={handleRemoveRepo} className="tye-btn bg-red-600 text-white border-red-800 shadow-[2px_2px_0px_0px_#991b1b] hover:bg-red-700">Remove</button>
        </div>
      </div>
    </div>
  ) : null;

  const renderGroup = (title: string, reposArray: RepoCard[], icon: React.ReactNode) => {
    if (reposArray.length === 0) return null;
    return (
      <div className="mb-6">
        <h3 className="font-pixel text-xs uppercase tracking-wider opacity-60 mb-3 flex items-center gap-1.5">
          {icon} {title}
        </h3>
        <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "flex flex-col gap-2"}>
          {reposArray.map((repo) => (
            <RepoCardView 
              key={repo.id} 
              repo={repo} 
              viewMode={viewMode}
              onOpen={onOpenRepo} 
              onTogglePin={(e) => handleTogglePin(e, repo.id, repo.is_pinned)} 
              onDelete={(e) => { e.stopPropagation(); setRepoToDelete(repo); }}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 bg-[var(--tye-cream)] text-[var(--tye-ink)]">
      {DeleteConfirmModal}
      
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

      {/* Toolbar */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1">
          <RiSearchLine className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--tye-ink)]/50" />
          <input
            type="text"
            placeholder="Search repositories by name or path..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm shadow-[3px_3px_0px_0px_var(--tye-ink)] focus:outline-none focus:translate-x-0.5 focus:translate-y-0.5 focus:shadow-[1px_1px_0px_0px_var(--tye-ink)] transition-all"
          />
        </div>
        <div className="flex items-center bg-white border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] p-1">
          <button 
            onClick={() => setViewMode('grid')}
            className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-[var(--tye-ink)] text-white' : 'text-[var(--tye-ink)] hover:bg-[var(--tye-cream)]'}`}
            title="Grid View"
          >
            <RiLayoutGridFill className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-[var(--tye-ink)] text-white' : 'text-[var(--tye-ink)] hover:bg-[var(--tye-cream)]'}`}
            title="List View"
          >
            <RiListCheck className="w-4 h-4" />
          </button>
        </div>
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
          <h3 className="font-bold text-lg mb-1">No Repositories Found</h3>
          <p className="text-xs opacity-70 max-w-sm mb-6">
            You haven't registered any repositories yet, or none match your search. You can also drag and drop a folder here!
          </p>
          <button onClick={onScanClick} className="tye-btn tye-btn-primary flex items-center gap-2 text-xs">
            <RiFolderOpenLine className="w-4 h-4" /> Scan Folders Now
          </button>
        </div>
      ) : (
        <div className="space-y-2 pb-8">
          {renderGroup("Pinned", pinnedRepos, <RiPushpin2Line className="w-3.5 h-3.5 text-[var(--tye-lavender)]" />)}
          {renderGroup("Today", todayRepos, <RiTimeLine className="w-3.5 h-3.5 text-[var(--tye-ink)]/60" />)}
          {renderGroup("Earlier this Week", weekRepos, <RiTimeLine className="w-3.5 h-3.5 text-[var(--tye-ink)]/60" />)}
          {renderGroup("Older", olderRepos, <RiFolderOpenLine className="w-3.5 h-3.5 text-[var(--tye-ink)]/60" />)}
        </div>
      )}
    </div>
  );
};

const RepoCardView: React.FC<{
  repo: RepoCard;
  viewMode: 'grid' | 'list';
  onOpen: (path: string) => void;
  onTogglePin: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}> = ({ repo, viewMode, onOpen, onTogglePin, onDelete }) => {
  const isDirty = repo.uncommitted_count > 0;
  
  if (viewMode === 'list') {
    return (
      <div
        onClick={() => onOpen(repo.path)}
        className="tye-card px-4 py-3 bg-white border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_var(--tye-ink)] transition-all cursor-pointer flex items-center justify-between group"
      >
        <div className="flex items-center gap-4 overflow-hidden flex-1">
          {/* Health Indicator Dot */}
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isDirty ? 'bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.6)]' : 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]'}`} title={isDirty ? 'Uncommitted changes' : 'Clean working tree'}></div>
          
          <div className="flex flex-col truncate w-[25%]">
            <h4 className="font-bold font-pixel text-sm truncate group-hover:text-[var(--tye-lavender)] transition-colors">
              {repo.name}
            </h4>
            <p className="font-mono text-[10px] opacity-50 truncate" title={repo.path}>{repo.path}</p>
          </div>
          
          <div className="flex items-center gap-1 font-mono text-[10px] w-[15%]">
            <RiGitBranchLine className="w-3 h-3 text-[var(--tye-lavender)]" />
            <span className="truncate">{repo.branch}</span>
          </div>
          
          <div className="font-mono text-[10px] opacity-60 truncate flex-1">
            {repo.last_commit_subject || 'No commits'}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
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
          <button
            onClick={onDelete}
            className="p-1 border border-transparent text-[var(--tye-ink)]/40 hover:border-red-500 hover:text-red-600 hover:bg-red-50 transition-all"
            title="Remove from Dashboard"
          >
            <RiDeleteBin6Line className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Grid view (Default)
  return (
    <div
      onClick={() => onOpen(repo.path)}
      className="tye-card p-4 bg-white border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_var(--tye-ink)] transition-all cursor-pointer flex flex-col justify-between group h-full"
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 overflow-hidden">
            {/* Health Indicator Dot */}
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isDirty ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]' : 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]'}`} title={isDirty ? 'Uncommitted changes' : 'Clean working tree'}></div>
            <h4 className="font-bold font-pixel text-base truncate group-hover:text-[var(--tye-lavender)] transition-colors">
              {repo.name}
            </h4>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
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
            <button
              onClick={onDelete}
              className="p-1 border border-transparent text-[var(--tye-ink)]/40 hover:border-red-500 hover:text-red-600 hover:bg-red-50 transition-all"
              title="Remove from Dashboard"
            >
              <RiDeleteBin6Line className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="font-mono text-xs opacity-60 truncate mb-4" title={repo.path}>
          {repo.path}
        </p>

        <div className="flex items-center gap-3 font-mono text-xs flex-wrap">
          <span className="flex items-center gap-1 px-2 py-0.5 bg-[var(--tye-cream)] border border-[var(--tye-ink)] font-bold">
            <RiGitBranchLine className="w-3 h-3 text-[var(--tye-lavender)]" />
            {repo.branch}
          </span>

          {isDirty ? (
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
