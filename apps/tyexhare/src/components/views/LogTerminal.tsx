"use client";

import { useEffect, useRef, useState } from "react";
import { FiTerminal, FiCopy, FiCheck, FiChevronDown, FiChevronUp } from "react-icons/fi";

interface LogTerminalProps {
  logs: string[];
}

export function LogTerminal({ logs }: LogTerminalProps) {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Filter out ANSI escape codes and raw terminal progress bar block characters (e.g. ████████)
  const cleanLogs = logs
    .map((log) => log.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "").replace(/█+/g, "").trim())
    .filter((log) => log.length > 0);

  // Auto-scroll to bottom on new log arrival
  useEffect(() => {
    if (logContainerRef.current && !collapsed) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [cleanLogs, collapsed]);

  const handleCopyLogs = async () => {
    if (cleanLogs.length === 0) return;
    try {
      await navigator.clipboard.writeText(cleanLogs.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy logs:", err);
    }
  };

  const getLogColor = (log: string) => {
    const lower = log.toLowerCase();
    if (lower.includes("error") || lower.includes("failed") || lower.includes("expired")) {
      return "text-red-400 font-bold";
    }
    if (lower.includes("connected") || lower.includes("done") || lower.includes("bypassing") || lower.includes("success")) {
      return "text-green-400 font-bold";
    }
    if (lower.includes("lan") || lower.includes("relay") || lower.includes("waiting")) {
      return "text-amber-300 font-bold";
    }
    return "text-neutral-300";
  };

  return (
    <div className="w-full border-4 border-foreground rounded-md overflow-hidden shadow-md bg-black select-text">
      {/* Terminal Header */}
      <div className="bg-foreground text-background text-xs font-mono px-3 py-2 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1 mr-1">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-secondary inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>
          </div>
          <FiTerminal className="w-4 h-4 text-primary-foreground" />
          <span className="font-bold tracking-wider font-pixel text-xs">TRANSMISSION_LOGS [{cleanLogs.length}]</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopyLogs}
            className="px-2 py-0.5 text-[10px] font-mono border border-background/40 hover:bg-background hover:text-foreground transition-all rounded flex items-center space-x-1"
            title="Copy logs to clipboard"
          >
            {copied ? <FiCheck className="w-3 h-3 text-green-400" /> : <FiCopy className="w-3 h-3" />}
            <span>{copied ? "COPIED" : "COPY"}</span>
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-background/20 transition-colors rounded text-background"
            title={collapsed ? "Expand terminal" : "Collapse terminal"}
          >
            {collapsed ? <FiChevronDown className="w-4 h-4" /> : <FiChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Log Stream Body */}
      {!collapsed && (
        <div
          ref={logContainerRef}
          className="p-3 bg-black/95 font-mono text-xs max-h-52 overflow-y-auto space-y-1.5 scroll-smooth border-t border-foreground/20"
        >
          {cleanLogs.length === 0 ? (
            <div className="text-neutral-500 italic">Initializing transmission log stream...</div>
          ) : (
            cleanLogs.map((log, idx) => (
              <div key={idx} className={`leading-relaxed flex items-start space-x-2 ${getLogColor(log)}`}>
                <span className="text-neutral-500 shrink-0 select-none">{">"}</span>
                <span className="break-all">{log}</span>
              </div>
            ))
          )}

          {/* Active Terminal Cursor */}
          <div className="flex items-center space-x-1 text-green-400 pt-1">
            <span className="text-neutral-500">{">"}</span>
            <span className="w-2 h-3.5 bg-green-400 animate-pulse inline-block"></span>
          </div>
        </div>
      )}
    </div>
  );
}
