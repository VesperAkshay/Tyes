import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiSettings4Line, RiCheckDoubleLine, RiAlertLine, RiLoader4Line, RiScissorsLine, RiInboxArchiveLine, RiStethoscopeLine, RiNodeTree } from 'react-icons/ri';
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
  const [runningTask, setRunningTask] = useState<string | null>(null);
  const [result, setResult] = useState<{ success: boolean; data?: any; error?: string } | null>(null);

  const runTask = async (taskName: string, command: string) => {
    setRunningTask(taskName);
    setResult(null);
    try {
      const res = await invoke(command, { repoPath });
      setResult({ success: true, data: res });
    } catch (err: any) {
      setResult({ success: false, error: err.toString() });
    } finally {
      setRunningTask(null);
    }
  };

  const tasks = [
    {
      id: 'optimize',
      name: 'Optimize Repository (GC)',
      desc: 'Packs loose objects, removes orphaned data, and improves performance.',
      icon: <RiSettings4Line className="w-5 h-5" />,
      command: 'git:repo_optimize'
    },
    {
      id: 'prune',
      name: 'Prune Unreachable Objects',
      desc: 'Deletes orphaned objects that are no longer referenced by any commit.',
      icon: <RiScissorsLine className="w-5 h-5" />,
      command: 'git:repo_prune'
    },
    {
      id: 'repack',
      name: 'Repack Objects',
      desc: 'Packs all unpacked objects and consolidates existing packs.',
      icon: <RiInboxArchiveLine className="w-5 h-5" />,
      command: 'git:repo_repack'
    },
    {
      id: 'fsck',
      name: 'Deep Integrity Scan (FSCK)',
      desc: 'Checks the database for corruption or missing links.',
      icon: <RiStethoscopeLine className="w-5 h-5" />,
      command: 'git:repo_fsck'
    },
    {
      id: 'commit_graph',
      name: 'Update Commit Graph',
      desc: 'Generates a commit-graph file to speed up history traversal.',
      icon: <RiNodeTree className="w-5 h-5" />,
      command: 'git:repo_commit_graph'
    }
  ];

  return (
    <div className="flex h-full w-full bg-[var(--tye-cream)] overflow-hidden">
      <div className="w-1/2 h-full border-r-2 border-[var(--tye-ink)] flex items-center justify-center p-8 bg-[var(--tye-cream)]">
        <img 
          src={poster4} 
          alt="04 RUST CORE SERIES" 
          className="max-h-full max-w-full object-contain drop-shadow-[8px_8px_0px_var(--tye-ink)] transition-transform hover:scale-[1.02] duration-500"
        />
      </div>

      <div className="w-1/2 h-full flex flex-col p-12 overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-[var(--tye-ink)] text-[var(--tye-cream)] flex items-center justify-center border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-lavender)]">
            <RiSettings4Line className="w-6 h-6" />
          </div>
          <h1 className="font-pixel text-4xl font-bold tracking-tight text-[var(--tye-ink)]">Maintenance Center</h1>
        </div>

        <p className="font-mono text-sm opacity-80 mb-8 max-w-md leading-relaxed">
          Keep your repository healthy and fast. Run deep scans, optimize database size, and repair broken links using native Git plumbing commands.
        </p>

        <div className="flex flex-col gap-4 mb-8">
          {tasks.map(t => (
            <div key={t.id} className="border-2 border-[var(--tye-ink)] p-4 flex items-center justify-between bg-white shadow-[4px_4px_0px_0px_var(--tye-ink)]">
              <div>
                <h3 className="font-mono font-bold text-lg text-[var(--tye-ink)]">{t.name}</h3>
                <p className="font-mono text-xs text-gray-600 mt-1">{t.desc}</p>
              </div>
              <button
                onClick={() => runTask(t.id, t.command)}
                disabled={runningTask !== null}
                className={`px-4 py-2 border-2 border-[var(--tye-ink)] font-mono text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  runningTask === t.id 
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : runningTask !== null
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-[var(--tye-lavender)] text-white hover:bg-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                }`}
              >
                {runningTask === t.id ? (
                  <><RiLoader4Line className="animate-spin w-4 h-4" /> Running...</>
                ) : (
                  <>{t.icon} Run</>
                )}
              </button>
            </div>
          ))}
        </div>

        {result && (
          <div className={`p-4 border-2 border-[var(--tye-ink)] font-mono text-sm flex flex-col gap-3 shadow-[4px_4px_0px_0px_var(--tye-ink)] animate-fade-in ${
            result.success ? 'bg-green-100' : 'bg-red-100'
          }`}>
            <div className="flex items-start gap-3">
              {result.success ? (
                <RiCheckDoubleLine className="w-6 h-6 text-green-700 flex-shrink-0 mt-0.5" />
              ) : (
                <RiAlertLine className="w-6 h-6 text-red-700 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex flex-col gap-1 w-full">
                <span className={`font-bold ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                  {result.success ? 'Task Completed Successfully' : 'Task Failed'}
                </span>
                
                {result.success && result.data?.space_saved_kb !== undefined ? (
                  <div className="flex gap-4 mt-2 text-green-800 text-xs">
                    <span className="bg-green-200 px-2 py-1 border border-green-300">
                      Objects Packed: {result.data.objects_packed}
                    </span>
                    <span className="bg-green-200 px-2 py-1 border border-green-300">
                      Space Saved: {result.data.space_saved_kb} KB
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 text-xs bg-black/5 p-2 rounded whitespace-pre-wrap font-mono overflow-x-auto">
                    {result.success ? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data)) : result.error}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
