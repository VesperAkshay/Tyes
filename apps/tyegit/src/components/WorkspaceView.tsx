import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StatusSidebar } from './Status/StatusSidebar';
import { GodModeDiffEditor } from './Diff/GodModeDiffEditor';
import { CommitPanel } from './Commit/CommitPanel';
import { CommitHistoryView } from './Commit/CommitHistoryView';
import { CommitDetailModal } from './Commit/CommitDetailModal';
import { StatusResult } from '../types';
import {
  RiArrowLeftLine,
  RiFileCodeLine,
  RiHistoryLine,
  RiRefreshLine,
  RiGitRepositoryLine,
} from 'react-icons/ri';

interface WorkspaceViewProps {
  repoPath: string;
  onClose: () => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ repoPath, onClose }) => {
  const [activeTab, setActiveTab] = useState<'changes' | 'history'>('changes');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isStaged, setIsStaged] = useState<boolean>(false);
  const [stagedCount, setStagedCount] = useState<number>(0);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  
  // Modal for inspected commit
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);

  const fetchStagedCount = async () => {
    try {
      const res: StatusResult = await invoke('git:status_get', {
        path: repoPath,
        includeIgnored: false,
      });
      setStagedCount(res.staged.length);
    } catch (err) {
      console.error('Failed to update staged count:', err);
    }
  };

  useEffect(() => {
    fetchStagedCount();
  }, [repoPath, refreshTrigger]);

  const handleStatusChange = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleSelectFile = (filePath: string, staged: boolean) => {
    setSelectedFile(filePath);
    setIsStaged(staged);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--tye-cream)]/20 overflow-hidden select-none">
      {/* Workspace Top Header Bar */}
      <div className="h-12 bg-white border-b-2 border-[var(--tye-ink)] px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--tye-cream)] hover:bg-[var(--tye-ink)] hover:text-white border border-[var(--tye-ink)] rounded text-xs font-mono font-bold transition-colors"
          >
            <RiArrowLeftLine /> Dashboard
          </button>

          <div className="flex items-center gap-2 border-l-2 border-[var(--tye-ink)]/20 pl-3">
            <RiGitRepositoryLine className="text-lg text-[var(--tye-lavender)]" />
            <span className="font-pixel font-bold text-sm tracking-wide text-[var(--tye-ink)]">
              {repoPath.split(/[\\/]/).pop() || repoPath}
            </span>
            <span className="font-mono text-[11px] text-gray-500 truncate max-w-sm" title={repoPath}>
              ({repoPath})
            </span>
          </div>
        </div>

        {/* Tab Selector (Changes vs History) */}
        <div className="flex items-center gap-2">
          <div className="flex bg-[var(--tye-cream)] p-0.5 border border-[var(--tye-ink)] rounded font-mono text-xs">
            <button
              onClick={() => setActiveTab('changes')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                activeTab === 'changes'
                  ? 'bg-[var(--tye-ink)] text-white font-bold shadow-sm'
                  : 'hover:bg-white/60'
              }`}
            >
              <RiFileCodeLine /> Changes
              {stagedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-[var(--tye-lavender)] text-white rounded-full text-[10px]">
                  {stagedCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                activeTab === 'history'
                  ? 'bg-[var(--tye-ink)] text-white font-bold shadow-sm'
                  : 'hover:bg-white/60'
              }`}
            >
              <RiHistoryLine /> History (`F-024`)
            </button>
          </div>

          <button
            onClick={handleStatusChange}
            title="Refresh workspace"
            className="p-1.5 bg-white hover:bg-[var(--tye-cream)] rounded border border-[var(--tye-ink)] text-xs transition-transform active:scale-95"
          >
            <RiRefreshLine />
          </button>
        </div>
      </div>

      {/* Main Workspace Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'changes' ? (
          <>
            {/* Left Status Engine Sidebar (`w-80`) */}
            <div className="w-80 flex-shrink-0 h-full overflow-hidden">
              <StatusSidebar
                repoPath={repoPath}
                selectedFile={selectedFile}
                onSelectFile={handleSelectFile}
                onStatusChange={handleStatusChange}
                refreshTrigger={refreshTrigger}
              />
            </div>

            {/* Center God-Mode Diff Editor & Bottom Commit Panel (`F-019`-`F-023`) */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <GodModeDiffEditor
                repoPath={repoPath}
                selectedFile={selectedFile}
                isStaged={isStaged}
                onStageChange={handleStatusChange}
              />
              <CommitPanel
                repoPath={repoPath}
                stagedCount={stagedCount}
                onCommitSuccess={() => {
                  handleStatusChange();
                  setSelectedFile(null);
                }}
              />
            </div>
          </>
        ) : (
          /* Commit History Engine View (`F-024`) */
          <div className="flex-1 h-full overflow-hidden">
            <CommitHistoryView
              repoPath={repoPath}
              onSelectCommit={(cid) => setSelectedCommitId(cid)}
              refreshTrigger={refreshTrigger}
            />
          </div>
        )}
      </div>

      {/* Detail Modal (`F-025`) */}
      <CommitDetailModal
        repoPath={repoPath}
        commitId={selectedCommitId}
        onClose={() => setSelectedCommitId(null)}
        onSelectCommit={(cid) => setSelectedCommitId(cid)}
      />
    </div>
  );
};
