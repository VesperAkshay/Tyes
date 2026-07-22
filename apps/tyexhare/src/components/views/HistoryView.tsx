"use client";

import { useEffect, useState, useRef } from "react";
import { FiClock, FiFile, FiDownload, FiUpload, FiTrash2 } from "react-icons/fi";
import anime from "animejs";

export interface TransferReceipt {
  id: string;
  type: "send" | "receive";
  filename: string;
  size: string;
  date: string;
  status: "success" | "failed";
}

export function HistoryView() {
  const [receipts, setReceipts] = useState<TransferReceipt[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem("tyexhare_history");
    if (saved) {
      try {
        setReceipts(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (containerRef.current && receipts.length > 0) {
      anime({
        targets: containerRef.current.children,
        translateY: [20, 0],
        opacity: [0, 1],
        duration: 400,
        delay: anime.stagger(50),
        easing: "easeOutQuad"
      });
    }
  }, [receipts.length]);

  const clearHistory = () => {
    localStorage.removeItem("tyexhare_history");
    setReceipts([]);
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center relative py-4">
      <div className="w-full flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold font-pixel text-secondary">Transfer History</h2>
        {receipts.length > 0 && (
          <button 
            onClick={clearHistory}
            className="flex items-center space-x-1.5 text-xs font-mono text-muted-foreground hover:text-destructive transition-colors border border-transparent hover:border-destructive px-2 py-1 rounded"
          >
            <FiTrash2 className="w-3.5 h-3.5" />
            <span>CLEAR LOGS</span>
          </button>
        )}
      </div>

      <div ref={containerRef} className="w-full space-y-3">
        {receipts.length === 0 ? (
          <div className="w-full border-2 border-foreground/20 border-dashed bg-stipple p-8 rounded flex flex-col items-center justify-center text-muted-foreground font-mono text-sm opacity-60">
            <FiClock className="w-8 h-8 mb-3 text-foreground/40" />
            <p>NO TRANSFER RECORDS FOUND.</p>
          </div>
        ) : (
          receipts.map((receipt) => (
            <div key={receipt.id} className="w-full border-2 border-foreground/30 bg-background p-3 rounded shadow-sm flex items-center justify-between hover:border-secondary transition-colors group">
              <div className="flex items-center space-x-4">
                <div className={`w-10 h-10 rounded border-2 flex items-center justify-center ${receipt.type === 'send' ? 'bg-primary/20 border-primary text-primary' : 'bg-secondary/20 border-secondary text-secondary'}`}>
                  {receipt.type === 'send' ? <FiUpload className="w-5 h-5" /> : <FiDownload className="w-5 h-5" />}
                </div>
                <div className="flex flex-col">
                  <span className="font-mono font-bold text-foreground truncate max-w-[200px] sm:max-w-[300px]">
                    {receipt.filename || "Unknown Transfer"}
                  </span>
                  <div className="flex items-center space-x-3 text-[10px] font-mono text-muted-foreground mt-1">
                    <span className="flex items-center space-x-1">
                      <FiClock className="w-3 h-3" />
                      <span>{new Date(receipt.date).toLocaleString()}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <FiFile className="w-3 h-3" />
                      <span>{receipt.size}</span>
                    </span>
                  </div>
                </div>
              </div>
              
              <div className={`px-2 py-1 rounded border text-[10px] font-bold font-mono ${receipt.status === 'success' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-destructive/10 text-destructive border-destructive/30'}`}>
                {receipt.status.toUpperCase()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
