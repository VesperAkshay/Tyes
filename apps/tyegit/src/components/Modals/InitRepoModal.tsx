import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RepositoryHandle } from '../../types';
import { RiAddLine, RiFolderAddLine, RiFileTextLine, RiCodeSSlashLine, RiScales3Line } from 'react-icons/ri';

interface InitRepoModalProps {
  onClose: () => void;
  onSuccess: (repo: RepositoryHandle) => void;
}

export const InitRepoModal: React.FC<InitRepoModalProps> = ({ onClose, onSuccess }) => {
  const [path, setPath] = useState('');
  const [readmeTitle, setReadmeTitle] = useState('New Repository');
  const [readmeDescription, setReadmeDescription] = useState('Initialized with Tyegit Engine (`F-008`).');
  const [gitignoreTemplate, setGitignoreTemplate] = useState('None');
  const [licenseType, setLicenseType] = useState('None');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const handle: RepositoryHandle = await invoke('git:repo_init', {
        path: path.trim(),
        initReadme: readmeTitle.trim() !== '',
        gitignoreTemplate: gitignoreTemplate === 'None' ? null : gitignoreTemplate,
        license: licenseType === 'None' ? null : licenseType,
      });
      onSuccess(handle);
      onClose();
    } catch (err: any) {
      setError(err?.toString() || 'Repository initialization failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--tye-ink)]/70 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white border-2 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[var(--tye-lavender)] p-4 border-b-2 border-[var(--tye-ink)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--tye-ink)] font-bold font-pixel text-lg">
            <RiFolderAddLine className="w-5 h-5" /> Initialize Repository (`F-008`)
          </div>
          <button onClick={onClose} className="font-mono font-bold text-sm hover:opacity-70">
            [X]
          </button>
        </div>

        {error && (
          <div className="m-4 p-3 bg-red-100 border-2 border-red-700 text-red-900 font-mono text-xs">
            ❌ {error}
          </div>
        )}

        <form onSubmit={handleInit} className="flex flex-col gap-5 p-6 overflow-y-auto">
          <div>
            <label className="block text-xs font-mono font-bold uppercase mb-1">
              Absolute Directory Path
            </label>
            <input
              type="text"
              value={path}
              onChange={e => setPath(e.target.value)}
              placeholder="e.g. F:\Projects\MyNewService or C:\Code\App"
              required
              className="w-full px-3 py-2 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tye-lavender)] shadow-[2px_2px_0px_0px_var(--tye-ink)]"
            />
            <p className="text-xs font-mono opacity-60 mt-1.5">
              Directory will be created if it does not already exist.
            </p>
          </div>

          <div className="flex flex-col gap-2 p-3.5 bg-[var(--tye-cream)]/40 border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
            <span className="text-xs font-mono font-bold uppercase flex items-center gap-1.5 text-[var(--tye-ink)]">
              <RiFileTextLine className="w-4 h-4 text-[var(--tye-lavender)]" /> README Configuration (`F-008`)
            </span>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={readmeTitle}
                onChange={e => setReadmeTitle(e.target.value)}
                placeholder="README Title"
                className="w-1/2 px-3 py-1.5 bg-white border-2 border-[var(--tye-ink)] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--tye-lavender)]"
              />
              <input
                type="text"
                value={readmeDescription}
                onChange={e => setReadmeDescription(e.target.value)}
                placeholder="Description..."
                className="w-1/2 px-3 py-1.5 bg-white border-2 border-[var(--tye-ink)] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--tye-lavender)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono font-bold uppercase mb-1 flex items-center gap-1">
                <RiCodeSSlashLine className="w-3.5 h-3.5" /> `.gitignore` Template
              </label>
              <select
                value={gitignoreTemplate}
                onChange={e => setGitignoreTemplate(e.target.value)}
                className="w-full px-3 py-2 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm shadow-[2px_2px_0px_0px_var(--tye-ink)]"
              >
                <option value="None">None</option>
                <option value="rust">Rust (`target/`, `.pdb`)</option>
                <option value="node">Node.js (`node_modules/`)</option>
                <option value="python">Python (`__pycache__/`, `.venv/`)</option>
                <option value="go">Go (`bin/`, `*.exe`)</option>
                <option value="java">Java (`*.class`, `target/`)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase mb-1 flex items-center gap-1">
                <RiScales3Line className="w-3.5 h-3.5" /> Open Source License
              </label>
              <select
                value={licenseType}
                onChange={e => setLicenseType(e.target.value)}
                className="w-full px-3 py-2 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm shadow-[2px_2px_0px_0px_var(--tye-ink)]"
              >
                <option value="None">None</option>
                <option value="MIT">MIT License</option>
                <option value="Apache-2.0">Apache 2.0 License</option>
              </select>
            </div>
          </div>

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
              <RiAddLine className="w-4 h-4" />
              {loading ? 'Initializing Git...' : 'Initialize Repository'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
