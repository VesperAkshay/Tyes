import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StatusResult, FileStatus, DiscardType } from '../../types';
import {
  RiAddLine,
  RiSubtractLine,
  RiDeleteBinLine,
  RiArrowRightSLine,
  RiArrowDownSLine,
  RiRefreshLine,
  RiCheckDoubleLine,
  RiFileTextLine,
  RiErrorWarningLine,
  RiEyeOffLine,
} from 'react-icons/ri';

interface StatusSidebarProps {
  repoPath: string;
  selectedFile: string | null;
  onSelectFile: (filePath: string, isStaged: boolean) => void;
  onStatusChange: () => void;
  refreshTrigger: number;
}

export const StatusSidebar: React.FC<StatusSidebarProps> = ({
  repoPath,
  selectedFile,
  onSelectFile,
  onStatusChange,
  refreshTrigger,
}) => {
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [includeIgnored, setIncludeIgnored] = useState<boolean>(false);

  // Collapsible sections
  const [openStaged, setOpenStaged] = useState<boolean>(true);
  const [openUnstaged, setOpenUnstaged] = useState<boolean>(true);
  const [openUntracked, setOpenUntracked] = useState<boolean>(true);
  const [openConflicted, setOpenConflicted] = useState<boolean>(true);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res: StatusResult = await invoke('git:status_get', {
        path: repoPath,
        includeIgnored,
      });
      setStatus(res);
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (repoPath) {
      fetchStatus();
    }
  }, [repoPath, includeIgnored, refreshTrigger]);

  const handleStageFile = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    try {
      await invoke('git:stage_file', { path: repoPath, filePath });
      onStatusChange();
    } catch (err) {
      console.error('Stage error:', err);
    }
  };

  const handleUnstageFile = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    try {
      await invoke('git:unstage_file', { path: repoPath, filePath });
      onStatusChange();
    } catch (err) {
      console.error('Unstage error:', err);
    }
  };

  const handleStageAll = async () => {
    try {
      await invoke('git:stage_all', { path: repoPath });
      onStatusChange();
    } catch (err) {
      console.error('Stage all error:', err);
    }
  };

  const handleUnstageAll = async () => {
    try {
      await invoke('git:unstage_all', { path: repoPath });
      onStatusChange();
    } catch (err) {
      console.error('Unstage all error:', err);
    }
  };

  const handleDiscard = async (e: React.MouseEvent, filePath: string, type: DiscardType) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to discard changes in ${filePath}? ${type === 'Untracked' ? '(Will move to Recycle Bin)' : ''}`)) {
      return;
    }
    try {
      await invoke('git:discard_changes', {
        path: repoPath,
        filePath: filePath,
        discardType: type,
      });
      onStatusChange();
    } catch (err) {
      console.error('Discard error:', err);
    }
  };

  const renderFileRow = (file: FileStatus, isStaged: boolean, discardType: DiscardType) => {
    const isSelected = selectedFile === file.path;
    const badgeColor =
      file.status === 'Added' || file.status === 'Untracked'
        ? 'bg-green-100 text-green-800 border-green-300'
        : file.status === 'Deleted'
        ? 'bg-red-100 text-red-800 border-red-300'
        : file.status === 'Unmerged'
        ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold'
        : 'bg-blue-100 text-blue-800 border-blue-300';

    return (
      <div
        key={`${file.path}-${isStaged ? 'staged' : 'unstaged'}`}
        onClick={() => onSelectFile(file.path, isStaged)}
        className={`flex items-center justify-between px-3 py-1.5 cursor-pointer font-mono text-xs border-b border-[var(--tye-ink)]/10 transition-colors ${
          isSelected ? 'bg-[var(--tye-lavender)]/20 font-bold border-l-4 border-l-[var(--tye-ink)]' : 'hover:bg-[var(--tye-cream)]/50'
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
          <RiFileTextLine className="flex-shrink-0 opacity-60" />
          <span className="truncate" title={file.path}>
            {file.path}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] border uppercase ${badgeColor}`}>
            {file.status[0]}
          </span>
        </div>

        <div className="flex items-center gap-1 opacity-80 hover:opacity-100">
          {isStaged ? (
            <button
              onClick={(e) => handleUnstageFile(e, file.path)}
              title="Unstage file"
              className="p-1 rounded hover:bg-[var(--tye-ink)] hover:text-white transition-colors"
            >
              <RiSubtractLine size={14} />
            </button>
          ) : (
            <>
              <button
                onClick={(e) => handleDiscard(e, file.path, discardType)}
                title="Discard file changes (Recycle Bin if untracked)"
                className="p-1 rounded hover:bg-red-500 hover:text-white text-red-600 transition-colors"
              >
                <RiDeleteBinLine size={14} />
              </button>
              <button
                onClick={(e) => handleStageFile(e, file.path)}
                title="Stage file"
                className="p-1 rounded hover:bg-[var(--tye-ink)] hover:text-white transition-colors"
              >
                <RiAddLine size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white border-r-2 border-[var(--tye-ink)] select-none">
      {/* Header Bar */}
      <div className="p-3 border-b-2 border-[var(--tye-ink)] bg-[var(--tye-cream)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-pixel font-bold text-sm tracking-wide">STATUS ENGINE</h3>
          {loading && <RiRefreshLine className="animate-spin text-xs opacity-60" />}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIncludeIgnored(!includeIgnored)}
            title="Toggle ignored files"
            className={`p-1.5 rounded border border-[var(--tye-ink)] transition-colors text-xs ${
              includeIgnored ? 'bg-[var(--tye-ink)] text-white' : 'bg-white hover:bg-[var(--tye-cream)]'
            }`}
          >
            <RiEyeOffLine />
          </button>
          <button
            onClick={fetchStatus}
            title="Refresh status"
            className="p-1.5 bg-white hover:bg-[var(--tye-cream)] rounded border border-[var(--tye-ink)] text-xs transition-transform active:scale-95"
          >
            <RiRefreshLine />
          </button>
        </div>
      </div>

      {/* Sections list */}
      <div className="flex-1 overflow-y-auto">
        {status ? (
          <>
            {/* Conflicted Section */}
            {status.conflicted.length > 0 && (
              <div className="border-b border-[var(--tye-ink)]">
                <div
                  onClick={() => setOpenConflicted(!openConflicted)}
                  className="flex items-center justify-between px-3 py-2 bg-amber-50 cursor-pointer font-bold font-sans text-xs hover:bg-amber-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5 text-amber-800">
                    {openConflicted ? <RiArrowDownSLine /> : <RiArrowRightSLine />}
                    <RiErrorWarningLine />
                    <span>Conflicted ({status.conflicted.length})</span>
                  </div>
                </div>
                {openConflicted && (
                  <div className="bg-amber-50/30">
                    {status.conflicted.map((f) => renderFileRow(f, false, 'Unstaged'))}
                  </div>
                )}
              </div>
            )}

            {/* Staged Section */}
            <div className="border-b border-[var(--tye-ink)]">
              <div
                onClick={() => setOpenStaged(!openStaged)}
                className="flex items-center justify-between px-3 py-2 bg-[var(--tye-cream)]/30 cursor-pointer font-bold font-sans text-xs hover:bg-[var(--tye-cream)] transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  {openStaged ? <RiArrowDownSLine /> : <RiArrowRightSLine />}
                  <span>Staged ({status.staged.length})</span>
                  {status.staged.length > 0 && (
                    <span className="text-[10px] font-mono opacity-70">
                      (+{status.total_staged_stats.insertions} / -{status.total_staged_stats.deletions})
                    </span>
                  )}
                </div>
                {status.staged.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnstageAll();
                    }}
                    title="Unstage all files"
                    className="p-1 bg-white hover:bg-[var(--tye-ink)] hover:text-white rounded border border-[var(--tye-ink)] text-[10px] font-mono flex items-center gap-1"
                  >
                    <RiSubtractLine /> All
                  </button>
                )}
              </div>
              {openStaged && (
                <div>
                  {status.staged.length === 0 ? (
                    <div className="p-3 text-xs font-mono opacity-50 italic text-center">No staged changes</div>
                  ) : (
                    status.staged.map((f) => renderFileRow(f, true, 'Staged'))
                  )}
                </div>
              )}
            </div>

            {/* Unstaged Section */}
            <div className="border-b border-[var(--tye-ink)]">
              <div
                onClick={() => setOpenUnstaged(!openUnstaged)}
                className="flex items-center justify-between px-3 py-2 bg-[var(--tye-cream)]/30 cursor-pointer font-bold font-sans text-xs hover:bg-[var(--tye-cream)] transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  {openUnstaged ? <RiArrowDownSLine /> : <RiArrowRightSLine />}
                  <span>Unstaged ({status.unstaged.length})</span>
                  {status.unstaged.length > 0 && (
                    <span className="text-[10px] font-mono opacity-70">
                      (+{status.total_unstaged_stats.insertions} / -{status.total_unstaged_stats.deletions})
                    </span>
                  )}
                </div>
                {status.unstaged.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStageAll();
                    }}
                    title="Stage all files"
                    className="p-1 bg-white hover:bg-[var(--tye-ink)] hover:text-white rounded border border-[var(--tye-ink)] text-[10px] font-mono flex items-center gap-1"
                  >
                    <RiAddLine /> All
                  </button>
                )}
              </div>
              {openUnstaged && (
                <div>
                  {status.unstaged.length === 0 ? (
                    <div className="p-3 text-xs font-mono opacity-50 italic text-center">No modified files</div>
                  ) : (
                    status.unstaged.map((f) => renderFileRow(f, false, 'Unstaged'))
                  )}
                </div>
              )}
            </div>

            {/* Untracked Section */}
            <div className="border-b border-[var(--tye-ink)]">
              <div
                onClick={() => setOpenUntracked(!openUntracked)}
                className="flex items-center justify-between px-3 py-2 bg-[var(--tye-cream)]/30 cursor-pointer font-bold font-sans text-xs hover:bg-[var(--tye-cream)] transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  {openUntracked ? <RiArrowDownSLine /> : <RiArrowRightSLine />}
                  <span>Untracked ({status.untracked.length})</span>
                </div>
                {status.untracked.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStageAll();
                    }}
                    title="Stage all untracked"
                    className="p-1 bg-white hover:bg-[var(--tye-ink)] hover:text-white rounded border border-[var(--tye-ink)] text-[10px] font-mono flex items-center gap-1"
                  >
                    <RiCheckDoubleLine /> Add All
                  </button>
                )}
              </div>
              {openUntracked && (
                <div>
                  {status.untracked.length === 0 ? (
                    <div className="p-3 text-xs font-mono opacity-50 italic text-center">No untracked files</div>
                  ) : (
                    status.untracked.map((f) => renderFileRow(f, false, 'Untracked'))
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-6 text-center text-xs font-mono opacity-50">Loading repository status...</div>
        )}
      </div>
    </div>
  );
};
