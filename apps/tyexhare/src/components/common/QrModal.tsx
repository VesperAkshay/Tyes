"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FiX, FiShare2, FiCopy, FiCheck } from "react-icons/fi";
import { BsQrCode } from "react-icons/bs";
import { FaWhatsapp, FaTelegram } from "react-icons/fa";

interface QrModalProps {
  code: string;
  onClose: () => void;
}

export function QrModal({ code, onClose }: QrModalProps) {
  const [svgContent, setSvgContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    async function loadQr() {
      try {
        const svg = await invoke<string>("generate_qr_code", { code });
        setSvgContent(svg);
      } catch (err) {
        console.error("Failed to generate QR code:", err);
      } finally {
        setLoading(false);
      }
    }
    if (code) {
      loadQr();
    }
  }, [code]);

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

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const downloadQrSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tye-xhare-qr-${code}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    openExternalUrl(url);
  };

  const handleShareTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(webLink)}&text=${encodeURIComponent(`Receive file on Tye-Xhare (Code: ${code})`)}`;
    openExternalUrl(url);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        if (svgContent) {
          const blob = new Blob([svgContent], { type: "image/svg+xml" });
          const file = new File([blob], `tye-xhare-qr-${code}.svg`, { type: "image/svg+xml" });

          if (navigator.canShare && navigator.canShare({ files: [file] })) {
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
    } else {
      handleCopyCode();
    }
  };

  return (
    <div className="fixed inset-0 bg-foreground/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200 select-none">
      <div className="bg-background border-4 border-foreground p-6 max-w-sm w-full rounded-lg shadow-2xl space-y-4 flex flex-col items-center relative">
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
        <div className="w-56 h-56 bg-background border-2 border-foreground p-3 rounded flex items-center justify-center shadow-inner my-1 relative group">
          {loading ? (
            <div className="font-mono text-xs text-muted-foreground animate-pulse">GENERATING QR...</div>
          ) : svgContent ? (
            <div
              className="w-full h-full"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          ) : (
            <div className="font-mono text-xs text-destructive">QR CODE ERROR</div>
          )}
        </div>

        {/* Download QR Image Action */}
        <button
          onClick={downloadQrSvg}
          disabled={!svgContent}
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
              className="px-2 py-2 bg-green-600 hover:bg-green-700 text-white font-mono text-xs font-bold rounded flex items-center justify-center space-x-1.5 transition-colors border border-green-700 shadow-sm"
              title="Share via WhatsApp"
            >
              <FaWhatsapp className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handleShareTelegram}
              className="px-2 py-2 bg-sky-500 hover:bg-sky-600 text-white font-mono text-xs font-bold rounded flex items-center justify-center space-x-1.5 transition-colors border border-sky-600 shadow-sm"
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
