import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiTerminalBoxLine, RiPlayCircleLine, RiErrorWarningLine } from 'react-icons/ri';

interface PlumbingTerminalProps {
  repoPath: string;
}

interface CommandHistoryEntry {
  command: string;
  output: string;
  isError: boolean;
  timestamp: string;
}

export const PlumbingTerminal: React.FC<PlumbingTerminalProps> = ({ repoPath }) => {
  const [commandInput, setCommandInput] = useState('');
  const [history, setHistory] = useState<CommandHistoryEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of terminal
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const dangerousCommands = ["update-ref", "update-index", "write-tree", "read-tree", "commit-tree"];

  const PLUMBING_COMMANDS = [
    { cmd: 'cat-file -p HEAD', desc: 'Pretty-print the contents of the HEAD commit object.', dangerous: false },
    { cmd: 'rev-parse HEAD', desc: 'Output the exact SHA-1 hash of HEAD.', dangerous: false },
    { cmd: 'rev-list --all', desc: 'List all commit objects in the repository in reverse chronological order.', dangerous: false },
    { cmd: 'ls-tree HEAD', desc: 'List the contents of the tree object for HEAD.', dangerous: false },
    { cmd: 'hash-object -w <file>', desc: 'Compute object ID and optionally creates a blob from a file.', dangerous: false },
    { cmd: 'update-ref refs/heads/<name> HEAD', desc: 'Update a branch reference to point to a specific commit.', dangerous: true },
    { cmd: 'commit-tree <tree-hash> -m "msg"', desc: 'Create a new commit object based on a tree hash.', dangerous: true },
    { cmd: 'write-tree', desc: 'Create a tree object from the current index.', dangerous: true },
    { cmd: 'update-index --add <file>', desc: 'Register file contents in the working tree to the index.', dangerous: true },
    { cmd: 'read-tree <tree-hash>', desc: 'Reads tree information into the index.', dangerous: true }
  ];

  const handleExecute = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!commandInput.trim()) return;

    const cmdStr = commandInput.trim();
    const args = cmdStr.split(/\s+/);
    
    // Safety check: is this a git command?
    if (args[0] === 'git') {
      args.shift(); // remove 'git' prefix if user typed it
    }

    if (args.length === 0) return;
    
    const cmdName = args[0];
    const isDangerous = dangerousCommands.includes(cmdName);

    if (isDangerous) {
      const confirm = window.confirm(
        `WARNING: '${cmdName}' is a destructive plumbing command.\n\n` +
        `This will modify your repository and trigger an auto-checkpoint via the Time Machine.\n\n` +
        `Are you sure you want to proceed?`
      );
      if (!confirm) return;
    }

    setIsExecuting(true);
    setCommandInput(''); // Clear input

    try {
      const endpoint = isDangerous ? 'git:plumbing_execute_dangerous' : 'git:plumbing_execute_safe';
      const output: string = await invoke(endpoint, { repoPath, args });
      
      setHistory(prev => [...prev, {
        command: cmdStr,
        output,
        isError: false,
        timestamp: new Date().toLocaleTimeString()
      }]);
    } catch (err: any) {
      setHistory(prev => [...prev, {
        command: cmdStr,
        output: err.toString(),
        isError: true,
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#1E1E1E] font-mono text-white">
      
      {/* Main Terminal Area */}
      <div className="flex-1 flex flex-col h-full border-r border-black">
      
      {/* Header */}
      <div className="p-3 bg-[#252526] border-b border-black flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-2 text-white">
          <RiTerminalBoxLine className="text-[var(--tye-lavender)] text-xl" />
          <h2 className="font-bold">Plumbing Terminal</h2>
        </div>
        <div className="text-xs text-gray-500 bg-black/40 px-3 py-1 rounded-full flex items-center gap-2">
          <RiErrorWarningLine className="text-amber-500" />
          Destructive commands auto-trigger Time Machine checkpoints
        </div>
      </div>

      {/* Terminal Output Area */}
      <div 
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto text-sm"
      >
        <div className="text-gray-500 mb-6">
          <p>Welcome to the Tyegit Plumbing Terminal.</p>
          <p>Available safe commands: hash-object, cat-file, rev-parse, rev-list, show-ref...</p>
          <p className="text-amber-600/70">Available dangerous commands: update-ref, commit-tree, write-tree...</p>
          <p className="mt-2 text-xs">Note: High-level porcelain commands (checkout, commit, pull) are disabled here.</p>
        </div>

        {history.map((entry, idx) => (
          <div key={idx} className="mb-4">
            <div className="flex items-center gap-2 text-[var(--tye-lavender)] font-bold mb-1">
              <span>tyegit@repo {entry.timestamp} $</span>
              <span className="text-white">{entry.command}</span>
            </div>
            {entry.output && (
              <div className={`whitespace-pre-wrap pl-4 border-l-2 ${entry.isError ? 'border-red-500 text-red-400' : 'border-gray-600 text-gray-300'}`}>
                {entry.output}
              </div>
            )}
          </div>
        ))}
        {isExecuting && (
          <div className="flex items-center gap-2 text-gray-500 animate-pulse mt-2">
            <span>Executing...</span>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-black flex items-center gap-3">
        <span className="text-[var(--tye-lavender)] font-bold">git</span>
        <form onSubmit={handleExecute} className="flex-1 flex">
          <input
            type="text"
            className="flex-1 bg-transparent text-white outline-none placeholder-gray-700"
            placeholder="cat-file -p HEAD"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            disabled={isExecuting}
            autoFocus
          />
          <button 
            type="submit" 
            disabled={isExecuting || !commandInput.trim()}
            className="text-[var(--tye-lavender)] hover:text-white disabled:opacity-50 transition-colors"
          >
            <RiPlayCircleLine className="text-2xl" />
          </button>
        </form>
      </div>
      </div>

      {/* Right Panel: Command Palette */}
      <div className="w-80 h-full flex flex-col bg-[#252526] overflow-hidden flex-shrink-0">
        <div className="p-3 border-b border-black font-bold text-sm bg-[#1E1E1E] text-[var(--tye-lavender)]">
          Command Palette
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {PLUMBING_COMMANDS.map((cmd, i) => (
            <div 
              key={i} 
              onClick={() => {
                setCommandInput(cmd.cmd);
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }}
              className="p-3 bg-[#1E1E1E] border border-[#333] hover:border-[var(--tye-lavender)] cursor-pointer rounded transition-colors group"
            >
              <div className="flex items-center gap-2 mb-1">
                {cmd.dangerous ? <RiErrorWarningLine className="text-amber-500" /> : <RiTerminalBoxLine className="text-gray-400" />}
                <span className={`text-xs font-bold ${cmd.dangerous ? 'text-amber-400' : 'text-gray-200'} group-hover:text-white`}>
                  git {cmd.cmd.split(' ')[0]}
                </span>
              </div>
              <div className="text-[10px] text-gray-500 font-sans leading-tight mb-2">
                {cmd.desc}
              </div>
              <div className="text-[10px] text-[var(--tye-lavender)] bg-black/50 px-2 py-1 rounded truncate">
                {cmd.cmd}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
