import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiPlugLine, RiRefreshLine, RiDownloadCloud2Line, RiDeleteBinLine } from 'react-icons/ri';

interface PluginManifest {
  name: string;
  version: string;
  author: string;
  entry_point: string;
  permissions: string[];
  hooks: string[];
}

interface RemotePluginManifest extends PluginManifest {
  id: string;
  description: string;
  download_url: string;
}

export const PluginManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'installed' | 'marketplace'>('installed');
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [remotePlugins, setRemotePlugins] = useState<RemotePluginManifest[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const fetchInstalledPlugins = async () => {
    setLoading(true);
    try {
      const data: PluginManifest[] = await invoke('git:plugin_list');
      setPlugins(data);
    } catch (e) {
      console.error("Error fetching local plugins:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchRemotePlugins = async () => {
    setLoading(true);
    try {
      const data: RemotePluginManifest[] = await invoke('git:plugin_marketplace_list');
      setRemotePlugins(data);
    } catch (e) {
      console.error("Error fetching marketplace:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'installed') {
      fetchInstalledPlugins();
    } else {
      fetchRemotePlugins();
    }
  }, [activeTab]);

  const handleInstall = async (plugin: RemotePluginManifest) => {
    setInstallingId(plugin.id);
    try {
      await invoke('git:plugin_install', { id: plugin.id, downloadUrl: plugin.download_url });
      // Switch back to installed tab after success
      setActiveTab('installed');
    } catch (e) {
      console.error("Failed to install plugin:", e);
      alert("Failed to install plugin: " + e);
    } finally {
      setInstallingId(null);
    }
  };

  const handleUninstall = async (pluginName: string) => {
    try {
      const id = pluginName.toLowerCase().replace(/ /g, '-');
      await invoke('git:plugin_uninstall', { id });
      fetchInstalledPlugins();
    } catch (e) {
      console.error("Failed to uninstall plugin:", e);
      alert("Failed to uninstall: " + e);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 bg-[var(--tye-cream)] text-[var(--tye-ink)]">
      <div className="flex items-center justify-between mb-4 pb-4 border-b-2 border-[var(--tye-ink)]">
        <div>
          <h1 className="text-3xl font-bold font-pixel tracking-tight">Plugin System</h1>
          <p className="text-sm opacity-80 mt-1 font-mono">Manage first-party extensions.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => invoke('git:open_plugins_folder')} className="tye-btn text-xs bg-white flex items-center gap-1 border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] font-bold px-3 py-1">
            <RiPlugLine className="w-3.5 h-3.5" /> Open Folder
          </button>
          <button onClick={activeTab === 'installed' ? fetchInstalledPlugins : fetchRemotePlugins} className="tye-btn text-xs bg-white flex items-center gap-1 border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] font-bold px-3 py-1">
            <RiRefreshLine className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-4 border-b-2 border-[var(--tye-ink)]">
        <button 
          onClick={() => setActiveTab('installed')} 
          className={`px-4 py-2 font-bold font-mono text-sm ${activeTab === 'installed' ? 'bg-[var(--tye-ink)] text-white' : 'bg-transparent text-[var(--tye-ink)] hover:bg-gray-200'} transition-colors border-2 border-b-0 border-transparent`}
        >
          Installed
        </button>
        <button 
          onClick={() => setActiveTab('marketplace')} 
          className={`px-4 py-2 font-bold font-mono text-sm flex items-center gap-2 ${activeTab === 'marketplace' ? 'bg-[var(--tye-mustard)] border-2 border-[var(--tye-ink)] border-b-0' : 'bg-transparent text-[var(--tye-ink)] hover:bg-gray-200'} transition-colors`}
        >
          <RiDownloadCloud2Line /> First-Party Extensions
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {loading && <div className="p-4 text-center font-mono opacity-60">Loading...</div>}

        {!loading && activeTab === 'installed' && plugins.length === 0 && (
          <div className="p-8 border-2 border-dashed border-[var(--tye-ink)] flex flex-col items-center justify-center opacity-60">
            <RiPlugLine className="w-8 h-8 mb-2" />
            <p className="font-mono text-sm">No plugins installed.</p>
            <button onClick={() => setActiveTab('marketplace')} className="mt-4 text-xs underline text-blue-600 font-bold">Browse Extensions</button>
          </div>
        )}

        {!loading && activeTab === 'installed' && plugins.map(p => (
          <div key={p.name} className="tye-card bg-white p-4 flex justify-between items-center border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
            <div>
              <h3 className="font-bold text-lg">{p.name} <span className="text-xs font-mono bg-gray-200 px-1 border border-gray-400">{p.version}</span></h3>
              <p className="text-sm opacity-70">By {p.author}</p>
              <div className="flex gap-2 mt-2">
                {p.hooks.map(h => <span key={h} className="text-[10px] bg-[var(--tye-lavender)] px-1 font-mono border border-[var(--tye-ink)]">{h}</span>)}
              </div>
            </div>
            <div className="flex items-center gap-4">
               <label className="relative inline-flex items-center cursor-pointer border-2 border-[var(--tye-ink)] rounded-full">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--tye-ink)]"></div>
              </label>
              <button onClick={() => handleUninstall(p.name)} className="text-red-500 hover:text-red-700 hover:bg-red-100 p-2 rounded-full transition-colors">
                <RiDeleteBinLine className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}

        {!loading && activeTab === 'marketplace' && remotePlugins.map(p => (
          <div key={p.id} className="tye-card bg-[var(--tye-cream)] p-4 flex justify-between items-center border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg">{p.name}</h3>
                <span className="text-[10px] bg-[var(--tye-mustard)] border border-[var(--tye-ink)] px-1 font-bold">OFFICIAL</span>
              </div>
              <p className="text-sm mt-1">{p.description}</p>
              <p className="text-xs opacity-60 mt-1 font-mono">v{p.version}</p>
            </div>
            <div>
              <button 
                onClick={() => handleInstall(p)} 
                disabled={installingId === p.id}
                className="tye-btn text-xs bg-[var(--tye-ink)] text-white flex items-center gap-1 border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-mustard)] font-bold px-4 py-2 disabled:opacity-50"
              >
                {installingId === p.id ? "Installing..." : "Install"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
