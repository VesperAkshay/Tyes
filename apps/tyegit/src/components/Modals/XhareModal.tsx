import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { RiCloseLine, RiShipLine, RiCheckLine, RiErrorWarningLine } from 'react-icons/ri';

interface XhareModalProps {
  repoPath: string;
  commitId: string;
  onClose: () => void;
}

interface TransferPayload {
  RelayStatus?: { running: boolean; ports: string };
  Progress?: { sent: number; total: number; speed: string };
  Error?: { message: string };
  Complete?: { message: string };
}

export const XhareModal: React.FC<XhareModalProps> = ({ repoPath, commitId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const hasStarted = React.useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    
    let unlisten: UnlistenFn | null = null;

    const startArchive = async () => {
      try {
        // Setup listener
        unlisten = await listen<TransferPayload>('transfer-event', (event) => {
          const p = event.payload;
          if (p.Progress) {
            setProgress(Math.round((p.Progress.sent / p.Progress.total) * 100));
          } else if (p.Complete) {
            setComplete(true);
          } else if (p.Error) {
            setError(p.Error.message);
          }
        });

        // Trigger command
        const returnedCode: string = await invoke('git:archive_and_share', {
          repoPath,
          commitId
        });
        setCode(returnedCode);
        setLoading(false);
      } catch (err: any) {
        setError(typeof err === 'string' ? err : err.message || 'Failed to archive');
        setLoading(false);
      }
    };

    startArchive();

    return () => {
      if (unlisten) unlisten();
    };
  }, [repoPath, commitId]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="bg-[var(--tye-cream)] border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_var(--tye-ink)] w-full max-w-md flex flex-col">
        <div className="p-4 border-b-2 border-[var(--tye-ink)] bg-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2 font-pixel font-bold text-sm tracking-wide text-amber-950">
            <RiShipLine size={20} />
            <span>ARCHIVE & SHARE</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-amber-950 hover:text-white rounded border border-amber-950 transition-colors">
            <RiCloseLine size={18} />
          </button>
        </div>

        <div className="p-8 flex flex-col items-center justify-center space-y-6">
          {error ? (
            <div className="text-red-700 font-mono text-center flex flex-col items-center gap-4">
              <RiErrorWarningLine size={48} />
              <p className="font-bold">{error}</p>
            </div>
          ) : complete ? (
            <div className="text-green-700 font-mono text-center flex flex-col items-center gap-4">
              <RiCheckLine size={64} className="animate-bounce" />
              <p className="font-bold text-xl">Archive Shared Successfully!</p>
            </div>
          ) : loading ? (
            <div className="font-mono text-[var(--tye-ink)] font-bold animate-pulse text-center">
              Generating ZIP Archive for {commitId.slice(0, 7)}...
            </div>
          ) : (
            <>
              <div className="text-center font-mono font-bold text-[var(--tye-ink)]">
                Share this code in the TyeXhare app to download the archive:
              </div>
              <div className="font-pixel text-6xl tracking-widest text-[var(--tye-lavender)] drop-shadow-md">
                {code}
              </div>
              
              <div className="w-full bg-white border-2 border-[var(--tye-ink)] h-6 mt-4 relative">
                <div 
                  className="h-full bg-amber-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold mix-blend-difference text-white">
                  {progress > 0 ? `UPLOADING: ${progress}%` : 'WAITING FOR RECEIVER...'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
