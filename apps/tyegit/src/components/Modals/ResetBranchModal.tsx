import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ResetMode } from "../../types";
import {
  RiCloseLine,
  RiHistoryLine,
  RiErrorWarningLine,
  RiAlertFill,
} from "react-icons/ri";

interface ResetBranchModalProps {
  repoPath: string;
  targetOid: string;
  targetSummary: string;
  isOpen: boolean;
  onClose: () => void;
  onResetCompleted: () => void;
}

export const ResetBranchModal: React.FC<ResetBranchModalProps> = ({
  repoPath,
  targetOid,
  targetSummary,
  isOpen,
  onClose,
  onResetCompleted,
}) => {
  const [mode, setMode] = useState<ResetMode>("Mixed");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmHardReset, setConfirmHardReset] = useState<boolean>(false);

  const handleReset = async () => {
    if (mode === "Hard" && !confirmHardReset) {
      setConfirmHardReset(true);
      return;
    }
    await executeReset();
  };

  const executeReset = async () => {
    try {
      setLoading(true);
      setError(null);
      await invoke<any>("git:branch_reset", {
        repoPath,
        targetOid,
        mode,
      });
      onResetCompleted();
      onClose();
    } catch (err: any) {
      setError(err || "Failed to reset branch");
    } finally {
      setLoading(false);
      setConfirmHardReset(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in zoom-in-95 duration-150">
      <div className="tye-card bg-[var(--tye-cream)] text-[var(--tye-ink)] max-w-xl w-full p-6 border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-[var(--tye-ink)] mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--tye-lavender)]/20 border-2 border-[var(--tye-ink)] flex items-center justify-center text-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
              <RiHistoryLine className="w-6 h-6 text-[var(--tye-lavender)]" />
            </div>
            <div>
              <h2 className="font-pixel text-xl font-bold tracking-tight">
                RESET CURRENT BRANCH (F-039)
              </h2>
              <p className="text-xs font-mono opacity-80 mt-0.5">
                Move HEAD pointer to target commit position
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Target Commit Box */}
          <div className="p-3.5 bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] flex flex-col gap-1 font-mono text-xs">
            <div className="text-[10px] text-[var(--tye-ink)]/60 font-bold uppercase">Target Commit</div>
            <div className="font-bold flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-[var(--tye-lavender)]/20 border border-[var(--tye-ink)] text-[var(--tye-ink)] font-mono">{targetOid.slice(0, 8)}</span>
              <span className="truncate text-[var(--tye-ink)] text-xs">{targetSummary || "Selected Commit"}</span>
            </div>
          </div>

          {/* Reset Mode Selector */}
          <div>
            <label className="block font-pixel text-xs uppercase tracking-wider text-[var(--tye-ink)] mb-2">
              Select Reset Mode
            </label>
            <div className="space-y-2.5">
              <label
                onClick={() => setMode("Soft")}
                className={`p-3 bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] flex items-start gap-3 cursor-pointer transition-all ${
                  mode === "Soft" ? "bg-[var(--tye-lavender)]/20 font-bold" : "hover:bg-[var(--tye-cream)]/40"
                }`}
              >
                <input
                  type="radio"
                  name="resetMode"
                  checked={mode === "Soft"}
                  onChange={() => setMode("Soft")}
                  className="mt-1 w-4 h-4 rounded-none border-2 border-[var(--tye-ink)] text-[var(--tye-lavender)] focus:ring-0 cursor-pointer"
                />
                <div>
                  <div className="font-pixel text-xs text-[var(--tye-ink)]">Soft (--soft)</div>
                  <div className="font-mono text-[11px] text-[var(--tye-ink)]/70 mt-0.5">
                    Resets HEAD pointer only. Keeps all differences between target and HEAD staged (`Ready to commit`).
                  </div>
                </div>
              </label>

              <label
                onClick={() => setMode("Mixed")}
                className={`p-3 bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] flex items-start gap-3 cursor-pointer transition-all ${
                  mode === "Mixed" ? "bg-[var(--tye-lavender)]/20 font-bold" : "hover:bg-[var(--tye-cream)]/40"
                }`}
              >
                <input
                  type="radio"
                  name="resetMode"
                  checked={mode === "Mixed"}
                  onChange={() => setMode("Mixed")}
                  className="mt-1 w-4 h-4 rounded-none border-2 border-[var(--tye-ink)] text-[var(--tye-lavender)] focus:ring-0 cursor-pointer"
                />
                <div>
                  <div className="font-pixel text-xs text-[var(--tye-ink)]">Mixed (--mixed) [Recommended]</div>
                  <div className="font-mono text-[11px] text-[var(--tye-ink)]/70 mt-0.5">
                    Resets HEAD and unstages index. Working directory files are kept completely intact as unstaged modifications.
                  </div>
                </div>
              </label>

              <label
                onClick={() => setMode("Hard")}
                className={`p-3 bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] flex items-start gap-3 cursor-pointer transition-all ${
                  mode === "Hard" ? "bg-rose-100 border-rose-800 font-bold" : "hover:bg-[var(--tye-cream)]/40"
                }`}
              >
                <input
                  type="radio"
                  name="resetMode"
                  checked={mode === "Hard"}
                  onChange={() => setMode("Hard")}
                  className="mt-1 w-4 h-4 rounded-none border-2 border-[var(--tye-ink)] text-rose-600 focus:ring-0 cursor-pointer"
                />
                <div>
                  <div className="font-pixel text-xs text-rose-800">Hard (--hard) [Destructive]</div>
                  <div className="font-mono text-[11px] text-rose-900/80 mt-0.5">
                    Resets HEAD, index, and working tree to match target commit. Uncommitted disk changes will be wiped out.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {mode === "Hard" && (
            <div className="p-3.5 bg-rose-100 border-2 border-rose-800 shadow-[3px_3px_0px_0px_#9f1239] flex items-start gap-3 text-rose-900 font-mono text-xs">
              <RiAlertFill className="text-lg text-rose-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold uppercase">Warning: Permanent Data Loss Possible</span>
                <p className="text-[11px] text-rose-900/80 mt-1 leading-relaxed">
                  Hard Reset will overwrite modified working files with exact contents from commit <span className="font-bold">{targetOid.slice(0, 8)}</span>.
                </p>
              </div>
            </div>
          )}
        </div>

        {confirmHardReset && (
          <div className="mb-4 p-4 bg-rose-100 border-2 border-rose-800 text-rose-950 font-mono text-xs shadow-[4px_4px_0px_0px_#9f1239]">
            <div className="font-pixel text-sm font-bold text-rose-900 mb-1">
              ⚠️ Confirm Hard Reset
            </div>
            <p className="mb-3 font-bold">
              Are you 100% sure you want to permanently discard all uncommitted changes in your working tree?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmHardReset(false)}
                className="px-3 py-1 bg-white border-2 border-rose-800 font-pixel text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={executeReset}
                className="px-3 py-1 bg-rose-600 text-white font-pixel text-xs border-2 border-rose-800 hover:bg-rose-700 font-bold"
              >
                Execute Hard Reset
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 border-t-2 border-[var(--tye-ink)] mt-4 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-[var(--tye-ink)] hover:text-[var(--tye-cream)] font-pixel text-xs border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all font-bold"
          >
            Cancel
          </button>
          <button
            onClick={handleReset}
            disabled={loading}
            className={`px-5 py-2 font-pixel text-xs border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center gap-1.5 font-bold ${
              loading
                ? "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
                : mode === "Hard"
                ? "bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                : "bg-[var(--tye-lavender)] hover:bg-[var(--tye-lavender)]/90 text-white cursor-pointer"
            }`}
          >
            <RiHistoryLine className="text-base" />
            {loading ? "Resetting..." : `Confirm ${mode} Reset`}
          </button>
        </div>
      </div>
    </div>
  );
};
