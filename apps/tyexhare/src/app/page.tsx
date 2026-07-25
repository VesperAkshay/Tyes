"use client";

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FiWifi, FiActivity } from "react-icons/fi";
import { Header } from "@/components/layout/Header";
import { StatusBar } from "@/components/layout/StatusBar";
import { TitleBar } from "@/components/layout/TitleBar";
import { DropOverlay } from "@/components/common/DropOverlay";
import { FileInspectorModal } from "@/components/views/FileInspectorModal";
import { SendView } from "@/components/views/SendView";
import { ReceiveView } from "@/components/views/ReceiveView";
import { TransferView } from "@/components/views/TransferView";
import { CompleteView } from "@/components/views/CompleteView";
import { SettingsView } from "@/components/views/SettingsView";
import { HistoryView, TransferReceipt } from "@/components/views/HistoryView";
import { RadarView, DiscoveredDevice } from "@/components/views/RadarView";
import { Tab } from "@/types";
import { useTransfer } from "@/hooks/useTransfer";
import { soundEngine } from "@/lib/audio";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("send");
  const [isSender, setIsSender] = useState<boolean>(true);
  const [relayAddr, setRelayAddr] = useState<string>("tyexhare.tyes.dev:9009");
  const [relayPass, setRelayPass] = useState<string>("pass123");
  const [defaultOutDir, setDefaultOutDir] = useState<string>("");
  const [inspectingFiles, setInspectingFiles] = useState<string[] | null>(null);
  const [pairingRequest, setPairingRequest] = useState<{sender_name: string, code: string, ip: string} | null>(null);

  const {
    transferState,
    stats,
    secretCode,
    setSecretCode,
    logs,
    promptMessage,
    doneMessage,
    errorMessage,
    embeddedRelayRunning,
    embeddedRelayPorts,
    startSend,
    startReceive,
    cancelTransfer,
    respondPrompt,
    resetTransfer,
    startLocalRelay,
    stopLocalRelay,
    selectFiles,
    selectFolder,
    openDownloadFolder,
  } = useTransfer();

  // Initialize theme, settings, and global audio click listener
  useEffect(() => {
    const storedTheme = localStorage.getItem("tyexhare_theme");
    if (storedTheme) {
      document.documentElement.dataset.theme = storedTheme;
    }

    async function loadSettings() {
      try {
        const savedAddr = await invoke<string | null>("get_secure_setting", { key: "relayAddr" });
        const savedPass = await invoke<string | null>("get_secure_setting", { key: "relayPass" });
        const savedDir = await invoke<string | null>("get_secure_setting", { key: "defaultOutDir" });
        
        if (savedAddr) setRelayAddr(savedAddr);
        if (savedPass) setRelayPass(savedPass);
        if (savedDir) setDefaultOutDir(savedDir);
      } catch (err) {
        console.warn("Failed to load secure settings:", err);
      }
    }
    loadSettings();

    const initAudio = () => {
      soundEngine.init();
      document.removeEventListener("pointerdown", initAudio);
    };
    document.addEventListener("pointerdown", initAudio);
    
    // Play blip on tab change if already initialized
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button')) {
        // if it's a tab button, play blip, else let the button handle it
        if (target.closest('[data-tab]')) {
          soundEngine.playBlip();
        } else {
          soundEngine.playClick();
        }
      }
    };
    document.addEventListener("click", handleGlobalClick);

    return () => {
      document.removeEventListener("pointerdown", initAudio);
      document.removeEventListener("click", handleGlobalClick);
    };
  }, []);

  // Listen for Radar incoming pair requests
  useEffect(() => {
    let unlisten: any;
    async function setup() {
      unlisten = await listen<{sender_name: string, code: string, ip: string}>("incoming_pair_request", (event) => {
        soundEngine.playBlip();
        setPairingRequest(event.payload);
      });
    }
    setup();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Auto-switch to transfer monitor tab when a transfer begins
  useEffect(() => {
    if (transferState === "transferring") {
      setActiveTab("transfer");
    }
  }, [transferState]);

  // Save history on complete or error
  useEffect(() => {
    if (transferState === "complete" || transferState === "error") {
      const formatBytes = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
      };

      const newReceipt: TransferReceipt = {
        id: crypto.randomUUID(),
        type: isSender ? "send" : "receive",
        filename: stats.filename || (isSender ? "Sent files" : "Received files"),
        size: formatBytes(stats.totalBytes),
        date: new Date().toISOString(),
        status: transferState === "complete" ? "success" : "failed",
      };

      const existing = localStorage.getItem("tyexhare_history");
      const receipts = existing ? JSON.parse(existing) : [];
      localStorage.setItem("tyexhare_history", JSON.stringify([newReceipt, ...receipts].slice(0, 50)));
    }
  }, [transferState, isSender, stats.filename, stats.totalBytes]);

  // Update default relay address when local relay toggles
  useEffect(() => {
    if (embeddedRelayRunning && embeddedRelayPorts) {
      const firstPort = embeddedRelayPorts.split(",")[0]?.trim() || "9009";
      setRelayAddr(`127.0.0.1:${firstPort}`);
    } else if (!embeddedRelayRunning) {
      setRelayAddr("tyexhare.tyes.dev:9009");
    }
  }, [embeddedRelayRunning, embeddedRelayPorts]);

  const handleSendFiles = (files: string[], customCode?: string) => {
    setIsSender(true);
    startSend(files, undefined, customCode, relayAddr, relayPass);
  };

  const handleSendText = (text: string, customCode?: string) => {
    setIsSender(true);
    startSend([], text, customCode, relayAddr, relayPass);
  };

  const handleReceive = (code: string, outDir?: string, autoAccept?: boolean) => {
    setIsSender(false);
    startReceive(code, relayAddr, relayPass, outDir || defaultOutDir || undefined, true, autoAccept);
  };

  const handleGlobalDrop = (files: string[]) => {
    if (files.length > 0) {
      setInspectingFiles(files);
    }
  };

  const handleConfirmInspect = (files: string[], customCode?: string) => {
    setInspectingFiles(null);
    setIsSender(true);
    startSend(files, undefined, customCode, relayAddr, relayPass);
  };

  // 1-Click transfer handler for Radar nodes
  const handleDeviceClick = async (device: DiscoveredDevice) => {
    const files = await selectFiles();
    if (files && files.length > 0) {
      setIsSender(true);
      const code = Math.floor(1000 + Math.random() * 9000) + "-radar-transfer";
      try {
        await invoke("send_pair_request", { targetDeviceId: device.device_id, targetIp: device.ip, code });
      } catch (err) {
        console.warn("Could not send pair request", err);
      }
      startSend(files, undefined, code, relayAddr, relayPass);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden select-none relative z-10">
      
      <TitleBar />
      
      {/* Global Window-Wide Drag & Drop Overlay */}
      <DropOverlay onFileDrop={handleGlobalDrop} />

      {/* Interactive File Inspection Card Modal */}
      {inspectingFiles && inspectingFiles.length > 0 && (
        <FileInspectorModal
          files={inspectingFiles}
          onConfirm={handleConfirmInspect}
          onCancel={() => setInspectingFiles(null)}
        />
      )}

      {/* The Adaptive App Shell */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Navigation (Bottom on Mobile, Left Sidebar on Desktop) */}
        <Header activeTab={activeTab} setActiveTab={setActiveTab} transferState={transferState} />

        {/* Main Stage */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background relative">
          
          {/* Mobile Active Transfer Pill (Floating Top) */}
          {transferState === "transferring" && activeTab !== "transfer" && (
            <div className="md:hidden absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4">
              <button
                onClick={() => setActiveTab("transfer")}
                className="flex items-center space-x-2 bg-[#22c55e] text-[#121212] px-4 py-2 rounded-full shadow-[0_0_20px_rgba(34,197,94,0.6)] font-pixel text-xs animate-pulse"
              >
                <FiActivity className="w-4 h-4" />
                <span>TRANSFER LIVE</span>
              </button>
            </div>
          )}

          {/* Main View Router Content Area */}
          <section className="flex-1 flex flex-col items-center justify-start relative overflow-y-auto px-4 py-4 md:py-8 my-auto">
            {activeTab === "transfer" ? (
              transferState === "complete" || transferState === "error" ? (
                <CompleteView
                  message={doneMessage}
                  errorMessage={errorMessage}
                  isSender={isSender}
                  onDone={() => {
                    resetTransfer();
                    setActiveTab("send");
                  }}
                  onOpenFolder={() => openDownloadFolder(defaultOutDir || undefined)}
                />
              ) : (
                <TransferView
                  stats={stats}
                  secretCode={secretCode}
                  logs={logs}
                  isSender={isSender}
                  promptMessage={promptMessage}
                  onRespondPrompt={respondPrompt}
                  onCancel={cancelTransfer}
                />
              )
            ) : activeTab === "receive" ? (
              <ReceiveView
                secretCode={secretCode}
                setSecretCode={setSecretCode}
                onReceive={handleReceive}
                promptMessage={promptMessage}
                onRespondPrompt={respondPrompt}
                selectFolder={selectFolder}
              />
            ) : activeTab === "settings" ? (
              <SettingsView
                relayAddr={relayAddr}
                setRelayAddr={setRelayAddr}
                relayPass={relayPass}
                setRelayPass={setRelayPass}
                defaultOutDir={defaultOutDir}
                setDefaultOutDir={setDefaultOutDir}
                embeddedRelayRunning={embeddedRelayRunning}
                embeddedRelayPorts={embeddedRelayPorts}
                startEmbeddedRelay={startLocalRelay}
                stopEmbeddedRelay={stopLocalRelay}
                selectFolder={selectFolder}
              />
            ) : activeTab === "history" ? (
              <HistoryView />
            ) : activeTab === "nearby" ? (
              <RadarView onDeviceClick={handleDeviceClick} />
            ) : (
              <SendView
                onSendFiles={handleSendFiles}
                onSendText={handleSendText}
                selectFiles={selectFiles}
                selectFolder={selectFolder}
              />
            )}
          </section>

          <StatusBar relayAddr={relayAddr} />
        </div>
      </div>

      {/* Radar Incoming Pair Request Modal */}
      {pairingRequest && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md border-4 border-foreground bg-background p-6 rounded-lg shadow-2xl space-y-5 relative">
            <div className="flex items-center space-x-3 border-b-2 border-foreground/20 pb-3">
              <div className="w-10 h-10 rounded bg-primary/20 border-2 border-primary flex items-center justify-center text-primary">
                <FiWifi className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-pixel text-lg text-foreground">INCOMING RADAR</h3>
                <p className="text-xs font-mono text-muted-foreground">Secure Transfer Request</p>
              </div>
            </div>
            
            <div className="border-2 border-foreground bg-muted/20 p-4 rounded-md space-y-3">
              <p className="text-sm font-mono text-foreground text-center">
                <span className="font-bold text-primary">{pairingRequest.sender_name}</span> wants to send you a file.
              </p>
            </div>
            
            <div className="flex space-x-3 pt-2">
              <button
                className="flex-1 py-2 font-pixel text-sm border-2 border-foreground hover:bg-muted text-foreground transition-colors rounded"
                onClick={() => setPairingRequest(null)}
              >
                DECLINE
              </button>
              <button
                className="flex-1 py-2 font-pixel text-sm border-2 border-primary bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-[4px_4px_0_0_#1a1a1a] dark:shadow-[4px_4px_0_0_#ede8dc] hover:shadow-none hover:translate-x-1 hover:translate-y-1 rounded"
                onClick={() => {
                  const code = pairingRequest.code;
                  setPairingRequest(null);
                  setActiveTab("receive");
                  handleReceive(code, undefined, true);
                }}
              >
                ACCEPT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
