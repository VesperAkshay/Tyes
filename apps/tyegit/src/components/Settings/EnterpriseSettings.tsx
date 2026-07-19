import React, { useState } from 'react';
import { RiBuildingLine, RiShieldKeyholeLine, RiGitBranchLine, RiFileList3Line } from 'react-icons/ri';

export const EnterpriseSettings: React.FC = () => {
  const [dlpEnabled, setDlpEnabled] = useState(false);
  const [branchPoliciesEnabled, setBranchPoliciesEnabled] = useState(false);

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
            <RiShieldKeyholeLine className="w-6 h-6 text-[var(--tye-lavender)]" />
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

        <div className="tye-card bg-white p-6">
          <div className="flex items-center gap-3 mb-4">
            <RiGitBranchLine className="w-6 h-6 text-[var(--tye-mustard)]" />
            <h2 className="text-xl font-bold font-mono">Branch Policies</h2>
          </div>
          <p className="text-sm opacity-70 mb-4">Enforce naming conventions and restrict commits to specific branches (e.g. main/master).</p>
          
          <label className="flex items-center gap-2 cursor-pointer font-bold">
            <input 
              type="checkbox" 
              checked={branchPoliciesEnabled} 
              onChange={e => setBranchPoliciesEnabled(e.target.checked)} 
              className="w-4 h-4 accent-[var(--tye-ink)]"
            />
            Require Issue ID in branch names (e.g. feat/TYE-123-new-button)
          </label>
        </div>

        <div className="tye-card bg-[var(--tye-ink)] text-white p-6">
          <div className="flex items-center gap-3 mb-4">
            <RiFileList3Line className="w-6 h-6 text-[var(--tye-mustard)]" />
            <h2 className="text-xl font-bold font-mono">Audit Log</h2>
          </div>
          <p className="text-sm opacity-70 mb-4">View append-only logs of all destructive actions performed in the client.</p>
          <button className="tye-btn bg-white text-[var(--tye-ink)] font-bold">Export Audit Log (CSV)</button>
        </div>
      </div>
    </div>
  );
};
