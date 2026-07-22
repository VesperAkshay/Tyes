"use client";

import { useEffect, useState, useRef } from "react";
import { FiActivity, FiDisc } from "react-icons/fi";
import anime from "animejs";

interface SpeedWaveformProps {
  currentSpeedMbps: number;
}

export function SpeedWaveform({ currentSpeedMbps }: SpeedWaveformProps) {
  const [mode, setMode] = useState<"waveform" | "analog">("waveform");
  const [history, setHistory] = useState<number[]>(Array(24).fill(2));
  const [peakSpeed, setPeakSpeed] = useState<number>(0);
  
  const barsRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<SVGLineElement>(null);

  useEffect(() => {
    if (currentSpeedMbps > peakSpeed) {
      setPeakSpeed(currentSpeedMbps);
    }

    setHistory((prev) => {
      const maxRange = 50; // 50 MB/s scaling peak
      const rawVal = Math.min(100, Math.max(5, (currentSpeedMbps / maxRange) * 100));
      const jittered = currentSpeedMbps > 0 ? Math.min(100, Math.max(5, rawVal + (Math.random() * 8 - 4))) : 4;
      return [...prev.slice(1), jittered];
    });
  }, [currentSpeedMbps, peakSpeed]);

  const maxDialSpeed = 50; 
  const normalizedSpeed = Math.min(maxDialSpeed, Math.max(0, currentSpeedMbps));
  const needleAngle = -90 + (normalizedSpeed / maxDialSpeed) * 180;
  const peakNeedleAngle = -90 + (Math.min(maxDialSpeed, peakSpeed) / maxDialSpeed) * 180;

  useEffect(() => {
    if (mode === "analog" && needleRef.current) {
      anime({
        targets: needleRef.current,
        rotate: needleAngle,
        transformOrigin: "100px 90px",
        duration: 300,
        easing: "spring(1, 80, 10, 0)"
      });
    }
  }, [needleAngle, mode]);

  return (
    <div className="w-full border-2 border-foreground/30 bg-stipple p-3.5 rounded-md space-y-2 select-none shadow-sm">
      {/* Header Controls */}
      <div className="flex items-center justify-between text-xs font-mono text-foreground font-bold border-b border-foreground/20 pb-1.5">
        <span className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-ping inline-block"></span>
          <span>NET TELEMETRY [{mode.toUpperCase()}]</span>
        </span>

        {/* Mode Toggle Button */}
        <div className="flex items-center space-x-1.5 bg-background border border-foreground/20 rounded p-0.5 text-[10px] shadow-inner">
          <button
            onClick={() => setMode("waveform")}
            className={`px-2 py-0.5 rounded flex items-center space-x-1 transition-colors ${
              mode === "waveform" ? "bg-foreground text-background font-bold" : "text-foreground hover:bg-muted"
            }`}
          >
            <FiActivity className="w-3 h-3" />
            <span>WAVEFORM</span>
          </button>
          <button
            onClick={() => setMode("analog")}
            className={`px-2 py-0.5 rounded flex items-center space-x-1 transition-colors ${
              mode === "analog" ? "bg-foreground text-background font-bold" : "text-foreground hover:bg-muted"
            }`}
          >
            <FiDisc className="w-3 h-3" />
            <span>SPEEDOMETER</span>
          </button>
        </div>
      </div>

      {/* Mode A: 24-Bar Synth Equalizer Waveform */}
      {mode === "waveform" && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground font-bold">
            <span>LIVE THROUGHPUT</span>
            <span className="text-secondary">PEAK: {peakSpeed.toFixed(1)} MB/s</span>
          </div>
          <div ref={barsRef} className="w-full h-16 bg-background flex items-end justify-between px-1.5 py-1 space-x-1.5 overflow-hidden rounded border border-foreground/20 shadow-inner">
            {history.map((heightPct, idx) => (
              <div
                key={idx}
                className="flex-1 bg-gradient-to-t from-primary via-secondary to-destructive rounded-t-sm transition-all duration-300"
                style={{ height: `${heightPct}%`, minHeight: "4px" }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mode B: Retro Risograph Analog Dial */}
      {mode === "analog" && (
        <div className="relative w-full h-24 bg-background rounded border border-foreground/20 flex flex-col items-center justify-center overflow-hidden p-2 shadow-inner">
          {/* Dial SVG */}
          <svg className="w-48 h-20 overflow-visible" viewBox="0 0 200 100">
            {/* Outer Arc */}
            <path
              d="M 20,90 A 80,80 0 0,1 180,90"
              fill="none"
              stroke="#D1CBBB"
              strokeWidth="10"
              strokeLinecap="round"
            />
            {/* Speed Zone Arc */}
            <path
              d="M 20,90 A 80,80 0 0,1 180,90"
              fill="none"
              stroke="url(#speedGradient)"
              strokeWidth="6"
              strokeLinecap="round"
            />

            <defs>
              <linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--primary)" />
                <stop offset="60%" stopColor="var(--secondary)" />
                <stop offset="100%" stopColor="var(--destructive)" />
              </linearGradient>
            </defs>

            {/* Tick Markers */}
            {[0, 10, 25, 35, 50].map((val, idx) => {
              const angle = -90 + (val / maxDialSpeed) * 180;
              const rad = (angle * Math.PI) / 180;
              const x1 = 100 + 68 * Math.cos(rad);
              const y1 = 90 + 68 * Math.sin(rad);
              const xText = 100 + 55 * Math.cos(rad);
              const yText = 90 + 55 * Math.sin(rad);
              return (
                <g key={idx}>
                  <line x1={x1} y1={y1} x2={100 + 76 * Math.cos(rad)} y2={90 + 76 * Math.sin(rad)} stroke="var(--foreground)" strokeWidth="2" />
                  <text x={xText} y={yText} fill="var(--foreground)" fontSize="8" textAnchor="middle" dominantBaseline="middle" fontFamily="monospace" fontWeight="bold">
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Peak Speed Indicator Line */}
            {peakSpeed > 0 && (
              <line
                x1="100"
                y1="90"
                x2={100 + 72 * Math.cos((peakNeedleAngle * Math.PI) / 180)}
                y2={90 + 72 * Math.sin((peakNeedleAngle * Math.PI) / 180)}
                stroke="var(--destructive)"
                strokeWidth="2"
                strokeDasharray="2,2"
              />
            )}

            {/* Moving Needle (Animated by anime.js) */}
            <line
              ref={needleRef}
              x1="100"
              y1="90"
              x2="100"
              y2="20"
              stroke="var(--foreground)"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Center Pivot Point */}
            <circle cx="100" cy="90" r="7" fill="var(--foreground)" />
            <circle cx="100" cy="90" r="3" fill="var(--background)" />
          </svg>

          {/* Current Speed readout */}
          <div className="absolute bottom-1 font-mono text-xs font-bold text-foreground bg-background px-2 py-0.5 rounded border border-foreground/30 flex items-center space-x-2 shadow-sm">
            <span>{currentSpeedMbps.toFixed(1)} MB/s</span>
            <span className="text-[10px] text-muted-foreground font-normal">| PEAK: {peakSpeed.toFixed(1)} MB/s</span>
          </div>
        </div>
      )}
    </div>
  );
}
