import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RepositoryHandle } from '../../types';
import { RiSearchLine, RiFolderOpenLine, RiCheckboxLine, RiCheckboxBlankLine, RiFilterLine } from 'react-icons/ri';

interface AutoDiscoveryModalProps {
  onClose: () => void;
  onSuccess: (found: RepositoryHandle[]) => void;
}

export const AutoDiscoveryModal: React.FC<AutoDiscoveryModalProps> = ({ onClose, onSuccess }) => {
  const [rootDirs, setRootDirs] = useState('F:\\Tyes');
  const [excludePatterns, setExcludePatterns] = useState('node_modules, .cargo, target, dist, .venv');
  const [discovered, setDiscovered] = useState<RepositoryHandle[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setScanning(true);
      setError(null);
      const roots = rootDirs.split(';').map(s => s.trim()).filter(Boolean);
      const excludes = excludePatterns.split(',').map(s => s.trim()).filter(Boolean);

      const res: RepositoryHandle[] = await invoke('git:discovery_scan', {
        rootDirs: roots,
        excludePatterns: excludes,
      });

      setDiscovered(res);
      setSelectedIds(new Set(res.map(r => r.id)));
      setHasScanned(true);
    } catch (err: any) {
      setError(err?.toString() || 'Discovery scan failed');
    } finally {
      setScanning(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === discovered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(discovered.map(r => r.id)));
    }
  };

  const handleImport = () => {
    const imported = discovered.filter(d => selectedIds.has(d.id));
    onSuccess(imported);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--tye-ink)]/70 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white border-2 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[var(--tye-lavender)] p-4 border-b-2 border-[var(--tye-ink)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--tye-ink)] font-bold font-pixel text-lg">
            <RiFolderOpenLine className="w-5 h-5" /> Auto-Discover Repositories (`F-007`)
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

        <form onSubmit={handleScan} className="flex flex-col gap-4 p-6 pb-2">
          <div>
            <label className="block text-xs font-mono font-bold uppercase mb-1">
              Root Directories to Scan (Semicolon separated `;`)
            </label>
            <input
              type="text"
              value={rootDirs}
              onChange={e => setRootDirs(e.target.value)}
              placeholder="F:\Tyes; C:\Projects"
              required
              className="w-full px-3 py-2 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tye-lavender)] shadow-[2px_2px_0px_0px_var(--tye-ink)]"
            />
          </div>

          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs font-mono font-bold uppercase mb-1 flex items-center gap-1">
                <RiFilterLine className="w-3.5 h-3.5" /> Exclude Patterns (Comma separated)
              </label>
              <input
                type="text"
                value={excludePatterns}
                onChange={e => setExcludePatterns(e.target.value)}
                placeholder="node_modules, target, .cargo"
                className="w-full px-3 py-2 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tye-lavender)] shadow-[2px_2px_0px_0px_var(--tye-ink)]"
              />
            </div>

            <button
              type="submit"
              disabled={scanning}
              className="tye-btn tye-btn-primary text-sm flex items-center gap-2 h-[42px] px-5"
            >
              <RiSearchLine className="w-4 h-4" />
              {scanning ? 'WalkDir Scanning...' : 'Start Parallel Scan'}
            </button>
          </div>
        </form>

        {/* Scan Results Area */}
        <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[360px] border-2 border-[var(--tye-ink)] bg-white p-3 font-mono text-xs m-6 mt-2 mb-4 shadow-[3px_3px_0px_0px_var(--tye-ink)]">
          {!hasScanned ? (
            <div className="h-full flex items-center justify-center text-center opacity-50 p-6">
              Enter root directories above and click "Start Parallel Scan" to recursively locate all `.git` repositories using high-performance tokio tasks.
            </div>
          ) : discovered.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center opacity-70 p-6 font-bold text-red-700">
              No Git repositories found in the specified root directories.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--tye-ink)]/20 font-bold bg-[var(--tye-cream)] p-2">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 hover:text-[var(--tye-lavender)]"
                >
                  {selectedIds.size === discovered.length ? <RiCheckboxLine className="w-4 h-4 text-[var(--tye-lavender)]" /> : <RiCheckboxBlankLine className="w-4 h-4" />}
                  <span>Select All ({discovered.length} Discovered)</span>
                </button>
                <span>{selectedIds.size} Selected</span>
              </div>

              {discovered.map(d => (
                <div
                  key={d.id}
                  onClick={() => toggleSelect(d.id)}
                  className={`p-2 border border-[var(--tye-ink)]/30 cursor-pointer flex items-center justify-between transition-colors ${
                    selectedIds.has(d.id) ? 'bg-[var(--tye-lavender)]/20 border-[var(--tye-ink)] font-bold' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    {selectedIds.has(d.id) ? <RiCheckboxLine className="w-4 h-4 text-[var(--tye-lavender)] flex-shrink-0" /> : <RiCheckboxBlankLine className="w-4 h-4 opacity-40 flex-shrink-0" />}
                    <span className="truncate">{d.path}</span>
                  </div>
                  <span className="px-1.5 py-0.5 bg-white border text-[10px] uppercase flex-shrink-0">
                    {d.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 pt-3 border-t-2 border-[var(--tye-ink)] flex justify-between items-center bg-[var(--tye-cream)]">
          <span className="text-xs font-mono opacity-70">
            Discovered repositories are automatically indexed in `git_repositories`.
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="tye-btn bg-white text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={selectedIds.size === 0}
              className="tye-btn tye-btn-primary text-sm font-bold"
            >
              Import Selected ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
