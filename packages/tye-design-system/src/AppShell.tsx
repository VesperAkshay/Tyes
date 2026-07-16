import React, { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { RiSubtractLine, RiCheckboxBlankLine, RiCloseLine, RiTerminalBoxLine } from 'react-icons/ri';

export type ModuleType = "git" | "api" | "run";

export interface AppShellProps {
  modules: ModuleType[];
  logoUrl?: string;
  appName?: string;
  children?: React.ReactNode;
}

export function AppShell({ modules, logoUrl, appName, children }: AppShellProps) {
  const isHubMode = modules.length > 1;
  const [activeModule, setActiveModule] = useState<ModuleType>(modules[0] || "git");

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    try { getCurrentWindow().minimize(); } catch(err) { console.warn('Window control error:', err); }
  };

  const handleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation();
    try { getCurrentWindow().toggleMaximize(); } catch(err) { console.warn('Window control error:', err); }
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    try { getCurrentWindow().close(); } catch(err) { console.warn('Window control error:', err); }
  };

  return (
    <div className="tye-app-shell" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      backgroundColor: 'var(--tye-cream)',
      color: 'var(--tye-ink)',
      fontFamily: 'var(--tye-font-sans)',
      overflow: 'hidden'
    }}>
      {/* Custom Tauri v2 Title Bar (`decorations: false`, `data-tauri-drag-region`) */}
      <header
        data-tauri-drag-region
        className="tye-title-bar"
        style={{
          height: '38px',
          width: '100%',
          backgroundColor: 'var(--tye-cream)',
          borderBottom: '2px solid var(--tye-ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          userSelect: 'none',
          flexShrink: 0,
          zIndex: 9999
        }}
      >
        {/* Left: Brand info (`data-tauri-drag-region`) */}
        <div data-tauri-drag-region style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold' }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="App Logo"
              style={{ width: '22px', height: '22px', objectFit: 'contain', pointerEvents: 'none' }}
            />
          ) : (
            <RiTerminalBoxLine style={{ fontSize: '16px', color: 'var(--tye-lavender)', pointerEvents: 'none' }} />
          )}
          <span style={{ fontFamily: 'var(--tye-font-display)', letterSpacing: '-0.02em', pointerEvents: 'none' }}>
            {appName || (isHubMode ? 'tye Hub' : `tye ${modules[0]?.toUpperCase() || 'GIT'}`)}
          </span>
        </div>

        {/* Center: Draggable Spacer (`data-tauri-drag-region`) */}
        <div data-tauri-drag-region style={{ flex: 1, height: '100%', cursor: 'default' }} />

        {/* Right: Window Controls (`Minimize`, `Maximize/Restore`, `Close`) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={handleMinimize}
            style={{
              width: '28px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1.5px solid var(--tye-ink)',
              backgroundColor: 'white',
              color: 'var(--tye-ink)',
              cursor: 'pointer',
              borderRadius: '3px',
              boxShadow: '1px 1px 0px 0px var(--tye-ink)'
            }}
            title="Minimize"
          >
            <RiSubtractLine style={{ fontSize: '14px', pointerEvents: 'none' }} />
          </button>

          <button
            onClick={handleMaximize}
            style={{
              width: '28px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1.5px solid var(--tye-ink)',
              backgroundColor: 'white',
              color: 'var(--tye-ink)',
              cursor: 'pointer',
              borderRadius: '3px',
              boxShadow: '1px 1px 0px 0px var(--tye-ink)'
            }}
            title="Maximize / Restore"
          >
            <RiCheckboxBlankLine style={{ fontSize: '12px', pointerEvents: 'none' }} />
          </button>

          <button
            onClick={handleClose}
            style={{
              width: '28px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1.5px solid var(--tye-ink)',
              backgroundColor: '#D17B88',
              color: 'white',
              cursor: 'pointer',
              borderRadius: '3px',
              boxShadow: '1px 1px 0px 0px var(--tye-ink)'
            }}
            title="Close Window"
          >
            <RiCloseLine style={{ fontSize: '15px', pointerEvents: 'none' }} />
          </button>
        </div>
      </header>

      {/* Main App Container below Titlebar */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Activity Bar: only visible when more than 1 module is loaded (Hub mode) */}
        {isHubMode && (
          <aside className="tye-activity-bar" style={{
            width: '56px',
            borderRight: '2px solid var(--tye-ink)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: '12px',
            gap: '16px',
            backgroundColor: 'var(--tye-cream)'
          }}>
            {modules.includes("git") && (
              <button
                onClick={() => setActiveModule("git")}
                style={{
                  width: '40px',
                  height: '40px',
                  border: activeModule === "git" ? '2px solid var(--tye-ink)' : 'none',
                  backgroundColor: activeModule === "git" ? 'var(--tye-lavender)' : 'transparent',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  fontWeight: 'bold'
                }}
                title="Tyegit"
              >
                G
              </button>
            )}
            {modules.includes("api") && (
              <button
                onClick={() => setActiveModule("api")}
                style={{
                  width: '40px',
                  height: '40px',
                  border: activeModule === "api" ? '2px solid var(--tye-ink)' : 'none',
                  backgroundColor: activeModule === "api" ? 'var(--tye-api-accent)' : 'transparent',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  fontWeight: 'bold'
                }}
                title="TyeApi"
              >
                A
              </button>
            )}
            {modules.includes("run") && (
              <button
                onClick={() => setActiveModule("run")}
                style={{
                  width: '40px',
                  height: '40px',
                  border: activeModule === "run" ? '2px solid var(--tye-ink)' : 'none',
                  backgroundColor: activeModule === "run" ? 'var(--tye-mustard)' : 'transparent',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  fontWeight: 'bold'
                }}
                title="TyeRun"
              >
                R
              </button>
            )}
          </aside>
        )}

        {/* Main Content Area */}
        <main className="tye-main-panel" style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {children || (
            <div style={{ padding: '24px' }}>
              <h1 style={{ fontFamily: 'var(--tye-font-display)', margin: '0 0 16px 0' }}>
                {isHubMode ? `tye Hub — Active: ${activeModule.toUpperCase()}` : `tye ${modules[0]?.toUpperCase() || ''}`}
              </h1>
              <p>Select or open a project folder to begin.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
