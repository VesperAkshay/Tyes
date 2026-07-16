import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CommitRequest, HookResult } from '../../types';
import {
  RiGitCommitLine,
  RiTerminalBoxLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiAddLine,
  RiUserAddLine,
  RiPlayLine,
} from 'react-icons/ri';

interface CommitPanelProps {
  repoPath: string;
  stagedCount: number;
  onCommitSuccess: () => void;
}

export const CommitPanel: React.FC<CommitPanelProps> = ({
  repoPath,
  stagedCount,
  onCommitSuccess,
}) => {
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [commitType, setCommitType] = useState<string>('Normal');
  const [amend, setAmend] = useState<boolean>(false);
  const [signoff, setSignoff] = useState<boolean>(false);
  const [coAuthors, setCoAuthors] = useState<string[]>([]);
  const [coAuthorInput, setCoAuthorInput] = useState<string>('');
  
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-commit hook execution state (`F-023`)
  const [hookResult, setHookResult] = useState<HookResult | null>(null);
  const [runningHook, setRunningHook] = useState<boolean>(false);
  const [showHookConsole, setShowHookConsole] = useState<boolean>(false);

  const handleAddCoAuthor = () => {
    if (coAuthorInput.trim() && !coAuthors.includes(coAuthorInput.trim())) {
      setCoAuthors([...coAuthors, coAuthorInput.trim()]);
      setCoAuthorInput('');
    }
  };

  const handleRemoveCoAuthor = (idx: number) => {
    setCoAuthors(coAuthors.filter((_, i) => i !== idx));
  };

  const handleRunHook = async () => {
    setRunningHook(true);
    setShowHookConsole(true);
    try {
      const res: HookResult = await invoke('git:hook_execute', { path: repoPath });
      setHookResult(res);
    } catch (err: any) {
      setHookResult({
        hook_name: 'pre-commit',
        exit_code: -1,
        stdout: '',
        stderr: typeof err === 'string' ? err : err.message || 'Execution error',
        succeeded: false,
      });
    } finally {
      setRunningHook(false);
    }
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setError('Commit message subject is required');
      return;
    }
    if (stagedCount === 0 && !amend) {
      setError('No staged changes to commit');
      return;
    }

    setSubmitting(true);
    setError(null);

    const req: CommitRequest = {
      message: subject.trim(),
      body: body.trim() ? body.trim() : undefined,
      amend,
      signoff,
      co_authors: coAuthors,
      commit_type: commitType,
    };

    try {
      await invoke('git:commit_create', { path: repoPath, req });
      setSubject('');
      setBody('');
      setAmend(false);
      setCoAuthors([]);
      onCommitSuccess();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err.message || 'Failed to create commit');
    } finally {
      setSubmitting(false);
    }
  };

  // Character count rules (50 yellow, 72 red)
  const subjLen = subject.length;
  const subjColor =
    subjLen > 72
      ? 'text-red-600 font-bold'
      : subjLen > 50
      ? 'text-amber-600 font-bold'
      : 'text-gray-500';

  return (
    <div className="bg-white border-t-2 border-[var(--tye-ink)] p-4 flex flex-col gap-3 flex-shrink-0 select-none">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <RiGitCommitLine className="text-lg text-[var(--tye-lavender)]" />
          <h3 className="font-pixel font-bold text-sm tracking-wide">COMMIT ENGINE</h3>
          <span className="text-xs font-mono px-2 py-0.5 bg-[var(--tye-cream)] border rounded font-bold">
            {stagedCount} staged
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Run pre-commit hook (`F-023`) */}
          <button
            type="button"
            onClick={handleRunHook}
            disabled={runningHook}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-[var(--tye-cream)] hover:bg-[var(--tye-ink)] hover:text-white border border-[var(--tye-ink)] rounded transition-colors disabled:opacity-50"
            title="Execute repository pre-commit hook"
          >
            <RiTerminalBoxLine />
            {runningHook ? 'Running Hook...' : 'Test Hook'}
          </button>
        </div>
      </div>

      {/* Pre-commit Hook Console Output */}
      {showHookConsole && (
        <div className="bg-black text-white p-3 rounded font-mono text-xs border-2 border-[var(--tye-ink)] max-h-40 overflow-y-auto">
          <div className="flex items-center justify-between mb-2 border-b border-gray-700 pb-1">
            <span className="font-bold flex items-center gap-1.5 text-yellow-400">
              <RiTerminalBoxLine /> Pre-Commit Hook Output
            </span>
            {hookResult && (
              <span className={`flex items-center gap-1 font-bold ${hookResult.succeeded ? 'text-green-400' : 'text-red-400'}`}>
                {hookResult.succeeded ? <RiCheckboxCircleLine /> : <RiCloseCircleLine />}
                {hookResult.succeeded ? 'PASSED (0)' : `FAILED (${hookResult.exit_code})`}
              </span>
            )}
          </div>
          {runningHook ? (
            <div className="text-gray-400 animate-pulse">Running hook script in background...</div>
          ) : hookResult ? (
            <div className="space-y-1 whitespace-pre-wrap break-all">
              {hookResult.stdout && <div className="text-gray-300">{hookResult.stdout}</div>}
              {hookResult.stderr && <div className="text-red-400">{hookResult.stderr}</div>}
              {!hookResult.stdout && !hookResult.stderr && (
                <div className="text-gray-500 italic">No output produced.</div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-400 text-red-800 text-xs p-2 rounded font-mono">
          {error}
        </div>
      )}

      <form onSubmit={handleCommit} className="flex flex-col gap-2.5 font-sans">
        {/* Top Options Bar (Commit Type, Amend, Signoff) */}
        <div className="flex items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <label className="font-bold text-[var(--tye-ink)]">Type:</label>
            <select
              value={commitType}
              onChange={(e) => setCommitType(e.target.value)}
              className="bg-white border border-[var(--tye-ink)] px-2 py-0.5 rounded focus:outline-none"
            >
              <option value="Normal">Normal</option>
              <option value="Fixup">Fixup!</option>
              <option value="Squash">Squash!</option>
            </select>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={amend}
                onChange={(e) => setAmend(e.target.checked)}
                className="accent-[var(--tye-ink)] cursor-pointer"
              />
              <span>Amend HEAD</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={signoff}
                onChange={(e) => setSignoff(e.target.checked)}
                className="accent-[var(--tye-ink)] cursor-pointer"
              />
              <span>Signed-off-by</span>
            </label>
          </div>
        </div>

        {/* Message Subject Input */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="font-bold">Subject</span>
            <span className={subjColor}>
              {subjLen}/50 {subjLen > 72 && '(EXCEEDS 72 CHARS!)'}
            </span>
          </div>
          <input
            type="text"
            placeholder="feat: concise summary of changes"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border-2 border-[var(--tye-ink)] px-3 py-1.5 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tye-lavender)]"
          />
        </div>

        {/* Message Body Input */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-mono font-bold">Body (Optional)</span>
          <textarea
            placeholder="Detailed explanation of what and why..."
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full border border-[var(--tye-ink)] px-3 py-1.5 rounded font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[var(--tye-lavender)] resize-none"
          />
        </div>

        {/* Co-authors Input */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center border border-[var(--tye-ink)] rounded bg-white overflow-hidden">
              <RiUserAddLine className="ml-2 text-gray-400" />
              <input
                type="text"
                placeholder="Co-author (e.g. Jane Doe <jane@tyegit.dev>)"
                value={coAuthorInput}
                onChange={(e) => setCoAuthorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCoAuthor();
                  }
                }}
                className="w-full px-2 py-1 text-xs font-mono focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleAddCoAuthor}
              className="px-2.5 py-1 bg-[var(--tye-cream)] hover:bg-[var(--tye-ink)] hover:text-white border border-[var(--tye-ink)] rounded text-xs font-mono font-bold"
            >
              + Add Co-author
            </button>
          </div>

          {coAuthors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {coAuthors.map((ca, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[var(--tye-lavender)]/20 border border-[var(--tye-lavender)] rounded text-xs font-mono"
                >
                  <span>{ca}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCoAuthor(idx)}
                    className="text-red-600 hover:text-red-800 font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Submit Commit Button */}
        <button
          type="submit"
          disabled={submitting || (stagedCount === 0 && !amend)}
          className="w-full py-2.5 bg-[var(--tye-ink)] hover:bg-[var(--tye-lavender)] text-white font-pixel font-bold text-sm tracking-widest rounded transition-all shadow-[3px_3px_0px_var(--tye-lavender)] hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none mt-1"
        >
          {submitting ? 'COMMITTING CHANGES...' : amend ? 'AMEND COMMIT' : 'COMMIT TO HEAD'}
        </button>
      </form>
    </div>
  );
};
