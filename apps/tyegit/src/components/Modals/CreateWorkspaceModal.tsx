import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiCloseLine, RiFolderAddLine, RiErrorWarningLine } from 'react-icons/ri';

interface CreateWorkspaceModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateWorkspaceModal: React.FC<CreateWorkspaceModalProps> = ({ onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
      await invoke('git:group_create', { name: name.trim() });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[450px] bg-[var(--tye-cream)] border-2 border-[var(--tye-ink)] shadow-[6px_6px_0px_0px_var(--tye-ink)]">
        <div className="flex items-center justify-between px-4 py-3 bg-[var(--tye-ink)] text-white">
          <span className="font-pixel font-bold text-sm tracking-wide flex items-center gap-2">
            <RiFolderAddLine /> New Workspace
          </span>
          <button onClick={onClose} className="hover:text-[var(--tye-lavender)] transition-colors">
            <RiCloseLine className="text-lg" />
          </button>
        </div>

        <div className="p-6">
          <p className="font-mono text-sm opacity-80 mb-4">
            Create a Workspace to categorize your repositories (e.g., "Client Projects", "Open Source").
          </p>

          <input
            type="text"
            placeholder="Workspace Name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
            }}
            className="w-full px-3 py-2 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm shadow-[3px_3px_0px_0px_var(--tye-ink)] focus:outline-none focus:translate-x-0.5 focus:translate-y-0.5 focus:shadow-[1px_1px_0px_0px_var(--tye-ink)] transition-all mb-4"
            autoFocus
          />

          {error && (
            <div className="bg-red-100 border border-red-500 text-red-900 px-3 py-2 text-xs font-mono flex items-start gap-2 mb-4">
              <RiErrorWarningLine className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t-2 border-[var(--tye-ink)] bg-[var(--tye-cream)]/50">
          <button onClick={onClose} className="tye-btn bg-white">Cancel</button>
          <button 
            onClick={handleCreate} 
            disabled={loading || !name.trim()}
            className="tye-btn tye-btn-primary"
          >
            {loading ? 'Creating...' : 'Create Workspace'}
          </button>
        </div>
      </div>
    </div>
  );
};
