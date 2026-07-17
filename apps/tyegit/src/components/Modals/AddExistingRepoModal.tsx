import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RepoCard } from '../../types';
import { RiSearchLine, RiFolderAddLine, RiCheckboxLine, RiCheckboxBlankLine } from 'react-icons/ri';

interface AddExistingRepoModalProps {
  onClose: () => void;
  onSuccess: () => void;
  activeWorkspaceId: string;
}

export const AddExistingRepoModal: React.FC<AddExistingRepoModalProps> = ({ onClose, onSuccess, activeWorkspaceId }) => {
  const [repos, setRepos] = useState<RepoCard[]>([]);
  const [workspaceRepos, setWorkspaceRepos] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [repoData, groupData] = await Promise.all([
          invoke<RepoCard[]>('git:dashboard_get_repos'),
          invoke<any[]>('git:group_list', { projectId: 'default_project' })
        ]);
        
        const activeGroup = groupData.find(g => g.id === activeWorkspaceId);
        const inWorkspace = new Set<string>();
        if (activeGroup) {
          activeGroup.repos.forEach((r: any) => inWorkspace.add(r.id));
        }
        
        setRepos(repoData.filter(r => !inWorkspace.has(r.id)));
        setWorkspaceRepos(inWorkspace);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeWorkspaceId]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const filteredRepos = repos.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRepos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRepos.map(r => r.id)));
    }
  };

  const handleAdd = async () => {
    try {
      for (const repoId of selectedIds) {
        await invoke('git:group_add_repo', { groupId: activeWorkspaceId, repoId });
      }
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white border-2 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] max-w-2xl w-full flex flex-col max-h-[85vh]">
        <div className="bg-[var(--tye-lavender)] p-4 border-b-2 border-[var(--tye-ink)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--tye-ink)] font-bold font-pixel text-lg">
            <RiFolderAddLine className="w-5 h-5" /> Add Existing Repositories
          </div>
          <button onClick={onClose} className="font-mono font-bold text-sm hover:opacity-70">
            [X]
          </button>
        </div>

        <div className="p-4 border-b-2 border-[var(--tye-ink)] bg-[var(--tye-cream)]">
          <div className="relative">
            <RiSearchLine className="w-4 h-4 absolute left-3 top-3 text-[var(--tye-ink)]/50" />
            <input
              type="text"
              placeholder="Search unassigned repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm shadow-[2px_2px_0px_0px_var(--tye-ink)] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-white min-h-[300px]">
          {loading ? (
            <div className="h-full flex items-center justify-center opacity-50 font-mono text-sm">
              Loading...
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="h-full flex items-center justify-center opacity-70 font-mono text-sm text-center">
              No existing repositories found that are not already in this workspace.
            </div>
          ) : (
            <div className="flex flex-col gap-2 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--tye-ink)]/20 font-bold bg-[var(--tye-cream)] p-2">
                <button type="button" onClick={toggleSelectAll} className="flex items-center gap-2 hover:text-[var(--tye-lavender)]">
                  {selectedIds.size === filteredRepos.length && filteredRepos.length > 0 ? (
                    <RiCheckboxLine className="w-4 h-4 text-[var(--tye-lavender)]" />
                  ) : (
                    <RiCheckboxBlankLine className="w-4 h-4" />
                  )}
                  <span>Select All ({filteredRepos.length})</span>
                </button>
                <span>{selectedIds.size} Selected</span>
              </div>

              {filteredRepos.map(repo => (
                <div
                  key={repo.id}
                  onClick={() => toggleSelect(repo.id)}
                  className={`p-2 border border-[var(--tye-ink)]/30 cursor-pointer flex flex-col gap-1 transition-colors ${
                    selectedIds.has(repo.id) ? 'bg-[var(--tye-lavender)]/20 border-[var(--tye-ink)] font-bold' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    {selectedIds.has(repo.id) ? <RiCheckboxLine className="w-4 h-4 text-[var(--tye-lavender)] flex-shrink-0" /> : <RiCheckboxBlankLine className="w-4 h-4 opacity-40 flex-shrink-0" />}
                    <span className="font-bold truncate text-sm">{repo.name}</span>
                  </div>
                  <div className="pl-6 text-[10px] opacity-70 truncate">{repo.path}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t-2 border-[var(--tye-ink)] flex justify-between items-center bg-[var(--tye-cream)]">
          <button onClick={onClose} className="tye-btn bg-white text-sm">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={selectedIds.size === 0}
            className="tye-btn tye-btn-primary text-sm font-bold"
          >
            Add Selected ({selectedIds.size})
          </button>
        </div>
      </div>
    </div>
  );
};
