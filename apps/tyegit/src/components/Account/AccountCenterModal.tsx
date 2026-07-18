import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiGithubFill, RiGitlabFill, RiDeleteBin2Line, RiRefreshLine, RiCloseLine, RiUser3Line, RiBitCoinLine } from 'react-icons/ri';
import { FaBitbucket } from 'react-icons/fa';
import { HostingAccount } from '../../types';

interface AccountCenterModalProps {
  onClose: () => void;
  onAccountsChanged: (accounts: HostingAccount[]) => void;
}

export const AccountCenterModal: React.FC<AccountCenterModalProps> = ({ onClose, onAccountsChanged }) => {
  const [accounts, setAccounts] = useState<HostingAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const items = await invoke<HostingAccount[]>('git:hosting_list_accounts');
      setAccounts(items);
      onAccountsChanged(items);
    } catch (err: any) {
      showStatus(`Failed to load accounts: ${err}`, true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const showStatus = (text: string, isError = false) => {
    setStatusMsg({ text, isError });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const handleOAuthLogin = async (provider: string) => {
    try {
      showStatus(`Starting OAuth flow for ${provider}... Please check your browser.`);
      const newAccount = await invoke<HostingAccount>('git:hosting_start_oauth', { provider });
      showStatus(`Successfully connected ${provider} account: ${newAccount.username}`);
      fetchAccounts();
    } catch (err: any) {
      showStatus(`OAuth failed: ${err}`, true);
    }
  };

  const handleRemoveAccount = async (id: string, username: string) => {
    if (!confirm(`Are you sure you want to disconnect ${username}?`)) return;
    try {
      await invoke('git:hosting_remove_account', { accountId: id });
      showStatus(`Disconnected account ${username}`);
      fetchAccounts();
    } catch (err: any) {
      showStatus(`Failed to remove account: ${err}`, true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--tye-cream)] border-2 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] w-full max-w-2xl max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-2 border-[var(--tye-ink)] bg-white">
          <div className="flex items-center gap-3">
            <RiUser3Line className="text-2xl text-[var(--tye-lavender)]" />
            <h2 className="font-pixel text-2xl font-bold">Account Center</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--tye-cream)] border-2 border-transparent hover:border-[var(--tye-ink)] transition-colors"
          >
            <RiCloseLine className="text-2xl" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          <p className="font-mono text-sm opacity-80 mb-6">
            Connect your GitHub or GitLab accounts to enable Pull Requests, Issue Tracking, and quick cloning. 
            Credentials are encrypted and stored securely in the local OS keyring.
          </p>

          {statusMsg && (
            <div
              className={`p-3 mb-6 border-2 font-mono text-xs shadow-[2px_2px_0px_0px_var(--tye-ink)] flex items-center justify-between ${
                statusMsg.isError
                  ? 'bg-rose-100 border-rose-800 text-rose-900'
                  : 'bg-emerald-100 border-emerald-800 text-emerald-900'
              }`}
            >
              <span className="font-bold">{statusMsg.text}</span>
              <button onClick={() => setStatusMsg(null)} className="font-bold ml-4">✕</button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* GitHub Card */}
            <div className="bg-white border-2 border-[var(--tye-ink)] p-4 flex flex-col items-center text-center shadow-[4px_4px_0px_0px_var(--tye-ink)]">
              <RiGithubFill className="w-10 h-10 mb-2 text-[var(--tye-ink)]" />
              <h3 className="font-pixel text-lg font-bold mb-1">GitHub</h3>
              <p className="font-mono text-xs opacity-70 mb-4">Connect to GitHub.com</p>
              <button
                onClick={() => handleOAuthLogin('github')}
                className="tye-btn bg-[var(--tye-ink)] text-white hover:bg-[var(--tye-ink)]/80 flex items-center gap-2 w-full justify-center"
              >
                <RiGithubFill className="w-4 h-4" />
                <span>Login with GitHub</span>
              </button>
            </div>

            {/* GitLab Card */}
            <div className="bg-white border-2 border-[var(--tye-ink)] p-4 flex flex-col items-center text-center shadow-[4px_4px_0px_0px_var(--tye-ink)]">
              <RiGitlabFill className="w-10 h-10 mb-2 text-orange-600" />
              <h3 className="font-pixel text-lg font-bold mb-1">GitLab</h3>
              <p className="font-mono text-xs opacity-70 mb-4">Connect to GitLab.com</p>
              <button
                onClick={() => handleOAuthLogin('gitlab')}
                className="tye-btn bg-orange-600 text-white hover:bg-orange-700 border-orange-800 flex items-center gap-2 w-full justify-center"
              >
                <RiGitlabFill className="w-4 h-4" />
                <span>Login with GitLab</span>
              </button>
            </div>

            {/* Bitbucket Card */}
            <div className="bg-white border-2 border-[var(--tye-ink)] p-4 flex flex-col items-center text-center shadow-[4px_4px_0px_0px_var(--tye-ink)]">
              <FaBitbucket className="w-10 h-10 mb-2 text-blue-600" />
              <h3 className="font-pixel text-lg font-bold mb-1">Bitbucket</h3>
              <p className="font-mono text-xs opacity-70 mb-4">Connect to Bitbucket.org</p>
              <button
                onClick={() => handleOAuthLogin('bitbucket')}
                className="tye-btn bg-blue-600 text-white hover:bg-blue-700 border-blue-800 flex items-center gap-2 w-full justify-center"
              >
                <FaBitbucket className="w-4 h-4" />
                <span>Login with Bitbucket</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-[var(--tye-ink)]/20">
            <h3 className="font-pixel text-xl font-bold">Connected Accounts</h3>
            <button
              onClick={fetchAccounts}
              className="p-1.5 hover:bg-[var(--tye-ink)] hover:text-white transition-colors border border-transparent hover:border-[var(--tye-ink)]"
              title="Refresh Accounts"
            >
              <RiRefreshLine className="w-5 h-5" />
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-center font-mono text-sm opacity-70">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="py-8 text-center bg-white border-2 border-[var(--tye-ink)] border-dashed font-mono text-sm opacity-70">
              No accounts connected yet.
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.map(account => (
                <div
                  key={account.id}
                  className="bg-white border-2 border-[var(--tye-ink)] p-4 shadow-[4px_4px_0px_0px_var(--tye-ink)] flex items-center gap-4"
                >
                  {account.avatar_url ? (
                    <img
                      src={account.avatar_url}
                      alt={account.username}
                      className="w-12 h-12 rounded-none border-2 border-[var(--tye-ink)]"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-[var(--tye-cream)] border-2 border-[var(--tye-ink)] flex items-center justify-center">
                      {account.provider === 'github' ? <RiGithubFill className="w-6 h-6" /> : <RiGitlabFill className="w-6 h-6" />}
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-pixel font-bold text-lg">{account.username}</span>
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-[var(--tye-lavender)] text-white">
                        {account.provider}
                      </span>
                    </div>
                    <div className="font-mono text-xs opacity-70 mt-1">{account.base_url}</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-700">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </div>
                    <button
                      onClick={() => handleRemoveAccount(account.id, account.username)}
                      className="p-2 border-2 border-[var(--tye-ink)] hover:bg-rose-600 hover:text-white transition-colors hover:border-rose-800"
                      title="Disconnect Account"
                    >
                      <RiDeleteBin2Line className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
