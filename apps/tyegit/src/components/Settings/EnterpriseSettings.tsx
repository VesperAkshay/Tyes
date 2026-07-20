import React from 'react';
import { RiBuildingLine, RiShieldKeyholeLine, RiGitBranchLine, RiFileList3Line } from 'react-icons/ri';
import { useLocalStorage } from '../../hooks/useLocalStorage';

export const EnterpriseSettings: React.FC = () => {
  const [dlpEnabled, setDlpEnabled] = useLocalStorage('tye:enterprise:dlpEnabled', false);
  const [cicdEnabled, setCicdEnabled] = useLocalStorage('tye:features:cicdEnabled', true);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 bg-[var(--tye-cream)] text-[var(--tye-ink)]">
      <div className="flex items-center justify-between mb-4 pb-4 border-b-2 border-[var(--tye-ink)]">
        <div>
          <h1 className="text-3xl font-bold font-pixel tracking-tight">Enterprise & Security</h1>
          <p className="text-sm opacity-80 mt-1 font-mono">Advanced features for teams (F-058).</p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="tye-card bg-white p-6">
          <div className="flex items-center gap-3 mb-4">
            <RiShieldKeyholeLine className="w-6 h-6 text-[var(--tye-primary)]" />
            <h2 className="text-xl font-bold font-mono">Data Loss Prevention (DLP)</h2>
          </div>
          <p className="text-sm opacity-70 mb-4">Automatically scan commits for secrets and sensitive data before allowing them to be saved to the repository.</p>
          
          <label className="flex items-center gap-2 cursor-pointer font-bold">
            <input 
              type="checkbox" 
              checked={dlpEnabled} 
              onChange={e => setDlpEnabled(e.target.checked)} 
              className="w-4 h-4 accent-[var(--tye-ink)]"
            />
            Enable Pre-commit Secret Scanner
          </label>
        </div>

        <div className="tye-card bg-white p-6 border-l-4 border-[var(--tye-lavender)]">
          <div className="flex items-center gap-3 mb-4">
            <RiFileList3Line className="w-6 h-6 text-[var(--tye-lavender)]" />
            <h2 className="text-xl font-bold font-mono">CI/CD Pipeline Dashboard (Feature Flag)</h2>
          </div>
          <p className="text-sm opacity-70 mb-4">Display the advanced CI/CD Dashboard tab to monitor GitHub Actions and manage encrypted secrets.</p>
          
          <label className="flex items-center gap-2 cursor-pointer font-bold">
            <input 
              type="checkbox" 
              checked={cicdEnabled} 
              onChange={e => setCicdEnabled(e.target.checked)} 
              className="w-4 h-4 accent-[var(--tye-ink)]"
            />
            Enable CI/CD Pipeline Dashboard
          </label>
        </div>
      </div>
    </div>
  );
};
