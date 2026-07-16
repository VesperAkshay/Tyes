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
  RiErrorWarningLine,
  RiEyeOffLine,
  RiEyeLine,
  RiListUnordered,
  RiNodeTree,
  RiFolder3Fill,
  RiFolderOpenFill
} from 'react-icons/ri';
import { MaterialFileIcon } from '../UI/MaterialFileIcon';

interface StatusSidebarProps {
  repoPath: string;
  selectedFile: string | null;
  onSelectFile: (filePath: string, isStaged: boolean) => void;
  onStatusChange: () => void;
  refreshTrigger: number;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  file?: FileStatus;
}

const buildTree = (files: FileStatus[]): TreeNode[] => {
  const root: TreeNode = { name: 'root', path: '', isDir: true, children: [] };

  files.forEach(file => {
    const parts = file.path.split('/');
    let currentLevel = root.children;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = index === parts.length - 1;

      let existingNode = currentLevel.find(n => n.name === part);
      if (!existingNode) {
        existingNode = {
          name: part,
          path: currentPath,
          isDir: !isLast,
          children: []
        };
        currentLevel.push(existingNode);
      }

      if (isLast) {
        existingNode.file = file;
      }
      currentLevel = existingNode.children;
    });
  });

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(n => sortNodes(n.children));
  };
  
  sortNodes(root.children);
  return root.children;
};

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
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('tree');

  // Collapsible sections
  const [openStaged, setOpenStaged] = useState<boolean>(true);
  const [openUnstaged, setOpenUnstaged] = useState<boolean>(true);
  const [openUntracked, setOpenUntracked] = useState<boolean>(true);
  const [openConflicted, setOpenConflicted] = useState<boolean>(true);
  const [openIgnored, setOpenIgnored] = useState<boolean>(true);

  const [confirmDiscard, setConfirmDiscard] = useState<{
    filePath: string;
    type: DiscardType;
  } | null>(null);

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

  const handleIgnoreFile = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    try {
      await invoke('git:ignore_file', { path: repoPath, filePath });
      onStatusChange();
    } catch (err) {
      console.error('Ignore error:', err);
    }
  };

  const handleUnignoreFile = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    try {
      await invoke('git:unignore_file', { path: repoPath, filePath });
      onStatusChange();
    } catch (err) {
      console.error('Unignore error:', err);
    }
  };

  const handleDiscard = (e: React.MouseEvent, filePath: string, type: DiscardType) => {
    e.stopPropagation();
    setConfirmDiscard({ filePath, type });
  };

  const executeDiscard = async (filePath: string, type: DiscardType) => {
    setConfirmDiscard(null);
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

  const renderFileRow = (file: FileStatus, isStaged: boolean, discardType: DiscardType, level: number = 0) => {
    const isSelected = selectedFile === file.path;
    const badgeColor =
      file.status === 'Added' || file.status === 'Untracked'
        ? 'bg-green-100 text-green-800 border-green-300'
        : file.status === 'Deleted'
        ? 'bg-red-100 text-red-800 border-red-300'
        : file.status === 'Unmerged'
        ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold'
        : 'bg-blue-100 text-blue-800 border-blue-300';

    const indent = level * 12;

    return (
      <div
        key={`${file.path}-${isStaged ? 'staged' : 'unstaged'}`}
        onClick={() => onSelectFile(file.path, isStaged)}
        style={{ paddingLeft: `${indent + 12}px` }}
        className={`flex items-center justify-between pr-3 py-1.5 cursor-pointer font-mono text-xs border-b border-[var(--tye-ink)]/5 transition-colors group ${
          isSelected ? 'bg-[var(--tye-lavender)]/20 font-bold border-l-4 border-l-[var(--tye-ink)]' : 'hover:bg-[var(--tye-cream)]/50'
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
          <MaterialFileIcon filename={file.path} className="w-4 h-4 opacity-80" />
          <span className="truncate" title={file.path}>
            {viewMode === 'tree' ? file.path.split('/').pop() : file.path}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] border uppercase ${badgeColor}`}>
            {file.status[0]}
          </span>
        </div>

        <div className="flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
          {file.status === 'Ignored' ? (
            <button
              onClick={(e) => handleUnignoreFile(e, file.path)}
              title="Remove from .gitignore"
              className="p-1 rounded hover:bg-[var(--tye-ink)] hover:text-white transition-colors text-[var(--tye-ink)]/70"
            >
              <RiEyeLine size={14} />
            </button>
          ) : isStaged ? (
            <button
              onClick={(e) => handleUnstageFile(e, file.path)}
              title="Unstage file"
              className="p-1 rounded hover:bg-[var(--tye-ink)] hover:text-white transition-colors"
            >
              <RiSubtractLine size={14} />
            </button>
          ) : (
            <>
              {file.status === 'Untracked' && (
                <button
                  onClick={(e) => handleIgnoreFile(e, file.path)}
                  title="Add to .gitignore"
                  className="p-1 rounded hover:bg-[var(--tye-ink)] hover:text-white transition-colors text-[var(--tye-ink)]/70 mr-1"
                >
                  <RiEyeOffLine size={14} />
                </button>
              )}
              <button
                onClick={(e) => handleDiscard(e, file.path, discardType)}
                title="Discard file changes"
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

  const FileTreeNodeComponent: React.FC<{
    node: TreeNode;
    isStaged: boolean;
    discardType: DiscardType;
    level: number;
  }> = ({ node, isStaged, discardType, level }) => {
    const [isOpen, setIsOpen] = useState(true);

    if (!node.isDir && node.file) {
      return renderFileRow(node.file, isStaged, discardType, level);
    }

    const collectFiles = (n: TreeNode): string[] => {
      let paths: string[] = [];
      if (!n.isDir && n.file) paths.push(n.file.path);
      n.children.forEach(c => { paths.push(...collectFiles(c)); });
      return paths;
    };

    const handleStageFolder = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const paths = collectFiles(node);
      try {
        await Promise.all(paths.map(p => invoke('git:stage_file', { path: repoPath, filePath: p })));
        onStatusChange();
      } catch (err) { console.error(err); }
    };

    const handleUnstageFolder = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const paths = collectFiles(node);
      try {
        await Promise.all(paths.map(p => invoke('git:unstage_file', { path: repoPath, filePath: p })));
        onStatusChange();
      } catch (err) { console.error(err); }
    };

    return (
      <div className="w-full">
        <div 
          onClick={() => setIsOpen(!isOpen)}
          style={{ paddingLeft: `${level * 12 + 12}px` }}
          className="flex items-center justify-between pr-3 py-1 cursor-pointer font-mono text-[11px] font-bold text-[var(--tye-ink)]/80 hover:bg-[var(--tye-cream)]/50 group border-b border-[var(--tye-ink)]/5"
        >
          <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
            <span className="opacity-50 group-hover:opacity-100 transition-opacity">
              {isOpen ? <RiArrowDownSLine /> : <RiArrowRightSLine />}
            </span>
            {isOpen ? <RiFolderOpenFill className="text-yellow-500 w-4 h-4" /> : <RiFolder3Fill className="text-yellow-500 w-4 h-4" />}
            <span className="truncate">{node.name}</span>
          </div>

          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            {isStaged ? (
               <button onClick={handleUnstageFolder} title="Unstage Folder" className="p-1 rounded hover:bg-[var(--tye-ink)] hover:text-white border border-transparent hover:border-[var(--tye-ink)]">
                 <RiSubtractLine size={12} />
               </button>
            ) : (
               <button onClick={handleStageFolder} title="Stage Folder" className="p-1 rounded hover:bg-[var(--tye-ink)] hover:text-white border border-transparent hover:border-[var(--tye-ink)]">
                 <RiAddLine size={12} />
               </button>
            )}
          </div>
        </div>
        {isOpen && (
          <div>
            {node.children.map(child => (
              <FileTreeNodeComponent key={child.path} node={child} isStaged={isStaged} discardType={discardType} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSectionFiles = (files: FileStatus[], isStaged: boolean, discardType: DiscardType) => {
    if (files.length === 0) return null;
    if (viewMode === 'list') {
      return files.map(f => renderFileRow(f, isStaged, discardType, 0));
    } else {
      const tree = buildTree(files);
      return tree.map(node => (
        <FileTreeNodeComponent key={node.path} node={node} isStaged={isStaged} discardType={discardType} level={0} />
      ));
    }
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
          <div className="flex items-center bg-white border border-[var(--tye-ink)] rounded mr-2 p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1 rounded-sm transition-colors ${viewMode === 'list' ? 'bg-[var(--tye-ink)] text-white' : 'hover:bg-[var(--tye-cream)] text-[var(--tye-ink)]/60'}`}
              title="Flat List View"
            >
              <RiListUnordered size={12} />
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`p-1 rounded-sm transition-colors ${viewMode === 'tree' ? 'bg-[var(--tye-ink)] text-white' : 'hover:bg-[var(--tye-cream)] text-[var(--tye-ink)]/60'}`}
              title="Nested Tree View"
            >
              <RiNodeTree size={12} />
            </button>
          </div>

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

      {confirmDiscard && (
        <div className="m-3 p-3 bg-amber-100 border-2 border-amber-800 text-amber-950 font-mono text-xs shadow-[3px_3px_0px_0px_#92400e]">
          <div className="font-pixel text-xs font-bold text-amber-900 mb-1">
            ⚠️ Confirm Discard
          </div>
          <p className="mb-2 font-bold text-[11px] leading-tight">
            Discard changes in {confirmDiscard.filePath}? {confirmDiscard.type === 'Untracked' ? '(Will move to Recycle Bin)' : ''}
          </p>
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => setConfirmDiscard(null)}
              className="px-2 py-0.5 bg-white border border-amber-800 font-pixel text-[10px] font-bold"
            >
              Cancel
            </button>
            <button
              onClick={() => executeDiscard(confirmDiscard.filePath, confirmDiscard.type)}
              className="px-2 py-0.5 bg-amber-600 text-white font-pixel text-[10px] border border-amber-800 hover:bg-amber-700 font-bold"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Sections list */}
      <div className="flex-1 overflow-y-auto pb-6">
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
                    {renderSectionFiles(status.conflicted, false, 'Unstaged')}
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
                    renderSectionFiles(status.staged, true, 'Staged')
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
                    renderSectionFiles(status.unstaged, false, 'Unstaged')
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
                    renderSectionFiles(status.untracked, false, 'Untracked')
                  )}
                </div>
              )}
            </div>

            {/* Ignored Section */}
            {includeIgnored && (
              <div className="border-b border-[var(--tye-ink)]">
                <div
                  onClick={() => setOpenIgnored(!openIgnored)}
                  className="flex items-center justify-between px-3 py-2 bg-gray-100/50 cursor-pointer font-bold font-sans text-xs hover:bg-gray-100 transition-colors opacity-70"
                >
                  <div className="flex items-center gap-1.5">
                    {openIgnored ? <RiArrowDownSLine /> : <RiArrowRightSLine />}
                    <span>Ignored ({status.ignored.length})</span>
                  </div>
                </div>
                {openIgnored && (
                  <div>
                    {status.ignored.length === 0 ? (
                      <div className="p-3 text-xs font-mono opacity-50 italic text-center">No ignored files visible</div>
                    ) : (
                      renderSectionFiles(status.ignored, false, 'Untracked')
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="p-6 text-center text-xs font-mono opacity-50">Loading repository status...</div>
        )}
      </div>
    </div>
  );
};
