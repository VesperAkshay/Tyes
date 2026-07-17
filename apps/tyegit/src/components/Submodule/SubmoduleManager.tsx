import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiGitRepositoryLine, RiRefreshLine, RiDownloadCloud2Line, RiErrorWarningLine, RiAddLine } from 'react-icons/ri';

interface SubmoduleInfo {
  name: string;
  path: string;
  url: string;
  current_oid: string | null;
  head_oid: string | null;
  is_dirty: boolean;
  branch: string | null;
}

interface SubmoduleManagerProps {
  repoPath: string;
}

export const SubmoduleManager: React.FC<SubmoduleManagerProps> = ({ repoPath }) => {
  const [submodules, setSubmodules] = useState<SubmoduleInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addPath, setAddPath] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const fetchSubmodules = async () => {
    try {
      setLoading(true);
      setError(null);
      const data: SubmoduleInfo[] = await invoke('git:submodule_list', { repoPath });
      setSubmodules(data);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmodules();
  }, [repoPath]);

  const handleInit = async (name: string) => {
    try {
      await invoke('git:submodule_init', { repoPath, name });
      fetchSubmodules();
    } catch (err: any) {
      alert(`Init failed: ${err}`);
    }
  };

  const handleUpdate = async (name: string) => {
    try {
      await invoke('git:submodule_update', { repoPath, name });
      fetchSubmodules();
    } catch (err: any) {
      alert(`Update failed: ${err}`);
    }
  };

  const handleSync = async (name: string) => {
    try {
      await invoke('git:submodule_sync', { repoPath, name });
      fetchSubmodules();
    } catch (err: any) {
      alert(`Sync failed: ${err}`);
    }
  };

  const handleAddSubmodule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUrl) return;
    try {
      setAddLoading(true);
      await invoke('git:submodule_add', { 
        repoPath, 
        url: addUrl, 
        path: addPath.trim() || null 
      });
      setAddUrl('');
      setAddPath('');
      setIsAdding(false);
      fetchSubmodules();
    } catch (err: any) {
      alert(`Add failed: ${err}`);
    } finally {
      setAddLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-[var(--tye-ink)] font-mono">Loading Submodules...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[var(--tye-cream)] p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6 border-b-2 border-[var(--tye-ink)] pb-4">
        <h2 className="font-pixel text-2xl text-[var(--tye-ink)] flex items-center gap-2">
          <RiGitRepositoryLine /> Submodule Manager
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="px-3 py-1.5 border border-[var(--tye-ink)] font-mono text-sm bg-[var(--tye-lavender)] text-white hover:bg-[var(--tye-ink)] transition-colors"
          >
            <RiAddLine className="inline mr-1" /> Add Submodule
          </button>
          <button
            onClick={fetchSubmodules}
            className="px-3 py-1.5 border border-[var(--tye-ink)] font-mono text-sm hover:bg-[var(--tye-ink)] hover:text-white transition-colors"
          >
            <RiRefreshLine className="inline mr-1" /> Refresh
          </button>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleAddSubmodule} className="mb-6 p-4 border-2 border-[var(--tye-ink)] bg-white shadow-[4px_4px_0px_var(--tye-ink)] flex flex-col gap-3">
          <h3 className="font-bold font-mono text-sm">Add New Submodule</h3>
          <div className="flex gap-3">
            <input 
              type="text" 
              placeholder="Git URL (required, e.g., https://github.com/...)" 
              className="flex-1 px-3 py-2 border-2 border-[var(--tye-ink)] font-mono text-sm outline-none focus:shadow-[2px_2px_0px_var(--tye-lavender)]"
              value={addUrl}
              onChange={e => setAddUrl(e.target.value)}
              required
              disabled={addLoading}
            />
            <input 
              type="text" 
              placeholder="Path (optional, e.g., libs/my-lib)" 
              className="w-1/3 px-3 py-2 border-2 border-[var(--tye-ink)] font-mono text-sm outline-none focus:shadow-[2px_2px_0px_var(--tye-lavender)]"
              value={addPath}
              onChange={e => setAddPath(e.target.value)}
              disabled={addLoading}
            />
            <button 
              type="submit"
              disabled={addLoading || !addUrl}
              className="px-6 py-2 bg-[var(--tye-ink)] text-white font-bold font-mono hover:bg-black disabled:opacity-50 shadow-[2px_2px_0px_var(--tye-lavender)] border-2 border-transparent"
            >
              {addLoading ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-900 border-2 border-red-900 font-mono text-sm shadow-[2px_2px_0px_red]">
          {error}
        </div>
      )}

      {submodules.length === 0 ? (
        <div className="text-gray-500 font-mono text-sm bg-white p-6 border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_var(--tye-ink)]">
          No submodules detected in this repository. Click "Add Submodule" above to create one.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {submodules.map((sub, i) => {
            const isOutOfSync = sub.current_oid !== sub.head_oid;
            return (
              <div key={i} className="border-2 border-[var(--tye-ink)] bg-white p-5 shadow-[4px_4px_0px_var(--tye-ink)] flex items-center justify-between">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-bold font-mono text-lg text-[var(--tye-ink)]">{sub.name}</span>
                    {sub.is_dirty && (
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-xs font-mono font-bold rounded flex items-center gap-1">
                        <RiErrorWarningLine /> Dirty
                      </span>
                    )}
                    {isOutOfSync && (
                      <span className="px-2 py-0.5 bg-rose-200 text-rose-900 text-xs font-mono font-bold rounded">
                        Out of Sync
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-mono text-gray-600">
                    <div className="truncate w-96">URL: {sub.url}</div>
                    <div>Path: {sub.path}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      HEAD: <span className="font-bold">{sub.head_oid?.substring(0,8) || 'Unknown'}</span> | 
                      Index: <span className="font-bold">{sub.current_oid?.substring(0,8) || 'Unknown'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 min-w-[120px]">
                  <button
                    onClick={() => handleUpdate(sub.name)}
                    className="w-full px-3 py-1.5 bg-[var(--tye-lavender)] text-white hover:bg-[var(--tye-ink)] text-xs font-mono font-bold flex justify-center items-center gap-1 transition-colors"
                  >
                    <RiDownloadCloud2Line /> Update
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleInit(sub.name)}
                      className="flex-1 px-2 py-1 border border-[var(--tye-ink)] hover:bg-gray-100 text-[10px] font-mono font-bold"
                    >
                      Init
                    </button>
                    <button
                      onClick={() => handleSync(sub.name)}
                      className="flex-1 px-2 py-1 border border-[var(--tye-ink)] hover:bg-gray-100 text-[10px] font-mono font-bold"
                    >
                      Sync
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
