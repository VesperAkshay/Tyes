import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RebasePlanItem, RebaseAction, CommitListItem } from "../../types";
import {
  RiCloseLine,
  RiGitRepositoryCommitsLine,
  RiPlayListAddLine,
  RiArrowUpDownLine,
  RiCheckLine,
  RiErrorWarningLine,
} from "react-icons/ri";

interface InteractiveRebaseModalProps {
  repoPath: string;
  upstreamRef: string;
  commitsToRebase: CommitListItem[];
  isOpen: boolean;
  onClose: () => void;
  onRebaseCompleted: (hasConflicts: boolean) => void;
}

export const InteractiveRebaseModal: React.FC<InteractiveRebaseModalProps> = ({
  repoPath,
  upstreamRef,
  commitsToRebase,
  isOpen,
  onClose,
  onRebaseCompleted,
}) => {
  const [plan, setPlan] = useState<RebasePlanItem[]>(() =>
    commitsToRebase.map((c) => ({
      commit_oid: c.id,
      action: "Pick" as RebaseAction,
      new_message: c.message_subject,
    }))
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleActionChange = (oid: string, newAction: RebaseAction) => {
    setPlan((prev) =>
      prev.map((item) => (item.commit_oid === oid ? { ...item, action: newAction } : item))
    );
  };

  const handleMessageChange = (oid: string, newMsg: string) => {
    setPlan((prev) =>
      prev.map((item) => (item.commit_oid === oid ? { ...item, new_message: newMsg } : item))
    );
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setPlan((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === plan.length - 1) return;
    setPlan((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleStartRebase = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await invoke<any>("git:branch_rebase_start", {
        repoPath,
        upstreamRef,
        plan,
      });
      onRebaseCompleted(res.has_conflicts);
      onClose();
    } catch (err: any) {
      setError(err || "Interactive rebase failed");
    } finally {
      setLoading(false);
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
              <RiGitRepositoryCommitsLine className="w-6 h-6 text-[var(--tye-lavender)]" />
            </div>
            <div>
              <h2 className="font-pixel text-xl font-bold tracking-tight">
                INTERACTIVE REBASE (F-036)
              </h2>
              <p className="text-xs font-mono opacity-80 mt-0.5">
                Rebase current branch onto <span className="font-bold text-[var(--tye-lavender)]">{upstreamRef}</span> ({plan.length} commits)
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

        {/* Instructions */}
        <div className="p-3 bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] mb-4 text-[11px] text-[var(--tye-ink)] font-mono flex items-center justify-between flex-shrink-0">
          <span className="font-bold">Commands: pick = use | reword = edit msg | edit = pause | squash = melt | drop = delete</span>
          <span className="opacity-70">Use ▲/▼ arrows to reorder commits</span>
        </div>

        {/* Commit Plan Table */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {plan.map((item, idx) => {
            const commitInfo = commitsToRebase.find((c) => c.id === item.commit_oid);
            return (
              <div
                key={item.commit_oid}
                className="p-3 bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] flex items-center justify-between gap-3 font-mono text-xs"
              >
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleMoveUp(idx)}
                      disabled={idx === 0}
                      className={`text-[10px] px-1 border border-[var(--tye-ink)] ${idx === 0 ? "opacity-30 cursor-not-allowed" : "hover:bg-[var(--tye-ink)] hover:text-white"}`}
                      title="Move commit up in rebase plan"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMoveDown(idx)}
                      disabled={idx === plan.length - 1}
                      className={`text-[10px] px-1 border border-[var(--tye-ink)] ${idx === plan.length - 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-[var(--tye-ink)] hover:text-white"}`}
                      title="Move commit down in rebase plan"
                    >
                      ▼
                    </button>
                  </div>

                  <select
                    value={item.action}
                    onChange={(e) => handleActionChange(item.commit_oid, e.target.value as RebaseAction)}
                    className={`px-2.5 py-1.5 border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] font-bold text-xs focus:outline-none cursor-pointer ${
                      item.action === "Pick"
                        ? "bg-emerald-100 text-emerald-900"
                        : item.action === "Reword"
                        ? "bg-amber-100 text-amber-900"
                        : item.action === "Squash" || item.action === "Fixup"
                        ? "bg-violet-100 text-violet-900"
                        : item.action === "Drop"
                        ? "bg-rose-100 text-rose-900 line-through"
                        : "bg-sky-100 text-sky-900"
                    }`}
                  >
                    <option value="Pick">pick</option>
                    <option value="Reword">reword</option>
                    <option value="Edit">edit</option>
                    <option value="Squash">squash</option>
                    <option value="Fixup">fixup</option>
                    <option value="Drop">drop</option>
                  </select>

                  <span className="text-[var(--tye-ink)]/70 text-[11px] font-bold">{item.commit_oid.slice(0, 7)}</span>
                </div>

                <div className="flex-1 overflow-hidden">
                  {item.action === "Reword" ? (
                    <input
                      type="text"
                      value={item.new_message || ""}
                      onChange={(e) => handleMessageChange(item.commit_oid, e.target.value)}
                      className="w-full px-2.5 py-1 bg-white border-2 border-[var(--tye-ink)] text-[var(--tye-ink)] text-xs font-mono focus:outline-none focus:translate-x-[1px] focus:translate-y-[1px] font-bold"
                      placeholder="Enter new commit summary..."
                    />
                  ) : (
                    <span className={`text-[var(--tye-ink)] truncate block font-mono text-xs font-bold ${item.action === "Drop" ? "line-through opacity-50" : ""}`}>
                      {commitInfo?.message_subject || item.new_message || "Commit summary"}
                    </span>
                  )}
                </div>

                <div className="text-[10px] text-[var(--tye-ink)]/60 shrink-0 font-mono font-bold">
                  {commitInfo?.author_name || "Author"}
                </div>
              </div>
            );
          })}

          {plan.length === 0 && (
            <div className="text-center py-10 text-xs text-[var(--tye-ink)]/60 font-mono font-bold">
              No commits available between current branch and {upstreamRef}.
            </div>
          )}
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
            onClick={handleStartRebase}
            disabled={loading || plan.length === 0}
            className={`px-5 py-2 font-pixel text-xs border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center gap-1.5 font-bold ${
              loading || plan.length === 0
                ? "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
                : "bg-[var(--tye-lavender)] hover:bg-[var(--tye-lavender)]/90 text-white cursor-pointer"
            }`}
          >
            <RiPlayListAddLine className="text-base" />
            {loading ? "Rebasing..." : "Start Interactive Rebase"}
          </button>
        </div>
      </div>
    </div>
  );
};
