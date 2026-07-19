import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiCloseLine, RiDownloadCloud2Line } from 'react-icons/ri';

interface TerminalLogPaneProps {
  repoPath: string;
  jobId: string;
  jobName: string;
  onClose: () => void;
}

export const TerminalLogPane: React.FC<TerminalLogPaneProps> = ({ repoPath, jobId, jobName, onClose }) => {
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const fetchLog = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await invoke<string>('git:cicd_get_log', { repoPath, jobId });
        setLogs(data);
      } catch (err: any) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };
    fetchLog();
  }, [repoPath, jobId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--tye-ink)] text-white font-mono text-sm">
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-black/40 shadow-md">
        <div>
          <h2 className="font-bold flex items-center gap-2">
            <RiDownloadCloud2Line className="text-[var(--tye-lavender)] text-lg" />
            Job Logs: {jobName}
          </h2>
          <span className="text-xs opacity-60">ID: {jobId}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-800 rounded transition-colors text-xl opacity-80 hover:opacity-100"
        >
          <RiCloseLine />
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-4">
        {loading ? (
          <div className="flex-1 flex justify-center items-center">
            <span className="animate-pulse">Downloading logs from GitHub...</span>
          </div>
        ) : error ? (
          <div className="text-rose-400 font-bold p-4 border border-rose-800 bg-rose-900/20">
            Failed to load logs: {error}
          </div>
        ) : (
          <pre
            ref={scrollRef}
            className="flex-1 overflow-auto whitespace-pre-wrap break-words bg-black/50 p-4 rounded border border-gray-800 shadow-inner"
          >
            {logs || 'No logs available for this job.'}
          </pre>
        )}
      </div>
    </div>
  );
};
