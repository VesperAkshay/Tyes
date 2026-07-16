import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitConfigEntry, GitInstallation, RepoCard } from '../../types';
import { RiSettings4Line, RiSave3Line, RiRefreshLine, RiCheckDoubleLine, RiErrorWarningLine, RiShieldCheckLine, RiTerminalBoxLine } from 'react-icons/ri';

interface ConfigTabsProps {
  activeRepoPath?: string | null;
}

export const ConfigTabs: React.FC<ConfigTabsProps> = ({ activeRepoPath }) => {
  const [activeTab, setActiveTab] = useState<'system' | 'global' | 'local' | 'install'>('global');
  const [installation, setInstallation] = useState<GitInstallation | null>(null);
  const [systemEntries, setSystemEntries] = useState<GitConfigEntry[]>([]);
  const [globalEntries, setGlobalEntries] = useState<GitConfigEntry[]>([]);
  const [localPath, setLocalPath] = useState(activeRepoPath || '');
  const [localEntries, setLocalEntries] = useState<GitConfigEntry[]>([]);
  const [managedRepos, setManagedRepos] = useState<RepoCard[]>([]);
  const [newLocalKey, setNewLocalKey] = useState('');
  const [newLocalValue, setNewLocalValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [customGitPath, setCustomGitPath] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  const showStatus = (text: string, isError = false) => {
    setStatusMsg({ text, isError });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  // Form states for Global quick edit
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const fetchInstallation = async () => {
    try {
      const inst: GitInstallation = await invoke('git:installation_detect');
      setInstallation(inst);
      setCustomGitPath(inst.path);
    } catch (err: any) {
      console.error('Git detection error:', err);
    }
  };

  const fetchGlobal = async () => {
    try {
      setLoading(true);
      const data: GitConfigEntry[] = await invoke('git:config_get_global');
      setGlobalEntries(data);
      const nameEntry = data.find(e => e.key.toLowerCase() === 'user.name');
      const emailEntry = data.find(e => e.key.toLowerCase() === 'user.email');
      if (nameEntry) setUserName(nameEntry.value);
      if (emailEntry) setUserEmail(emailEntry.value);
    } catch (err: any) {
      showStatus(`Failed to fetch global config: ${err}`, true);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystem = async () => {
    try {
      setLoading(true);
      const data: GitConfigEntry[] = await invoke('git:config_get_system');
      setSystemEntries(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchManagedRepos = async () => {
    try {
      const data: RepoCard[] = await invoke('git:dashboard_get_repos');
      setManagedRepos(data);
      if (activeRepoPath && !localPath) {
        setLocalPath(activeRepoPath);
      } else if (!localPath && data.length > 0) {
        setLocalPath(data[0].path);
      }
    } catch (err: any) {
      console.error('Failed to load managed repos:', err);
    }
  };

  const fetchLocal = async (pathToLoad = localPath) => {
    if (!pathToLoad) return;
    try {
      setLoading(true);
      const data: GitConfigEntry[] = await invoke('git:config_get_local', { path: pathToLoad });
      setLocalEntries(data);
    } catch (err: any) {
      showStatus(`Failed to read local config for ${pathToLoad}: ${err}`, true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstallation();
    fetchGlobal();
    fetchSystem();
    fetchManagedRepos();
  }, [activeRepoPath]);

  useEffect(() => {
    if (activeTab === 'local' && localPath) {
      fetchLocal(localPath);
    }
  }, [activeTab, localPath]);

  const handleSetLocalEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPath || !newLocalKey || !newLocalValue) return;
    try {
      await invoke('git:config_set_local', { path: localPath, key: newLocalKey, value: newLocalValue });
      setNewLocalKey('');
      setNewLocalValue('');
      fetchLocal(localPath);
      showStatus(`Saved local override (${newLocalKey} = ${newLocalValue}) to ${localPath}/.git/config`);
    } catch (err: any) {
      showStatus(`Error saving local entry: ${err}`, true);
    }
  };

  const handleSaveGlobalIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (userName) await invoke('git:config_set_global', { key: 'user.name', value: userName });
      if (userEmail) await invoke('git:config_set_global', { key: 'user.email', value: userEmail });
      fetchGlobal();
      showStatus('Global identity updated! (~/.gitconfig safely backed up to ~/.gitconfig.backup)');
    } catch (err: any) {
      showStatus(`Error saving identity: ${err}`, true);
    }
  };

  const handleSetGlobalEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey || !newValue) return;
    try {
      await invoke('git:config_set_global', { key: newKey, value: newValue });
      setNewKey('');
      setNewValue('');
      fetchGlobal();
      showStatus(`Applied setting: ${newKey} = ${newValue}`);
    } catch (err: any) {
      showStatus(`Error: ${err}`, true);
    }
  };

  const handleSetCustomGitPath = async () => {
    try {
      const inst: GitInstallation = await invoke('git:installation_set_path', { path: customGitPath });
      setInstallation(inst);
      showStatus(`Successfully updated Git path to ${inst.path} (${inst.version})`);
    } catch (err: any) {
      showStatus(`Failed to set Git path: ${err}`, true);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 bg-[var(--tye-cream)] text-[var(--tye-ink)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b-2 border-[var(--tye-ink)]">
        <div>
          <h1 className="text-3xl font-bold font-pixel tracking-tight">Configuration Engine</h1>
          <p className="text-sm opacity-80 mt-1 font-mono">
            Manage Git Installation (`F-001`), System (`F-002`), Global (`F-003`), and Local (`F-004`) configs.
          </p>
        </div>

        {installation && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-[var(--tye-ink)] font-mono text-xs shadow-[2px_2px_0px_0px_var(--tye-ink)]">
            <RiCheckDoubleLine className="w-4 h-4 text-green-700" />
            <span>Git {installation.version}</span>
            {installation.is_portable && <span className="bg-[var(--tye-lavender)]/40 px-1 font-bold">Portable</span>}
          </div>
        )}
      </div>

      {statusMsg && (
        <div className={`mb-4 p-3 border-2 border-[var(--tye-ink)] font-mono text-xs flex items-center gap-2 animate-fade-in ${
          statusMsg.isError ? 'bg-red-100 text-red-900' : 'bg-green-100 text-green-900'
        }`}>
          {statusMsg.isError ? <RiErrorWarningLine className="w-4 h-4 text-red-700 flex-shrink-0" /> : <RiCheckDoubleLine className="w-4 h-4 text-green-700 flex-shrink-0" />}
          <span className="font-bold flex-1">{statusMsg.text}</span>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="flex gap-2 mb-6 border-b-2 border-[var(--tye-ink)] pb-2 font-mono text-sm">
        <button
          onClick={() => setActiveTab('global')}
          className={`px-4 py-2 font-bold transition-colors ${
            activeTab === 'global' ? 'bg-[var(--tye-lavender)] border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]' : 'hover:bg-white/50'
          }`}
        >
          Global (~/.gitconfig)
        </button>
        <button
          onClick={() => setActiveTab('local')}
          className={`px-4 py-2 font-bold transition-colors ${
            activeTab === 'local' ? 'bg-[var(--tye-lavender)] border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]' : 'hover:bg-white/50'
          }`}
        >
          Local (.git/config)
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 font-bold transition-colors ${
            activeTab === 'system' ? 'bg-[var(--tye-lavender)] border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]' : 'hover:bg-white/50'
          }`}
        >
          System Config
        </button>
        <button
          onClick={() => setActiveTab('install')}
          className={`px-4 py-2 font-bold transition-colors ${
            activeTab === 'install' ? 'bg-[var(--tye-lavender)] border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]' : 'hover:bg-white/50'
          }`}
        >
          Git Installation
        </button>
      </div>

      {/* Tab 1: Global Config */}
      {activeTab === 'global' && (
        <div className="flex flex-col gap-6">
          <div className="p-4 bg-white border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RiShieldCheckLine className="w-6 h-6 text-green-700" />
              <div>
                <h3 className="font-bold text-sm">Safety Backup Protection Active (`F-003`)</h3>
                <p className="text-xs font-mono opacity-70">
                  Every modification made via Tyegit automatically backs up `~/.gitconfig` to `~/.gitconfig.backup` first.
                </p>
              </div>
            </div>
            <button onClick={fetchGlobal} className="tye-btn text-xs bg-white flex items-center gap-1">
              <RiRefreshLine className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Quick User Identity Form */}
            <form onSubmit={handleSaveGlobalIdentity} className="tye-card p-5 bg-white flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-base mb-3 flex items-center gap-2">
                  <RiSettings4Line className="w-4 h-4 text-[var(--tye-lavender)]" /> User Identity (user.*)
                </h3>
                <div className="flex flex-col gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-mono font-bold uppercase mb-1">User Name (`user.name`)</label>
                    <input
                      type="text"
                      value={userName}
                      onChange={e => setUserName(e.target.value)}
                      placeholder="e.g. Linus Torvalds"
                      className="w-full px-3 py-1.5 border border-[var(--tye-ink)] font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[var(--tye-lavender)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono font-bold uppercase mb-1">User Email (`user.email`)</label>
                    <input
                      type="email"
                      value={userEmail}
                      onChange={e => setUserEmail(e.target.value)}
                      placeholder="e.g. torvalds@linux-foundation.org"
                      className="w-full px-3 py-1.5 border border-[var(--tye-ink)] font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[var(--tye-lavender)]"
                    />
                  </div>
                </div>
              </div>
              <button type="submit" className="tye-btn tye-btn-primary self-start flex items-center gap-2 text-sm">
                <RiSave3Line className="w-4 h-4" /> Save Identity
              </button>
            </form>

            {/* Add Arbitrary Key-Value */}
            <form onSubmit={handleSetGlobalEntry} className="tye-card p-5 bg-white flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-base mb-3 flex items-center gap-2">
                  <RiTerminalBoxLine className="w-4 h-4 text-[var(--tye-lavender)]" /> Add/Update Config Entry
                </h3>
                <div className="flex flex-col gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-mono font-bold uppercase mb-1">Config Key</label>
                    <input
                      type="text"
                      value={newKey}
                      onChange={e => setNewKey(e.target.value)}
                      placeholder="e.g. core.editor or alias.st"
                      className="w-full px-3 py-1.5 border border-[var(--tye-ink)] font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[var(--tye-lavender)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono font-bold uppercase mb-1">Value</label>
                    <input
                      type="text"
                      value={newValue}
                      onChange={e => setNewValue(e.target.value)}
                      placeholder="e.g. code --wait or status -sb"
                      className="w-full px-3 py-1.5 border border-[var(--tye-ink)] font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[var(--tye-lavender)]"
                    />
                  </div>
                </div>
              </div>
              <button type="submit" className="tye-btn self-start flex items-center gap-2 text-sm bg-white">
                <RiSave3Line className="w-4 h-4" /> Apply Setting
              </button>
            </form>
          </div>

          {/* Table of All Global Entries */}
          <div className="tye-card p-5 bg-white">
            <h3 className="font-bold text-base mb-3 font-mono">All Global & XDG Settings ({globalEntries.length})</h3>
            <div className="overflow-x-auto max-h-80 overflow-y-auto border border-[var(--tye-ink)]">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead className="bg-[var(--tye-cream)] border-b border-[var(--tye-ink)] sticky top-0">
                  <tr>
                    <th className="p-2.5 border-r border-[var(--tye-ink)]">Key</th>
                    <th className="p-2.5 border-r border-[var(--tye-ink)]">Level</th>
                    <th className="p-2.5">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {globalEntries.map((e, idx) => (
                    <tr key={idx} className={`border-b border-[var(--tye-ink)]/20 ${e.is_critical ? 'bg-yellow-50 font-bold' : ''}`}>
                      <td className="p-2.5 border-r border-[var(--tye-ink)]/20 text-[var(--tye-lavender)] font-bold">{e.key}</td>
                      <td className="p-2.5 border-r border-[var(--tye-ink)]/20 uppercase text-[10px]">{e.level}</td>
                      <td className="p-2.5 break-all">{e.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Local Config */}
      {activeTab === 'local' && (
        <div className="flex flex-col gap-6">
          <div className="tye-card p-5 bg-white">
            <h3 className="font-bold text-base mb-2 font-mono">Inspect & Modify Repository Local Config (`.git/config`)</h3>
            <p className="text-xs font-mono opacity-70 mb-4">
              Select any managed repository from your workspace to view and edit its local `.git/config` settings (`F-004`).
            </p>
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
              <div className="flex-1 relative">
                <select
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[var(--tye-cream)] border-2 border-[var(--tye-ink)] font-mono text-sm shadow-[3px_3px_0px_0px_var(--tye-ink)] focus:outline-none cursor-pointer"
                >
                  <option value="" disabled>-- Select a Managed Repository --</option>
                  {managedRepos.map((repo) => (
                    <option key={repo.id} value={repo.path}>
                      {repo.name} ({repo.path})
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => fetchLocal(localPath)}
                disabled={!localPath || loading}
                className="tye-btn tye-btn-primary text-sm flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <RiRefreshLine className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Reload Config</span>
              </button>
            </div>
          </div>

          {localEntries.length > 0 && (
            <>
              <div className="tye-card p-5 bg-white">
                <h3 className="font-bold text-base mb-3 font-mono">Local Repository Config ({localEntries.length})</h3>
                <div className="overflow-x-auto max-h-80 overflow-y-auto border border-[var(--tye-ink)]">
                  <table className="w-full text-left font-mono text-xs border-collapse">
                    <thead className="bg-[var(--tye-cream)] border-b border-[var(--tye-ink)] sticky top-0">
                      <tr>
                        <th className="p-2.5 border-r border-[var(--tye-ink)]">Key</th>
                        <th className="p-2.5 border-r border-[var(--tye-ink)]">Level</th>
                        <th className="p-2.5">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {localEntries.map((e, idx) => (
                        <tr key={idx} className="border-b border-[var(--tye-ink)]/20">
                          <td className="p-2.5 border-r border-[var(--tye-ink)]/20 font-bold text-[var(--tye-lavender)]">{e.key}</td>
                          <td className="p-2.5 border-r border-[var(--tye-ink)]/20 uppercase text-[10px]">{e.level}</td>
                          <td className="p-2.5 break-all">{e.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Quick Set Local Setting */}
              <div className="tye-card p-5 bg-white border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)]">
                <h3 className="font-bold text-base mb-2 font-mono text-[var(--tye-ink)]">
                  Add / Override Local Setting (`.git/config`)
                </h3>
                <p className="text-xs font-mono opacity-70 mb-4">
                  Set a repository-specific setting (e.g. override `user.name` or `user.email` just for this repository).
                </p>
                <form onSubmit={handleSetLocalEntry} className="flex flex-col md:flex-row gap-3">
                  <input
                    type="text"
                    placeholder="e.g. user.name or core.autocrlf"
                    value={newLocalKey}
                    onChange={e => setNewLocalKey(e.target.value)}
                    className="px-3 py-2 border-2 border-[var(--tye-ink)] font-mono text-xs flex-1 bg-[var(--tye-cream)]"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Value (e.g. Tye Developer or true)"
                    value={newLocalValue}
                    onChange={e => setNewLocalValue(e.target.value)}
                    className="px-3 py-2 border-2 border-[var(--tye-ink)] font-mono text-xs flex-1 bg-[var(--tye-cream)]"
                    required
                  />
                  <button type="submit" className="tye-btn tye-btn-primary text-xs flex items-center justify-center gap-1.5 whitespace-nowrap">
                    <RiSave3Line className="w-4 h-4" /> Save Override
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 3: System Config */}
      {activeTab === 'system' && (
        <div className="tye-card p-5 bg-white">
          <h3 className="font-bold text-base mb-3 font-mono">Machine System Config (`git config --system`)</h3>
          <div className="overflow-x-auto max-h-96 overflow-y-auto border border-[var(--tye-ink)]">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead className="bg-[var(--tye-cream)] border-b border-[var(--tye-ink)] sticky top-0">
                <tr>
                  <th className="p-2.5 border-r border-[var(--tye-ink)]">Key</th>
                  <th className="p-2.5">Value</th>
                </tr>
              </thead>
              <tbody>
                {systemEntries.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="p-4 text-center opacity-60">No system-wide settings found.</td>
                  </tr>
                ) : systemEntries.map((e, idx) => (
                  <tr key={idx} className="border-b border-[var(--tye-ink)]/20">
                    <td className="p-2.5 border-r border-[var(--tye-ink)]/20 font-bold">{e.key}</td>
                    <td className="p-2.5 break-all">{e.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Git Installation */}
      {activeTab === 'install' && installation && (
        <div className="flex flex-col gap-6">
          <div className="tye-card p-6 bg-white flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <RiTerminalBoxLine className="w-8 h-8 text-[var(--tye-lavender)]" />
              <div>
                <h3 className="font-bold text-lg font-pixel">Git Executable Status (`F-001`)</h3>
                <p className="text-sm font-mono opacity-80">Version: {installation.version}</p>
              </div>
            </div>

            <div className="bg-[var(--tye-cream)] p-4 border border-[var(--tye-ink)] font-mono text-xs flex flex-col gap-2">
              <div><span className="font-bold">Detected Path:</span> {installation.path}</div>
              <div><span className="font-bold">Minimum Requirement:</span> 2.20.0 ({installation.is_valid ? '✅ Valid' : '❌ Too Low'})</div>
              <div><span className="font-bold">Portable Distribution:</span> {installation.is_portable ? 'Yes' : 'No'}</div>
            </div>

            <div className="pt-2 border-t border-[var(--tye-ink)]/20">
              <h4 className="font-bold text-sm mb-2">Override Git Executable Path</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customGitPath}
                  onChange={e => setCustomGitPath(e.target.value)}
                  placeholder="e.g. C:\Program Files\Git\bin\git.exe"
                  className="flex-1 px-3 py-2 border border-[var(--tye-ink)] font-mono text-sm"
                />
                <button onClick={handleSetCustomGitPath} className="tye-btn tye-btn-primary text-sm">
                  Save Override
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
