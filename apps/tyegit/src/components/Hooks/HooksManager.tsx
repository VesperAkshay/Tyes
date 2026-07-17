import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiTerminalBoxLine, RiSave3Line, RiPlayCircleLine } from 'react-icons/ri';

interface Hook {
  name: string;
  path: string;
  is_enabled: boolean;
  content: string;
}

interface HooksManagerProps {
  repoPath: string;
}

export const HooksManager: React.FC<HooksManagerProps> = ({ repoPath }) => {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [selectedHook, setSelectedHook] = useState<Hook | null>(null);
  const [editorContent, setEditorContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchHooks = async () => {
    try {
      const data: Hook[] = await invoke('git:hook_list', { repoPath });
      setHooks(data);
      if (selectedHook) {
        const updated = data.find(h => h.name === selectedHook.name);
        if (updated) {
          setSelectedHook(updated);
          setEditorContent(updated.content);
        }
      } else if (data.length > 0) {
        setSelectedHook(data[0]);
        setEditorContent(data[0].content);
      }
    } catch (err: any) {
      console.error('Failed to fetch hooks:', err);
    }
  };

  useEffect(() => {
    fetchHooks();
  }, [repoPath]);

  const handleToggle = async (hook: Hook) => {
    try {
      await invoke('git:hook_toggle', { repoPath, name: hook.name, enable: !hook.is_enabled });
      fetchHooks();
    } catch (err: any) {
      alert(`Toggle failed: ${err}`);
    }
  };

  const handleSave = async () => {
    if (!selectedHook) return;
    setIsSaving(true);
    try {
      await invoke('git:hook_edit', { repoPath, name: selectedHook.name, content: editorContent });
      await fetchHooks();
    } catch (err: any) {
      alert(`Save failed: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full bg-[var(--tye-cream)] overflow-hidden">
      {/* Left Sidebar: Hooks List */}
      <div className="w-1/3 h-full border-r-2 border-[var(--tye-ink)] flex flex-col bg-white">
        <div className="p-4 border-b-2 border-[var(--tye-ink)] bg-[var(--tye-cream)] flex items-center gap-2">
          <RiTerminalBoxLine className="text-xl" />
          <h2 className="font-pixel text-lg">Git Hooks</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {hooks.map(hook => (
            <div 
              key={hook.name}
              onClick={() => {
                setSelectedHook(hook);
                setEditorContent(hook.content);
              }}
              className={`p-3 mb-2 cursor-pointer border-2 transition-colors flex items-center justify-between ${
                selectedHook?.name === hook.name 
                  ? 'border-[var(--tye-ink)] bg-[var(--tye-lavender)]/10 shadow-[2px_2px_0px_var(--tye-ink)]' 
                  : 'border-transparent hover:border-[var(--tye-ink)]/30'
              }`}
            >
              <span className="font-mono text-sm font-bold">{hook.name}</span>
              <div 
                className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in"
                onClick={(e) => { e.stopPropagation(); handleToggle(hook); }}
              >
                <input 
                  type="checkbox" 
                  checked={hook.is_enabled} 
                  readOnly
                  className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-2 border-[var(--tye-ink)] appearance-none cursor-pointer transition-transform duration-200 ease-in-out"
                  style={{ transform: hook.is_enabled ? 'translateX(100%)' : 'translateX(0)' }}
                />
                <label className={`toggle-label block overflow-hidden h-5 rounded-full border-2 border-[var(--tye-ink)] cursor-pointer ${hook.is_enabled ? 'bg-green-400' : 'bg-gray-300'}`}></label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Area: Editor */}
      <div className="w-2/3 h-full flex flex-col">
        {selectedHook ? (
          <>
            <div className="p-4 border-b-2 border-[var(--tye-ink)] flex items-center justify-between bg-white">
              <div>
                <h3 className="font-mono font-bold text-lg">{selectedHook.name}</h3>
                <span className="text-xs font-mono text-gray-500">{selectedHook.path}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-3 py-1.5 bg-[var(--tye-ink)] text-white hover:bg-black font-mono text-xs font-bold flex items-center gap-1 shadow-[2px_2px_0px_var(--tye-lavender)]"
                >
                  <RiSave3Line /> {isSaving ? 'Saving...' : 'Save Script'}
                </button>
              </div>
            </div>
            <textarea
              className="flex-1 w-full p-4 font-mono text-sm bg-[#1E1E1E] text-[#D4D4D4] outline-none resize-none"
              value={editorContent}
              onChange={(e) => setEditorContent(e.target.value)}
              spellCheck={false}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center font-mono text-gray-500">
            Select a hook to edit
          </div>
        )}
      </div>
    </div>
  );
};
