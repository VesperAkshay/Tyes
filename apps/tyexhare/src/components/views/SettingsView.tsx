"use client";

import { useState, useEffect } from "react";
import { FiServer, FiLock, FiFolder, FiPower, FiCheck, FiVolume2, FiVolumeX, FiMonitor } from "react-icons/fi";
import { soundEngine } from "@/lib/audio";

interface SettingsViewProps {
  relayAddr: string;
  setRelayAddr: (addr: string) => void;
  relayPass: string;
  setRelayPass: (pass: string) => void;
  embeddedRelayRunning: boolean;
  embeddedRelayPorts: string;
  startEmbeddedRelay: (ports?: string, pass?: string) => Promise<void>;
  stopEmbeddedRelay: () => Promise<void>;
  selectFolder: () => Promise<string | null>;
  defaultOutDir: string;
  setDefaultOutDir: (dir: string) => void;
}

export function SettingsView({
  relayAddr,
  setRelayAddr,
  relayPass,
  setRelayPass,
  embeddedRelayRunning,
  embeddedRelayPorts,
  startEmbeddedRelay,
  stopEmbeddedRelay,
  selectFolder,
  defaultOutDir,
  setDefaultOutDir,
}: SettingsViewProps) {
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [theme, setTheme] = useState("default");

  useEffect(() => {
    setAudioEnabled(soundEngine.getEnabled());
    const storedTheme = localStorage.getItem("tyexhare_theme") || "default";
    setTheme(storedTheme);
  }, []);

  const handleToggleAudio = () => {
    soundEngine.init();
    const nextState = !audioEnabled;
    soundEngine.setEnabled(nextState);
    setAudioEnabled(nextState);
    if (nextState) soundEngine.playClick();
  };

  const handlePickDefaultDir = async () => {
    soundEngine.playClick();
    const folder = await selectFolder();
    if (folder) {
      setDefaultOutDir(folder);
    }
  };

  const handleSave = () => {
    soundEngine.playSuccess();
    setSavedSuccess(true);
    // Save theme
    localStorage.setItem("tyexhare_theme", theme);
    document.documentElement.dataset.theme = theme;
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="w-full max-w-4xl flex flex-col items-center space-y-6">
      <h2 className="text-2xl font-bold font-pixel mb-2 text-secondary w-full text-left">SETTINGS & RELAY</h2>

      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="flex flex-col space-y-6 w-full">
          {/* UI & Theme Configuration */}
          <div className="w-full border-2 border-foreground/30 p-5 bg-stipple rounded-md space-y-4 shadow-sm">
            <div className="text-xs font-mono font-bold text-muted-foreground flex items-center space-x-2 border-b border-foreground/20 pb-2">
              <FiMonitor className="w-4 h-4" />
              <span>INTERFACE & AUDIO</span>
            </div>
            
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold text-foreground">Tactile UI Audio</label>
              <button
                onClick={handleToggleAudio}
                className={`px-3 py-1.5 font-pixel text-xs border border-foreground/30 flex items-center space-x-1.5 transition-all rounded shadow-sm ${
                  audioEnabled ? "bg-secondary text-background" : "bg-muted text-muted-foreground"
                }`}
              >
                {audioEnabled ? <FiVolume2 /> : <FiVolumeX />}
                <span>{audioEnabled ? "ON" : "OFF"}</span>
              </button>
            </div>

            <div className="space-y-2 pt-2 border-t border-foreground/10">
              <label className="text-xs font-mono font-bold text-foreground">Poster Palette Theme</label>
              <div className="grid grid-cols-3 gap-2">
                {["default", "monochrome", "neon"].map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      setTheme(t);
                      soundEngine.playClick();
                    }}
                    className={`py-2 text-xs font-mono font-bold rounded border-2 transition-all ${
                      theme === t ? "border-primary bg-primary/10 text-primary" : "border-foreground/20 bg-background text-muted-foreground hover:border-foreground/40"
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Default Output Directory */}
          <div className="w-full border-2 border-foreground/30 p-5 bg-background rounded-md space-y-3 shadow-sm">
            <div className="text-xs font-mono font-bold text-muted-foreground flex items-center space-x-2 border-b border-foreground/20 pb-2">
              <FiFolder className="w-4 h-4" />
              <span>DEFAULT DOWNLOAD DIRECTORY</span>
            </div>
            <div className="flex items-center justify-between bg-muted/20 border border-foreground/30 p-2.5 rounded font-mono text-xs truncate mt-2">
              <span className="truncate mr-2">{defaultOutDir || "Default Downloads / TyeXhare"}</span>
              <button
                onClick={handlePickDefaultDir}
                className="text-xs font-bold text-foreground hover:text-secondary flex items-center space-x-1 border-2 border-foreground/30 px-2.5 py-1 rounded bg-background shrink-0 transition-all hover:border-secondary"
              >
                <FiFolder />
                <span>Browse</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-6 w-full">
          {/* Embedded Relay Control Box */}
          <div className="w-full border-2 border-foreground/30 bg-muted/20 p-5 rounded-md space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b-2 border-foreground/20 pb-3">
              <div className="flex items-center space-x-2">
                <FiServer className="w-5 h-5 text-primary" />
                <span className="font-pixel text-base">EMBEDDED LOCAL RELAY</span>
              </div>
              <button
                onClick={() => {
                  soundEngine.playClick();
                  embeddedRelayRunning ? stopEmbeddedRelay() : startEmbeddedRelay(embeddedRelayPorts, relayPass);
                }}
                className={`px-4 py-2 font-pixel text-xs border-2 border-foreground/30 flex items-center space-x-1.5 transition-all rounded shadow-sm hover:border-foreground/60 ${
                  embeddedRelayRunning ? "bg-primary text-background hover:bg-destructive" : "bg-foreground text-background hover:bg-secondary"
                }`}
              >
                <FiPower />
                <span>{embeddedRelayRunning ? "STOP RELAY" : "START RELAY"}</span>
              </button>
            </div>
            <div className="text-xs font-mono text-foreground/80 space-y-1">
              <div>Status: <span className={embeddedRelayRunning ? "font-bold text-secondary" : "text-muted-foreground"}>{embeddedRelayRunning ? "ACTIVE & LISTENING" : "STOPPED"}</span></div>
              <div>Listening Ports: <span className="font-bold">{embeddedRelayPorts}</span></div>
            </div>
          </div>

          {/* Relay Server Configuration */}
          <div className="w-full border-2 border-foreground/30 p-5 bg-background rounded-md space-y-4 shadow-sm">
            <div className="text-xs font-mono font-bold text-muted-foreground flex items-center space-x-2 border-b border-foreground/20 pb-2">
              <FiServer className="w-4 h-4" />
              <span>REMOTE RELAY SERVER</span>
            </div>
            
            <div className="space-y-1 pt-1">
              <label className="text-xs font-mono font-bold text-foreground">Relay Address & Port</label>
              <div className="flex items-center border border-foreground/30 rounded px-3 py-2 bg-muted/20">
                <FiServer className="text-muted-foreground mr-2 shrink-0" />
                <input
                  type="text"
                  value={relayAddr}
                  onChange={(e) => setRelayAddr(e.target.value)}
                  placeholder="tyexhare.tyes.dev:9009"
                  className="w-full bg-transparent font-mono text-sm outline-none text-foreground"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-foreground">Relay Passphrase</label>
              <div className="flex items-center border border-foreground/30 rounded px-3 py-2 bg-muted/20">
                <FiLock className="text-muted-foreground mr-2 shrink-0" />
                <input
                  type="password"
                  value={relayPass}
                  onChange={(e) => setRelayPass(e.target.value)}
                  placeholder="pass123"
                  className="w-full bg-transparent font-mono text-sm outline-none text-foreground"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="w-full btn-3d-secondary text-lg py-3 flex items-center justify-center space-x-2"
      >
        {savedSuccess ? <FiCheck /> : null}
        <span>{savedSuccess ? "SETTINGS SAVED!" : "SAVE CONFIGURATION"}</span>
      </button>
    </div>
  );
}
