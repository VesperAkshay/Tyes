import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConflictFileItem, ThreeWayPanes } from "../../types";
import {
  RiCloseLine,
  RiCheckDoubleLine,
  RiErrorWarningLine,
  RiArrowRightLine,
  RiCheckLine,
  RiCodeSSlashLine,
  RiSubtractLine,
} from "react-icons/ri";

interface ThreeWayConflictModalProps {
  repoPath: string;
  isOpen: boolean;
  onClose: () => void;
  onResolvedAll: () => void;
}

export const ThreeWayConflictModal: React.FC<ThreeWayConflictModalProps> = ({
  repoPath,
  isOpen,
  onClose,
  onResolvedAll,
}) => {
  const [conflicts, setConflicts] = useState<ConflictFileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [panes, setPanes] = useState<ThreeWayPanes | null>(null);
  const [resolvedText, setResolvedText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fetchConflicts = async () => {
    try {
      setLoading(true);
      const items = await invoke<ConflictFileItem[]>("git:conflict_list", { repoPath });
      setConflicts(items);
      if (items.length > 0 && !selectedFile) {
        setSelectedFile(items[0].file_path);
      } else if (items.length === 0) {
        setSelectedFile(null);
        setPanes(null);
      }
    } catch (err: any) {
      setError(err || "Failed to load conflicts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && repoPath) {
      fetchConflicts();
    }
  }, [isOpen, repoPath]);

  useEffect(() => {
    if (selectedFile && repoPath) {
      loadPanes(selectedFile);
    }
  }, [selectedFile, repoPath]);

  const loadPanes = async (path: string) => {
    try {
      setError(null);
      const data = await invoke<ThreeWayPanes>("git:conflict_get_panes", { repoPath, filePath: path });
      setPanes(data);
      setResolvedText(data.ours_content || data.base_content || "");
    } catch (err: any) {
      setError(err || "Failed to load conflict panes");
    }
  };

  const handleMarkResolved = async () => {
    if (!selectedFile) return;
    try {
      setError(null);
      await invoke("git:conflict_resolve", {
        repoPath,
        filePath: selectedFile,
        resolvedContent: resolvedText,
      });
      setStatusMsg(`Successfully marked ${selectedFile} as resolved!`);
      await fetchConflicts();
    } catch (err: any) {
      setError(err || "Failed to save resolved content");
    }
  };

  const handleContinue = async () => {
    try {
      setError(null);
      const msg = await invoke<string>("git:conflict_continue", { repoPath });
      setStatusMsg(msg || "Merge/Rebase continued successfully.");
      onResolvedAll();
      onClose();
    } catch (err: any) {
      setError(err || "Cannot continue operation");
    }
  };

  const [confirmAbort, setConfirmAbort] = useState<boolean>(false);

  const handleAbort = async () => {
    if (!confirmAbort) {
      setConfirmAbort(true);
      return;
    }
    await executeAbort();
  };

  const executeAbort = async () => {
    try {
      setError(null);
      await invoke("git:conflict_abort", { repoPath });
      onResolvedAll();
      onClose();
    } catch (err: any) {
      setError(err || "Failed to abort operation");
    } finally {
      setConfirmAbort(false);
    }
  };

  if (!isOpen) return null;

  const resolvedCount = conflicts.filter((c) => c.is_resolved).length;
  const totalCount = conflicts.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in zoom-in-95 duration-150">
      <div className="tye-card bg-[var(--tye-cream)] text-[var(--tye-ink)] w-[95vw] h-[90vh] p-6 border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-[var(--tye-ink)] mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--tye-lavender)]/20 border-2 border-[var(--tye-ink)] flex items-center justify-center text-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
              <RiCodeSSlashLine className="w-6 h-6 text-[var(--tye-lavender)]" />
            </div>
            <div>
              <h2 className="font-pixel text-xl font-bold tracking-tight">
                THREE-WAY CONFLICT RESOLVER (F-040)
              </h2>
              <p className="text-xs font-mono opacity-80 mt-0.5">
                Resolve conflicts between BASE, OURS, and THEIRS before continuing your operation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold px-3 py-1.5 bg-white border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
              {totalCount === 0 ? "All Conflicts Resolved" : `Unresolved: ${totalCount}`}
            </span>
            <button
              onClick={handleAbort}
              className="px-3.5 py-1.5 font-pixel text-xs bg-rose-100 hover:bg-rose-200 text-rose-900 border-2 border-rose-800 shadow-[2px_2px_0px_0px_#9f1239] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all font-bold"
            >
              Abort Operation
            </button>
            <button
              onClick={handleContinue}
              disabled={totalCount > 0}
              className={`px-4 py-1.5 font-pixel text-xs border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-1.5 font-bold ${
                totalCount === 0
                  ? "bg-[var(--tye-lavender)] hover:bg-[var(--tye-lavender)]/90 text-white cursor-pointer"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
              }`}
            >
              <RiCheckDoubleLine className="text-base" />
              Continue Operation
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-[var(--tye-ink)] hover:text-[var(--tye-cream)] transition-colors border-2 border-transparent hover:border-[var(--tye-ink)] ml-2"
            >
              <RiCloseLine className="w-6 h-6" />
            </button>
          </div>
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

        {confirmAbort && (
          <div className="mb-4 p-4 bg-rose-100 border-2 border-rose-800 text-rose-950 font-mono text-xs shadow-[4px_4px_0px_0px_#9f1239]">
            <div className="font-pixel text-sm font-bold text-rose-900 mb-1">
              ⚠️ Confirm Abort Conflict Resolution
            </div>
            <p className="mb-3 font-bold">
              Are you sure you want to abort this operation? Any conflict resolutions will be discarded.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmAbort(false)}
                className="px-3 py-1 bg-white border-2 border-rose-800 font-pixel text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={executeAbort}
                className="px-3 py-1 bg-rose-600 text-white font-pixel text-xs border-2 border-rose-800 hover:bg-rose-700 font-bold"
              >
                Confirm Abort
              </button>
            </div>
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

        {/* Body */}
        <div className="flex-1 flex overflow-hidden border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] bg-white">
          {/* File Sidebar */}
          <div className="w-64 border-r-2 border-[var(--tye-ink)] bg-[var(--tye-cream)]/40 flex flex-col">
            <div className="px-4 py-2.5 border-b-2 border-[var(--tye-ink)] font-pixel text-xs uppercase text-[var(--tye-ink)]">
              Conflicted Files ({conflicts.length})
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conflicts.map((file) => {
                const isSelected = selectedFile === file.file_path;
                return (
                  <button
                    key={file.file_path}
                    onClick={() => setSelectedFile(file.file_path)}
                    className={`w-full text-left px-3 py-2 border-2 text-xs flex items-center justify-between transition-all font-mono font-bold ${
                      isSelected
                        ? "bg-[var(--tye-lavender)] border-[var(--tye-ink)] text-white shadow-[2px_2px_0px_0px_var(--tye-ink)]"
                        : "border-transparent text-[var(--tye-ink)] hover:bg-[var(--tye-cream)]"
                    }`}
                  >
                    <span className="truncate flex-1">{file.file_path}</span>
                    <span className="ml-2">
                      {file.is_resolved ? (
                        <RiCheckLine className="text-emerald-600 text-base" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-amber-600 inline-block animate-pulse" />
                      )}
                    </span>
                  </button>
                );
              })}
              {conflicts.length === 0 && (
                <div className="text-center py-10 text-xs text-[var(--tye-ink)]/60 font-mono font-bold">
                  No active index conflicts. Click "Continue Operation".
                </div>
              )}
            </div>
          </div>

          {/* Three Panes + Resolved Pane */}
          {panes ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-white font-mono text-xs">
              {/* Top Row: Base | Ours | Theirs */}
              <div className="h-1/2 flex border-b-2 border-[var(--tye-ink)]">
                {/* BASE */}
                <div className="flex-1 flex flex-col border-r-2 border-[var(--tye-ink)] bg-gray-50">
                  <div className="px-3 py-1.5 bg-gray-200 border-b-2 border-[var(--tye-ink)] text-[var(--tye-ink)] font-pixel text-xs flex items-center justify-between">
                    <span>BASE (Common Ancestor)</span>
                    <button
                      onClick={() => setResolvedText(panes.base_content)}
                      className="px-2 py-0.5 border border-[var(--tye-ink)] bg-white hover:bg-[var(--tye-ink)] hover:text-white font-mono text-[10px] font-bold transition-colors"
                    >
                      Use Base
                    </button>
                  </div>
                  <pre className="flex-1 p-3 overflow-auto text-[var(--tye-ink)] leading-relaxed whitespace-pre-wrap select-text font-bold">
                    {panes.base_content || "// No Base content"}
                  </pre>
                </div>

                {/* OURS */}
                <div className="flex-1 flex flex-col border-r-2 border-[var(--tye-ink)] bg-emerald-50/50">
                  <div className="px-3 py-1.5 bg-emerald-100 border-b-2 border-[var(--tye-ink)] text-emerald-950 font-pixel text-xs flex items-center justify-between">
                    <span>OURS (Current Branch)</span>
                    <button
                      onClick={() => setResolvedText(panes.ours_content)}
                      className="px-2 py-0.5 border border-[var(--tye-ink)] bg-white hover:bg-emerald-900 hover:text-white font-mono text-[10px] font-bold transition-colors"
                    >
                      Take Ours
                    </button>
                  </div>
                  <pre className="flex-1 p-3 overflow-auto text-emerald-950 leading-relaxed whitespace-pre-wrap select-text font-bold">
                    {panes.ours_content || "// No Ours content"}
                  </pre>
                </div>

                {/* THEIRS */}
                <div className="flex-1 flex flex-col bg-sky-50/50">
                  <div className="px-3 py-1.5 bg-sky-100 border-b-2 border-[var(--tye-ink)] text-sky-950 font-pixel text-xs flex items-center justify-between">
                    <span>THEIRS (Incoming Branch)</span>
                    <button
                      onClick={() => setResolvedText(panes.theirs_content)}
                      className="px-2 py-0.5 border border-[var(--tye-ink)] bg-white hover:bg-sky-900 hover:text-white font-mono text-[10px] font-bold transition-colors"
                    >
                      Take Theirs
                    </button>
                  </div>
                  <pre className="flex-1 p-3 overflow-auto text-sky-950 leading-relaxed whitespace-pre-wrap select-text font-bold">
                    {panes.theirs_content || "// No Theirs content"}
                  </pre>
                </div>
              </div>

              {/* Bottom Row: Resolved Pane Editor */}
              <div className="h-1/2 flex flex-col bg-[var(--tye-cream)]/20">
                <div className="px-4 py-2 bg-[var(--tye-cream)] border-b-2 border-[var(--tye-ink)] flex items-center justify-between">
                  <span className="font-pixel text-xs text-[var(--tye-ink)] flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--tye-lavender)] border border-[var(--tye-ink)] animate-pulse" />
                    Resolved Output (Editable Stage 0 Result for {selectedFile})
                  </span>
                  <button
                    onClick={handleMarkResolved}
                    className="px-4 py-1.5 font-pixel text-xs bg-emerald-600 hover:bg-emerald-500 text-white border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center gap-1.5 transition-all cursor-pointer font-bold"
                  >
                    <RiCheckLine className="text-base" />
                    Save & Mark Resolved
                  </button>
                </div>
                <textarea
                  value={resolvedText}
                  onChange={(e) => setResolvedText(e.target.value)}
                  placeholder="Edit final resolved content here or click 'Take Ours' / 'Take Theirs' above..."
                  className="flex-1 p-4 bg-white text-[var(--tye-ink)] font-mono text-xs focus:outline-none leading-relaxed resize-none font-bold"
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[var(--tye-ink)]/60 text-xs font-mono font-bold">
              Select a conflicted file from the sidebar to start resolving.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
