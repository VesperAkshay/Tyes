import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiSettings4Line, RiCheckDoubleLine, RiAlertLine, RiLoader4Line } from 'react-icons/ri';
import poster4 from '../../assets/posters/Poster4.png';

interface MaintenanceViewProps {
  repoPath: string;
}

interface GcResult {
  message: string;
  space_saved_kb: number;
  objects_packed: number;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({ repoPath }) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; data?: GcResult; error?: string } | null>(null);

  const handleOptimize = async () => {
    setIsOptimizing(true);
    setResult(null);
    try {
      const res: GcResult = await invoke('git:repo_optimize', { repoPath });
      setResult({ success: true, data: res });
    } catch (err: any) {
      setResult({ success: false, error: err.toString() });
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-[var(--tye-cream)] overflow-hidden">
      <div className="w-1/2 h-full border-r-2 border-[var(--tye-ink)] flex items-center justify-center p-8 bg-[var(--tye-cream)]">
        <img 
          src={poster4} 
          alt="04 RUST CORE SERIES" 
          className="max-h-full max-w-full object-contain drop-shadow-[8px_8px_0px_var(--tye-ink)] transition-transform hover:scale-[1.02] duration-500"
        />
      </div>

      <div className="w-1/2 h-full flex flex-col p-12 justify-center">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-[var(--tye-ink)] text-[var(--tye-cream)] flex items-center justify-center border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-lavender)]">
            <RiSettings4Line className="w-6 h-6" />
          </div>
          <h1 className="font-pixel text-4xl font-bold tracking-tight text-[var(--tye-ink)]">Maintenance Center</h1>
        </div>

        <p className="font-mono text-sm opacity-80 mb-8 max-w-md leading-relaxed">
          Over time, Git accumulates dangling objects and uncompressed files. 
          Running a garbage collection (`git gc`) packs these files, deletes orphaned data, and significantly speeds up repository performance.
        </p>

        <button
          onClick={handleOptimize}
          disabled={isOptimizing}
          className={`px-6 py-4 border-2 border-[var(--tye-ink)] font-mono font-bold text-lg flex items-center justify-center gap-3 transition-all ${
            isOptimizing 
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-[var(--tye-lavender)] text-white hover:bg-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] active:translate-x-1 active:translate-y-1 active:shadow-[0px_0px_0px_0px_var(--tye-ink)]'
          }`}
        >
          {isOptimizing ? (
            <>
              <RiLoader4Line className="animate-spin w-5 h-5" /> Optimizing Database...
            </>
          ) : (
            <>
              <RiSettings4Line className="w-5 h-5" /> Optimize Repository
            </>
          )}
        </button>

        {result && (
          <div className={`mt-8 p-4 border-2 border-[var(--tye-ink)] font-mono text-sm flex items-start gap-3 shadow-[4px_4px_0px_0px_var(--tye-ink)] animate-fade-in ${
            result.success ? 'bg-green-100' : 'bg-red-100'
          }`}>
            {result.success ? (
              <>
                <RiCheckDoubleLine className="w-6 h-6 text-green-700 flex-shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-green-900">{result.data?.message}</span>
                  <div className="flex gap-4 mt-2 text-green-800 text-xs">
                    <span className="bg-green-200 px-2 py-1 border border-green-300">
                      Objects Packed: {result.data?.objects_packed}
                    </span>
                    <span className="bg-green-200 px-2 py-1 border border-green-300">
                      Space Saved: {result.data?.space_saved_kb} KB
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <RiAlertLine className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />
                <span className="font-bold whitespace-pre-wrap">{result.error}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
