import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RepositoryHandle } from '../../types';
import { RiDownload2Line, RiGitBranchLine, RiFolderOpenLine } from 'react-icons/ri';

interface CloneRepoModalProps {
  onClose: () => void;
  onSuccess: (repo: RepositoryHandle) => void;
}

export const CloneRepoModal: React.FC<CloneRepoModalProps> = ({ onClose, onSuccess }) => {
  const [url, setUrl] = useState('');
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUrlChange = (val: string) => {
    setUrl(val);
    // Auto-suggest destination directory name if path is empty or matches previous auto-suggest
    if (val) {
      const cleaned = val.replace(/\/$/, '').split(/[\/\\]/).pop()?.replace(/\.git$/, '');
      if (cleaned) {
        setPath(`F:\\Projects\\${cleaned}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !path) return;
    try {
      setLoading(true);
      setError(null);
      const handle: RepositoryHandle = await invoke('git:repo_clone', {
        url,
        path,
      });
      onSuccess(handle);
      onClose();
    } catch (err: any) {
      setError(err?.toString() || 'Cloning failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--tye-ink)]/70 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white border-2 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[var(--tye-lavender)] p-4 border-b-2 border-[var(--tye-ink)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--tye-ink)] font-bold font-pixel text-lg">
            <RiDownload2Line className="w-5 h-5" /> Clone Remote Repository (`F-009`)
          </div>
          <button onClick={onClose} className="font-mono font-bold text-sm hover:opacity-70">
            [X]
          </button>
        </div>

        {error && (
          <div className="m-4 p-3 bg-red-100 border-2 border-red-700 text-red-900 font-mono text-xs break-all">
            ❌ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          <div>
            <label className="block text-xs font-mono font-bold uppercase mb-1 flex items-center gap-1">
              <RiGitBranchLine className="w-3.5 h-3.5" /> Remote Repository URL (HTTPS or SSH)
            </label>
            <input
              type="text"
              value={url}
              onChange={e => handleUrlChange(e.target.value)}
              placeholder="https://github.com/tyes/example.git or git@github.com:tyes/example.git"
              required
              className="w-full px-3 py-2 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tye-lavender)] shadow-[2px_2px_0px_0px_var(--tye-ink)]"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-bold uppercase mb-1 flex items-center gap-1">
              <RiFolderOpenLine className="w-3.5 h-3.5" /> Destination Local Directory
            </label>
            <input
              type="text"
              value={path}
              onChange={e => setPath(e.target.value)}
              placeholder="F:\Projects\example"
              required
              className="w-full px-3 py-2 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tye-lavender)] shadow-[2px_2px_0px_0px_var(--tye-ink)]"
            />
          </div>

          {loading && (
            <div className="p-4 bg-[var(--tye-lavender)]/20 border border-[var(--tye-ink)] font-mono text-xs flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-[var(--tye-ink)] border-t-transparent animate-spin rounded-full"></div>
              <div>
                <div className="font-bold">Cloning objects and checking out working tree...</div>
                <div className="opacity-70">Transfer callbacks active via `tye-core-vault` & libgit2.</div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t-2 border-[var(--tye-ink)] flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="tye-btn bg-white text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="tye-btn tye-btn-primary text-sm flex items-center gap-2"
            >
              <RiDownload2Line className="w-4 h-4" />
              {loading ? 'Cloning...' : 'Start Clone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
