"use client";

import { useEffect, useRef } from "react";
import { FiCheckCircle, FiAlertTriangle, FiFolder, FiSend } from "react-icons/fi";
import anime from "animejs";

interface CompleteViewProps {
  message?: string | null;
  errorMessage?: string | null;
  onDone: () => void;
  onOpenFolder?: () => void;
}

export function CompleteView({ message, errorMessage, onDone, onOpenFolder }: CompleteViewProps) {
  const isError = Boolean(errorMessage);
  const containerRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      anime({
        targets: containerRef.current.children,
        translateY: [-20, 0],
        opacity: [0, 1],
        duration: 500,
        delay: anime.stagger(150, { start: 100 }),
        easing: "easeOutElastic(1, .6)"
      });
    }

    if (!isError && iconRef.current) {
      // Mechanical success burst
      anime({
        targets: iconRef.current,
        scale: [0.5, 1.2, 1],
        rotate: [-15, 10, 0],
        duration: 800,
        easing: "spring(1, 80, 10, 0)"
      });
    } else if (isError && iconRef.current) {
      anime({
        targets: iconRef.current,
        translateX: [-10, 10, -10, 10, 0],
        duration: 400,
        easing: "easeInOutSine"
      });
    }
  }, [isError]);

  return (
    <div ref={containerRef} className="w-full max-w-lg flex flex-col items-center text-center my-auto py-4 select-none relative">
      {/* Background Halftone Burst Effect (purely decorative) */}
      {!isError && (
        <div className="absolute inset-0 bg-stipple opacity-20 rounded-full scale-150 animate-pulse pointer-events-none -z-10" />
      )}

      <div
        ref={iconRef}
        className={`w-20 h-20 rounded-full border-2 border-foreground/30 flex items-center justify-center mb-5 shadow-inner ${
          isError ? "bg-destructive text-background" : "bg-primary text-background"
        }`}
      >
        {isError ? <FiAlertTriangle className="w-10 h-10" /> : <FiCheckCircle className="w-10 h-10" />}
      </div>

      <h2 className="text-3xl font-pixel font-bold mb-2 text-foreground">
        {isError ? "TRANSFER FAILED" : "TRANSFER COMPLETE!"}
      </h2>

      {/* The "Receipt" Box */}
      <div className="font-mono text-sm text-foreground/90 mb-6 border-2 border-foreground/30 p-5 bg-background shadow-md rounded-md w-full text-left space-y-3 relative overflow-hidden">
        {/* Top zigzag edge to look like a torn receipt (optional styling) */}
        
        <div className="flex items-center justify-between border-b border-foreground/10 pb-2">
          <span className="font-pixel text-xs text-muted-foreground">STATUS_REPORT</span>
          <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
            isError ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-primary/10 text-primary border-primary/30"
          }`}>
            {isError ? "FAILED" : "SUCCESS (100%)"}
          </span>
        </div>

        <p className="leading-relaxed font-bold break-all">
          {errorMessage || message || "File(s) transferred successfully to destination."}
        </p>

        {!isError && (
          <div className="text-xs text-muted-foreground pt-1 flex items-center space-x-1">
            <FiFolder className="w-3.5 h-3.5 text-secondary shrink-0" />
            <span className="truncate">Saved to: Downloads / TyeXhare</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
        {!isError && onOpenFolder && (
          <button
            onClick={onOpenFolder}
            className="w-full sm:flex-1 py-3 px-4 btn-3d-secondary hover:bg-secondary border-foreground/20 font-pixel text-xs flex items-center justify-center space-x-2 rounded transition-colors"
          >
            <FiFolder className="w-4 h-4" />
            <span>OPEN FOLDER</span>
          </button>
        )}

        <button
          onClick={onDone}
          className="w-full sm:flex-1 py-3 px-4 btn-3d font-pixel text-xs border-foreground/20 flex items-center justify-center space-x-2 rounded transition-colors"
        >
          <FiSend className="w-4 h-4" />
          <span>{isError ? "TRY AGAIN" : "SHARE NEW FILE"}</span>
        </button>
      </div>
    </div>
  );
}
