"use client";

import { useState, useEffect, useRef } from "react";
import { CodeTicket } from "@/components/common/CodeTicket";
import { SpeedWaveform } from "@/components/views/SpeedWaveform";
import { LogTerminal } from "@/components/views/LogTerminal";
import { TransferStats } from "@/types";
import { FiXCircle, FiClock, FiDownload, FiFolder, FiCheck, FiX } from "react-icons/fi";
import { BsShieldCheck } from "react-icons/bs";
import anime from "animejs";

interface TransferViewProps {
  stats: TransferStats;
  secretCode?: string;
  logs?: string[];
  isSender?: boolean;
  promptMessage?: string | null;
  onRespondPrompt?: (accepted: boolean) => void;
  onCancel: () => void;
}

export function TransferView({
  stats,
  secretCode,
  logs = [],
  isSender = true,
  promptMessage,
  onRespondPrompt,
  onCancel,
}: TransferViewProps) {
  const [roomSecondsLeft, setRoomSecondsLeft] = useState<number>(900); // 15 minutes = 900 seconds
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
  }, []);

  useEffect(() => {
    if (stats.currentBytes > 0) return; // Stop room timer once byte transfer starts

    const timer = setInterval(() => {
      setRoomSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [stats.currentBytes]);

  const formatRoomTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? "0" : ""}${secs}s`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatEta = (seconds: number): string => {
    if (seconds <= 0) return "--";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div ref={containerRef} className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 items-start my-auto py-2 relative">
      {/* ACCEPT / DECLINE PROMPT MODAL OVERLAY */}
      {promptMessage && onRespondPrompt && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-background border-2 border-secondary p-6 max-w-md w-full rounded-lg shadow-2xl space-y-5">
            <div className="font-pixel text-lg text-secondary border-b-2 border-secondary/20 pb-2 flex items-center space-x-2">
              <BsShieldCheck className="w-6 h-6 text-secondary" />
              <span>INCOMING FILE TRANSFER REQUEST</span>
            </div>
            <div className="font-mono text-sm text-foreground leading-relaxed bg-muted/20 p-4 border border-foreground/10 rounded">
              {promptMessage}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => onRespondPrompt(false)}
                className="flex-1 py-3 bg-muted text-foreground border-2 border-foreground/30 hover:bg-destructive hover:border-destructive hover:text-white transition-all flex items-center justify-center space-x-2 rounded font-bold font-mono text-xs"
              >
                <FiX className="w-4 h-4" />
                <span>DECLINE</span>
              </button>
              <button
                onClick={() => onRespondPrompt(true)}
                className="flex-1 py-3 btn-3d bg-secondary border-secondary text-background hover:bg-primary hover:border-primary transition-all flex items-center justify-center space-x-2 rounded font-bold text-xs"
              >
                <FiCheck className="w-4 h-4" />
                <span>ACCEPT & DOWNLOAD</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT COLUMN: Controls & Progress Card */}
      <div className="flex flex-col space-y-4 w-full">
        {/* Sender vs Receiver Header Card */}
        {isSender ? (
          secretCode && <CodeTicket code={secretCode} />
        ) : (
          <div className="w-full border-2 border-foreground/30 bg-stipple p-4 rounded-md shadow-sm space-y-2 select-none">
            <div className="flex items-center justify-between border-b border-foreground/20 pb-2">
              <span className="font-pixel text-xs text-secondary flex items-center space-x-1.5">
                <FiDownload className="w-4 h-4" />
                <span>INCOMING RECEIVER MONITOR</span>
              </span>
              <span className="text-[10px] font-mono bg-muted/40 px-2 py-0.5 border border-foreground/20 rounded font-bold">
                ROLE: RECEIVER
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground">Connected Code:</span>
              <span className="font-bold text-foreground bg-background px-2 py-0.5 rounded border border-foreground/20 shadow-sm">
                {secretCode || "Connecting..."}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground flex items-center space-x-1">
                <FiFolder className="w-3.5 h-3.5" />
                <span>Save Directory:</span>
              </span>
              <span className="font-bold text-secondary truncate max-w-[180px]">
                Downloads / TyeXhare
              </span>
            </div>
          </div>
        )}

        {/* Main Transfer Progress Card */}
        <div className="w-full border-2 border-foreground/30 bg-background p-5 rounded-md shadow-sm space-y-4">
          {/* 15-Minute Room Active Indicator */}
          {stats.currentBytes === 0 && (
            <div className="w-full bg-muted/20 border border-foreground/20 px-3 py-2 rounded flex items-center justify-between text-xs font-mono">
              <span className="flex items-center space-x-2 text-foreground font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse"></span>
                <span className="truncate">
                  {isSender ? "ROOM ACTIVE — WAITING" : "RECEIVER READY — CONNECTED"}
                </span>
              </span>
              <span className="text-secondary font-bold font-mono flex items-center space-x-1 shrink-0">
                <FiClock className="w-3.5 h-3.5" />
                <span>{formatRoomTime(roomSecondsLeft)}</span>
              </span>
            </div>
          )}

          <div className="flex items-center justify-between border-b-2 border-foreground/10 pb-2">
            <span className="font-pixel text-base text-foreground truncate max-w-[220px]">
              {stats.filename || "Preparing transfer..."}
            </span>
            <span className="font-mono text-2xl font-bold text-secondary">
              {stats.percentage}%
            </span>
          </div>

          {/* Custom Retro Progress Bar */}
          <div className="w-full h-7 border-2 border-foreground/30 bg-muted/30 p-1 rounded overflow-hidden relative shadow-inner">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-sm"
              style={{ width: `${stats.percentage}%` }}
            />
          </div>

          {/* Transfer Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 font-mono text-xs">
            <div className="border border-foreground/20 p-2.5 rounded bg-muted/10 text-center shadow-sm">
              <div className="text-[10px] text-muted-foreground font-bold">TRANSFERRED</div>
              <div className="font-bold text-foreground mt-0.5 truncate">
                {formatBytes(stats.currentBytes)} / {formatBytes(stats.totalBytes)}
              </div>
            </div>
            <div className="border border-foreground/20 p-2.5 rounded bg-muted/10 text-center shadow-sm">
              <div className="text-[10px] text-muted-foreground font-bold">SPEED</div>
              <div className="font-bold text-primary mt-0.5">
                {stats.speedMbps > 0 ? `${stats.speedMbps} MB/s` : "--"}
              </div>
            </div>
            <div className="border border-foreground/20 p-2.5 rounded bg-muted/10 text-center shadow-sm">
              <div className="text-[10px] text-muted-foreground font-bold">EST. TIME</div>
              <div className="font-bold text-secondary mt-0.5">
                {formatEta(stats.etaSeconds)}
              </div>
            </div>
          </div>
        </div>

        {/* Cancel Button */}
        <button
          onClick={onCancel}
          className="w-full flex items-center justify-center space-x-2 text-destructive border-2 border-destructive/50 bg-destructive/5 hover:bg-destructive hover:border-destructive hover:text-white transition-all rounded text-sm shrink-0 font-bold py-3"
        >
          <FiXCircle className="w-4 h-4" />
          <span>CANCEL TRANSFER</span>
        </button>
      </div>

      {/* RIGHT COLUMN: Live Telemetry & Logs */}
      <div className="flex flex-col space-y-4 w-full">
        {/* Live Speed Waveform Equalizer */}
        <SpeedWaveform currentSpeedMbps={stats.speedMbps} />

        {/* Live Logs Terminal Drawer */}
        <LogTerminal logs={logs} />
      </div>
    </div>
  );
}
