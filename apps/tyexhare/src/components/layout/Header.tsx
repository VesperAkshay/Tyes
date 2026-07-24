"use client";

import { FiSend, FiDownload, FiSettings, FiActivity, FiRadio, FiClock } from "react-icons/fi";
import { Tab, TransferState } from "@/types";
import { cn } from "@/lib/utils";

interface HeaderProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  transferState?: TransferState;
}

export function Header({ activeTab, setActiveTab, transferState }: HeaderProps) {
  const isTransferring = transferState === "transferring";

  const navItems = [
    { id: "nearby", label: "RADAR", icon: FiRadio, color: "var(--sidebar-ring)" },
    { id: "send", label: "SEND", icon: FiSend, color: "var(--primary)" },
    { id: "receive", label: "RECEIVE", icon: FiDownload, color: "var(--secondary)" },
    { id: "history", label: "HISTORY", icon: FiClock, color: "var(--foreground)" },
    { id: "settings", label: "SETTINGS", icon: FiSettings, color: "var(--foreground)" },
  ] as const;

  return (
    <nav className="flex md:flex-col justify-between items-center md:items-stretch bg-muted/40 backdrop-blur-md md:w-64 h-16 md:h-full border-t-2 md:border-t-0 md:border-r-2 border-primary/20 shrink-0 z-40 order-last md:order-first px-2 md:px-0 md:py-6 shadow-2xl">
      
      {/* Desktop Logo Header */}
      <div className="hidden md:flex flex-col items-center justify-center mb-8 px-4 space-y-4">
        <img src="/TyeXhareLogo.png" alt="Tye-Xhare Logo" className="w-20 h-20 object-contain drop-shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]" />
        <h1 className="text-2xl font-pixel text-foreground text-center tracking-widest drop-shadow-md">TYE-XHARE</h1>
      </div>

      {/* Navigation Links */}
      <div className="flex md:flex-col w-full h-full md:h-auto items-center justify-around md:justify-start md:space-y-3 md:px-4">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              data-tab={item.id}
              className={cn(
                "relative flex md:w-full items-center justify-center md:justify-start space-x-0 md:space-x-4 p-2 md:px-5 md:py-3.5 rounded-xl transition-all duration-300 group overflow-hidden",
                isActive ? "bg-background shadow-lg border-primary/40 scale-105 md:scale-100" : "hover:bg-foreground/5 active:scale-95",
                "border-2 border-transparent"
              )}
            >
              {isActive && (
                <div 
                  className="absolute inset-0 opacity-15 pointer-events-none" 
                  style={{ backgroundColor: item.color }} 
                />
              )}
              {isActive && (
                <div 
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 rounded-r-full hidden md:block shadow-[0_0_10px_currentColor]" 
                  style={{ backgroundColor: item.color }} 
                />
              )}
              
              <item.icon 
                className={cn(
                  "w-6 h-6 md:w-5 md:h-5 transition-transform duration-300", 
                  isActive ? "scale-110 drop-shadow-md" : "group-hover:scale-110 opacity-70"
                )} 
                style={{ color: isActive ? item.color : "currentColor" }} 
              />
              
              <span 
                className={cn(
                  "hidden md:block font-pixel text-xs tracking-widest transition-colors",
                  isActive ? "opacity-100 drop-shadow-sm" : "opacity-70 group-hover:opacity-100"
                )}
                style={{ color: isActive ? item.color : "currentColor" }}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Active Transfer Pill (Desktop only) */}
        {isTransferring && (
          <div className="hidden md:block mt-auto pt-8 w-full animate-in fade-in slide-in-from-bottom-4">
            <button
              onClick={() => setActiveTab("transfer")}
              className={cn(
                "w-full flex flex-col items-center space-y-3 bg-[#22c55e]/20 text-[#22c55e] border-2 border-[#22c55e]/50 p-4 rounded-xl hover:bg-[#22c55e]/30 transition-colors shadow-[0_0_20px_rgba(34,197,94,0.3)] group",
                activeTab === "transfer" && "bg-[#22c55e]/30 border-[#22c55e]"
              )}
            >
              <FiActivity className="w-8 h-8 animate-pulse group-hover:scale-110 transition-transform" />
              <span className="font-pixel text-[10px] text-center tracking-widest">LIVE TRANSFER</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
