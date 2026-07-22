"use client";

import { useState, useRef, useEffect } from "react";
import { FiFolder, FiCheck, FiX, FiCamera } from "react-icons/fi";
import anime from "animejs";
import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode";

interface ReceiveViewProps {
  secretCode: string;
  setSecretCode: (code: string) => void;
  onReceive: (code: string, outDir?: string, autoAccept?: boolean) => void;
  promptMessage?: string | null;
  onRespondPrompt?: (accepted: boolean) => void;
  selectFolder: () => Promise<string | null>;
}

export function ReceiveView({
  secretCode,
  setSecretCode,
  onReceive,
  promptMessage,
  onRespondPrompt,
  selectFolder,
}: ReceiveViewProps) {
  const [outputDir, setOutputDir] = useState<string>("");
  const [autoAccept, setAutoAccept] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

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
    if (isScanning) {
      scannerRef.current = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 }, supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA] },
        false
      );
      scannerRef.current.render(
        (decodedText) => {
          setSecretCode(decodedText);
          setIsScanning(false);
        },
        (error) => {
          // ignore scan errors, they happen continuously
        }
      );
    } else {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
    }
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
      }
    };
  }, [isScanning, setSecretCode]);

  const handlePickOutputDir = async () => {
    const folder = await selectFolder();
    if (folder) {
      setOutputDir(folder);
    }
  };

  const handleStartReceive = () => {
    if (secretCode.trim()) {
      onReceive(secretCode.trim(), outputDir || undefined, autoAccept);
    }
  };

  return (
    <div ref={containerRef} className="w-full max-w-lg flex flex-col items-center relative">
      <h2 className="text-2xl font-bold mb-6 font-pixel text-secondary">Receive Transfer</h2>

      {/* Secret Code Input Card */}
      <div
        className="w-full flex flex-col items-start border-2 border-foreground/30 bg-stipple p-6 mb-6 focus-within:border-secondary transition-colors rounded-md shadow-inner"
      >
        <div className="flex justify-between w-full items-center mb-3">
          <label className="font-pixel text-muted-foreground text-xs tracking-wider">SECRET_CODE_REQUIRED</label>
          <button 
            onClick={() => setIsScanning(!isScanning)}
            className={`p-1.5 rounded transition-colors ${isScanning ? 'bg-destructive text-white' : 'bg-background border border-foreground/20 hover:text-secondary hover:border-secondary text-foreground'}`}
            title="Scan QR Code"
          >
            {isScanning ? <FiX className="w-4 h-4" /> : <FiCamera className="w-4 h-4" />}
          </button>
        </div>
        
        {isScanning ? (
          <div id="qr-reader" className="w-full bg-background rounded border-2 border-foreground/20 overflow-hidden mb-2" />
        ) : (
          <div className="flex w-full items-center bg-background px-3 py-2 border border-foreground/20 rounded shadow-sm">
            <span className="text-2xl font-mono text-secondary mr-3">{">"}</span>
            <input
              type="text"
              value={secretCode}
              onChange={(e) => setSecretCode(e.target.value)}
              placeholder="e.g. 8492-apple-banana"
              className="flex-1 bg-transparent text-xl font-mono text-foreground outline-none placeholder:text-muted-foreground/40 caret-secondary"
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Save Destination Picker & Options */}
      <div className="w-full border-2 border-foreground/20 p-4 bg-muted/20 mb-6 space-y-3 rounded shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-muted-foreground">SAVE DESTINATION:</span>
          <button
            onClick={handlePickOutputDir}
            className="text-xs font-bold text-foreground hover:text-secondary flex items-center space-x-1 border border-foreground/30 px-2.5 py-1 rounded bg-background transition-colors hover:border-secondary"
          >
            <FiFolder className="w-3.5 h-3.5" />
            <span>{outputDir ? "Change Folder" : "Browse Folder"}</span>
          </button>
        </div>
        <div className="text-xs font-mono text-foreground/80 truncate bg-background p-2 border border-foreground/20 rounded">
          {outputDir || "Default Downloads / TyeXhare"}
        </div>

        <div className="flex items-center space-x-2 pt-2 border-t border-foreground/10 mt-2">
          <input
            type="checkbox"
            id="autoAccept"
            checked={autoAccept}
            onChange={(e) => setAutoAccept(e.target.checked)}
            className="w-4 h-4 accent-secondary cursor-pointer"
          />
          <label htmlFor="autoAccept" className="text-xs font-mono text-foreground cursor-pointer select-none">
            Auto-accept transfer prompt without confirmation
          </label>
        </div>
      </div>

      {/* Receive Action Button */}
      <button
        onClick={handleStartReceive}
        disabled={!secretCode.trim()}
        className="w-full btn-3d-secondary text-xl py-4 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary hover:border-secondary hover:text-background transition-all duration-300"
      >
        RECEIVE TRANSFER
      </button>

      {/* Confirmation Modal overlay when prompt is triggered */}
      {promptMessage && onRespondPrompt && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-background border-2 border-secondary p-6 max-w-md w-full rounded-lg shadow-2xl space-y-6">
            <div className="font-pixel text-xl text-secondary border-b-2 border-secondary/20 pb-3">
              INCOMING TRANSFER
            </div>
            <p className="font-mono text-sm text-foreground leading-relaxed">
              {promptMessage}
            </p>
            <div className="flex space-x-4">
              <button
                onClick={() => onRespondPrompt(false)}
                className="flex-1 py-3 border-2 border-foreground hover:bg-destructive hover:text-background hover:border-destructive flex items-center justify-center space-x-2 rounded transition-colors font-bold"
              >
                <FiX />
                <span>DECLINE</span>
              </button>
              <button
                onClick={() => onRespondPrompt(true)}
                className="flex-1 py-3 btn-3d hover:bg-secondary flex items-center justify-center space-x-2 transition-colors"
              >
                <FiCheck />
                <span>ACCEPT</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
