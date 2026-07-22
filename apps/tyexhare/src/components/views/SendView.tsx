"use client";

import { useState, useRef, useEffect } from "react";
import { FiFolder, FiFile, FiMessageSquare, FiX, FiKey } from "react-icons/fi";
import anime from "animejs";

interface SendViewProps {
  onSendFiles: (files: string[], customCode?: string) => void;
  onSendText: (text: string, customCode?: string) => void;
  selectFiles: () => Promise<string[]>;
  selectFolder: () => Promise<string | null>;
}

export function SendView({ onSendFiles, onSendText, selectFiles, selectFolder }: SendViewProps) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [sendType, setSendType] = useState<"files" | "text">("files");
  const [textContent, setTextContent] = useState<string>("");
  const [customCode, setCustomCode] = useState<string>("");
  const [showCodeInput, setShowCodeInput] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      anime({
        targets: containerRef.current.children,
        translateY: [20, 0],
        opacity: [0, 1],
        duration: 400,
        delay: anime.stagger(100),
        easing: "easeOutQuad"
      });
    }
  }, [sendType]); // Re-trigger on type change to animate the new content

  const handlePickFiles = async () => {
    const files = await selectFiles();
    if (files.length > 0) {
      setSelectedPaths((prev) => Array.from(new Set([...prev, ...files])));
    }
  };

  const handlePickFolder = async () => {
    const folder = await selectFolder();
    if (folder) {
      setSelectedPaths((prev) => Array.from(new Set([...prev, folder])));
    }
  };

  const removePath = (pathToRemove: string) => {
    setSelectedPaths((prev) => prev.filter((p) => p !== pathToRemove));
  };

  const handleSend = () => {
    if (sendType === "files" && selectedPaths.length > 0) {
      onSendFiles(selectedPaths, customCode || undefined);
    } else if (sendType === "text" && textContent.trim()) {
      onSendText(textContent.trim(), customCode || undefined);
    }
  };

  return (
    <div ref={containerRef} className="w-full max-w-xl flex flex-col items-center">
      {/* Mode Switcher */}
      <div className="flex border-2 border-foreground/50 rounded mb-6 overflow-hidden w-full max-w-md shadow-sm">
        <button
          onClick={() => setSendType("files")}
          className={`flex-1 py-2.5 font-bold flex items-center justify-center space-x-2 transition-colors ${
            sendType === "files" ? "bg-primary text-background" : "bg-transparent text-foreground hover:bg-muted"
          }`}
        >
          <FiFile />
          <span>Files / Folders</span>
        </button>
        <button
          onClick={() => setSendType("text")}
          className={`flex-1 py-2.5 font-bold flex items-center justify-center space-x-2 transition-colors ${
            sendType === "text" ? "bg-secondary text-background" : "bg-transparent text-foreground hover:bg-muted"
          }`}
        >
          <FiMessageSquare />
          <span>Text Message</span>
        </button>
      </div>

      {sendType === "files" ? (
        <div className="w-full flex flex-col items-center">
          {/* Dropzone / File Picker Box */}
          <div
            onClick={handlePickFiles}
            className="w-full border-2 border-foreground/30 border-dashed bg-stipple p-8 flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all rounded-md group shadow-inner"
          >
            <div className="w-20 h-20 relative mb-4 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300 flex items-center justify-center">
              <svg className="w-16 h-16 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h2 className="text-xl font-bold mb-1 group-hover:text-primary transition-colors">Click to select files</h2>
            <p className="text-muted-foreground font-mono text-sm">Select files or add folders below</p>
          </div>

          {/* Selected File List */}
          {selectedPaths.length > 0 && (
            <div className="w-full mt-4 max-h-40 overflow-y-auto border-2 border-foreground/20 p-3 bg-muted/20 space-y-2 rounded">
              <div className="text-xs font-mono font-bold text-muted-foreground mb-2">SELECTED ITEMS ({selectedPaths.length}):</div>
              {selectedPaths.map((p) => (
                <div key={p} className="flex items-center justify-between bg-background border border-foreground/10 px-3 py-1.5 rounded text-sm font-mono truncate shadow-sm">
                  <span className="truncate mr-2">{p}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removePath(p);
                    }}
                    className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                  >
                    <FiX />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Additional Options */}
          <div className="mt-6 flex w-full justify-between items-center">
            <button
              onClick={handlePickFolder}
              className="text-foreground hover:text-primary font-bold flex items-center space-x-2 text-sm border-2 border-foreground/20 border-b-4 border-r-4 active:translate-x-[2px] active:translate-y-[2px] active:border-b-2 active:border-r-2 px-4 py-2 bg-background hover:border-primary transition-all rounded"
            >
              <FiFolder />
              <span>Add Folder</span>
            </button>

            <button
              onClick={() => setShowCodeInput(!showCodeInput)}
              className="text-foreground hover:text-secondary font-bold flex items-center space-x-2 text-sm border-2 border-foreground/20 border-b-4 border-r-4 active:translate-x-[2px] active:translate-y-[2px] active:border-b-2 active:border-r-2 px-4 py-2 bg-background hover:border-secondary transition-all rounded"
            >
              <FiKey />
              <span>{showCodeInput ? "Random Code" : "Custom Code"}</span>
            </button>
          </div>
        </div>
      ) : (
        /* Text Message Input */
        <div className="w-full flex flex-col items-center">
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="Type or paste text message to send securely..."
            className="w-full h-44 p-4 border-2 border-foreground/30 bg-background font-mono text-foreground outline-none focus:border-secondary resize-none rounded-md placeholder:text-muted-foreground/50 shadow-inner"
          />
          <div className="mt-4 flex w-full justify-end">
            <button
              onClick={() => setShowCodeInput(!showCodeInput)}
              className="text-foreground hover:text-secondary font-bold flex items-center space-x-2 text-sm border-2 border-foreground/20 border-b-4 border-r-4 active:translate-x-[2px] active:translate-y-[2px] active:border-b-2 active:border-r-2 px-4 py-2 bg-background hover:border-secondary transition-all rounded"
            >
              <FiKey />
              <span>{showCodeInput ? "Random Code" : "Custom Code"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Custom Code Input Box */}
      {showCodeInput && (
        <div className="w-full mt-4 flex flex-col items-start border-2 border-secondary/30 p-3 bg-secondary/5 rounded">
          <label className="text-xs font-mono font-bold text-secondary mb-1">CUSTOM SECRET CODE (OPTIONAL):</label>
          <input
            type="text"
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value)}
            placeholder="e.g. my-secret-pass-123"
            className="w-full bg-background border border-foreground/20 px-3 py-2 font-mono text-sm outline-none rounded focus:border-secondary transition-colors shadow-inner"
          />
        </div>
      )}

      {/* Send Submit Button */}
      <button
        onClick={handleSend}
        disabled={(sendType === "files" && selectedPaths.length === 0) || (sendType === "text" && !textContent.trim())}
        className="mt-8 w-full btn-3d text-xl py-4 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary hover:border-primary transition-all duration-300"
      >
        SEND TRANSFER
      </button>
    </div>
  );
}
