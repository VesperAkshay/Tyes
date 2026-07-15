import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SshKey } from '../../types';
import { RiKey2Line, RiShieldKeyholeLine, RiAddLine, RiRefreshLine, RiCheckDoubleLine, RiFileCopyLine, RiTerminalBoxLine } from 'react-icons/ri';

export const SshKeyManager: React.FC = () => {
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  const showStatus = (text: string, isError = false) => {
    setStatusMsg({ text, isError });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  // Form states for keygen
  const [keyName, setKeyName] = useState('id_ed25519_tyegit');
  const [comment, setComment] = useState('user@tyegit');
  const [passphrase, setPassphrase] = useState('');
  const [generating, setGenerating] = useState(false);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const data: SshKey[] = await invoke('git:ssh_list_keys');
      setKeys(data);
    } catch (err: any) {
      showStatus(`Failed to list SSH keys: ${err}`, true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGenerating(true);
      const newKey: SshKey = await invoke('git:ssh_generate_key', {
        keyName,
        comment,
        passphrase,
      });
      showStatus(`Generated new Ed25519 key: ${newKey.path} (${newKey.fingerprint})`);
      setShowGenerate(false);
      setKeyName('id_ed25519_tyegit');
      setPassphrase('');
      fetchKeys();
    } catch (err: any) {
      showStatus(`Key generation failed: ${err}`, true);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showStatus('Copied to clipboard!');
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 bg-[var(--tye-cream)] text-[var(--tye-ink)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b-2 border-[var(--tye-ink)]">
        <div>
          <h1 className="text-3xl font-bold font-pixel tracking-tight">SSH Key Manager</h1>
          <p className="text-sm opacity-80 mt-1 font-mono">
            Discover `~/.ssh/` keys (`F-005`), inspect fingerprints, and generate high-security `Ed25519` credentials.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={fetchKeys} className="tye-btn text-xs bg-white flex items-center gap-1.5">
            <RiRefreshLine className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => setShowGenerate(true)} className="tye-btn tye-btn-primary flex items-center gap-2 text-sm">
            <RiAddLine className="w-4 h-4" /> Generate Ed25519 Key
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className={`mb-4 p-3 border-2 border-[var(--tye-ink)] font-mono text-xs flex items-center gap-2 animate-fade-in ${
          statusMsg.isError ? 'bg-red-100 text-red-900' : 'bg-green-100 text-green-900'
        }`}>
          <span className="font-bold flex-1">{statusMsg.text}</span>
        </div>
      )}

      {showGenerate && (
        <form onSubmit={handleGenerateKey} className="tye-card p-6 bg-white mb-6 border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)]">
          <div className="flex items-center justify-between mb-4 border-b pb-2 border-[var(--tye-ink)]">
            <h3 className="font-bold text-lg font-pixel flex items-center gap-2">
              <RiKey2Line className="w-5 h-5 text-[var(--tye-lavender)]" /> Generate New Ed25519 SSH Key Pair
            </h3>
            <button type="button" onClick={() => setShowGenerate(false)} className="text-xs font-mono font-bold hover:underline">
              [Close]
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-mono font-bold uppercase mb-1">Key Filename</label>
              <input
                type="text"
                value={keyName}
                onChange={e => setKeyName(e.target.value)}
                placeholder="id_ed25519"
                required
                className="w-full px-3 py-1.5 border border-[var(--tye-ink)] font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[var(--tye-lavender)]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-bold uppercase mb-1">Comment (-C)</label>
              <input
                type="text"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="user@device"
                required
                className="w-full px-3 py-1.5 border border-[var(--tye-ink)] font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[var(--tye-lavender)]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-bold uppercase mb-1">Passphrase (Optional)</label>
              <input
                type="password"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                placeholder="Leave blank for unencrypted"
                className="w-full px-3 py-1.5 border border-[var(--tye-ink)] font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[var(--tye-lavender)]"
              />
            </div>
          </div>

          <button type="submit" disabled={generating} className="tye-btn tye-btn-primary text-sm">
            {generating ? 'Executing ssh-keygen...' : 'Create Ed25519 Key Pair'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center font-mono text-sm">
          Scanning ~/.ssh/ directory...
        </div>
      ) : keys.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-[var(--tye-ink)] p-12 bg-white/50 text-center">
          <RiKey2Line className="w-12 h-12 mb-3 opacity-40" />
          <h3 className="font-bold text-lg mb-1">No SSH Keys Discovered</h3>
          <p className="text-sm opacity-70 mb-6 max-w-md font-mono">
            We scanned `~/.ssh/` but found no standard key pairs (`id_rsa`, `id_ed25519`, `id_ecdsa`).
          </p>
          <button onClick={() => setShowGenerate(true)} className="tye-btn tye-btn-primary text-sm">
            Generate Ed25519 Key
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {keys.map((k, idx) => (
            <div
              key={idx}
              className={`tye-card p-5 bg-white flex flex-col justify-between ${
                k.is_weak ? 'border-red-600 bg-red-50/30' : ''
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 font-bold text-base overflow-hidden">
                    <RiKey2Line className="w-5 h-5 text-[var(--tye-lavender)] flex-shrink-0" />
                    <span className="truncate font-mono">{k.path.split(/[\/\\]/).pop()}</span>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-mono font-bold uppercase border ${
                    k.is_weak ? 'bg-red-200 border-red-700 text-red-900' : 'bg-green-100 border-green-700 text-green-900'
                  }`}>
                    {k.key_type} ({k.size_bits} bit)
                  </span>
                </div>

                {k.is_weak && k.warning_message && (
                  <div className="mb-4 p-3 bg-red-100 border border-red-600 text-red-900 text-xs font-mono flex items-start gap-2">
                    <RiShieldKeyholeLine className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-700" />
                    <span>{k.warning_message}</span>
                  </div>
                )}

                <div className="bg-[var(--tye-cream)] p-3 border border-[var(--tye-ink)] font-mono text-xs mb-3">
                  <div className="flex items-center justify-between mb-1 opacity-60">
                    <span>SHA256 FINGERPRINT</span>
                    <button onClick={() => copyToClipboard(k.fingerprint)} className="hover:text-[var(--tye-ink)]">
                      <RiFileCopyLine className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="truncate font-bold text-[var(--tye-ink)]">{k.fingerprint}</div>
                </div>

                <div className="text-xs font-mono opacity-70 truncate mb-2" title={k.path}>
                  Path: {k.path}
                </div>
                {k.public_path && (
                  <div className="text-xs font-mono opacity-70 truncate" title={k.public_path}>
                    Pub: {k.public_path}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--tye-ink)]/20 flex justify-between items-center text-xs font-mono">
                {k.is_weak ? (
                  <span className="text-red-700 font-bold flex items-center gap-1">
                    <RiShieldKeyholeLine className="w-3.5 h-3.5" /> Security Upgrade Recommended
                  </span>
                ) : (
                  <span className="text-green-700 font-bold flex items-center gap-1">
                    <RiCheckDoubleLine className="w-3.5 h-3.5" /> Strong Cryptographic Strength
                  </span>
                )}
                <button
                  onClick={() => copyToClipboard(k.path)}
                  className="px-2 py-1 border border-[var(--tye-ink)] bg-white hover:bg-[var(--tye-lavender)] transition-colors"
                >
                  Copy Path
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
