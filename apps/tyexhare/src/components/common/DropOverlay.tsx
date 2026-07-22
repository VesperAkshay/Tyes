"use client";

import { useEffect, useState } from "react";
import { FiUploadCloud, FiFileText } from "react-icons/fi";

interface DropOverlayProps {
  onFileDrop: (files: string[]) => void;
}

export function DropOverlay({ onFileDrop }: DropOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter = 0;

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const droppedFiles: string[] = [];
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i];
          // In Web / Tauri, path property is present on File object
          const path = (file as unknown as { path?: string }).path || file.name;
          droppedFiles.push(path);
        }
        if (droppedFiles.length > 0) {
          onFileDrop(droppedFiles);
        }
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [onFileDrop]);

  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-md border-8 border-dashed border-primary flex flex-col items-center justify-center p-8 animate-in fade-in duration-200 select-none">
      <div className="border-4 border-foreground bg-background p-8 rounded-xl shadow-2xl flex flex-col items-center max-w-md text-center space-y-4 animate-bounce">
        <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center border-4 border-primary text-primary">
          <FiUploadCloud className="w-10 h-10" />
        </div>

        <div>
          <h2 className="text-2xl font-pixel text-foreground">DROP FILE ANYWHERE</h2>
          <p className="text-sm font-mono text-muted-foreground mt-1">
            Release to inspect file & generate instant transfer code
          </p>
        </div>

        <div className="px-4 py-2 bg-muted/30 border border-foreground/30 rounded font-mono text-xs text-foreground flex items-center space-x-2">
          <FiFileText className="w-4 h-4 text-secondary" />
          <span>READY FOR SECURE PAKE ENCRYPTION</span>
        </div>
      </div>
    </div>
  );
}
