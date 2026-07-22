import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Tab, TransferState, TransferEventPayload, TransferStats } from "@/types";

export function useTransfer() {
  const [transferState, setTransferState] = useState<TransferState>("idle");
  const [secretCode, setSecretCode] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [promptMessage, setPromptMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  
  const [stats, setStats] = useState<TransferStats>({
    filename: "",
    totalBytes: 0,
    currentBytes: 0,
    percentage: 0,
    speedMbps: 0,
    etaSeconds: 0,
  });

  const [embeddedRelayRunning, setEmbeddedRelayRunning] = useState<boolean>(false);
  const [embeddedRelayPorts, setEmbeddedRelayPorts] = useState<string>("9009,9010,9011,9012,9013");

  const lastProgressRef = useRef<{ bytes: number; timestamp: number }>({
    bytes: 0,
    timestamp: Date.now(),
  });

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    async function setupListener() {
      try {
        unlisten = await listen<TransferEventPayload>("transfer-event", (event) => {
          const payload = event.payload;

          switch (payload.type) {
            case "CodeGenerated":
              setSecretCode(payload.data.code);
              break;

            case "Log":
              setLogs((prev) => [...prev, payload.data.message]);
              break;

            case "Progress": {
              const { filename, total, current } = payload.data;
              const now = Date.now();
              const timeDiff = (now - lastProgressRef.current.timestamp) / 1000;
              const byteDiff = current - lastProgressRef.current.bytes;

              let speedMbps = stats.speedMbps;
              let etaSeconds = stats.etaSeconds;

              if (timeDiff >= 0.5 && byteDiff >= 0) {
                const bytesPerSec = byteDiff / timeDiff;
                speedMbps = parseFloat(((bytesPerSec * 8) / (1024 * 1024)).toFixed(2));
                const remainingBytes = total - current;
                etaSeconds = bytesPerSec > 0 ? Math.ceil(remainingBytes / bytesPerSec) : 0;
                
                lastProgressRef.current = { bytes: current, timestamp: now };
              }

              const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

              setStats({
                filename,
                totalBytes: total,
                currentBytes: current,
                percentage,
                speedMbps,
                etaSeconds,
              });

              setTransferState("transferring");
              break;
            }

            case "Prompt":
              setPromptMessage(payload.data.message);
              setTransferState("prompt");
              break;

            case "Done":
              setDoneMessage(payload.data.message);
              setTransferState("complete");
              break;

            case "Error":
              setErrorMessage(payload.data.message);
              setTransferState("error");
              break;

            case "RelayStatus":
              setEmbeddedRelayRunning(payload.data.running);
              if (payload.data.ports) setEmbeddedRelayPorts(payload.data.ports);
              break;
          }
        });
      } catch (err) {
        console.warn("Tauri event listener not available (non-Tauri web mode):", err);
      }
    }

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Sync secretCode with the Rust discovery service
  useEffect(() => {
    const deviceName = localStorage.getItem("tyexhare_device_name") || "Tye-Xhare User";
    invoke("set_discovery_state", { name: deviceName, code: secretCode }).catch(console.warn);
  }, [secretCode]);

  const startSend = async (
    files: string[],
    text?: string,
    customCode?: string,
    relay?: string,
    pass?: string
  ) => {
    setLogs([]);
    setErrorMessage(null);
    setDoneMessage(null);
    setTransferState("transferring");
    lastProgressRef.current = { bytes: 0, timestamp: Date.now() };

    try {
      const code = await invoke<string>("start_send", {
        files,
        text: text || null,
        customCode: customCode || null,
        relay: relay || null,
        pass: pass || null,
      });
      setSecretCode(code);
    } catch (err: any) {
      setErrorMessage(String(err));
      setTransferState("error");
    }
  };

  const startReceive = async (
    code: string,
    relay?: string,
    pass?: string,
    outDir?: string,
    resume?: boolean,
    autoAccept?: boolean
  ) => {
    setLogs([]);
    setErrorMessage(null);
    setDoneMessage(null);
    setTransferState("transferring");
    lastProgressRef.current = { bytes: 0, timestamp: Date.now() };

    try {
      await invoke("start_receive", {
        code,
        relay: relay || null,
        pass: pass || null,
        outDir: outDir || null,
        resume: resume ?? true,
        autoAccept: autoAccept ?? false,
      });
    } catch (err: any) {
      setErrorMessage(String(err));
      setTransferState("error");
    }
  };

  const respondPrompt = async (accepted: boolean) => {
    setPromptMessage(null);
    try {
      await invoke("respond_prompt", { accepted });
      if (accepted) {
        setTransferState("transferring");
      } else {
        resetTransfer();
      }
    } catch (err) {
      console.error("Error responding to prompt:", err);
    }
  };

  const cancelTransfer = async () => {
    try {
      await invoke("cancel_transfer");
    } catch (err) {
      console.error("Error cancelling transfer:", err);
    }
    resetTransfer();
  };

  const startEmbeddedRelay = async (ports?: string, pass?: string) => {
    try {
      await invoke<string>("start_local_relay", {
        ports: ports || null,
        pass: pass || null,
      });
      setEmbeddedRelayRunning(true);
    } catch (err: any) {
      setErrorMessage(`Relay launch error: ${err}`);
    }
  };

  const stopEmbeddedRelay = async () => {
    try {
      await invoke("stop_local_relay");
      setEmbeddedRelayRunning(false);
    } catch (err) {
      console.error("Error stopping relay:", err);
    }
  };

  const selectFiles = async (): Promise<string[]> => {
    try {
      return await invoke<string[]>("pick_files");
    } catch (err) {
      console.error("Error picking files:", err);
      return [];
    }
  };

  const selectFolder = async (): Promise<string | null> => {
    try {
      return await invoke<string | null>("pick_folder");
    } catch (err) {
      console.error("Error picking folder:", err);
      return null;
    }
  };

  const openDownloadFolder = async (path?: string) => {
    try {
      await invoke("open_download_folder", { path: path || null });
    } catch (err) {
      console.error("Error opening download folder:", err);
    }
  };

  const resetTransfer = () => {
    setTransferState("idle");
    setSecretCode("");
    setLogs([]);
    setPromptMessage(null);
    setErrorMessage(null);
    setDoneMessage(null);
    setStats({
      filename: "",
      totalBytes: 0,
      currentBytes: 0,
      percentage: 0,
      speedMbps: 0,
      etaSeconds: 0,
    });
  };

  return {
    transferState,
    secretCode,
    setSecretCode,
    logs,
    promptMessage,
    errorMessage,
    doneMessage,
    stats,
    embeddedRelayRunning,
    embeddedRelayPorts,
    startSend,
    startReceive,
    respondPrompt,
    cancelTransfer,
    startEmbeddedRelay,
    stopEmbeddedRelay,
    startLocalRelay: startEmbeddedRelay,
    stopLocalRelay: stopEmbeddedRelay,
    selectFiles,
    selectFolder,
    resetTransfer,
    openDownloadFolder,
  };
}
