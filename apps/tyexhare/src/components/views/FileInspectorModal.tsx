"use client";

import { useState } from "react";
import { FiFile, FiLock, FiCheckCircle, FiX } from "react-icons/fi";
import { BsShieldCheck } from "react-icons/bs";

interface FileInspectorModalProps {
  files: string[];
  onConfirm: (files: string[], customCode?: string) => void;
  onCancel: () => void;
}

export function FileInspectorModal({ files, onConfirm, onCancel }: FileInspectorModalProps) {
  const [customCode, setCustomCode] = useState<string>("");

  const getFileName = (path: string) => {
    return path.split(/[/\\]/).pop() || path;
  };

  const getFileExtension = (path: string) => {
    const filename = getFileName(path);
    const ext = filename.split(".").pop();
    return ext && ext !== filename ? ext.toUpperCase() : "FILE";
  };

  const mainFile = files[0] || "Selected_File";
  const ext = getFileExtension(mainFile);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-md border-4 border-foreground bg-background p-6 rounded-lg shadow-2xl space-y-5 relative">
        {/* Close Button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors"
        >
          <FiX className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 border-b-2 border-foreground/20 pb-3">
          <div className="w-10 h-10 rounded bg-primary/20 border-2 border-primary flex items-center justify-center text-primary">
            <BsShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-pixel text-lg text-foreground">FILE INSPECTION CARD</h3>
            <p className="text-xs font-mono text-muted-foreground">Ready for PAKE 256-bit encryption</p>
          </div>
        </div>

        {/* File Detail Box */}
        <div className="border-2 border-foreground bg-muted/20 p-4 rounded-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="px-2 py-0.5 bg-foreground text-background font-mono text-[10px] font-bold rounded">
              TYPE: {ext}
            </span>
            <span className="text-xs font-mono text-secondary font-bold">
              {files.length} FILE{files.length > 1 ? "S" : ""} SELECTED
            </span>
          </div>

          <div className="flex items-center space-x-3 pt-1">
            <FiFile className="w-8 h-8 text-primary shrink-0" />
            <div className="overflow-hidden">
              <div className="font-mono text-sm font-bold text-foreground truncate">
                {getFileName(mainFile)}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground truncate">
                {mainFile}
              </div>
            </div>
          </div>

          {/* Technical Transfer Specs */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-foreground/10">
            <div className="bg-background/80 p-2 rounded border border-foreground/20">
              <div className="text-[10px] text-muted-foreground">ENCRYPTION</div>
              <div className="font-bold text-green-600 flex items-center space-x-1 mt-0.5">
                <FiLock className="w-3 h-3" />
                <span>AES-256-GCM</span>
              </div>
            </div>
            <div className="bg-background/80 p-2 rounded border border-foreground/20">
              <div className="text-[10px] text-muted-foreground">DISCOVERY</div>
              <div className="font-bold text-primary mt-0.5">LAN & RELAY</div>
            </div>
          </div>
        </div>

        {/* Optional Custom Code Input */}
        <div className="space-y-1.5 font-mono">
          <label className="text-xs font-bold text-foreground flex items-center justify-between">
            <span>CUSTOM SECRET CODE (OPTIONAL)</span>
            <span className="text-[10px] text-muted-foreground">Auto-generated if empty</span>
          </label>
          <input
            type="text"
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value)}
            placeholder="e.g. 8492-apple-banana"
            className="w-full border-2 border-foreground bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary rounded"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border-2 border-foreground font-mono text-xs font-bold hover:bg-muted transition-colors rounded"
          >
            CANCEL
          </button>
          <button
            onClick={() => onConfirm(files, customCode || undefined)}
            className="flex-2 py-2.5 bg-primary text-background font-pixel text-xs border-2 border-foreground border-b-4 border-r-4 active:translate-x-[2px] active:translate-y-[2px] font-bold hover:bg-primary/90 transition-all flex items-center justify-center space-x-2 rounded"
          >
            <FiCheckCircle className="w-4 h-4" />
            <span>START ENCRYPTED TRANSFER</span>
          </button>
        </div>
      </div>
    </div>
  );
}
