"use client";

import { useEffect, useState } from "react";
import { FiMinus, FiSquare, FiX } from "react-icons/fi";

export function TitleBar() {
  const [appWindow, setAppWindow] = useState<any>(null);

  useEffect(() => {
    // Dynamic import to prevent SSR/non-Tauri crash
    import("@tauri-apps/api/window").then((mod) => {
      setAppWindow(mod.getCurrentWindow());
    }).catch(() => {
      // Non-Tauri browser dev mode
    });
  }, []);

  const handleMinimize = () => {
    if (appWindow) appWindow.minimize();
  };

  const handleMaximize = () => {
    if (appWindow) appWindow.toggleMaximize();
  };

  const handleClose = () => {
    if (appWindow) appWindow.close();
  };

  return (
    <div
      data-tauri-drag-region
      className="w-full bg-foreground text-background h-9 flex items-center justify-between px-3 select-none shrink-0 border-b border-foreground/20"
    >
      {/* Brand & App Title */}
      <div data-tauri-drag-region className="flex items-center space-x-2.5 font-pixel text-sm tracking-wider">
        <img src="/TyeXhareLogo.png" alt="Logo" className="w-7 h-7 object-contain" />
        <span data-tauri-drag-region className="text-background font-bold">TYE-XHARE</span>
      </div>

      {/* Window Controls */}
      <div className="flex items-center space-x-1">
        <button
          onClick={handleMinimize}
          className="p-1.5 hover:bg-muted/30 text-background transition-colors rounded"
          title="Minimize"
        >
          <FiMinus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="p-1.5 hover:bg-muted/30 text-background transition-colors rounded"
          title="Maximize"
        >
          <FiSquare className="w-3 h-3" />
        </button>
        <button
          onClick={handleClose}
          className="p-1.5 hover:bg-destructive hover:text-background text-background transition-colors rounded"
          title="Close"
        >
          <FiX className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
