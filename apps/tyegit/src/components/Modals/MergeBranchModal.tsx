import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BranchItem, MergeStrategy, MergeAnalysisResult } from "../../types";
import {
  RiCloseLine,
  RiGitMergeLine,
  RiCheckDoubleLine,
  RiErrorWarningLine,
  RiInformationLine,
} from "react-icons/ri";

interface MergeBranchModalProps {
  repoPath: string;
  branches: BranchItem[];
  currentBranch: string;
  isOpen: boolean;
  onClose: () => void;
  onMerged: (hasConflicts: boolean) => void;
}

export const MergeBranchModal: React.FC<MergeBranchModalProps> = ({
  repoPath,
  branches,
  currentBranch,
  isOpen,
  onClose,
  onMerged,
}) => {
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [strategy, setStrategy] = useState<MergeStrategy>("FastForward");
  const [analysis, setAnalysis] = useState<MergeAnalysisResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const availableBranches = (branches || []).filter((b) => b && b.name !== currentBranch);

  useEffect(() => {
    if (isOpen && availableBranches.length > 0 && !selectedBranch) {
      setSelectedBranch(availableBranches[0].name);
    }
  }, [isOpen, availableBranches, selectedBranch]);

  useEffect(() => {
    if (isOpen && selectedBranch && repoPath) {
      runAnalysis(selectedBranch);
    }
  }, [isOpen, selectedBranch, repoPath]);

  const runAnalysis = async (branchName: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await invoke<MergeAnalysisResult>("git:branch_merge_analyze", {
        repoPath,
        sourceBranch: branchName,
      });
      setAnalysis(res);
    } catch (err: any) {
      setError(err || "Failed to analyze merge compatibility");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    if (!selectedBranch) return;
    try {
      setLoading(true);
      const res = await invoke<any>("git:branch_merge", {
        repoPath,
        sourceBranch: selectedBranch,
        strategy,
      });
      onMerged(res.has_conflicts);
      onClose();
    } catch (err: any) {
      setError(err || "Merge operation failed");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in zoom-in-95 duration-150">
      <div className="tye-card bg-[var(--tye-cream)] text-[var(--tye-ink)] max-w-2xl w-full p-6 border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-[var(--tye-ink)] mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--tye-lavender)]/20 border-2 border-[var(--tye-ink)] flex items-center justify-center text-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
              <RiGitMergeLine className="w-6 h-6 text-[var(--tye-lavender)]" />
            </div>
            <div>
              <h2 className="font-pixel text-xl font-bold tracking-tight">
                MERGE BRANCH (F-035)
              </h2>
              <p className="text-xs font-mono opacity-80 mt-0.5">
                Merge an incoming branch into current HEAD: <span className="font-bold text-[var(--tye-lavender)]">{currentBranch}</span>
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
          {/* Source Branch Selector */}
          <div>
            <label className="block font-pixel text-xs uppercase tracking-wider text-[var(--tye-ink)] mb-1.5">
              Source Branch To Merge
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] font-mono text-xs text-[var(--tye-ink)] focus:outline-none focus:translate-x-[1px] focus:translate-y-[1px] transition-all cursor-pointer font-bold"
            >
              {availableBranches.length === 0 ? (
                <option value="">No other branches available to merge</option>
              ) : (
                availableBranches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.is_remote ? "Remote" : "Local"})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Analysis Card */}
          {analysis && (
            <div className="p-4 bg-white border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] flex flex-col gap-3">
              <div className="flex items-center justify-between border-b-2 border-[var(--tye-ink)]/20 pb-2">
                <span className="font-pixel text-xs text-[var(--tye-ink)]">Analysis Summary</span>
                <span
                  className={`px-2.5 py-0.5 border-2 border-[var(--tye-ink)] text-[10px] font-mono font-bold ${
                    analysis.is_up_to_date
                      ? "bg-gray-200 text-gray-700"
                      : analysis.can_fast_forward
                      ? "bg-emerald-200 text-emerald-900"
                      : "bg-amber-200 text-amber-900"
                  }`}
                >
                  {analysis.is_up_to_date
                    ? "Up To Date"
                    : analysis.can_fast_forward
                    ? "Fast-Forward Capable"
                    : "3-Way Merge Required"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-1 text-center font-mono text-xs">
                <div className="p-2.5 bg-[var(--tye-cream)]/50 border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
                  <div className="text-[var(--tye-ink)]/60 text-[10px] font-bold">AHEAD</div>
                  <div className="text-[var(--tye-ink)] font-bold text-base mt-0.5">{analysis.commits_ahead}</div>
                </div>
                <div className="p-2.5 bg-[var(--tye-cream)]/50 border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
                  <div className="text-[var(--tye-ink)]/60 text-[10px] font-bold">BEHIND</div>
                  <div className="text-[var(--tye-ink)] font-bold text-base mt-0.5">{analysis.commits_behind}</div>
                </div>
                <div className="p-2.5 bg-[var(--tye-cream)]/50 border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
                  <div className="text-[var(--tye-ink)]/60 text-[10px] font-bold">CONFLICT RISK</div>
                  <div
                    className={`font-bold text-base mt-0.5 ${
                      analysis.conflict_probability === "High"
                        ? "text-rose-600"
                        : analysis.conflict_probability === "Medium"
                        ? "text-amber-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {analysis.conflict_probability}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Merge Strategy Options */}
          <div>
            <label className="block font-pixel text-xs uppercase tracking-wider text-[var(--tye-ink)] mb-2">
              Merge Strategy Selection
            </label>
            <div className="space-y-2.5">
              <label
                onClick={() => setStrategy("FastForward")}
                className={`p-3 bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] flex items-start gap-3 cursor-pointer transition-all ${
                  strategy === "FastForward" ? "bg-[var(--tye-lavender)]/20 font-bold" : "hover:bg-[var(--tye-cream)]/40"
                }`}
              >
                <input
                  type="radio"
                  name="strategy"
                  checked={strategy === "FastForward"}
                  onChange={() => setStrategy("FastForward")}
                  className="mt-1 w-4 h-4 rounded-none border-2 border-[var(--tye-ink)] text-[var(--tye-lavender)] focus:ring-0 cursor-pointer"
                />
                <div>
                  <div className="font-pixel text-xs text-[var(--tye-ink)]">Default (Fast-Forward if possible)</div>
                  <div className="font-mono text-[11px] text-[var(--tye-ink)]/70 mt-0.5">
                    Fast-forwards pointer when no divergence exists; otherwise creates a merge commit.
                  </div>
                </div>
              </label>

              <label
                onClick={() => setStrategy("NoFastForward")}
                className={`p-3 bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] flex items-start gap-3 cursor-pointer transition-all ${
                  strategy === "NoFastForward" ? "bg-[var(--tye-lavender)]/20 font-bold" : "hover:bg-[var(--tye-cream)]/40"
                }`}
              >
                <input
                  type="radio"
                  name="strategy"
                  checked={strategy === "NoFastForward"}
                  onChange={() => setStrategy("NoFastForward")}
                  className="mt-1 w-4 h-4 rounded-none border-2 border-[var(--tye-ink)] text-[var(--tye-lavender)] focus:ring-0 cursor-pointer"
                />
                <div>
                  <div className="font-pixel text-xs text-[var(--tye-ink)]">No Fast-Forward (--no-ff)</div>
                  <div className="font-mono text-[11px] text-[var(--tye-ink)]/70 mt-0.5">
                    Always creates an explicit merge commit to preserve complete branch topology and history.
                  </div>
                </div>
              </label>

              <label
                onClick={() => setStrategy("Squash")}
                className={`p-3 bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] flex items-start gap-3 cursor-pointer transition-all ${
                  strategy === "Squash" ? "bg-[var(--tye-lavender)]/20 font-bold" : "hover:bg-[var(--tye-cream)]/40"
                }`}
              >
                <input
                  type="radio"
                  name="strategy"
                  checked={strategy === "Squash"}
                  onChange={() => setStrategy("Squash")}
                  className="mt-1 w-4 h-4 rounded-none border-2 border-[var(--tye-ink)] text-[var(--tye-lavender)] focus:ring-0 cursor-pointer"
                />
                <div>
                  <div className="font-pixel text-xs text-[var(--tye-ink)]">Squash Merge (--squash)</div>
                  <div className="font-mono text-[11px] text-[var(--tye-ink)]/70 mt-0.5">
                    Combines all branch commits into a single commit on current branch without keeping merge history.
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t-2 border-[var(--tye-ink)] mt-4 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-[var(--tye-ink)] hover:text-[var(--tye-cream)] font-pixel text-xs border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all font-bold"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={loading || !selectedBranch || (analysis?.is_up_to_date ?? false)}
            className={`px-5 py-2 font-pixel text-xs border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center gap-1.5 font-bold ${
              loading || !selectedBranch || (analysis?.is_up_to_date ?? false)
                ? "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
                : "bg-[var(--tye-lavender)] hover:bg-[var(--tye-lavender)]/90 text-white cursor-pointer"
            }`}
          >
            <RiGitMergeLine className="text-base" />
            {loading ? "Merging..." : "Execute Merge"}
          </button>
        </div>
      </div>
    </div>
  );
};
