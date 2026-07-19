import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiCloseLine, RiLockPasswordLine, RiCodeBoxLine, RiSave3Line } from 'react-icons/ri';

interface SettingsFormModalProps {
  repoPath: string;
  type: 'variable' | 'secret';
  onClose: () => void;
  onSuccess: () => void;
}

export const SettingsFormModal: React.FC<SettingsFormModalProps> = ({ repoPath, type, onClose, onSuccess }) => {
  const [name, setName] = useState<string>('');
  const [value, setValue] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !value.trim()) return;

    setLoading(true);
    setError(null);
    try {
      if (type === 'secret') {
        await invoke('git:cicd_add_secret', { repoPath, name: name.trim().toUpperCase(), value: value.trim() });
      } else {
        await invoke('git:cicd_add_variable', { repoPath, name: name.trim().toUpperCase(), value: value.trim() });
      }
      onSuccess();
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-[var(--tye-cream)] border-2 border-[var(--tye-ink)] shadow-[6px_6px_0px_0px_var(--tye-ink)] w-full max-w-md overflow-hidden flex flex-col font-sans">
        
        {/* Header */}
        <div className="bg-white px-4 py-3 border-b-2 border-[var(--tye-ink)] flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-[var(--tye-ink)]">
            {type === 'secret' ? <RiLockPasswordLine className="text-xl text-[var(--tye-terracotta)]" /> : <RiCodeBoxLine className="text-xl text-[var(--tye-primary)]" />}
            <span>Add New {type === 'secret' ? 'Secret' : 'Variable'}</span>
          </div>
          <button onClick={onClose} className="hover:bg-gray-200 p-1 rounded transition-colors text-[var(--tye-ink)]">
            <RiCloseLine className="text-xl" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm opacity-70">
            {type === 'secret' 
              ? 'Secrets are securely encrypted using Libsodium X25519 before being transmitted to GitHub.' 
              : 'Variables are stored in plaintext and accessible by CI/CD runs.'}
          </p>
          
          {error && (
            <div className="bg-rose-100 text-rose-900 border-2 border-rose-800 p-3 text-sm font-mono shadow-[2px_2px_0px_0px_var(--tye-ink)]">
              {error}
            </div>
          )}

          <form id="settingsForm" onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-bold text-[var(--tye-ink)]">Name (Key)</label>
              <input
                type="text"
                placeholder={`e.g. ${type === 'secret' ? 'AWS_ACCESS_KEY_ID' : 'NODE_ENV'}`}
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                className="px-3 py-2 border-2 border-[var(--tye-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--tye-primary)] font-mono text-sm uppercase bg-white"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-bold text-[var(--tye-ink)]">Value</label>
              <textarea
                placeholder="Enter value here..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="px-3 py-2 border-2 border-[var(--tye-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--tye-primary)] font-mono text-sm min-h-[100px] bg-white"
                required
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="bg-white px-6 py-4 border-t-2 border-[var(--tye-ink)] flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border-2 border-[var(--tye-ink)] text-[var(--tye-ink)] hover:bg-gray-100 font-bold active:translate-y-[1px] transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="settingsForm"
            disabled={loading || !name || !value}
            className="px-4 py-2 bg-[var(--tye-ink)] text-white hover:bg-gray-800 font-bold active:translate-y-[1px] transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <span className="animate-pulse">Saving...</span> : <><RiSave3Line /> Save {type === 'secret' ? 'Secret' : 'Variable'}</>}
          </button>
        </div>
      </div>
    </div>
  );
};
