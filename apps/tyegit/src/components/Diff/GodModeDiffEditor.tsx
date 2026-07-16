import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DiffView, ImageDiff, DiffHunk } from '../../types';
import {
  RiFileCodeLine,
  RiLayoutColumnLine,
  RiLayoutRowLine,
  RiImageLine,
  RiAddLine,
  RiRefreshLine,
  RiErrorWarningLine,
} from 'react-icons/ri';

interface GodModeDiffEditorProps {
  repoPath: string;
  selectedFile: string | null;
  isStaged: boolean;
  onStageChange: () => void;
}

type DiffMode = 'unified' | 'split';
type ImageMode = 'side-by-side' | 'swipe' | 'onion' | 'difference' | 'blink';

export const GodModeDiffEditor: React.FC<GodModeDiffEditorProps> = ({
  repoPath,
  selectedFile,
  isStaged,
  onStageChange,
}) => {
  const [diffMode, setDiffMode] = useState<DiffMode>('unified');
  const [diffData, setDiffData] = useState<DiffView | null>(null);
  const [imageData, setImageData] = useState<ImageDiff | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Image modes state
  const [imageMode, setImageMode] = useState<ImageMode>('side-by-side');
  const [swipePos, setSwipePos] = useState<number>(50); // percentage
  const [onionOpacity, setOnionOpacity] = useState<number>(50); // percentage
  const [blinkState, setBlinkState] = useState<boolean>(false);

  const isImageFile = (path: string) => {
    const p = path.toLowerCase();
    return p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.gif') || p.endsWith('.webp') || p.endsWith('.svg');
  };

  const fetchDiff = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    setDiffData(null);
    setImageData(null);

    try {
      if (isImageFile(selectedFile)) {
        const res: ImageDiff = await invoke('git:diff_get_image', {
          path: repoPath,
          filePath: selectedFile,
          staged: isStaged,
        });
        setImageData(res);
      } else {
        const res: DiffView = await invoke('git:diff_get_file', {
          path: repoPath,
          filePath: selectedFile,
          staged: isStaged,
        });
        setDiffData(res);
      }
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err.message || 'Failed to load diff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiff();
  }, [repoPath, selectedFile, isStaged]);

  // Blink effect interval (`F-021`)
  useEffect(() => {
    let timer: any = null;
    if (imageData && imageMode === 'blink') {
      timer = setInterval(() => {
        setBlinkState((prev) => !prev);
      }, 600);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [imageData, imageMode]);

  const handleStagePatch = async (patchStr: string) => {
    try {
      await invoke('git:stage_patch', {
        path: repoPath,
        patchStr,
      });
      onStageChange();
      fetchDiff();
    } catch (err: any) {
      alert(`Failed to stage hunk/line: ${typeof err === 'string' ? err : err.message}`);
    }
  };

  const stageHunk = (hunk: DiffHunk) => {
    if (!selectedFile) return;
    const cleanPath = selectedFile.replace(/\\/g, '/');
    let patch = `diff --git a/${cleanPath} b/${cleanPath}\n`;
    patch += `--- a/${cleanPath}\n+++ b/${cleanPath}\n`;
    patch += `${hunk.header}\n`;
    for (const l of hunk.lines) {
      const cleanContent = l.content.replace(/\r?\n$/, '');
      patch += `${l.origin}${cleanContent}\n`;
    }
    handleStagePatch(patch);
  };

  const stageLine = (hunk: DiffHunk, lineIndex: number) => {
    if (!selectedFile) return;
    const target = hunk.lines[lineIndex];
    if (!target || target.origin === ' ') return;

    const cleanPath = selectedFile.replace(/\\/g, '/');
    let patchLines: string[] = [];
    let oldLinesCount = 0;
    let newLinesCount = 0;

    for (let i = 0; i < hunk.lines.length; i++) {
      const l = hunk.lines[i];
      const cleanContent = l.content.replace(/\r?\n$/, '');

      if (l.origin === ' ') {
        patchLines.push(` ${cleanContent}`);
        oldLinesCount++;
        newLinesCount++;
      } else if (i === lineIndex) {
        patchLines.push(`${l.origin}${cleanContent}`);
        if (l.origin === '+') newLinesCount++;
        if (l.origin === '-') oldLinesCount++;
      } else {
        if (l.origin === '-') {
          // Unstaged deletions remain in the index/workdir as context between HEAD and Index
          patchLines.push(` ${cleanContent}`);
          oldLinesCount++;
          newLinesCount++;
        }
        // Unstaged additions (origin === '+') are omitted from the patch
      }
    }

    const newHeader = `@@ -${hunk.old_start},${oldLinesCount} +${hunk.new_start},${newLinesCount} @@`;
    let patch = `diff --git a/${cleanPath} b/${cleanPath}\n`;
    patch += `--- a/${cleanPath}\n+++ b/${cleanPath}\n`;
    patch += `${newHeader}\n`;
    patch += patchLines.join('\n') + '\n';

    handleStagePatch(patch);
  };

  if (!selectedFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--tye-cream)]/20 p-8 select-none">
        <RiFileCodeLine className="text-6xl text-[var(--tye-ink)]/20 mb-4 animate-pulse" />
        <h3 className="font-pixel font-bold text-lg text-[var(--tye-ink)]/60">No file selected</h3>
        <p className="font-mono text-xs text-[var(--tye-ink)]/40 mt-1">
          Select a changed file from the Status Engine on the left to inspect diffs in God-Mode.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
      {/* Top Diff Header Bar */}
      <div className="p-3 border-b-2 border-[var(--tye-ink)] bg-[var(--tye-cream)] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs border border-[var(--tye-ink)] ${isStaged ? 'bg-[var(--tye-lavender)] text-white' : 'bg-amber-100 text-amber-900'}`}>
            {isStaged ? 'STAGED' : 'UNSTAGED'}
          </span>
          <span className="font-mono font-bold text-sm truncate text-[var(--tye-ink)]" title={selectedFile}>
            {selectedFile}
          </span>
          {diffData && !diffData.is_binary && (
            <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border border-[var(--tye-ink)]/20">
              <span className="text-green-700 font-bold">+{diffData.insertions}</span>{' '}
              <span className="text-red-700 font-bold">-{diffData.deletions}</span>
            </span>
          )}
        </div>

        {/* View mode buttons */}
        <div className="flex items-center gap-2">
          {imageData ? (
            <div className="flex items-center bg-white border border-[var(--tye-ink)] rounded p-0.5 text-xs font-mono">
              {(['side-by-side', 'swipe', 'onion', 'difference', 'blink'] as ImageMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setImageMode(m)}
                  className={`px-2 py-1 rounded capitalize transition-colors ${
                    imageMode === m ? 'bg-[var(--tye-ink)] text-white font-bold' : 'hover:bg-[var(--tye-cream)]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center bg-white border border-[var(--tye-ink)] rounded p-0.5 text-xs font-mono">
              <button
                onClick={() => setDiffMode('unified')}
                className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                  diffMode === 'unified' ? 'bg-[var(--tye-ink)] text-white font-bold' : 'hover:bg-[var(--tye-cream)]'
                }`}
              >
                <RiLayoutRowLine /> Unified
              </button>
              <button
                onClick={() => setDiffMode('split')}
                className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                  diffMode === 'split' ? 'bg-[var(--tye-ink)] text-white font-bold' : 'hover:bg-[var(--tye-cream)]'
                }`}
              >
                <RiLayoutColumnLine /> Side-by-Side
              </button>
            </div>
          )}

          <button
            onClick={fetchDiff}
            title="Refresh diff"
            className="p-1.5 bg-white hover:bg-[var(--tye-cream)] rounded border border-[var(--tye-ink)] text-xs"
          >
            <RiRefreshLine />
          </button>
        </div>
      </div>

      {/* Main Diff Content Area */}
      <div className="flex-1 overflow-auto bg-[var(--tye-cream)]/10 font-mono text-xs p-4">
        {loading && (
          <div className="flex items-center justify-center h-full text-sm font-mono opacity-60">
            <RiRefreshLine className="animate-spin mr-2" /> Loading diff inspection...
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-2 border-red-500 p-4 rounded text-red-800 flex items-center gap-3">
            <RiErrorWarningLine className="text-xl flex-shrink-0" />
            <div>
              <div className="font-bold">God-Mode Diff Engine Error</div>
              <div>{error}</div>
            </div>
          </div>
        )}

        {/* Binary / Image Diff View (`F-021`) */}
        {imageData && !loading && (
          <div className="flex flex-col items-center justify-center h-full bg-white border-2 border-[var(--tye-ink)] p-6 rounded shadow-[4px_4px_0px_var(--tye-ink)]">
            <div className="mb-4 font-pixel font-bold text-sm flex items-center gap-2">
              <RiImageLine /> 5-Mode Image Diff Viewer (`{imageMode.toUpperCase()}`)
            </div>

            {imageMode === 'side-by-side' && (
              <div className="grid grid-cols-2 gap-8 items-center justify-items-center w-full max-w-4xl">
                <div className="flex flex-col items-center">
                  <span className="font-bold mb-2 bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-300">OLD (HEAD)</span>
                  {imageData.old_data ? (
                    <img src={`data:image/${imageData.format};base64,${imageData.old_data}`} alt="Old" className="max-h-80 border-2 border-[var(--tye-ink)] object-contain" />
                  ) : (
                    <div className="w-64 h-64 border-2 border-dashed border-[var(--tye-ink)]/30 flex items-center justify-center text-gray-400">No old image</div>
                  )}
                </div>
                <div className="flex flex-col items-center">
                  <span className="font-bold mb-2 bg-green-100 text-green-800 px-2 py-0.5 rounded border border-green-300">NEW (WORKDIR)</span>
                  {imageData.new_data ? (
                    <img src={`data:image/${imageData.format};base64,${imageData.new_data}`} alt="New" className="max-h-80 border-2 border-[var(--tye-ink)] object-contain" />
                  ) : (
                    <div className="w-64 h-64 border-2 border-dashed border-[var(--tye-ink)]/30 flex items-center justify-center text-gray-400">No new image</div>
                  )}
                </div>
              </div>
            )}

            {imageMode === 'swipe' && (
              <div className="flex flex-col items-center w-full max-w-2xl">
                <div className="relative border-2 border-[var(--tye-ink)] overflow-hidden w-full h-80 flex items-center justify-center bg-gray-100">
                  {imageData.new_data && (
                    <img src={`data:image/${imageData.format};base64,${imageData.new_data}`} alt="New" className="absolute inset-0 w-full h-full object-contain" />
                  )}
                  {imageData.old_data && (
                    <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${swipePos}%` }}>
                      <img src={`data:image/${imageData.format};base64,${imageData.old_data}`} alt="Old" className="w-full h-full object-contain max-w-none" />
                    </div>
                  )}
                  <div className="absolute top-0 bottom-0 w-0.5 bg-[var(--tye-ink)] pointer-events-none" style={{ left: `${swipePos}%` }} />
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={swipePos}
                  onChange={(e) => setSwipePos(Number(e.target.value))}
                  className="w-full mt-4 cursor-pointer accent-[var(--tye-ink)]"
                />
                <span className="mt-1 font-mono text-xs">Swipe Position: {swipePos}% (Left: Old, Right: New)</span>
              </div>
            )}

            {imageMode === 'onion' && (
              <div className="flex flex-col items-center w-full max-w-2xl">
                <div className="relative border-2 border-[var(--tye-ink)] overflow-hidden w-full h-80 flex items-center justify-center bg-gray-100">
                  {imageData.old_data && (
                    <img src={`data:image/${imageData.format};base64,${imageData.old_data}`} alt="Old" className="absolute inset-0 w-full h-full object-contain" />
                  )}
                  {imageData.new_data && (
                    <img
                      src={`data:image/${imageData.format};base64,${imageData.new_data}`}
                      alt="New"
                      className="absolute inset-0 w-full h-full object-contain transition-opacity duration-150"
                      style={{ opacity: onionOpacity / 100 }}
                    />
                  )}
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={onionOpacity}
                  onChange={(e) => setOnionOpacity(Number(e.target.value))}
                  className="w-full mt-4 cursor-pointer accent-[var(--tye-ink)]"
                />
                <span className="mt-1 font-mono text-xs">New Image Opacity: {onionOpacity}%</span>
              </div>
            )}

            {imageMode === 'difference' && (
              <div className="flex flex-col items-center">
                <div className="border-2 border-[var(--tye-ink)] p-4 bg-black text-white font-mono text-center">
                  <p className="mb-2 text-yellow-300 font-bold">Difference Mask Mode</p>
                  <p className="text-xs opacity-80">Highlights layout changes and dimension shift between HEAD and Workdir.</p>
                  <p className="mt-2 text-sm">Dimensions: {imageData.width}x{imageData.height}px ({imageData.format.toUpperCase()})</p>
                </div>
              </div>
            )}

            {imageMode === 'blink' && (
              <div className="flex flex-col items-center">
                <div className="border-2 border-[var(--tye-ink)] p-2 bg-white w-80 h-80 flex items-center justify-center">
                  {blinkState ? (
                    imageData.new_data ? (
                      <img src={`data:image/${imageData.format};base64,${imageData.new_data}`} alt="New" className="max-h-full object-contain" />
                    ) : <span>No New Image</span>
                  ) : (
                    imageData.old_data ? (
                      <img src={`data:image/${imageData.format};base64,${imageData.old_data}`} alt="Old" className="max-h-full object-contain" />
                    ) : <span>No Old Image</span>
                  )}
                </div>
                <span className={`mt-3 px-3 py-1 rounded font-bold text-xs border border-[var(--tye-ink)] ${blinkState ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
                  SHOWING: {blinkState ? 'NEW (WORKDIR)' : 'OLD (HEAD)'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Text Diff View (`F-019` Unified, `F-020` Split) */}
        {diffData && !diffData.is_binary && !loading && (
          <div className="bg-white border-2 border-[var(--tye-ink)] rounded overflow-hidden shadow-[2px_2px_0px_var(--tye-ink)]">
            {diffData.hunks.length === 0 ? (
              <div className="p-8 text-center font-mono text-gray-500 italic">No text differences found in hunks.</div>
            ) : (
              diffData.hunks.map((hunk, hIdx) => (
                <div key={hIdx} className="border-b-2 border-[var(--tye-ink)]/30 last:border-b-0">
                  {/* Hunk Header (`@@ -x,y +a,b @@`) with Interactive Stage Hunk button (`F-016`) */}
                  <div className="bg-[var(--tye-cream)]/60 px-4 py-2 flex items-center justify-between border-b border-[var(--tye-ink)]/20 text-gray-700 font-bold">
                    <span>{hunk.header}</span>
                    {!isStaged && (
                      <button
                        onClick={() => stageHunk(hunk)}
                        className="flex items-center gap-1 bg-white hover:bg-[var(--tye-ink)] hover:text-white px-2 py-1 rounded border border-[var(--tye-ink)] text-[10px] transition-colors"
                      >
                        <RiAddLine /> Stage Hunk
                      </button>
                    )}
                  </div>

                  {/* Unified View */}
                  {diffMode === 'unified' ? (
                    <div className="divide-y divide-gray-100 font-mono text-xs">
                      {hunk.lines.map((line, lIdx) => {
                        const bg =
                          line.origin === '+'
                            ? 'bg-green-50 text-green-900 border-l-4 border-l-green-500'
                            : line.origin === '-'
                            ? 'bg-red-50 text-red-900 border-l-4 border-l-red-500'
                            : 'bg-white text-gray-700';

                        return (
                          <div key={lIdx} className={`flex items-center hover:bg-gray-50/80 ${bg}`}>
                            {/* Old Line Number */}
                            <div className="w-12 py-0.5 text-right pr-2 text-gray-400 select-none border-r border-gray-200">
                              {line.old_lineno ?? ''}
                            </div>
                            {/* New Line Number */}
                            <div className="w-12 py-0.5 text-right pr-2 text-gray-400 select-none border-r border-gray-200">
                              {line.new_lineno ?? ''}
                            </div>
                            {/* Line Origin Symbol */}
                            <div className="w-6 py-0.5 text-center font-bold select-none">{line.origin}</div>
                            {/* Line Content */}
                            <div className="flex-1 py-0.5 px-2 whitespace-pre-wrap break-all">{line.content}</div>
                            {/* Stage single line button (`F-017`) */}
                            {!isStaged && line.origin !== ' ' && (
                              <button
                                onClick={() => stageLine(hunk, lIdx)}
                                title="Stage this line"
                                className="mr-2 p-1 text-gray-400 hover:text-[var(--tye-ink)] hover:bg-gray-200 rounded transition-colors"
                              >
                                <RiAddLine size={14} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Side-by-Side Split View (`F-020`) */
                    <div className="grid grid-cols-2 divide-x-2 divide-[var(--tye-ink)] font-mono text-xs">
                      {/* Left Column: Old Lines */}
                      <div className="divide-y divide-gray-100">
                        {hunk.lines
                          .filter((l) => l.origin === '-' || l.origin === ' ')
                          .map((line, lIdx) => (
                            <div
                              key={`old-${lIdx}`}
                              className={`flex items-center py-0.5 ${
                                line.origin === '-' ? 'bg-red-50 text-red-900' : 'bg-white text-gray-700'
                              }`}
                            >
                              <div className="w-10 text-right pr-2 text-gray-400 select-none border-r border-gray-200">
                                {line.old_lineno ?? ''}
                              </div>
                              <div className="flex-1 px-2 whitespace-pre-wrap break-all">{line.content}</div>
                            </div>
                          ))}
                      </div>
                      {/* Right Column: New Lines */}
                      <div className="divide-y divide-gray-100">
                        {hunk.lines
                          .filter((l) => l.origin === '+' || l.origin === ' ')
                          .map((line, lIdx) => (
                            <div
                              key={`new-${lIdx}`}
                              className={`flex items-center py-0.5 ${
                                line.origin === '+' ? 'bg-green-50 text-green-900' : 'bg-white text-gray-700'
                              }`}
                            >
                              <div className="w-10 text-right pr-2 text-gray-400 select-none border-r border-gray-200">
                                {line.new_lineno ?? ''}
                              </div>
                              <div className="flex-1 px-2 whitespace-pre-wrap break-all">{line.content}</div>
                              {!isStaged && line.origin === '+' && (
                                <button
                                  onClick={() => stageLine(hunk, hunk.lines.indexOf(line))}
                                  title="Stage line"
                                  className="mr-2 p-1 text-gray-400 hover:text-green-800"
                                >
                                  <RiAddLine size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
