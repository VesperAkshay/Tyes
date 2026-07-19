import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiPlugLine, RiRefreshLine } from 'react-icons/ri';

interface PluginManifest {
  name: string;
  version: string;
  author: string;
  entry_point: string;
  permissions: string[];
  hooks: string[];
}

export const PluginManager: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPlugins = async () => {
    setLoading(true);
    try {
      const data: PluginManifest[] = await invoke('git:plugin_list');
      setPlugins(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlugins();
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 bg-[var(--tye-cream)] text-[var(--tye-ink)]">
      <div className="flex items-center justify-between mb-4 pb-4 border-b-2 border-[var(--tye-ink)]">
        <div>
          <h1 className="text-3xl font-bold font-pixel tracking-tight">Plugin System (F-057)</h1>
          <p className="text-sm opacity-80 mt-1 font-mono">Manage installed Extism WASM plugins.</p>
        </div>
        <button onClick={fetchPlugins} className="tye-btn text-xs bg-white flex items-center gap-1">
          <RiRefreshLine className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {plugins.length === 0 && !loading && (
          <div className="p-8 border-2 border-dashed border-[var(--tye-ink)] flex flex-col items-center justify-center opacity-60">
            <RiPlugLine className="w-8 h-8 mb-2" />
            <p className="font-mono text-sm">No plugins installed.</p>
          </div>
        )}
        {plugins.map(p => (
          <div key={p.name} className="tye-card bg-white p-4 flex justify-between items-center border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
            <div>
              <h3 className="font-bold text-lg">{p.name} <span className="text-xs font-mono bg-gray-200 px-1 border border-gray-400">{p.version}</span></h3>
              <p className="text-sm opacity-70">By {p.author}</p>
              <div className="flex gap-2 mt-2">
                {p.hooks.map(h => <span key={h} className="text-[10px] bg-[var(--tye-lavender)] px-1 font-mono border border-[var(--tye-ink)]">{h}</span>)}
              </div>
            </div>
            <div>
               <label className="relative inline-flex items-center cursor-pointer border-2 border-[var(--tye-ink)] rounded-full">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--tye-ink)]"></div>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
