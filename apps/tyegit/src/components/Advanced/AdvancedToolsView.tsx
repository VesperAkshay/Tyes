import React, { useState } from 'react';
import { HooksManager } from '../Hooks/HooksManager';
import { InternalsBrowser } from './InternalsBrowser';
import { PlumbingTerminal } from './PlumbingTerminal';
import { RiTerminalBoxLine, RiDatabase2Line, RiSettings6Line } from 'react-icons/ri';

interface AdvancedToolsViewProps {
  repoPath: string;
}

export const AdvancedToolsView: React.FC<AdvancedToolsViewProps> = ({ repoPath }) => {
  const [activeSubTab, setActiveSubTab] = useState<'hooks' | 'internals' | 'plumbing'>('hooks');

  return (
    <div className="flex flex-col h-full bg-[var(--tye-cream)] overflow-hidden">
      {/* Top Navigation for Advanced Tools */}
      <div className="flex border-b-2 border-[var(--tye-ink)] bg-white">
        <button
          onClick={() => setActiveSubTab('hooks')}
          className={`flex-1 py-3 font-mono font-bold text-sm flex items-center justify-center gap-2 border-r-2 border-[var(--tye-ink)] transition-colors ${
            activeSubTab === 'hooks' ? 'bg-[var(--tye-lavender)] text-white shadow-[inset_0px_-4px_0px_var(--tye-ink)]' : 'hover:bg-gray-100'
          }`}
        >
          <RiSettings6Line className="text-lg" /> Git Hooks
        </button>
        <button
          onClick={() => setActiveSubTab('internals')}
          className={`flex-1 py-3 font-mono font-bold text-sm flex items-center justify-center gap-2 border-r-2 border-[var(--tye-ink)] transition-colors ${
            activeSubTab === 'internals' ? 'bg-[var(--tye-lavender)] text-white shadow-[inset_0px_-4px_0px_var(--tye-ink)]' : 'hover:bg-gray-100'
          }`}
        >
          <RiDatabase2Line className="text-lg" /> Internals Browser
        </button>
        <button
          onClick={() => setActiveSubTab('plumbing')}
          className={`flex-1 py-3 font-mono font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
            activeSubTab === 'plumbing' ? 'bg-[var(--tye-lavender)] text-white shadow-[inset_0px_-4px_0px_var(--tye-ink)]' : 'hover:bg-gray-100'
          }`}
        >
          <RiTerminalBoxLine className="text-lg" /> Plumbing Terminal
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeSubTab === 'hooks' && <HooksManager repoPath={repoPath} />}
        {activeSubTab === 'internals' && <InternalsBrowser repoPath={repoPath} />}
        {activeSubTab === 'plumbing' && <PlumbingTerminal repoPath={repoPath} />}
      </div>
    </div>
  );
};
