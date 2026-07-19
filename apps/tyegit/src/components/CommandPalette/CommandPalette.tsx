import React, { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { RiSearchLine, RiGitCommitLine, RiSettings4Line, RiHistoryLine, RiCloudLine, RiPulseLine, RiGitRepositoryLine, RiAddLine, RiDownloadCloud2Line, RiRadarLine, RiFolderAddLine, RiKeyboardBoxLine, RiInformationLine } from 'react-icons/ri';

interface CommandPaletteProps {
  inWorkspace?: boolean;
  activeRepoPath?: string | null;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ inWorkspace = false, activeRepoPath = null }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Toggle the menu when ⌘K or Ctrl+Shift+P is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((key === 'p' && (e.metaKey || e.ctrlKey) && e.shiftKey) || (key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setOpen((open) => !open);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[15vh]">
      <div className="w-full max-w-2xl bg-[var(--tye-cream)] border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] rounded-none overflow-hidden">
        <Command label="Command Palette" shouldFilter={true} className="w-full">
          <div className="flex items-center px-4 border-b-2 border-[var(--tye-ink)] bg-white">
            <RiSearchLine className="w-5 h-5 text-[var(--tye-ink)] opacity-50 mr-2" />
            <Command.Input 
              value={search}
              onValueChange={setSearch}
              placeholder="Search commands (e.g. Commit, Settings, Maintenance)..."
              className="w-full py-4 text-lg bg-transparent font-sans outline-none placeholder:text-gray-400"
              autoFocus
            />
            <span className="text-xs font-mono bg-gray-200 px-1 border border-gray-400">ESC to close</span>
          </div>
          
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="p-8 text-center text-[var(--tye-ink)] opacity-50 font-mono">No commands found.</Command.Empty>

            <Command.Group heading="Global Actions" className="px-2 py-2 text-xs font-bold text-[var(--tye-lavender)] uppercase tracking-wider font-mono">
              <Command.Item onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent('tye:cmd:init')); }} className="flex items-center px-3 py-3 text-sm hover:bg-[var(--tye-lavender)] hover:text-white cursor-pointer data-[selected=true]:bg-[var(--tye-lavender)] data-[selected=true]:text-white font-bold border-b border-[var(--tye-ink)]/10">
                <RiAddLine className="mr-3 w-5 h-5" /> Initialize Repository
              </Command.Item>
              <Command.Item onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent('tye:cmd:clone')); }} className="flex items-center px-3 py-3 text-sm hover:bg-[var(--tye-lavender)] hover:text-white cursor-pointer data-[selected=true]:bg-[var(--tye-lavender)] data-[selected=true]:text-white font-bold border-b border-[var(--tye-ink)]/10">
                <RiDownloadCloud2Line className="mr-3 w-5 h-5" /> Clone Repository
              </Command.Item>
              <Command.Item onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent('tye:cmd:scan')); }} className="flex items-center px-3 py-3 text-sm hover:bg-[var(--tye-lavender)] hover:text-white cursor-pointer data-[selected=true]:bg-[var(--tye-lavender)] data-[selected=true]:text-white font-bold border-b border-[var(--tye-ink)]/10">
                <RiRadarLine className="mr-3 w-5 h-5" /> Scan for Repositories
              </Command.Item>
              <Command.Item onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent('tye:cmd:workspace_new')); }} className="flex items-center px-3 py-3 text-sm hover:bg-[var(--tye-lavender)] hover:text-white cursor-pointer data-[selected=true]:bg-[var(--tye-lavender)] data-[selected=true]:text-white font-bold border-b border-[var(--tye-ink)]/10">
                <RiFolderAddLine className="mr-3 w-5 h-5" /> New Workspace
              </Command.Item>
            </Command.Group>

            {inWorkspace && (
              <Command.Group heading="Git Actions" className="px-2 py-2 text-xs font-bold text-[var(--tye-lavender)] uppercase tracking-wider font-mono">
                <Command.Item onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent('tye:cmd:commit')); }} className="flex items-center px-3 py-3 text-sm hover:bg-[var(--tye-lavender)] hover:text-white cursor-pointer data-[selected=true]:bg-[var(--tye-lavender)] data-[selected=true]:text-white font-bold border-b border-[var(--tye-ink)]/10">
                  <RiGitCommitLine className="mr-3 w-5 h-5" /> Commit Changes
                </Command.Item>
                <Command.Item onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent('tye:cmd:fetch')); }} className="flex items-center px-3 py-3 text-sm hover:bg-[var(--tye-lavender)] hover:text-white cursor-pointer data-[selected=true]:bg-[var(--tye-lavender)] data-[selected=true]:text-white font-bold border-b border-[var(--tye-ink)]/10">
                  <RiCloudLine className="mr-3 w-5 h-5" /> Fetch & Pull
                </Command.Item>
                <Command.Item onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent('tye:cmd:time_machine')); }} className="flex items-center px-3 py-3 text-sm hover:bg-[var(--tye-lavender)] hover:text-white cursor-pointer data-[selected=true]:bg-[var(--tye-lavender)] data-[selected=true]:text-white font-bold border-b border-[var(--tye-ink)]/10">
                  <RiHistoryLine className="mr-3 w-5 h-5" /> Open Time Machine
                </Command.Item>
                <Command.Item onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent('tye:cmd:maintenance')); }} className="flex items-center px-3 py-3 text-sm hover:bg-[var(--tye-lavender)] hover:text-white cursor-pointer data-[selected=true]:bg-[var(--tye-lavender)] data-[selected=true]:text-white font-bold border-b border-[var(--tye-ink)]/10">
                  <RiPulseLine className="mr-3 w-5 h-5" /> Maintenance Center
                </Command.Item>
              </Command.Group>
            )}

            {!inWorkspace && activeRepoPath && (
              <Command.Group heading="Navigation" className="px-2 py-2 text-xs font-bold text-[var(--tye-lavender)] uppercase tracking-wider font-mono">
                <Command.Item onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent('tye:cmd:return_repo')); }} className="flex items-center px-3 py-3 text-sm hover:bg-[var(--tye-lavender)] hover:text-white cursor-pointer data-[selected=true]:bg-[var(--tye-lavender)] data-[selected=true]:text-white font-bold border-b border-[var(--tye-ink)]/10">
                  <RiGitRepositoryLine className="mr-3 w-5 h-5" /> Return to Active Repo ({activeRepoPath.split(/[\\/]/).pop()})
                </Command.Item>
              </Command.Group>
            )}

            <Command.Group heading="Settings & Tools" className="px-2 pt-4 pb-2 text-xs font-bold text-[var(--tye-mustard)] uppercase tracking-wider font-mono">
              <Command.Item onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent('tye:cmd:settings')); }} className="flex items-center px-3 py-3 text-sm hover:bg-[var(--tye-mustard)] hover:text-white cursor-pointer data-[selected=true]:bg-[var(--tye-mustard)] data-[selected=true]:text-white font-bold border-b border-[var(--tye-ink)]/10">
                <RiSettings4Line className="mr-3 w-5 h-5" /> Configuration Engine
              </Command.Item>
              <Command.Item onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent('tye:cmd:shortcuts')); }} className="flex items-center px-3 py-3 text-sm hover:bg-[var(--tye-mustard)] hover:text-white cursor-pointer data-[selected=true]:bg-[var(--tye-mustard)] data-[selected=true]:text-white font-bold border-b border-[var(--tye-ink)]/10">
                <RiKeyboardBoxLine className="mr-3 w-5 h-5" /> Keyboard Shortcuts
              </Command.Item>
              <Command.Item onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent('tye:cmd:about')); }} className="flex items-center px-3 py-3 text-sm hover:bg-[var(--tye-mustard)] hover:text-white cursor-pointer data-[selected=true]:bg-[var(--tye-mustard)] data-[selected=true]:text-white font-bold border-b border-[var(--tye-ink)]/10">
                <RiInformationLine className="mr-3 w-5 h-5" /> About Tyegit
              </Command.Item>
            </Command.Group>

          </Command.List>
        </Command>
      </div>
    </div>
  );
};
