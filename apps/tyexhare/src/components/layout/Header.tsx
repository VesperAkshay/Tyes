"use client";

import { FiSend, FiDownload, FiSettings, FiActivity, FiRadio } from "react-icons/fi";
import { Tab, TransferState } from "@/types";

import { useRef, useEffect } from "react";
import anime from "animejs";

interface HeaderProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  transferState?: TransferState;
}

export function Header({ activeTab, setActiveTab, transferState }: HeaderProps) {
  const isTransferring = transferState === "transferring";
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!navRef.current || !indicatorRef.current) return;
    
    // Find the active tab button
    const activeBtn = navRef.current.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement;
    if (activeBtn) {
      anime({
        targets: indicatorRef.current,
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
        backgroundColor: activeTab === "send" ? "var(--primary)" : 
                         activeTab === "receive" ? "var(--secondary)" : 
                         activeTab === "nearby" ? "var(--sidebar-ring)" :
                         activeTab === "transfer" ? "#22c55e" : 
                         "var(--foreground)",
        duration: 400,
        easing: "spring(1, 80, 10, 0)"
      });
    }
  }, [activeTab, isTransferring]);

  return (
    <header className="flex flex-col mb-4 border-b-2 border-foreground/20 pb-3 select-none">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3.5">
          <img src="/TyeXhareLogo.png" alt="Tye-Xhare Logo" className="w-16 h-16 object-contain drop-shadow-md" />
          <h1 className="text-3xl font-pixel text-foreground">Tye-Xhare</h1>
        </div>
        {isTransferring && activeTab !== "transfer" && (
          <button
            onClick={() => setActiveTab("transfer")}
            className="flex items-center space-x-2 bg-primary text-background text-xs font-pixel px-3 py-1.5 rounded animate-pulse hover:opacity-90 transition-opacity btn-3d"
          >
            <FiActivity className="w-4 h-4" />
            <span>TRANSFER IN PROGRESS — VIEW LIVE</span>
          </button>
        )}
      </div>

      <nav ref={navRef} className="flex space-x-6 items-center relative pb-2">
        <button
          data-tab="send"
          onClick={() => setActiveTab("send")}
          className={`flex items-center space-x-2 text-base font-bold transition-colors z-10 ${
            activeTab === "send" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FiSend className="w-4 h-4" />
          <span>SEND</span>
        </button>

        <button
          data-tab="receive"
          onClick={() => setActiveTab("receive")}
          className={`flex items-center space-x-2 text-base font-bold transition-colors z-10 ${
            activeTab === "receive" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FiDownload className="w-4 h-4" />
          <span>RECEIVE</span>
        </button>

        <button
          data-tab="nearby"
          onClick={() => setActiveTab("nearby")}
          className={`flex items-center space-x-2 text-base font-bold transition-colors z-10 ${
            activeTab === "nearby" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FiRadio className="w-4 h-4" />
          <span>NEARBY</span>
        </button>

        {isTransferring && (
          <button
            data-tab="transfer"
            onClick={() => setActiveTab("transfer")}
            className={`flex items-center space-x-2 text-base font-bold transition-colors font-pixel z-10 ${
              activeTab === "transfer" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FiActivity className={`w-4 h-4 ${activeTab === "transfer" ? "text-green-500" : ""}`} />
            <span>TRANSFER MONITOR</span>
          </button>
        )}

        <div className="flex items-center ml-auto space-x-6 z-10">
          <button
            data-tab="history"
            onClick={() => setActiveTab("history")}
            className={`flex items-center space-x-2 text-base font-bold transition-colors ${
              activeTab === "history" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FiActivity className="w-4 h-4" />
            <span>HISTORY</span>
          </button>

          <button
            data-tab="settings"
            onClick={() => setActiveTab("settings")}
            className={`flex items-center space-x-2 text-base font-bold transition-colors ${
              activeTab === "settings" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FiSettings className="w-4 h-4" />
            <span>SETTINGS</span>
          </button>
        </div>

        {/* Animated Indicator */}
        <div 
          ref={indicatorRef} 
          className="absolute bottom-0 h-1 bg-primary rounded-t-sm"
          style={{ width: 0, left: 0 }}
        />
      </nav>
    </header>
  );
}
