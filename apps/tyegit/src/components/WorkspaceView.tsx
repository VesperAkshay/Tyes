import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StatusSidebar } from './Status/StatusSidebar';
import { GodModeDiffEditor } from './Diff/GodModeDiffEditor';
import { CommitPanel } from './Commit/CommitPanel';
import { CommitHistoryView } from './Commit/CommitHistoryView';
import { CommitDetailModal } from './Commit/CommitDetailModal';
import { CommitGraphView } from './Graph/CommitGraphView';
import { BranchManager } from './Branch/BranchManager';
import { RemoteManagerModal } from './Remote/RemoteManagerModal';
import { ThreeWayConflictModal } from './Conflicts/ThreeWayConflictModal';
import { StashManagerModal } from './Stash/StashManagerModal';
import { MergeBranchModal } from './Modals/MergeBranchModal';
import { ResetBranchModal } from './Modals/ResetBranchModal';
import { InteractiveRebaseModal } from './Modals/InteractiveRebaseModal';
import { TimeMachineView } from './TimeMachine/TimeMachineView';
import { StatusResult, ConflictFileItem, BranchItem, BranchList, CommitListItem } from '../types';
import {
  RiArrowLeftLine,
  RiFileCodeLine,
  RiHistoryLine,
  RiRefreshLine,
  RiGitRepositoryLine,
  RiGitBranchLine,
  RiGitRepositoryCommitsLine,
  RiCloudLine,
  RiInboxArchiveLine,
  RiGitMergeLine,
  RiAlertFill,
  RiTimeLine,
} from 'react-icons/ri';

