import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AppShell } from '@tyes/design-system';
import { Dashboard } from './components/Dashboard';
import { ConfigTabs } from './components/Settings/ConfigTabs';
import { SshKeyManager } from './components/Settings/SshKeyManager';
import { WorkspaceView } from './components/WorkspaceView';
import { InitRepoModal } from './components/Modals/InitRepoModal';
import { CloneRepoModal } from './components/Modals/CloneRepoModal';
import { AutoDiscoveryModal } from './components/Modals/AutoDiscoveryModal';
import { AboutModal } from './components/Modals/AboutModal';
import { RiDashboardLine, RiSettings4Line, RiKey2Line, RiGitCommitLine, RiCheckDoubleLine, RiCloseLine, RiMenuFoldLine, RiMenuUnfoldLine, RiInformationLine } from 'react-icons/ri';
import tyegitLogo from './assets/logo.png';

export default function App() {
  const [activeView, setActiveView] = useState<'dashboard' | 'config' | 'ssh' | 'workspace'>('dashboard');
  const [activeRepoPath, setActiveRepoPath] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  // Modal toggles
  const [showInitModal, setShowInitModal] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);

  // Non-blocking sleek notification state instead of browser alerts
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 4500);
  };

  const handleOpenRepo = async (path: string) => {
    try {
      await invoke('git:repo_open', { path });
    } catch (err) {
      console.error('Failed to update repository last_opened timestamp:', err);
    }
    showToast(`Set active workspace context to ${path}`);
    setActiveRepoPath(path);
    setActiveView('workspace');
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <AppShell modules={["git"]} logoUrl={tyegitLogo} appName="Tyegit">
      <div className="flex h-full w-full overflow-hidden relative">
        {/* Tyegit Sidebar Panel */}
        <aside className={`bg-white border-r-2 border-[var(--tye-ink)] flex flex-col justify-between p-4 flex-shrink-0 transition-all duration-300 ${isSidebarCollapsed ? 'w-20 items-center' : 'w-64'}`}>
          <div className="w-full">
            {/* Logo / Title */}
            <div className={`flex items-center gap-3 pb-5 mb-6 border-b-2 border-[var(--tye-ink)] ${isSidebarCollapsed ? 'justify-center' : ''}`}>
              <img
                src={tyegitLogo}
                alt="Tyegit Logo"
                className={`object-contain drop-shadow-[2px_2px_0px_var(--tye-ink)] flex-shrink-0 transition-all duration-300 hover:scale-105 ${isSidebarCollapsed ? 'w-10 h-10' : 'w-14 h-14'}`}
              />
              {!isSidebarCollapsed && (
                <div>
                  <h2 className="font-bold font-pixel tracking-tight text-xl leading-none mb-1">Tyegit</h2>
                  <span className="text-[10px] font-mono opacity-60 uppercase tracking-widest block">Engine v0.1</span>
                </div>
              )}
            </div>

            {/* Navigation Buttons */}
            <nav className="flex flex-col gap-2 font-mono text-sm w-full">
              <button
                onClick={() => setActiveView('dashboard')}
                title="Repositories"
                className={`flex items-center gap-3 py-2.5 font-bold transition-all ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3'} ${
                  activeView === 'dashboard'
                    ? 'bg-[var(--tye-ink)] text-white shadow-[3px_3px_0px_0px_var(--tye-lavender)] translate-x-1'
                    : 'hover:bg-[var(--tye-cream)] hover:translate-x-1'
                }`}
              >
                <RiDashboardLine className="w-5 h-5 text-[var(--tye-lavender)] flex-shrink-0" />
                {!isSidebarCollapsed && <span>Repositories</span>}
              </button>

              <button
                onClick={() => setActiveView('config')}
                title="Configuration (`F-004`)"
                className={`flex items-center gap-3 py-2.5 font-bold transition-all ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3'} ${
                  activeView === 'config'
                    ? 'bg-[var(--tye-ink)] text-white shadow-[3px_3px_0px_0px_var(--tye-lavender)] translate-x-1'
                    : 'hover:bg-[var(--tye-cream)] hover:translate-x-1'
                }`}
              >
                <RiSettings4Line className="w-5 h-5 text-[var(--tye-lavender)] flex-shrink-0" />
                {!isSidebarCollapsed && <span>Configuration (`F-004`)</span>}
              </button>

              <button
                onClick={() => setActiveView('ssh')}
                title="SSH Keys (`F-005`)"
                className={`flex items-center gap-3 py-2.5 font-bold transition-all ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3'} ${
                  activeView === 'ssh'
                    ? 'bg-[var(--tye-ink)] text-white shadow-[3px_3px_0px_0px_var(--tye-lavender)] translate-x-1'
                    : 'hover:bg-[var(--tye-cream)] hover:translate-x-1'
                }`}
              >
                <RiKey2Line className="w-5 h-5 text-[var(--tye-lavender)] flex-shrink-0" />
                {!isSidebarCollapsed && <span>SSH Keys (`F-005`)</span>}
              </button>

              <button
                onClick={() => setShowAboutModal(true)}
                title="About Tyegit"
                className={`flex items-center gap-3 py-2.5 font-bold transition-all ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3'} hover:bg-[var(--tye-cream)] hover:translate-x-1`}
              >
                <RiInformationLine className="w-5 h-5 text-[var(--tye-lavender)] flex-shrink-0" />
                {!isSidebarCollapsed && <span>About</span>}
              </button>
            </nav>
          </div>

          {/* Footer Info Box & Toggle */}
          <div className="w-full mt-4 flex flex-col gap-2">
            {!isSidebarCollapsed && (
              <div className="bg-[var(--tye-cream)] p-3 border-2 border-[var(--tye-ink)] font-mono text-xs shadow-[2px_2px_0px_0px_var(--tye-ink)]">
                <div className="font-bold flex items-center gap-1.5 mb-1 text-[var(--tye-ink)]">
                  <RiGitCommitLine className="w-3.5 h-3.5 text-[var(--tye-lavender)]" /> Part 2 Milestone 2
                </div>
                <p className="opacity-70 text-[11px] leading-relaxed">
                  Status, Staging, Diffs & Commits — God-Mode Diff Editor Active.
                </p>
              </div>
            )}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 border-2 border-transparent text-[var(--tye-ink)]/50 hover:text-[var(--tye-ink)] hover:bg-[var(--tye-cream)] transition-all flex items-center justify-center w-full group"
              title={isSidebarCollapsed ? "Expand Sidebar (Ctrl+B)" : "Collapse Sidebar (Ctrl+B)"}
            >
              {isSidebarCollapsed ? <RiMenuUnfoldLine className="w-5 h-5 group-hover:scale-110 transition-transform" /> : <RiMenuFoldLine className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />}
            </button>
          </div>
        </aside>

        {/* Main Workspace View */}
        <div className="flex-1 overflow-hidden flex flex-col relative">
          {activeView === 'dashboard' && (
            <Dashboard
              onOpenRepo={handleOpenRepo}
              onInitClick={() => setShowInitModal(true)}
              onCloneClick={() => setShowCloneModal(true)}
              onScanClick={() => setShowScanModal(true)}
              refreshTrigger={refreshTrigger}
            />
          )}
          {activeView === 'config' && <ConfigTabs activeRepoPath={activeRepoPath} />}
          {activeView === 'ssh' && <SshKeyManager />}
          {activeView === 'workspace' && activeRepoPath && (
            <WorkspaceView
              repoPath={activeRepoPath}
              onClose={() => {
                setActiveView('dashboard');
                setActiveRepoPath(null);
                setRefreshTrigger(prev => prev + 1);
              }}
            />
          )}

          {/* Sleek Non-Blocking Notification Toast Banner */}
          {toastMessage && (
            <div className="absolute bottom-6 right-6 z-50 bg-[var(--tye-cream)] border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] p-4 max-w-md flex items-center gap-3 animate-fade-in">
              <RiCheckDoubleLine className="w-5 h-5 text-green-700 flex-shrink-0" />
              <span className="font-mono text-xs font-bold flex-1">{toastMessage}</span>
              <button
                onClick={() => setToastMessage(null)}
                className="hover:text-[var(--tye-lavender)] p-1 transition-colors"
              >
                <RiCloseLine className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showInitModal && (
        <InitRepoModal
          onClose={() => setShowInitModal(false)}
          onSuccess={(repo) => {
            showToast(`Repository created & registered at ${repo.path}`);
            setActiveView('dashboard');
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      )}
      {showCloneModal && (
        <CloneRepoModal
          onClose={() => setShowCloneModal(false)}
          onSuccess={(repo) => {
            showToast(`Successfully cloned repository ${repo.name} to ${repo.path}`);
            setActiveView('dashboard');
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      )}
    {showScanModal && (
        <AutoDiscoveryModal
          onClose={() => setShowScanModal(false)}
          onSuccess={(found) => {
            if (found.length > 0) {
              showToast(`Imported ${found.length} discovered repositories into Tyegit index`);
            }
            setActiveView('dashboard');
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      )}
      {showAboutModal && (
        <AboutModal onClose={() => setShowAboutModal(false)} />
      )}
    </AppShell>
  );
}
