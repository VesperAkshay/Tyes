import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GraphNode, GraphEdge, GraphView, HistorySearchType, HistorySearchQuery } from '../../types';
import {
  RiGitRepositoryCommitsLine,
  RiSearchLine,
  RiFilter3Line,
  RiGitBranchLine,
  RiCloseLine,
  RiRefreshLine,
  RiFlag2Line,
  RiFileCopyLine,
} from 'react-icons/ri';

interface CommitGraphViewProps {
  repoPath: string;
  onSelectCommit?: (commitId: string) => void;
}

export const CommitGraphView: React.FC<CommitGraphViewProps> = ({ repoPath, onSelectCommit }) => {
  const [graphData, setGraphData] = useState<GraphView>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);

  // Filters & Search state
  const [firstParentOnly, setFirstParentOnly] = useState(false);
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<HistorySearchType>('message');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GraphNode[] | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const rowHeight = 36; // px per commit row
  const laneWidth = 22; // px width per lane column

  const fetchGraph = async () => {
    if (!repoPath) return;
    try {
      setLoading(true);
      const data: GraphView = await invoke('git:get_commit_graph', {
        repoPath,
        limit: 1000,
        branchFilter: branchFilter.trim() || null,
        firstParentOnly,
      });
      setGraphData(data);
      setSearchResults(null);
    } catch (err: any) {
      console.error('Failed to load commit graph:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, [repoPath, firstParentOnly, branchFilter]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      setIsSearching(true);
      const query: HistorySearchQuery = {
        query_type: searchType,
        value: searchQuery.trim(),
        branch: branchFilter.trim() || undefined,
        all_branches: !branchFilter.trim(),
        include_merges: !firstParentOnly,
        limit: 500,
      };
      const results: GraphNode[] = await invoke('git:search_history', { repoPath, query });
      setSearchResults(results);
    } catch (err: any) {
      console.error('Search history error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const displayedNodes = searchResults || graphData.nodes;

  // Draw Bezier curves on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || searchResults) return; // Only draw DAG curves for main graph

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const totalRows = graphData.nodes.length;
    const maxLane = graphData.nodes.reduce((max, n) => Math.max(max, n.lane), 0) + 1;

    // Set canvas dimensions matching total list height and compact lane width
    const height = totalRows * rowHeight;
    const width = Math.min(Math.max((maxLane + 1) * laneWidth + 24, 60), 380);

    // High DPI scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Map commit IDs to index rows
    const idToIndex = new Map<string, number>();
    graphData.nodes.forEach((n, idx) => idToIndex.set(n.id, idx));

    // Draw Edges (Professional Elbow Bezier curves)
    graphData.edges.forEach((edge) => {
      const fromIdx = idToIndex.get(edge.from_id);
      const toIdx = idToIndex.get(edge.to_id);

      if (fromIdx === undefined || toIdx === undefined) return;

      const startX = edge.from_lane * laneWidth + 18;
      const startY = fromIdx * rowHeight + rowHeight / 2;
      const endX = edge.to_lane * laneWidth + 18;
      const endY = toIdx * rowHeight + rowHeight / 2;

      ctx.beginPath();
      ctx.moveTo(startX, startY);

      if (edge.from_lane === edge.to_lane || Math.abs(toIdx - fromIdx) <= 1) {
        if (edge.from_lane === edge.to_lane) {
          // Straight vertical line along exact lane
          ctx.lineTo(endX, endY);
        } else {
          // Adjacent row transition: tight direct s-curve
          const ctrlY1 = startY + (endY - startY) * 0.45;
          const ctrlY2 = startY + (endY - startY) * 0.55;
          ctx.bezierCurveTo(startX, ctrlY1, endX, ctrlY2, endX, endY);
        }
      } else {
        // Multi-row merge/fork: drop straight down vertically along original lane until 1 row above target
        const dropEndY = endY - rowHeight;
        ctx.lineTo(startX, dropEndY);

        // Perform crisp 1-row elbow s-curve from vertical drop right into target node
        const ctrlY1 = dropEndY + rowHeight * 0.45;
        const ctrlY2 = dropEndY + rowHeight * 0.55;
        ctx.bezierCurveTo(startX, ctrlY1, endX, ctrlY2, endX, endY);
      }

      ctx.strokeStyle = edge.color || '#8B85C4';
      ctx.lineWidth = 2.4;
      ctx.stroke();
    });

    // Draw Nodes (Circles on lanes)
    graphData.nodes.forEach((node, idx) => {
      const x = node.lane * laneWidth + 18;
      const y = idx * rowHeight + rowHeight / 2;

      // Glow ring if selected commit
      if (node.id === selectedCommitId) {
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.strokeStyle = '#D9A441';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Outer border circle
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = node.color || '#8B85C4';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#121212';
      ctx.stroke();

      if (node.is_head) {
        // Double ring for HEAD
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    });
  }, [graphData, searchResults, selectedCommitId]);

  const maxLane = graphData.nodes.reduce((max, n) => Math.max(max, n.lane), 0);
  const canvasWidth = Math.min(Math.max((maxLane + 1) * laneWidth + 24, 60), 380);

  const formatTime = (ts: number) => {
    const date = new Date(ts * 1000);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full bg-[var(--tye-cream)] text-[var(--tye-ink)] p-6 overflow-hidden">
      {/* Header & Filter Bar (`F-028`, `F-029`) */}
      <div className="flex flex-col gap-4 mb-4 pb-4 border-b-2 border-[var(--tye-ink)] flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold font-pixel tracking-tight flex items-center gap-2">
              <RiGitRepositoryCommitsLine className="text-[var(--tye-lavender)] w-6 h-6" />
              <span>Commit Graph & History (`F-028`, `F-029`)</span>
            </h1>
            <p className="text-xs font-mono opacity-80 mt-1">
              Topological DAG visualization with Bezier curves and high-performance search.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFirstParentOnly(!firstParentOnly)}
              className={`px-3 py-1.5 text-xs font-mono border-2 border-[var(--tye-ink)] transition-all flex items-center gap-1.5 ${
                firstParentOnly
                  ? 'bg-[var(--tye-lavender)] text-white font-bold shadow-[2px_2px_0px_0px_var(--tye-ink)]'
                  : 'bg-white text-[var(--tye-ink)] hover:bg-[var(--tye-cream)]'
              }`}
              title="Toggle First Parent Only (`--first-parent`)"
            >
              <RiFilter3Line className="w-4 h-4" />
              <span>First Parent Only</span>
            </button>

            <button
              onClick={fetchGraph}
              disabled={loading}
              className="tye-btn bg-white border-2 border-[var(--tye-ink)] text-xs flex items-center gap-1.5 hover:bg-[var(--tye-cream)]"
              title="Refresh Graph"
            >
              <RiRefreshLine className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search Bar (`F-029`) */}
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
          <div className="flex items-center border-2 border-[var(--tye-ink)] bg-white shadow-[2px_2px_0px_0px_var(--tye-ink)]">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as HistorySearchType)}
              className="px-2.5 py-1.5 bg-transparent font-mono text-xs font-bold border-r-2 border-[var(--tye-ink)] focus:outline-none"
            >
              <option value="message">Commit Msg (`-g`)</option>
              <option value="author">Author (`--author`)</option>
              <option value="committer">Committer (`--committer`)</option>
              <option value="file_path">File Path (`--`)</option>
              <option value="pickaxe">Pickaxe Text (`-S`)</option>
              <option value="pickaxe_regex">Pickaxe Regex (`-G`)</option>
            </select>

            <input
              type="text"
              placeholder={`Search commit history (${searchType})...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 font-mono text-xs w-64 sm:w-80 focus:outline-none bg-transparent"
            />

            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="px-2 text-[var(--tye-ink)] opacity-60 hover:opacity-100"
              >
                <RiCloseLine className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Branch filter (optional)"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-2.5 py-1.5 border-2 border-[var(--tye-ink)] font-mono text-xs bg-white shadow-[2px_2px_0px_0px_var(--tye-ink)] w-44"
            />

            <button
              type="submit"
              disabled={isSearching}
              className="tye-btn tye-btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5"
            >
              <RiSearchLine className="w-4 h-4" />
              <span>{isSearching ? 'Searching...' : 'Search'}</span>
            </button>
          </div>
        </form>
      </div>

      {searchResults && (
        <div className="bg-[var(--tye-lavender)]/10 border-2 border-[var(--tye-lavender)] p-2.5 mb-3 font-mono text-xs flex items-center justify-between">
          <span>
            Found <span className="font-bold">{searchResults.length}</span> commits matching{' '}
            <span className="font-bold underline">{searchQuery}</span> ({searchType}).
          </span>
          <button
            onClick={clearSearch}
            className="text-xs font-bold underline hover:text-[var(--tye-lavender)]"
          >
            Show Full DAG Graph
          </button>
        </div>
      )}

      {/* Graph Area (`F-028`) */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-white border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] relative select-none"
      >
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 font-pixel text-sm">
            Calculating DAG topology and Bezier lanes...
          </div>
        )}

        <div className="relative min-w-full" style={{ height: `${displayedNodes.length * rowHeight}px` }}>
          {/* Canvas for Bezier curves and lane dots */}
          {!searchResults && (
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 pointer-events-none z-10"
            />
          )}

          {/* DOM Rows for commit info */}
          <div
            className="absolute top-0 right-0 left-0 z-10 font-mono text-xs"
            style={{ paddingLeft: searchResults ? '16px' : `${canvasWidth}px` }}
          >
            {displayedNodes.map((node) => {
              const isSelected = selectedCommitId === node.id;
              return (
                <div
                  key={node.id}
                  onClick={() => {
                    setSelectedCommitId(node.id);
                    if (onSelectCommit) onSelectCommit(node.id);
                  }}
                  className={`group flex items-center justify-between border-b border-[var(--tye-ink)]/15 pr-4 pl-2 cursor-pointer transition-colors ${
                    isSelected ? 'bg-[var(--tye-mustard)]/30 font-bold' : 'hover:bg-[var(--tye-cream)]/70'
                  }`}
                  style={{ height: `${rowHeight}px` }}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-4">
                    {/* Pill ID Badge */}
                    <div className="flex items-center gap-1">
                      <span className="bg-[var(--tye-ink)] text-white px-1.5 py-0.5 rounded font-mono text-[11px] font-bold flex-shrink-0 shadow-[1px_1px_0px_0px_var(--tye-lavender)]">
                        {node.short_id}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(node.id);
                        }}
                        title="Copy full SHA"
                        className="opacity-0 group-hover:opacity-100 text-[var(--tye-ink)] hover:text-[var(--tye-lavender)] transition-opacity p-0.5 flex-shrink-0"
                      >
                        <RiFileCopyLine />
                      </button>
                    </div>

                    {/* Branch / Tag Badges (`F-028`) */}
                    {node.refs && node.refs.length > 0 && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {node.refs.map((ref, idx) => {
                          const isHead = ref === 'HEAD' || ref.includes('HEAD ->');
                          const isTag = ref.startsWith('tag:');
                          return (
                            <span
                              key={idx}
                              className={`text-[10px] px-1.5 py-0.5 border font-bold rounded flex items-center gap-1 shadow-sm ${
                                isHead
                                  ? 'bg-[var(--tye-lavender)] text-white border-[var(--tye-ink)] font-pixel tracking-wider'
                                  : isTag
                                  ? 'bg-amber-200 text-amber-950 border-amber-900 font-bold'
                                  : 'bg-emerald-100 text-emerald-950 border-emerald-900 font-bold'
                              }`}
                            >
                              {isHead ? <RiGitBranchLine /> : isTag ? <RiFlag2Line /> : null}
                              <span>{ref}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Commit Subject */}
                    <span className="truncate text-sm font-medium text-[var(--tye-ink)]" title={node.subject}>
                      {node.subject || '(no commit message)'}
                    </span>
                  </div>

                  {/* Author & Timestamp */}
                  <div className="flex items-center gap-4 flex-shrink-0 text-[11px] text-[var(--tye-ink)]/75">
                    <span className="truncate max-w-[140px] font-medium" title={node.author_email}>
                      {node.author_name}
                    </span>
                    <span className="w-24 text-right font-mono opacity-80">{formatTime(node.timestamp)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
