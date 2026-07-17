import React from 'react';
import { RiCloseLine, RiLinksLine, RiMailLine, RiLinkedinBoxFill, RiTwitterXFill, RiInformationLine } from 'react-icons/ri';
import tyegitLogo from '../../assets/logo.png';

interface AboutModalProps {
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-[var(--tye-ink)]/70 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white border-2 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] max-w-sm w-full overflow-hidden flex flex-col">
        <div className="bg-[var(--tye-lavender)] p-4 border-b-2 border-[var(--tye-ink)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--tye-ink)] font-bold font-pixel text-lg">
            <RiInformationLine className="w-5 h-5" />
            ABOUT TYEGIT
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--tye-ink)] hover:text-[var(--tye-cream)] transition-colors border-2 border-transparent hover:border-[var(--tye-ink)] text-[var(--tye-ink)]"
          >
            <RiCloseLine className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center justify-center text-center">
          <img src={tyegitLogo} alt="Tyegit Logo" className="w-24 h-24 mb-4 drop-shadow-[4px_4px_0px_var(--tye-ink)]" />
          <h2 className="font-pixel text-2xl font-bold tracking-tight text-[var(--tye-ink)] mb-1">Tyegit</h2>
          <p className="font-mono text-xs opacity-70 uppercase tracking-widest mb-6">Engine v0.1</p>

          <div className="flex flex-col gap-3 w-full font-mono text-sm">
            <a href="https://tyegit.tyes.dev" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 border-2 border-[var(--tye-ink)] hover:bg-[var(--tye-cream)] transition-colors group cursor-pointer shadow-[2px_2px_0px_0px_var(--tye-ink)]">
              <span className="flex items-center gap-2 font-bold text-[var(--tye-ink)]"><RiLinksLine className="text-[var(--tye-lavender)] group-hover:scale-110 transition-transform" /> Website</span>
              <span className="opacity-70 text-xs truncate max-w-[150px]">tyegit.tyes.dev</span>
            </a>

            <a href="mailto:contact@tyes.dev" className="flex items-center justify-between p-3 border-2 border-[var(--tye-ink)] hover:bg-[var(--tye-cream)] transition-colors group cursor-pointer shadow-[2px_2px_0px_0px_var(--tye-ink)]">
              <span className="flex items-center gap-2 font-bold text-[var(--tye-ink)]"><RiMailLine className="text-[var(--tye-lavender)] group-hover:scale-110 transition-transform" /> Email</span>
              <span className="opacity-70 text-xs truncate max-w-[150px]">contact@tyes.dev</span>
            </a>

            <a href="https://www.linkedin.com/in/patelakshay1503" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 border-2 border-[var(--tye-ink)] hover:bg-[var(--tye-cream)] transition-colors group cursor-pointer shadow-[2px_2px_0px_0px_var(--tye-ink)]">
              <span className="flex items-center gap-2 font-bold text-[var(--tye-ink)]"><RiLinkedinBoxFill className="text-[var(--tye-lavender)] group-hover:scale-110 transition-transform" /> LinkedIn</span>
              <span className="opacity-70 text-xs">Akshay Patel</span>
            </a>

            <a href="https://x.com/Akshaypatell_" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 border-2 border-[var(--tye-ink)] hover:bg-[var(--tye-cream)] transition-colors group cursor-pointer shadow-[2px_2px_0px_0px_var(--tye-ink)]">
              <span className="flex items-center gap-2 font-bold text-[var(--tye-ink)]"><RiTwitterXFill className="text-[var(--tye-lavender)] group-hover:scale-110 transition-transform" /> Twitter / X</span>
              <span className="opacity-70 text-xs">@Akshaypatell_</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
