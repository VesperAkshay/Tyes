"use client";

import { useEffect, useState, useRef } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import anime from "animejs";
import { FiMonitor, FiSmartphone, FiBox, FiWifi } from "react-icons/fi";
import { soundEngine } from "@/lib/audio";

export interface DiscoveredDevice {
  name: String;
  os: String;
  code: String;
  ip: String;
  timestamp: number;
}

interface RadarViewProps {
  onDeviceClick: (device: DiscoveredDevice) => void;
}

export function RadarView({ onDeviceClick }: RadarViewProps) {
  const [devices, setDevices] = useState<Map<string, DiscoveredDevice>>(new Map());
  const radarRef = useRef<HTMLDivElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);

  // Cleanup stale devices
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      setDevices(prev => {
        let changed = false;
        const next = new Map(prev);
        for (const [key, dev] of Array.from(next.entries())) {
          if (now - dev.timestamp > 10) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Listen to Tauri events
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    async function setup() {
      try {
        unlisten = await listen<DiscoveredDevice>("device_discovered", (event) => {
          setDevices(prev => {
            const next = new Map(prev);
            next.set(event.payload.ip as string, event.payload);
            return next;
          });
        });
      } catch (err) {
        console.warn("Radar listener failed", err);
      }
    }
    setup();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Radar Sweep Animation
  useEffect(() => {
    if (!sweepRef.current) return;
    
    // Sweep Rotation
    const sweepAnim = anime({
      targets: sweepRef.current,
      rotate: 360,
      duration: 4000,
      easing: 'linear',
      loop: true
    });

    return () => sweepAnim.pause();
  }, []);

  const getIcon = (os: string) => {
    const lo = os.toLowerCase();
    if (lo.includes("mac") || lo.includes("win") || lo.includes("linux")) return <FiMonitor className="w-6 h-6" />;
    if (lo.includes("ios") || lo.includes("android")) return <FiSmartphone className="w-6 h-6" />;
    return <FiBox className="w-6 h-6" />;
  };

  const getPosition = (ip: string) => {
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      hash = ip.charCodeAt(i) + ((hash << 5) - hash);
    }
    const angle = Math.abs(hash % 360);
    const distance = 120 + Math.abs((hash >> 4) % 180); // 120px to 300px radius
    
    const rad = angle * (Math.PI / 180);
    const x = Math.cos(rad) * distance;
    const y = Math.sin(rad) * distance;
    
    return { x, y };
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full relative overflow-hidden bg-background bg-stipple shadow-inner rounded-xl border-2 border-primary/10">
      
      {/* Container for absolute centering */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px]" ref={radarRef}>
        
        {/* Animated Sonar Ping Rings */}
        {[0, 1, 2, 3].map((i) => (
          <div 
            key={i}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-solid border-primary/30 pointer-events-none shadow-[0_0_15px_rgba(0,0,0,0.1)] animate-sonar-ring"
            style={{ animationDelay: `${i * 0.75}s` }}
          ></div>
        ))}

        {/* Tactical Crosshairs */}
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-primary/20 -translate-y-1/2"></div>
        <div className="absolute left-1/2 top-0 h-full w-[1px] bg-primary/20 -translate-x-1/2"></div>

        {/* Concentric Grid Rings */}
        <div className="absolute top-1/2 left-1/2 w-[200px] h-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10 border-dashed pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 w-[400px] h-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10 border-dashed pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10 border-dashed pointer-events-none"></div>
        
        {/* Radar Sweep Arm */}
        <div 
          ref={sweepRef}
          className="absolute top-1/2 left-1/2 w-[800px] h-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none origin-center"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0deg, rgba(var(--primary-rgb), 0.02) 270deg, var(--sidebar-ring) 360deg)'
          }}
        ></div>

        {/* Central 'You' Node */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div className="bg-primary text-background p-4 rounded-full shadow-[0_0_20px_var(--primary)] flex items-center justify-center">
            <FiWifi className="w-6 h-6 animate-pulse" />
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2">
            <span className="font-pixel text-xs bg-background/80 px-2 py-1 rounded shadow-sm text-primary font-bold tracking-wider">
              YOU
            </span>
          </div>
        </div>

        {/* Discovered Devices */}
        {Array.from(devices.values()).map((dev) => {
          const pos = getPosition(dev.ip as string);
          return (
            <button
              key={dev.ip as string}
              onClick={() => {
                soundEngine.playClick();
                onDeviceClick(dev);
              }}
              style={{
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`
              }}
              className="absolute top-1/2 left-1/2 flex flex-col items-center pointer-events-auto transition-all hover:scale-110 active:scale-95 group z-20"
            >
              <div className="absolute inset-0 bg-secondary/30 rounded-full animate-ping" />
              <div className="relative bg-background border-2 border-secondary text-secondary p-3 rounded-full shadow-lg z-10 group-hover:bg-secondary group-hover:text-background transition-colors">
                {getIcon(dev.os as string)}
              </div>
              <div className="mt-2 px-3 py-1 bg-background border-2 border-secondary/50 text-secondary font-mono text-xs font-bold rounded shadow-md opacity-90 group-hover:opacity-100 whitespace-nowrap">
                {dev.name}
              </div>
            </button>
          );
        })}
      </div>
      
      {/* Scanning status text overlay */}
      <div className="absolute bottom-6 right-6 font-pixel text-xs text-primary/70 animate-pulse flex items-center space-x-2">
        <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></span>
        <span>SCANNING LOCAL NETWORK...</span>
      </div>
    </div>
  );
}
