import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CheckpointItem } from '../../types';
import { RiPushpinLine, RiCloseLine, RiSaveLine } from 'react-icons/ri';

interface PinSaveStateModalProps {
  repoPath: string;
  isOpen: boolean;
  onClose: () => void;
  onPinned: (item: CheckpointItem) => void;
}

export const PinSaveStateModal: React.FC<PinSaveStateModalProps> = ({
  repoPath,
  isOpen,
  onClose,
  onPinned,
}) => {
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePin = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Please provide a save state label.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const item: CheckpointItem = await invoke('git:checkpoint_capture_manual', {
        repoPath,
        customLabel: trimmed,
        explanation: notes.trim() || null,
      });
      onPinned(item);
      setLabel('');
      setNotes('');
      onClose();
    } catch (err: any) {
      setError(`Failed to pin save state: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className="w-[480px] bg-[var(--tye-cream)] border-2 border-[var(--tye-ink)] shadow-[6px_6px_0px_0px_var(--tye-ink)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--tye-ink)] bg-[var(--tye-ink)]">
          <div className="flex items-center gap-2">
            <RiPushpinLine className="text-[var(--tye-cream)] text-lg" />
            <span className="font-pixel font-bold text-sm text-[var(--tye-cream)] tracking-wide uppercase">
              Pin Recovery Anchor
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--tye-cream)] hover:text-[var(--tye-rose)] transition-colors"
          >
            <RiCloseLine className="text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          <p className="font-mono text-xs text-[var(--tye-ink)]/70 leading-relaxed">
            Create a named recovery anchor at the current HEAD. Pinned checkpoints are
            <strong className="text-[var(--tye-lavender)]"> exempt from auto-pruning</strong> and
            appear in the Time Machine pinned view.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="font-pixel text-xs font-bold text-[var(--tye-ink)] uppercase tracking-wider">
              Save State Label <span className="text-[var(--tye-rose)]">*</span>
            </label>
            <input
              id="pin-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder='e.g. "Pre-Refactoring Auth Module"'
              className="w-full px-3 py-2 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm text-[var(--tye-ink)] focus:outline-none focus:border-[var(--tye-lavender)] transition-colors"
              disabled={loading}
              onKeyDown={(e) => e.key === 'Enter' && handlePin()}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-pixel text-xs font-bold text-[var(--tye-ink)] uppercase tracking-wider">
              Notes <span className="text-[var(--tye-ink)]/40 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              id="pin-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why is this checkpoint important?"
              rows={2}
              className="w-full px-3 py-2 bg-white border-2 border-[var(--tye-ink)] font-mono text-sm text-[var(--tye-ink)] focus:outline-none focus:border-[var(--tye-lavender)] transition-colors resize-none"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-rose-100 border-2 border-rose-700 px-3 py-2 font-mono text-xs text-rose-900">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t-2 border-[var(--tye-ink)] bg-[var(--tye-cream)]/60">
          <button
            id="pin-cancel-btn"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-1.5 font-mono text-xs font-bold border-2 border-[var(--tye-ink)] bg-white hover:bg-[var(--tye-rose)] hover:text-white hover:border-[var(--tye-rose)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            id="pin-confirm-btn"
            onClick={handlePin}
            disabled={loading || !label.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 font-mono text-xs font-bold border-2 border-[var(--tye-ink)] bg-[var(--tye-lavender)] text-white hover:bg-[var(--tye-ink)] transition-colors disabled:opacity-40 shadow-[2px_2px_0px_0px_var(--tye-ink)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
          >
            <RiSaveLine />
            {loading ? 'Pinning…' : '+ Pin Save State'}
          </button>
        </div>
      </div>
    </div>
  );
};
