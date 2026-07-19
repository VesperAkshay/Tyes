import React, { useEffect } from 'react';
import { RiKeyboardBoxLine, RiCloseLine } from 'react-icons/ri';

interface Shortcut {
  id: string;
  name: string;
  keys: string[];
}

const defaultShortcuts: Shortcut[] = [
  // Global
  { id: 'cmd_palette', name: 'Open Command Palette', keys: ['Ctrl', 'Shift', 'P'] },
  { id: 'toggle_sidebar', name: 'Toggle Sidebar', keys: ['Ctrl', 'B'] },
  
  // Repository Actions
  { id: 'init', name: 'Initialize Repository', keys: ['Ctrl', 'Shift', 'I'] },
  { id: 'clone', name: 'Clone Repository', keys: ['Ctrl', 'Shift', 'C'] },
  { id: 'scan', name: 'Scan for Repositories', keys: ['Ctrl', 'Shift', 'S'] },
  { id: 'workspace_new', name: 'New Workspace', keys: ['Ctrl', 'Shift', 'N'] },
  
  // Git Actions
  { id: 'commit', name: 'Commit Changes', keys: ['Ctrl', 'Enter'] },
  { id: 'fetch', name: 'Fetch & Pull', keys: ['Ctrl', 'Shift', 'F'] },
  { id: 'time_machine', name: 'Open Time Machine', keys: ['Ctrl', 'T'] },
  { id: 'maintenance', name: 'Maintenance Center', keys: ['Ctrl', 'Shift', 'M'] },
  
  // Settings & Tools
  { id: 'settings', name: 'Configuration Engine', keys: ['Ctrl', ','] },
  { id: 'shortcuts', name: 'Keyboard Shortcuts', keys: ['Ctrl', '/'] },
  { id: 'about', name: 'About Tyegit', keys: ['Ctrl', 'Shift', 'A'] }
];

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ onClose }) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[var(--tye-cream)] border-2 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] w-full max-w-xl max-h-[90vh] flex flex-col relative animate-slide-up">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-2 border-[var(--tye-ink)] bg-[var(--tye-lavender)] text-white">
          <div className="flex items-center gap-2">
            <RiKeyboardBoxLine className="w-5 h-5" />
            <h2 className="font-bold font-pixel text-lg tracking-tight">Keyboard Shortcuts</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/20 transition-colors"
          >
            <RiCloseLine className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto text-[var(--tye-ink)] bg-white">
          <p className="text-sm opacity-80 mb-6 font-mono">View global keybindings (`F-060`). Customization is coming soon.</p>
          
          <div className="flex flex-col gap-3">
            {defaultShortcuts.map(s => (
              <div key={s.id} className="flex justify-between items-center py-2 border-b border-[var(--tye-ink)]/10 last:border-0">
                <span className="font-bold text-sm">{s.name}</span>
                <div className="flex gap-1">
                  {s.keys.length > 0 ? s.keys.map((k, i) => (
                    <kbd key={i} className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono font-bold shadow-sm">
                      {k}
                    </kbd>
                  )) : (
                    <span className="text-xs font-mono opacity-50 italic">Unassigned</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-[var(--tye-ink)] bg-[var(--tye-cream)] flex justify-end">
          <button 
            onClick={onClose}
            className="tye-btn text-xs px-6 py-2 bg-white"
          >
            Close
          </button>
        </div>
        
      </div>
    </div>
  );
};
