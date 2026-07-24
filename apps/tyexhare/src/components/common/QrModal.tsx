"use client";

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FiX, FiShare2, FiCopy, FiCheck, FiAlertTriangle } from "react-icons/fi";
import { BsQrCode } from "react-icons/bs";
import { FaWhatsapp, FaTelegram } from "react-icons/fa";
import { QRCodeSVG } from 'qrcode.react';

interface QrModalProps {
  code: string;
  onClose: () => void;
}

export function QrModal({ code, onClose }: QrModalProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const [shareWarning, setShareWarning] = useState<{ url: string | null; type: 'whatsapp' | 'telegram' | 'native' } | null>(null);

  const webLink = `https://tyexhare.tyes.dev/?code=${encodeURIComponent(code)}`;
  const shareText = `Receive my encrypted file on Tye-Xhare!\n🔗 Direct Link: ${webLink}\n🔑 Secret Code: ${code}`;

  const openExternalUrl = async (url: string) => {
    try {
      await invoke("open_url_safely", { url });
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Auto-clear clipboard after 60s for security
      setTimeout(() => navigator.clipboard.writeText(""), 60000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const downloadQrSvg = () => {
    // Generate SVG string from the rendered QRCodeSVG
    const svgElement = document.getElementById("qr-svg-container")?.querySelector("svg");
    if (!svgElement) return;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tye-xhare-qr-${code}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    setShareWarning({ url, type: 'whatsapp' });
  };

  const handleShareTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(webLink)}&text=${encodeURIComponent(`Receive file on Tye-Xhare (Code: ${code})`)}`;
    setShareWarning({ url, type: 'telegram' });
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setShareWarning({ url: null, type: 'native' });
    } else {
      handleCopyCode();
    }
  };

  const proceedWithShare = async () => {
    if (!shareWarning) return;
    const { url, type } = shareWarning;
    setShareWarning(null);

    if (type === 'native') {
      try {
        const svgElement = document.getElementById("qr-svg-container")?.querySelector("svg");
        if (svgElement && typeof navigator !== "undefined" && typeof navigator.canShare === "function") {
          const svgData = new XMLSerializer().serializeToString(svgElement);
          const blob = new Blob([svgData], { type: "image/svg+xml" });
          const file = new File([blob], `tye-xhare-qr-${code}.svg`, { type: "image/svg+xml" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: "Tye-Xhare QR Code",
              text: shareText,
              files: [file],
            });
            return;
          }
        }
        await navigator.share({
          title: "Tye-Xhare Transfer Code",
          text: shareText,
        });
      } catch (err) {
        console.log("Share cancelled or not supported:", err);
      }
    } else if (url) {
      openExternalUrl(url);
    }
  };

  return (
    <div className="fixed inset-0 bg-foreground/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200 select-none">
      <div className="bg-background border-4 border-foreground p-6 max-w-sm w-full rounded-lg shadow-2xl space-y-4 flex flex-col items-center relative overflow-hidden">
        
        {/* Warning Overlay */}
        {shareWarning && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-md z-20 flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4 border border-destructive/20">
              <FiAlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="font-pixel text-lg text-foreground mb-2">SECURITY WARNING</h3>
            <p className="text-xs font-mono text-muted-foreground mb-6 leading-relaxed">
              Anyone with this code can intercept your file transfer. Only share it via secure, trusted channels.
            </p>
            <div className="flex w-full space-x-3">
              <button
                onClick={() => setShareWarning(null)}
                className="flex-1 py-3 border-2 border-foreground hover:bg-muted font-pixel text-xs rounded transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={proceedWithShare}
                className="flex-1 py-3 bg-destructive text-destructive-foreground hover:bg-destructive/90 font-pixel text-xs rounded transition-colors"
              >
                PROCEED
              </button>
            </div>
          </div>
        )}

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground p-1 transition-colors"
        >
          <FiX className="w-6 h-6" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-2 border-b-2 border-foreground pb-2 w-full justify-center">
          <BsQrCode className="w-5 h-5 text-primary" />
          <span className="font-pixel text-lg text-foreground">SCAN & SHARE QR</span>
        </div>

        {/* QR Code Container */}
        <div id="qr-svg-container" className="w-56 h-56 bg-white border-2 border-foreground p-3 rounded flex items-center justify-center shadow-inner my-1">
          <QRCodeSVG value={code} size={200} fgColor="#000000" bgColor="#ffffff" level="H" />
        </div>

        {/* Download QR Image Action */}
        <button
          onClick={downloadQrSvg}
          className="text-xs font-pixel text-primary hover:underline flex items-center space-x-1 border border-primary/40 px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/20 transition-colors"
        >
          <BsQrCode className="w-3.5 h-3.5" />
          <span>SAVE QR IMAGE (.SVG)</span>
        </button>

        {/* Code Display */}
        <div className="text-center font-mono space-y-1 w-full">
          <div className="text-xs text-muted-foreground">SECRET TRANSFER CODE</div>
          <div className="text-base font-bold text-foreground bg-muted/40 p-2 rounded border border-foreground/30 font-mono tracking-wide flex items-center justify-between px-3">
            <span>{code}</span>
            <button
              onClick={handleCopyCode}
              className="text-xs text-primary hover:underline font-bold flex items-center space-x-1"
            >
              {copied ? <FiCheck className="w-3.5 h-3.5 text-green-600" /> : <FiCopy className="w-3.5 h-3.5" />}
              <span>{copied ? "COPIED" : "COPY"}</span>
            </button>
          </div>
        </div>

        {/* Social Share Buttons */}
        <div className="w-full pt-2 border-t border-foreground/20 space-y-2">
          <div className="text-[10px] font-pixel text-muted-foreground text-center tracking-wider">
            QUICK SHARE TO MOBILE
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleShareWhatsApp}
              className="px-2 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white font-mono text-xs font-bold rounded flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
              title="Share via WhatsApp"
            >
              <FaWhatsapp className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handleShareTelegram}
              className="px-2 py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white font-mono text-xs font-bold rounded flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
              title="Share via Telegram"
            >
              <FaTelegram className="w-4 h-4" />
              <span>Telegram</span>
            </button>

            <button
              onClick={handleNativeShare}
              className="px-2 py-2 bg-foreground hover:bg-primary text-background font-mono text-xs font-bold rounded flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
              title="Share via System Apps"
            >
              <FiShare2 className="w-4 h-4" />
              <span>More</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
