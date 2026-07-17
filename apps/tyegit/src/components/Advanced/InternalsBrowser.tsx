import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RiSearchLine, RiFileCodeLine, RiNodeTree, RiGitCommitLine, RiPriceTag3Line, RiBugLine, RiDatabase2Line } from 'react-icons/ri';

interface GitObjectInfo {
  oid: string;
  kind: string;
  size: number;
  content_hex: string | null;
  parsed_content: string | null;
}

interface GitTreeEntry {
  name: string;
  oid: string;
  kind: string;
  filemode: string;
}

interface InternalsBrowserProps {
  repoPath: string;
}

export const InternalsBrowser: React.FC<InternalsBrowserProps> = ({ repoPath }) => {
  const [searchOid, setSearchOid] = useState('');
  const [currentObj, setCurrentObj] = useState<GitObjectInfo | null>(null);
  const [treeEntries, setTreeEntries] = useState<GitTreeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'parsed' | 'hex'>('parsed');

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchOid || searchOid.length < 4) return;

    setLoading(true);
    setError(null);
    setCurrentObj(null);
    setTreeEntries(null);
    setViewMode('parsed');

    try {
      // 1. Resolve prefix
      const fullOid: string = await invoke('git:internals_search_prefix', { repoPath, prefix: searchOid });
      
      // 2. Fetch object info
      const objInfo: GitObjectInfo = await invoke('git:internals_get_object', { repoPath, oidHex: fullOid });
      setCurrentObj(objInfo);

      // 3. If it's a tree or commit (and we want to show its tree), fetch the tree
      if (objInfo.kind === 'Tree' || objInfo.kind === 'Commit') {
        let targetTreeOid = fullOid;
        if (objInfo.kind === 'Commit' && objInfo.parsed_content) {
            // Very naive parse to find tree hash from commit content for convenience
            const match = objInfo.parsed_content.match(/^tree ([a-f0-9]{40})/m);
            if (match) targetTreeOid = match[1];
        }
        
        try {
          const tree: GitTreeEntry[] = await invoke('git:internals_get_tree', { repoPath, treeOidHex: targetTreeOid });
          setTreeEntries(tree);
        } catch (treeErr) {
          console.warn("Could not load tree for object", treeErr);
        }
      }
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const getIconForKind = (kind: string) => {
    switch(kind) {
      case 'Commit': return <RiGitCommitLine className="text-amber-500" />;
      case 'Tree': return <RiNodeTree className="text-blue-500" />;
      case 'Blob': return <RiFileCodeLine className="text-green-500" />;
      case 'Tag': return <RiPriceTag3Line className="text-purple-500" />;
      default: return <RiBugLine className="text-gray-500" />;
    }
  };

  return (
    <div className="flex h-full w-full bg-[var(--tye-cream)] text-[var(--tye-ink)]">
      
      {/* Left Panel: Search & Tree Navigation */}
      <div className="w-1/3 h-full border-r-2 border-[var(--tye-ink)] flex flex-col bg-white">
        <div className="p-4 border-b-2 border-[var(--tye-ink)] bg-[var(--tye-cream)]">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input 
              type="text" 
              placeholder="Enter SHA-1 prefix..." 
              className="flex-1 px-3 py-1.5 border-2 border-[var(--tye-ink)] font-mono text-sm outline-none focus:shadow-[2px_2px_0px_var(--tye-lavender)] transition-shadow"
              value={searchOid}
              onChange={(e) => setSearchOid(e.target.value)}
            />
            <button 
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 bg-[var(--tye-ink)] text-white hover:bg-black font-bold border-2 border-transparent shadow-[2px_2px_0px_var(--tye-lavender)]"
            >
              <RiSearchLine />
            </button>
          </form>
          <div className="mt-2 text-xs font-mono text-gray-500">
            Search any Commit, Tree, Blob, or Tag hash (min 4 chars). Try `HEAD` or a commit hash.
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 bg-[#F9F9F9]">
          {error && (
            <div className="p-3 bg-red-100 text-red-900 border border-red-300 font-mono text-xs mb-2 break-words">
              {error}
            </div>
          )}
          
          {treeEntries && (
            <div className="flex flex-col gap-1">
              <h3 className="font-pixel text-sm mb-2 text-gray-600 uppercase px-2 pt-2">Tree References</h3>
              {treeEntries.map((entry, i) => (
                <div 
                  key={i} 
                  onClick={() => {
                    setSearchOid(entry.oid);
                    // trigger search in next tick after state updates
                    setTimeout(() => document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })), 0);
                  }}
                  className="flex items-center gap-2 p-2 hover:bg-[var(--tye-lavender)]/20 cursor-pointer font-mono text-xs border border-transparent hover:border-[var(--tye-ink)] transition-colors"
                >
                  {getIconForKind(entry.kind)}
                  <span className="text-gray-500">{entry.filemode}</span>
                  <span className="font-bold flex-1 truncate">{entry.name}</span>
                  <span className="text-gray-400 text-[10px]">{entry.oid.substring(0,7)}</span>
                </div>
              ))}
            </div>
          )}

          {!treeEntries && !error && currentObj?.kind !== 'Tree' && currentObj?.kind !== 'Commit' && (
            <div className="p-4 text-center text-gray-400 font-mono text-xs">
              No nested objects to display.
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Object Inspector */}
      <div className="w-2/3 h-full flex flex-col bg-[#1E1E1E] text-[#D4D4D4]">
        {currentObj ? (
          <>
            {/* Inspector Header */}
            <div className="p-4 border-b-2 border-gray-700 bg-[#252526] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getIconForKind(currentObj.kind)}</span>
                <div className="flex flex-col">
                  <span className="font-bold font-mono text-lg text-white">{currentObj.oid}</span>
                  <span className="font-mono text-xs text-gray-400">
                    Type: <strong className="text-[var(--tye-lavender)]">{currentObj.kind}</strong> | Size: {currentObj.size} bytes
                  </span>
                </div>
              </div>
              <div className="flex bg-[#333333] p-1 rounded">
                <button
                  onClick={() => setViewMode('parsed')}
                  className={`px-3 py-1 font-mono text-xs font-bold transition-colors ${viewMode === 'parsed' ? 'bg-[#1E1E1E] text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                >
                  Parsed
                </button>
                <button
                  onClick={() => setViewMode('hex')}
                  className={`px-3 py-1 font-mono text-xs font-bold transition-colors ${viewMode === 'hex' ? 'bg-[#1E1E1E] text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                >
                  Hex Dump
                </button>
              </div>
            </div>

            {/* Inspector Content */}
            <div className="flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-all">
              {viewMode === 'parsed' ? (
                currentObj.parsed_content ? (
                  <span className={currentObj.kind === 'Commit' ? 'text-amber-300' : 'text-green-300'}>
                    {currentObj.parsed_content}
                  </span>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                    <RiBugLine className="text-4xl opacity-50" />
                    <p>Binary object cannot be parsed as UTF-8.</p>
                    <button onClick={() => setViewMode('hex')} className="px-4 py-2 border border-gray-600 hover:bg-gray-800 text-white">View Hex Dump</button>
                  </div>
                )
              ) : (
                <div className="grid grid-cols-[auto_1fr] gap-4">
                  <div className="text-gray-600 select-none text-right">
                    {currentObj.content_hex?.split(' ').map((_, i) => i % 16 === 0 ? <div key={i}>{formatHexOffset(i)}</div> : null)}
                  </div>
                  <div className="text-blue-300 uppercase tracking-widest break-words" style={{ wordBreak: 'break-all', wordWrap: 'break-word', display: 'flex', flexWrap: 'wrap' }}>
                    {currentObj.content_hex?.split(' ').map((byte, i) => (
                       <span key={i} className="inline-block w-[2.5ch] text-center hover:bg-blue-900 transition-colors">{byte}</span>
                    ))}
                    {currentObj.size > 2048 && <div className="w-full mt-4 text-gray-500">... [TRUNCATED] ...</div>}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center font-mono text-gray-500 gap-4">
            <RiDatabase2Line className="text-6xl opacity-20" />
            <p>Search for an object to inspect its internals.</p>
          </div>
        )}
      </div>
    </div>
  );
};

function formatHexOffset(i: number): string {
  return "0x" + i.toString(16).padStart(6, '0');
}
