import React, { useState } from 'react';

export type ModuleType = "git" | "api" | "run";

export interface AppShellProps {
  modules: ModuleType[];
  children?: React.ReactNode;
}

export function AppShell({ modules, children }: AppShellProps) {
  const isHubMode = modules.length > 1;
  const [activeModule, setActiveModule] = useState<ModuleType>(modules[0] || "git");

  return (
    <div className="tye-app-shell" style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      backgroundColor: 'var(--tye-cream)',
      color: 'var(--tye-ink)',
      fontFamily: 'var(--tye-font-sans)'
    }}>
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
  );
}