interface WorkspaceViewProps {
  repoPath: string;
  onClose: () => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ repoPath, onClose }) => {
  const [activeTab, setActiveTab] = useState<'changes' | 'history' | 'graph' | 'branches' | 'timemachine'>('changes');
  const [showRemoteModal, setShowRemoteModal] = useState<boolean>(false);
  const [showStashModal, setShowStashModal] = useState<boolean>(false);
  const [showConflictModal, setShowConflictModal] = useState<boolean>(false);
  const [showMergeModal, setShowMergeModal] = useState<boolean>(false);
  const [branchesList, setBranchesList] = useState<BranchItem[]>([]);
  const [currentBranchName, setCurrentBranchName] = useState<string>('main');
  
  // Phase 4A Reset / Rebase modals state
  const [resetTarget, setResetTarget] = useState<{ oid: string; summary: string } | null>(null);
  const [rebaseTarget, setRebaseTarget] = useState<{ upstreamRef: string; commits: CommitListItem[] } | null>(null);
  const [conflictsCount, setConflictsCount] = useState<number>(0);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isStaged, setIsStaged] = useState<boolean>(false);
  const [stagedCount, setStagedCount] = useState<number>(0);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [statusBanner, setStatusBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  const showStatus = (text: string, isError = false) => {
    setStatusBanner({ text, isError });
    setTimeout(() => setStatusBanner(null), 5000);
  };
  
  // Modal for inspected commit
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);

  const fetchStagedAndConflicts = async () => {
    try {
      const res: StatusResult = await invoke('git:status_get', {
        path: repoPath,
        includeIgnored: false,
      });
      setStagedCount(res.staged.length);
      setConflictsCount(res.conflicted.length);
      // Auto open conflict modal if new conflicts detected
      if (res.conflicted.length > 0 && !showConflictModal) {
        // Option to trigger modal
      }
    } catch (err) {
      console.error('Failed to get staged/conflict status:', err);
    }
  };

  useEffect(() => {
    if (repoPath) {
      fetchStagedAndConflicts();
    }
  }, [repoPath, refreshTrigger]);

  const handleOpenMergeModal = async () => {
    try {
      const data: BranchList = await invoke('git:get_branches', { repoPath });
      const allBranches: BranchItem[] = [...(data.local || []), ...(data.remote || [])];
      setBranchesList(allBranches);
      const current = allBranches.find((b) => b.is_head);
      setCurrentBranchName(data.active_branch || current?.name || 'main');
      setShowMergeModal(true);
    } catch (err: any) {
      showStatus(`Failed to load branches for merge: ${err}`, true);
    }
  };

  const handleOpenRebaseOnto = async (targetCommitId: string) => {
    try {
      const commits: CommitListItem[] = await invoke('git:commit_history', {
        path: repoPath,
        offset: 0,
        limit: 100,
      });
      const idx = commits.findIndex((c) => c.id === targetCommitId);
      if (idx === -1) {
        showStatus('Could not find target commit in recent history.', true);
        return;
      }
      // Commits to rebase are those from HEAD up to (before) the target commit
      const toRebase = commits.slice(0, idx);
      setRebaseTarget({
        upstreamRef: targetCommitId.slice(0, 8),
        commits: toRebase,
      });
    } catch (err: any) {
      showStatus(`Failed to prepare interactive rebase: ${err}`, true);
    }
  };

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

        {/* Tab Selector (Changes, Graph, Branches, History) */}
        <div className="flex items-center gap-2.5">
          <div className="flex bg-[var(--tye-cream)] p-0.5 border border-[var(--tye-ink)] rounded font-mono text-xs">
            <button
              onClick={() => setActiveTab('changes')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
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
              onClick={() => setActiveTab('graph')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                activeTab === 'graph'
                  ? 'bg-[var(--tye-ink)] text-white font-bold shadow-sm'
                  : 'hover:bg-white/60'
              }`}
            >
              <RiGitRepositoryCommitsLine /> Graph (`F-028`)
            </button>
            <button
              onClick={() => setActiveTab('branches')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                activeTab === 'branches'
                  ? 'bg-[var(--tye-ink)] text-white font-bold shadow-sm'
                  : 'hover:bg-white/60'
              }`}
            >
              <RiGitBranchLine /> Branches (`F-026`)
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                activeTab === 'history'
                  ? 'bg-[var(--tye-ink)] text-white font-bold shadow-sm'
                  : 'hover:bg-white/60'
              }`}
            >
              <RiHistoryLine /> History
            </button>
            <button
              onClick={() => setActiveTab('timemachine')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                activeTab === 'timemachine'
                  ? 'bg-[var(--tye-lavender)] text-white font-bold shadow-sm'
                  : 'hover:bg-white/60'
              }`}
            >
              <RiTimeLine /> Time Machine
            </button>
          </div>

          <button
            onClick={() => setShowStashModal(true)}
            className="px-3 py-1 bg-violet-600 text-white hover:bg-violet-700 border border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] text-xs font-mono font-bold flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] transition-all"
            title="Stash WIP changes (F-041)"
          >
            <RiInboxArchiveLine className="w-3.5 h-3.5" />
            <span>Stash (`F-041`)</span>
          </button>

          <button
            onClick={handleOpenMergeModal}
            className="px-3 py-1 bg-emerald-600 text-white hover:bg-emerald-700 border border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] text-xs font-mono font-bold flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] transition-all"
            title="Merge branches (F-035)"
          >
            <RiGitMergeLine className="w-3.5 h-3.5" />
            <span>Merge (`F-035`)</span>
          </button>

          <button
            onClick={() => setShowRemoteModal(true)}
            className="px-3 py-1 bg-[var(--tye-lavender)] text-white hover:bg-[var(--tye-ink)] border border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] text-xs font-mono font-bold flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] transition-all"
          >
            <RiCloudLine className="w-3.5 h-3.5" />
            <span>Remotes (`F-030`)</span>
          </button>

          <button
            onClick={handleStatusChange}
            title="Refresh workspace"
            className="p-1.5 bg-white hover:bg-[var(--tye-cream)] rounded border border-[var(--tye-ink)] text-xs transition-transform active:scale-95"
          >
            <RiRefreshLine />
          </button>
        </div>
      </div>

      {/* Conflict Warning Banner (`F-040`) */}
      {conflictsCount > 0 && (
        <div className="bg-rose-600 text-white px-4 py-2 flex items-center justify-between font-mono text-xs border-b-2 border-[var(--tye-ink)] shadow-md animate-pulse">
          <div className="flex items-center gap-2.5 font-bold">
            <RiAlertFill className="text-lg" />
            <span>⚠️ {conflictsCount} UNRESOLVED INDEX CONFLICTS DETECTED (`F-040`)</span>
          </div>
          <button
            onClick={() => setShowConflictModal(true)}
            className="px-3 py-1 bg-white text-rose-700 font-bold rounded border border-[var(--tye-ink)] shadow-[2px_2px_0px_var(--tye-ink)] hover:bg-rose-50 transition-all cursor-pointer"
          >
            Open 3-Way Conflict Resolver (`F-040`)
          </button>
        </div>
      )}

      {statusBanner && (
        <div
          className={`p-3 mx-4 mt-3 border-2 font-mono text-xs shadow-[3px_3px_0px_0px_var(--tye-ink)] flex items-center justify-between ${
            statusBanner.isError
              ? 'bg-rose-100 border-rose-800 text-rose-900'
              : 'bg-emerald-100 border-emerald-800 text-emerald-900'
          }`}
        >
          <span className="font-bold">{statusBanner.text}</span>
          <button onClick={() => setStatusBanner(null)} className="font-bold ml-4">✕</button>
        </div>
      )}

      {/* Main Workspace Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'changes' && (
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
        )}

        {activeTab === 'graph' && (
          <div className="flex-1 h-full overflow-hidden">
            <CommitGraphView
              repoPath={repoPath}
              onSelectCommit={(cid) => setSelectedCommitId(cid)}
            />
          </div>
        )}

        {activeTab === 'branches' && (
          <div className="flex-1 h-full overflow-hidden">
            <BranchManager
              repoPath={repoPath}
              onBranchChanged={handleStatusChange}
            />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex-1 h-full overflow-hidden">
            <CommitHistoryView
              repoPath={repoPath}
              onSelectCommit={(cid) => setSelectedCommitId(cid)}
              refreshTrigger={refreshTrigger}
            />
          </div>
        )}

        {activeTab === 'timemachine' && (
          <div className="flex-1 h-full overflow-hidden">
            <TimeMachineView repoPath={repoPath} />
          </div>
        )}
      </div>

      {/* Detail Modal (`F-025` + `F-036`-`F-039` Actions) */}
      <CommitDetailModal
        repoPath={repoPath}
        commitId={selectedCommitId}
        onClose={() => setSelectedCommitId(null)}
        onSelectCommit={(cid) => setSelectedCommitId(cid)}
        onTriggerReset={(commitId, summary) => {
          setResetTarget({ oid: commitId, summary });
        }}
        onTriggerRebase={(commitId) => {
          handleOpenRebaseOnto(commitId);
        }}
        onConflictDetected={() => {
          handleStatusChange();
          setShowConflictModal(true);
        }}
      />

      {/* Remote Manager & Sync Modal (`F-030` - `F-033`) */}
      {showRemoteModal && (
        <RemoteManagerModal
          repoPath={repoPath}
          onClose={() => setShowRemoteModal(false)}
        />
      )}

      {/* Phase 4A Modals */}
      {showConflictModal && (
        <ThreeWayConflictModal
          repoPath={repoPath}
          isOpen={showConflictModal}
          onClose={() => setShowConflictModal(false)}
          onResolvedAll={() => {
            handleStatusChange();
            setShowConflictModal(false);
          }}
        />
      )}

      {showStashModal && (
        <StashManagerModal
          repoPath={repoPath}
          isOpen={showStashModal}
          onClose={() => setShowStashModal(false)}
          onStashChanged={() => handleStatusChange()}
        />
      )}

      {showMergeModal && (
        <MergeBranchModal
          repoPath={repoPath}
          branches={branchesList}
          currentBranch={currentBranchName}
          isOpen={showMergeModal}
          onClose={() => setShowMergeModal(false)}
          onMerged={(hasConflicts) => {
            handleStatusChange();
            if (hasConflicts) setShowConflictModal(true);
          }}
        />
      )}

      {resetTarget && (
        <ResetBranchModal
          repoPath={repoPath}
          targetOid={resetTarget.oid}
          targetSummary={resetTarget.summary}
          isOpen={true}
          onClose={() => setResetTarget(null)}
          onResetCompleted={() => handleStatusChange()}
        />
      )}

      {rebaseTarget && (
        <InteractiveRebaseModal
          repoPath={repoPath}
          upstreamRef={rebaseTarget.upstreamRef}
          commitsToRebase={rebaseTarget.commits}
          isOpen={true}
          onClose={() => setRebaseTarget(null)}
          onRebaseCompleted={(hasConflicts) => {
            handleStatusChange();
            if (hasConflicts) setShowConflictModal(true);
          }}
        />
      )}
    </div>
  );
};
