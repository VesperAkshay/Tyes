import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StashItem } from "../../types";
import {
  RiCloseLine,
  RiInboxArchiveLine,
  RiAddLine,
  RiDeleteBinLine,
  RiArrowGoBackLine,
  RiCheckLine,
  RiErrorWarningLine,
  RiCheckDoubleLine,
} from "react-icons/ri";

interface StashManagerModalProps {
  repoPath: string;
  isOpen: boolean;
  onClose: () => void;
  onStashChanged: () => void;
}

export const StashManagerModal: React.FC<StashManagerModalProps> = ({
  repoPath,
  isOpen,
  onClose,
  onStashChanged,
}) => {
  const [stashes, setStashes] = useState<StashItem[]>([]);
  const [stashMsg, setStashMsg] = useState<string>("");
  const [includeUntracked, setIncludeUntracked] = useState<boolean>(true);
  const [keepIndex, setKeepIndex] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = useState<number | null>(null);

  const fetchStashes = async () => {
    try {
      setLoading(true);
      const items = await invoke<StashItem[]>("git:stash_list", { repoPath });
      setStashes(items);
    } catch (err: any) {
      setError(err || "Failed to load stashes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && repoPath) {
      fetchStashes();
    }
  }, [isOpen, repoPath]);

  const handleSaveStash = async () => {
    try {
      setError(null);
      await invoke("git:stash_save", {
        repoPath,
        message: stashMsg.trim() || null,
        includeUntracked,
        keepIndex,
      });
      setStashMsg("");
      setStatusMsg("Stash created successfully! Working tree is clean.");
      await fetchStashes();
      onStashChanged();
    } catch (err: any) {
      setError(err || "Failed to save stash");
    }
  };

  const handleApply = async (index: number) => {
    try {
      setError(null);
      const res = await invoke<string>("git:stash_apply", { repoPath, index });
      setStatusMsg(res || `Stash@{${index}} applied cleanly without removing from stack.`);
      onStashChanged();
    } catch (err: any) {
      setError(err || "Failed to apply stash");
    }
  };

  const handlePop = async (index: number) => {
    try {
      setError(null);
      const res = await invoke<string>("git:stash_pop", { repoPath, index });
      setStatusMsg(res || `Stash@{${index}} popped cleanly and applied.`);
      await fetchStashes();
      onStashChanged();
    } catch (err: any) {
      setError(err || "Failed to pop stash");
    }
  };

  const handleDrop = (index: number) => {
    setConfirmDrop(index);
  };

  const executeDrop = async (index: number) => {
    setConfirmDrop(null);
    try {
      setError(null);
      await invoke("git:stash_drop", { repoPath, index });
      setStatusMsg(`Stash@{${index}} dropped from stack.`);
      await fetchStashes();
    } catch (err: any) {
      setError(err || "Failed to drop stash");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in zoom-in-95 duration-150">
      <div className="tye-card bg-[var(--tye-cream)] text-[var(--tye-ink)] max-w-3xl w-full p-6 border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-[var(--tye-ink)] mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--tye-lavender)]/20 border-2 border-[var(--tye-ink)] flex items-center justify-center text-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
              <RiInboxArchiveLine className="w-6 h-6 text-[var(--tye-lavender)]" />
            </div>
            <div>
              <h2 className="font-pixel text-xl font-bold tracking-tight">
                STASH MANAGER (F-041)
              </h2>
              <p className="text-xs font-mono opacity-80 mt-0.5">
                Temporarily store modified working tree changes or apply/pop saved WIP states.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--tye-ink)] hover:text-[var(--tye-cream)] transition-colors border-2 border-transparent hover:border-[var(--tye-ink)]"
          >
            <RiCloseLine className="w-6 h-6" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-100 border-2 border-rose-800 text-rose-900 font-mono text-xs flex items-center justify-between shadow-[2px_2px_0px_0px_#9f1239] flex-shrink-0">
            <span className="flex items-center gap-2 font-bold">
              <RiErrorWarningLine className="text-base text-rose-700 shrink-0" />
              {error}
            </span>
            <button
              onClick={() => setError(null)}
              className="text-rose-800 hover:text-rose-950 font-bold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {statusMsg && (
          <div className="mb-4 p-3 bg-emerald-100 border-2 border-emerald-800 text-emerald-950 font-mono text-xs flex items-center justify-between shadow-[2px_2px_0px_0px_#065f46] flex-shrink-0 animate-in fade-in duration-150">
            <span className="flex items-center gap-2 font-bold">
              <RiCheckDoubleLine className="text-base text-emerald-700 shrink-0" />
              {statusMsg}
            </span>
            <button
              onClick={() => setStatusMsg(null)}
              className="text-emerald-800 hover:text-emerald-950 font-bold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {confirmDrop !== null && (
          <div className="mb-4 p-4 bg-amber-100 border-2 border-amber-800 text-amber-950 font-mono text-xs shadow-[4px_4px_0px_0px_#92400e]">
            <div className="font-pixel text-sm font-bold text-amber-900 mb-1">
              ⚠️ Confirm Drop Stash
            </div>
            <p className="mb-3 font-bold">
              Are you sure you want to drop stash@&#123;{confirmDrop}&#125;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDrop(null)}
                className="px-3 py-1 bg-white border-2 border-amber-800 font-pixel text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => executeDrop(confirmDrop)}
                className="px-3 py-1 bg-amber-600 text-white font-pixel text-xs border-2 border-amber-800 hover:bg-amber-700 font-bold"
              >
                Confirm Drop
              </button>
            </div>
          </div>
        )}

        {/* Create Stash Form Box */}
        <div className="p-4 bg-white border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] mb-5 flex flex-col gap-3 flex-shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={stashMsg}
              onChange={(e) => setStashMsg(e.target.value)}
              placeholder="Stash message (e.g., 'WIP: auth refactor before rebase')..."
              className="flex-1 px-3 py-2 bg-[var(--tye-cream)]/40 border-2 border-[var(--tye-ink)] font-mono text-xs focus:outline-none focus:bg-white focus:shadow-[2px_2px_0px_0px_var(--tye-ink)] transition-all text-[var(--tye-ink)] placeholder-[var(--tye-ink)]/50"
            />
            <button
              onClick={handleSaveStash}
              className="px-4 py-2 bg-[var(--tye-lavender)] hover:bg-[var(--tye-lavender)]/90 text-white font-pixel text-xs border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center gap-1.5 shrink-0 cursor-pointer font-bold"
            >
              <RiAddLine className="text-base" />
              Stash WIP
            </button>
          </div>

          <div className="flex items-center gap-6 font-mono text-xs text-[var(--tye-ink)]">
            <label className="flex items-center gap-2 cursor-pointer select-none font-bold">
              <input
                type="checkbox"
                checked={includeUntracked}
                onChange={(e) => setIncludeUntracked(e.target.checked)}
                className="w-4 h-4 rounded-none border-2 border-[var(--tye-ink)] text-[var(--tye-lavender)] focus:ring-0 cursor-pointer"
              />
              Include Untracked (-u)
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none font-bold">
              <input
                type="checkbox"
                checked={keepIndex}
                onChange={(e) => setKeepIndex(e.target.checked)}
                className="w-4 h-4 rounded-none border-2 border-[var(--tye-ink)] text-[var(--tye-lavender)] focus:ring-0 cursor-pointer"
              />
              Keep Staged Index (--keep-index)
            </label>
          </div>
        </div>

        {/* Stash List Header */}
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <h3 className="font-pixel text-xs uppercase tracking-wider text-[var(--tye-ink)]">
            Saved Stash Stack ({stashes.length})
          </h3>
          {loading && <span className="font-mono text-xs opacity-60 animate-pulse">Refreshing stashes...</span>}
        </div>

        {/* Stash List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[340px]">
          {stashes.map((stash) => (
            <div
              key={stash.stash_oid}
              className="p-3.5 bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] hover:translate-y-[-1px] transition-all flex items-center justify-between gap-4"
            >
              <div className="flex flex-col gap-1.5 overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-[var(--tye-mustard)]/20 border border-[var(--tye-ink)] font-mono font-bold text-[10px] text-[var(--tye-ink)]">
                    stash@&#123;{stash.index}&#125;
                  </span>
                  <span className="font-mono text-xs opacity-60">{stash.stash_oid.slice(0, 8)}</span>
                </div>
                <p className="font-mono text-xs font-bold text-[var(--tye-ink)] truncate">
                  {stash.message || "No message provided"}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleApply(stash.index)}
                  className="px-3 py-1.5 bg-[var(--tye-cream)] hover:bg-[var(--tye-cream)]/70 border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all font-pixel text-xs flex items-center gap-1 text-[var(--tye-ink)] font-bold"
                  title="Apply changes and keep in stash list"
                >
                  <RiCheckLine className="text-sm text-emerald-600 font-bold" />
                  Apply
                </button>
                <button
                  onClick={() => handlePop(stash.index)}
                  className="px-3 py-1.5 bg-[var(--tye-lavender)] hover:bg-[var(--tye-lavender)]/90 text-white border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all font-pixel text-xs flex items-center gap-1 font-bold"
                  title="Apply changes and remove from stash list"
                >
                  <RiArrowGoBackLine className="text-sm" />
                  Pop
                </button>
                <button
                  onClick={() => handleDrop(stash.index)}
                  className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all ml-1"
                  title="Drop (delete) stash"
                >
                  <RiDeleteBinLine className="text-base" />
                </button>
              </div>
            </div>
          ))}

          {stashes.length === 0 && !loading && (
            <div className="p-8 bg-white border-2 border-dashed border-[var(--tye-ink)] text-center font-mono text-xs opacity-70">
              No saved stashes. Use the "Stash WIP" box above when you need to store your working directory modifications cleanly before switching branches or pulling updates.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t-2 border-[var(--tye-ink)] mt-4 flex items-center justify-between flex-shrink-0">
          <span className="font-mono text-[11px] opacity-70">
            Tip: Pop applies changes and drops the top stash entry automatically.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white hover:bg-[var(--tye-ink)] hover:text-[var(--tye-cream)] font-pixel text-xs border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
