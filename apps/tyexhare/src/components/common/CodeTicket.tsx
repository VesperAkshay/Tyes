"use client";

import { useState } from "react";
import { FiCopy, FiCheck, FiShare2 } from "react-icons/fi";
import { BsQrCode } from "react-icons/bs";
import { FaWhatsapp, FaTelegram } from "react-icons/fa";
import { QrModal } from "@/components/common/QrModal";

interface CodeTicketProps {
  code: string;
  label?: string;
}

export function CodeTicket({ code, label = "SECRET TRANSFER CODE" }: CodeTicketProps) {
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const webLink = `https://tyexhare.tyes.dev/?code=${encodeURIComponent(code)}`;
  const shareText = `Receive my encrypted file on Tye-Xhare!\n🔗 Direct Link: ${webLink}\n🔑 Secret Code: ${code}`;

  const openExternalUrl = async (url: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_url", { url });
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    openExternalUrl(url);
  };

  const handleShareTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent("https://tyexhare.tyes.dev")}&text=${encodeURIComponent(shareText)}`;
    openExternalUrl(url);
  };

  return (
    <>
      <div className="w-full border-4 border-foreground bg-background p-4 rounded-md shadow-md relative overflow-hidden group">
        {/* Decorative Stamp/Ticket Edge Accents */}
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-foreground" />
        <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-foreground" />

        <div className="flex flex-col items-center justify-center px-2">
          <span className="font-pixel text-xs text-muted-foreground tracking-widest uppercase mb-1">
            {label}
          </span>

          {/* Code Display */}
          <div className="text-2xl font-mono font-bold text-foreground tracking-wider my-1 select-all">
            {code}
          </div>

          {/* Action Buttons */}
          <div className="mt-2 flex items-center space-x-2 flex-wrap justify-center gap-y-2">
            <button
              onClick={handleCopy}
              className={`px-3.5 py-1.5 font-pixel text-xs border-2 border-foreground flex items-center space-x-1.5 transition-all border-b-4 border-r-4 active:translate-x-[2px] active:translate-y-[2px] rounded ${
                copied
                  ? "bg-green-600 text-white border-green-700 shadow-none"
                  : "bg-foreground text-background hover:bg-primary hover:text-background"
              }`}
            >
              {copied ? (
                <>
                  <FiCheck className="w-3.5 h-3.5 animate-bounce" />
                  <span>COPIED ✓</span>
                </>
              ) : (
                <>
                  <FiCopy className="w-3.5 h-3.5" />
                  <span>COPY CODE</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowQrModal(true)}
              className="px-3.5 py-1.5 font-pixel text-xs border-2 border-foreground border-b-4 border-r-4 active:translate-x-[2px] active:translate-y-[2px] bg-background text-foreground hover:bg-secondary transition-all flex items-center space-x-1.5 rounded"
            >
              <BsQrCode className="w-3.5 h-3.5" />
              <span>SHOW QR</span>
            </button>

            {/* Quick WhatsApp & Telegram Icons */}
            <div className="flex items-center space-x-1 pl-1">
              <button
                onClick={handleShareWhatsApp}
                className="p-2 bg-green-600 hover:bg-green-700 text-white rounded border border-green-700 transition-colors shadow-sm"
                title="Share via WhatsApp"
              >
                <FaWhatsapp className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleShareTelegram}
                className="p-2 bg-sky-500 hover:bg-sky-600 text-white rounded border border-sky-600 transition-colors shadow-sm"
                title="Share via Telegram"
              >
                <FaTelegram className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showQrModal && (
        <QrModal code={code} onClose={() => setShowQrModal(false)} />
      )}
    </>
  );
}
