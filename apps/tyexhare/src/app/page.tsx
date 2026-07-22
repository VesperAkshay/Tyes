"use client";

import { useState, useEffect } from "react";
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

  // Initialize theme and global audio click listener
  useEffect(() => {
    const storedTheme = localStorage.getItem("tyexhare_theme");
    if (storedTheme) {
      document.documentElement.dataset.theme = storedTheme;
    }

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
      startSend(files, undefined, device.code as string, relayAddr, relayPass);
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

      <div className="flex-1 flex flex-col p-5 overflow-hidden">
        <Header activeTab={activeTab} setActiveTab={setActiveTab} transferState={transferState} />

        <section className="flex-1 flex flex-col items-center justify-start relative overflow-y-auto px-4 py-1 my-auto">
          {/* Main View Router */}
          {transferState === "complete" || transferState === "error" ? (
            <CompleteView
              message={doneMessage}
              errorMessage={errorMessage}
              onDone={() => {
                resetTransfer();
                setActiveTab("send");
              }}
              onOpenFolder={() => openDownloadFolder(defaultOutDir || undefined)}
            />
          ) : transferState === "transferring" || activeTab === "transfer" ? (
            <TransferView
              stats={stats}
              secretCode={secretCode}
              logs={logs}
              isSender={isSender}
              promptMessage={promptMessage}
              onRespondPrompt={respondPrompt}
              onCancel={cancelTransfer}
            />
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
  );
}
