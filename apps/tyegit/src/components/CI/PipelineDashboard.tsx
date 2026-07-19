import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  RiRocketLine, RiCheckLine, RiCloseCircleLine, RiTimeLine, RiRefreshLine, 
  RiCodeBoxLine, RiLockPasswordLine, RiAddLine, RiTerminalBoxLine,
  RiGitCommitLine, RiArrowRightSLine
} from 'react-icons/ri';
import { CicdRun, CicdJob, CicdSecret, CicdVariable } from '../../types';
import { TerminalLogPane } from './TerminalLogPane';
import { SettingsFormModal } from './SettingsFormModal';

interface PipelineDashboardProps {
  repoPath: string;
}

type Tab = 'runs' | 'variables' | 'secrets';

export const PipelineDashboard: React.FC<PipelineDashboardProps> = ({ repoPath }) => {
  const [activeTab, setActiveTab] = useState<Tab>('runs');
  
  const [runs, setRuns] = useState<CicdRun[]>([]);
  const [jobs, setJobs] = useState<Record<string, CicdJob[]>>({});
  const [variables, setVariables] = useState<CicdVariable[]>([]);
  const [secrets, setSecrets] = useState<CicdSecret[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<{ id: string, name: string } | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState<'variable' | 'secret' | null>(null);

  const fetchRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<CicdRun[]>('git:cicd_get_runs', { repoPath });
      setRuns(data);
      if (data.length > 0) {
        setSelectedRun(data[0].id);
        fetchJobs(data[0].id);
      }
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobs = async (runId: string) => {
    if (jobs[runId]) return; // Already fetched
    try {
      const data = await invoke<CicdJob[]>('git:cicd_get_jobs', { repoPath, runId });
      setJobs(prev => ({ ...prev, [runId]: data }));
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchVariables = async () => {
    setLoading(true);
    try {
      const data = await invoke<CicdVariable[]>('git:cicd_get_variables', { repoPath });
      setVariables(data);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSecrets = async () => {
    setLoading(true);
    try {
      const data = await invoke<CicdSecret[]>('git:cicd_get_secrets', { repoPath });
      setSecrets(data);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'runs') fetchRuns();
    else if (activeTab === 'variables') fetchVariables();
    else if (activeTab === 'secrets') fetchSecrets();
  }, [activeTab, repoPath]);

  const handleRunSelect = (runId: string) => {
    setSelectedRun(runId);
    fetchJobs(runId);
  };

  const getStatusIcon = (status: string, conclusion?: string) => {
    if (status === 'queued' || status === 'in_progress') {
      return <RiTimeLine className="text-[var(--tye-mustard)] w-5 h-5 animate-spin" />;
    }
    if (conclusion === 'success') {
      return <RiCheckLine className="text-emerald-500 w-5 h-5" />;
    }
    if (conclusion === 'skipped') {
      return <RiArrowRightSLine className="text-gray-400 w-5 h-5" />;
    }
    return <RiCloseCircleLine className="text-rose-500 w-5 h-5" />;
  };

  return (
    <div className="flex h-full bg-[var(--tye-cream)] text-[var(--tye-ink)]">
      {/* Sidebar navigation */}
      <div className="w-64 border-r-2 border-[var(--tye-ink)] flex flex-col bg-white">
        <div className="p-4 border-b-2 border-[var(--tye-ink)]">
          <h2 className="font-pixel text-xl font-bold">Actions Center</h2>
        </div>
        <div className="flex flex-col p-2 gap-1 flex-1">
          <button 
            onClick={() => setActiveTab('runs')}
            className={`flex items-center gap-2 p-3 font-bold border-2 text-sm text-left transition-colors ${activeTab === 'runs' ? 'bg-[var(--tye-ink)] text-white border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-primary)]' : 'border-transparent hover:border-[var(--tye-ink)] text-[var(--tye-ink)]'}`}
          >
            <RiRocketLine className="text-lg" /> All Pipelines
          </button>
          <button 
            onClick={() => setActiveTab('variables')}
            className={`flex items-center gap-2 p-3 font-bold border-2 text-sm text-left transition-colors ${activeTab === 'variables' ? 'bg-[var(--tye-ink)] text-white border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-primary)]' : 'border-transparent hover:border-[var(--tye-ink)] text-[var(--tye-ink)]'}`}
          >
            <RiCodeBoxLine className="text-lg" /> Variables
          </button>
          <button 
            onClick={() => setActiveTab('secrets')}
            className={`flex items-center gap-2 p-3 font-bold border-2 text-sm text-left transition-colors ${activeTab === 'secrets' ? 'bg-[var(--tye-ink)] text-white border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-primary)]' : 'border-transparent hover:border-[var(--tye-ink)] text-[var(--tye-ink)]'}`}
          >
            <RiLockPasswordLine className="text-lg" /> Secrets
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex items-center justify-between p-4 border-b-2 border-[var(--tye-ink)] bg-[var(--tye-cream)]">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {activeTab === 'runs' && 'Pipeline Runs'}
            {activeTab === 'variables' && 'Repository Variables'}
            {activeTab === 'secrets' && 'Repository Secrets'}
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (activeTab === 'runs') fetchRuns();
                else if (activeTab === 'variables') fetchVariables();
                else if (activeTab === 'secrets') fetchSecrets();
              }}
              className="px-3 py-1.5 bg-white border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] hover:-translate-y-[1px] hover:shadow-[3px_3px_0px_0px_var(--tye-ink)] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_var(--tye-ink)] transition-all font-bold flex items-center gap-1"
            >
              <RiRefreshLine /> Refresh
            </button>
            {activeTab === 'variables' && (
              <button
                onClick={() => setShowSettingsModal('variable')}
                className="px-3 py-1.5 bg-[var(--tye-primary)] text-white border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] hover:-translate-y-[1px] active:translate-y-[1px] transition-all font-bold flex items-center gap-1"
              >
                <RiAddLine /> New Variable
              </button>
            )}
            {activeTab === 'secrets' && (
              <button
                onClick={() => setShowSettingsModal('secret')}
                className="px-3 py-1.5 bg-[var(--tye-terracotta)] text-white border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)] hover:-translate-y-[1px] active:translate-y-[1px] transition-all font-bold flex items-center gap-1"
              >
                <RiAddLine /> New Secret
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-rose-100 text-rose-900 border-b-2 border-rose-800 p-3 font-mono text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-[var(--tye-cream)]">
          {loading ? (
            <div className="flex justify-center items-center h-32 text-[var(--tye-primary)]">
              <RiRefreshLine className="animate-spin text-4xl" />
            </div>
          ) : (
            <>
              {activeTab === 'runs' && (
                <div className="flex h-full">
                  <div className="w-1/3 border-r-2 border-[var(--tye-ink)] overflow-y-auto bg-white">
                    {runs.map(run => (
                      <div 
                        key={run.id}
                        onClick={() => handleRunSelect(run.id)}
                        className={`p-4 border-b border-[var(--tye-ink)] cursor-pointer hover:bg-[var(--tye-cream)] transition-colors ${selectedRun === run.id ? 'bg-[var(--tye-cream)] border-l-4 border-l-[var(--tye-primary)]' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          {getStatusIcon(run.status, run.conclusion)}
                          <div className="flex-1 overflow-hidden">
                            <h3 className="font-bold text-sm truncate" title={run.display_title || run.name}>{run.display_title || run.name}</h3>
                            <div className="text-xs opacity-70 flex items-center gap-1 mt-1">
                              <RiGitCommitLine /> {run.head_branch}
                            </div>
                            <div className="text-xs opacity-50 font-mono mt-1">
                              {new Date(run.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="w-2/3 p-6 overflow-y-auto">
                    {selectedRun ? (
                      <div>
                        <h2 className="text-2xl font-bold mb-4 font-pixel">Pipeline Jobs</h2>
                        <div className="flex flex-col gap-4">
                          {(jobs[selectedRun] || []).map(job => (
                            <div key={job.id} className="bg-white border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)]">
                              <div className="p-4 border-b-2 border-[var(--tye-ink)] flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {getStatusIcon(job.status, job.conclusion)}
                                  <h3 className="font-bold text-lg">{job.name}</h3>
                                </div>
                                <button 
                                  onClick={() => setSelectedJob({ id: job.id, name: job.name })}
                                  className="px-3 py-1 bg-[var(--tye-ink)] text-white text-sm font-bold flex items-center gap-1 hover:bg-gray-800 transition-colors"
                                >
                                  <RiTerminalBoxLine /> View Logs
                                </button>
                              </div>
                              <div className="p-0">
                                {job.steps && job.steps.map(step => (
                                  <div key={step.number} className="flex items-center gap-3 p-3 border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
                                    {getStatusIcon(step.status, step.conclusion)}
                                    <span className="font-mono text-sm">{step.name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-gray-400 font-mono">
                        Select a pipeline run to view jobs.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'variables' && (
                <div className="p-6">
                  <div className="grid grid-cols-1 gap-4">
                    {variables.map(variable => (
                      <div key={variable.name} className="bg-white p-4 border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] flex flex-col gap-2">
                        <div className="flex items-center justify-between border-b-2 border-gray-100 pb-2">
                          <h3 className="font-bold text-lg font-mono text-[var(--tye-primary)]">{variable.name}</h3>
                          <span className="text-xs opacity-50 font-mono">Updated: {new Date(variable.updated_at).toLocaleDateString()}</span>
                        </div>
                        <div className="font-mono text-sm bg-[var(--tye-cream)] p-2 border border-dashed border-gray-400 overflow-x-auto">
                          {variable.value}
                        </div>
                      </div>
                    ))}
                    {variables.length === 0 && (
                      <div className="text-center p-8 opacity-70 font-mono">No variables found.</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'secrets' && (
                <div className="p-6">
                  <div className="grid grid-cols-1 gap-4">
                    {secrets.map(secret => (
                      <div key={secret.name} className="bg-white p-4 border-2 border-[var(--tye-ink)] shadow-[4px_4px_0px_0px_var(--tye-ink)] flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-lg font-mono text-[var(--tye-terracotta)] flex items-center gap-2">
                            <RiLockPasswordLine /> {secret.name}
                          </h3>
                          <span className="text-xs opacity-50 font-mono">Updated: {new Date(secret.updated_at).toLocaleDateString()}</span>
                        </div>
                        <div className="font-mono text-sm bg-gray-100 text-gray-400 p-2 border border-dashed border-gray-400 italic">
                          *** (Encrypted Value)
                        </div>
                      </div>
                    ))}
                    {secrets.length === 0 && (
                      <div className="text-center p-8 opacity-70 font-mono">No secrets found.</div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Terminal Pane Overlay */}
      {selectedJob && (
        <TerminalLogPane 
          repoPath={repoPath} 
          jobId={selectedJob.id} 
          jobName={selectedJob.name}
          onClose={() => setSelectedJob(null)} 
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsFormModal 
          repoPath={repoPath}
          type={showSettingsModal}
          onClose={() => setShowSettingsModal(null)}
          onSuccess={() => {
            setShowSettingsModal(null);
            if (showSettingsModal === 'variable') fetchVariables();
            if (showSettingsModal === 'secret') fetchSecrets();
          }}
        />
      )}
    </div>
  );
};
