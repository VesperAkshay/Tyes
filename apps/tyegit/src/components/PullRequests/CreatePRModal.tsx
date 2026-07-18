import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiCloseLine, RiGitPullRequestLine } from 'react-icons/ri';
import { PullRequest } from '../../types';

interface CreatePRModalProps {
  repoPath: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pr: PullRequest) => void;
}

export const CreatePRModal: React.FC<CreatePRModalProps> = ({ repoPath, isOpen, onClose, onSuccess }) => {
  const [headBranch, setHeadBranch] = useState('main');
  const [baseBranch, setBaseBranch] = useState('main');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && repoPath) {
      // Try to fetch current branch for head_branch
      invoke<string>('git:plumbing_execute_safe', { repoPath, args: ['branch', '--show-current'] })
        .then(branch => {
          if (branch && branch.trim()) {
            setHeadBranch(branch.trim());
          }
        })
        .catch(console.error);

      // Try to get latest commit message for title
      invoke<string>('git:plumbing_execute_safe', { repoPath, args: ['log', '-1', '--pretty=%B'] })
        .then(msg => {
          if (msg && msg.trim()) {
            const lines = msg.trim().split('\n');
            setTitle(lines[0] || '');
            if (lines.length > 1) {
              setDescription(lines.slice(1).join('\n').trim());
            }
          }
        })
        .catch(console.error);
    }
  }, [isOpen, repoPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Title is required");
      return;
    }
    if (headBranch === baseBranch) {
      setErrorMsg("Head and Base branches cannot be the same");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      const pr = await invoke<PullRequest>('git:hosting_create_pull_request', {
        repoPath,
        title,
        description,
        headBranch,
        baseBranch
      });
      onSuccess(pr);
      onClose();
    } catch (err: any) {
      setErrorMsg(`Failed to create Pull Request: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--tye-ink)]/50 backdrop-blur-sm transition-opacity">
      <div className="bg-[var(--tye-cream)] border-2 border-[var(--tye-ink)] w-full max-w-lg shadow-[8px_8px_0_var(--tye-ink)] animate-fade-in flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-2 border-[var(--tye-ink)] bg-white">
          <div className="flex items-center gap-2">
            <RiGitPullRequestLine className="w-5 h-5 text-[var(--tye-lavender)]" />
            <h2 className="font-black text-lg uppercase tracking-widest">Create Pull Request</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-[var(--tye-ink)] hover:text-white transition-colors"
          >
            <RiCloseLine className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {errorMsg && (
            <div className="mb-6 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-mono">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--tye-ink)]/70">Base Branch (Target)</label>
                <input 
                  type="text" 
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  className="w-full bg-white border-2 border-[var(--tye-ink)] p-2 font-mono text-sm focus:outline-none focus:border-[var(--tye-lavender)] transition-colors"
                  placeholder="e.g. main"
                />
              </div>
              <div className="mt-6 text-xl">←</div>
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--tye-ink)]/70">Head Branch (Source)</label>
                <input 
                  type="text" 
                  value={headBranch}
                  onChange={(e) => setHeadBranch(e.target.value)}
                  className="w-full bg-[var(--tye-ink)]/5 border-2 border-[var(--tye-ink)] p-2 font-mono text-sm focus:outline-none cursor-not-allowed"
                  readOnly
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--tye-ink)]/70">Title</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white border-2 border-[var(--tye-ink)] p-2 font-bold text-sm focus:outline-none focus:border-[var(--tye-lavender)] transition-colors"
                placeholder="e.g. feat: add new auth provider"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--tye-ink)]/70">Description</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="w-full bg-white border-2 border-[var(--tye-ink)] p-2 font-mono text-xs focus:outline-none focus:border-[var(--tye-lavender)] transition-colors resize-y"
                placeholder="Describe your changes..."
              />
            </div>

            <div className="flex justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 border-2 border-[var(--tye-ink)] font-bold text-sm hover:bg-[var(--tye-ink)]/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2 border-2 border-[var(--tye-ink)] bg-[var(--tye-lavender)] text-white font-black uppercase tracking-wider text-sm hover:bg-[var(--tye-ink)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px]"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Create PR'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
