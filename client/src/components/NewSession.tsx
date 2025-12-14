import React, { useEffect, useState } from 'react';
import { X, GitBranch, FolderPlus, Play, Terminal } from 'lucide-react';

interface NewSessionProps {
    token: string;
    onClose: () => void;
    onSessionCreated: (sessionId: string) => void;
    projectName?: string;
}

interface CommandPreset {
    id: string;
    name: string;
}

interface Worktree {
    path: string;
    branch?: string;
    hasSession: boolean;
}

export const NewSession = ({ token, onClose, onSessionCreated, projectName }: NewSessionProps) => {
    const [activeTab, setActiveTab] = useState<'new' | 'existing'>('new');
    const [branches, setBranches] = useState<string[]>([]);
    const [worktrees, setWorktrees] = useState<Worktree[]>([]);
    const [presets, setPresets] = useState<CommandPreset[]>([]);
    
    // Form State (New)
    const [baseBranch, setBaseBranch] = useState('main');
    const [newBranch, setNewBranch] = useState('');
    const [path, setPath] = useState('');
    const [autoPath, setAutoPath] = useState(true);
    const [copySession, setCopySession] = useState(true);
    const [copyClaude, setCopyClaude] = useState(true);
    const [pattern, setPattern] = useState('../{branch}');

    // Form State (Existing)
    const [selectedWorktreePath, setSelectedWorktreePath] = useState('');

    // Shared
    const [selectedPresetId, setSelectedPresetId] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        const headers = { 'x-access-token': token };

        Promise.all([
            fetch('/api/branches', { headers }).then(r => r.json()),
            fetch('/api/worktrees', { headers }).then(r => r.json()),
            fetch('/api/presets', { headers }).then(r => r.json()),
            fetch('/api/config', { headers }).then(r => r.json())
        ])
        .then(([branchData, worktreeData, presetData, configData]) => {
            // Branches
            setBranches(branchData);
            if (branchData.includes('main')) setBaseBranch('main');
            else if (branchData.includes('master')) setBaseBranch('master');
            else if (branchData.length > 0) setBaseBranch(branchData[0]);

            // Worktrees (filter out those with sessions)
            const available = worktreeData.filter((w: Worktree) => !w.hasSession);
            setWorktrees(available);
            if (available.length > 0) setSelectedWorktreePath(available[0].path);

            // Presets
            setPresets(presetData);
            if (presetData.length > 0) setSelectedPresetId(presetData[0].id);

            // Config
            if (configData.worktree?.autoDirectoryPattern) {
                setPattern(configData.worktree.autoDirectoryPattern);
            }
            if (configData.worktree?.copySessionData !== undefined) {
                setCopySession(configData.worktree.copySessionData);
            }
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    }, [token]);

    // Auto-generate path logic
    useEffect(() => {
        if (activeTab === 'new' && autoPath && newBranch) {
            let generated = pattern;
            const sanitizedBranch = newBranch
                .replace(/\//g, '-')
                .replace(/[^a-zA-Z0-9-_.]+/g, '')
                .replace(/^-+|-+$/g, '')
                .toLowerCase();
            
            generated = generated.replace(/{branch}/g, sanitizedBranch);
            generated = generated.replace(/{branch-name}/g, sanitizedBranch);
            
            if (projectName) {
                generated = generated.replace(/{project}/g, projectName);
            }
            
            setPath(generated);
        }
    }, [newBranch, autoPath, pattern, projectName, activeTab]);

    const handleCreateSession = async (worktreePath: string) => {
        const res = await fetch('/api/session/create', {
            method: 'POST',
            headers: { 
                'x-access-token': token,
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ path: worktreePath, presetId: selectedPresetId })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to start session');
        }

        const data = await res.json();
        return data.id;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            let targetPath = selectedWorktreePath;

            if (activeTab === 'new') {
                targetPath = path;
                // Create Worktree First
                const res = await fetch('/api/worktree/create', {
                    method: 'POST',
                    headers: { 
                        'x-access-token': token,
                        'Content-Type': 'application/json' 
                    },
                    body: JSON.stringify({
                        path,
                        branch: newBranch,
                        baseBranch,
                        copySessionData: copySession,
                        copyClaudeDirectory: copyClaude
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Failed to create worktree');
                }
                
                const data = await res.json();
                if (data.worktree && data.worktree.path) {
                    targetPath = data.worktree.path;
                }
            }

            // Start Session
            const sessionId = await handleCreateSession(targetPath);
            onSessionCreated(sessionId);

        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-900 p-8">
            <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Play className="w-6 h-6 text-green-400" />
                    New Session
                </h2>
                <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded text-gray-400">
                    <X className="w-6 h-6" />
                </button>
            </div>

            {error && (
                <div className="bg-red-900/20 border border-red-800 text-red-400 p-4 rounded mb-6">
                    Error: {error}
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-4 mb-6 border-b border-gray-800">
                <button
                    onClick={() => setActiveTab('new')}
                    className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${
                        activeTab === 'new' 
                            ? 'border-blue-500 text-white' 
                            : 'border-transparent text-gray-400 hover:text-gray-300'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <FolderPlus className="w-4 h-4" /> New Worktree
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab('existing')}
                    className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${
                        activeTab === 'existing' 
                            ? 'border-blue-500 text-white' 
                            : 'border-transparent text-gray-400 hover:text-gray-300'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <GitBranch className="w-4 h-4" /> Existing Worktree
                    </div>
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
                
                {activeTab === 'new' ? (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Base Branch</label>
                                <select
                                    value={baseBranch}
                                    onChange={(e) => setBaseBranch(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                                    disabled={loading}
                                >
                                    {branches.map(b => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">New Branch Name</label>
                                <input
                                    type="text"
                                    value={newBranch}
                                    onChange={(e) => setNewBranch(e.target.value)}
                                    placeholder="feature/my-feature"
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Worktree Path</label>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 mb-1">
                                    <input
                                        type="checkbox"
                                        id="autoPath"
                                        checked={autoPath}
                                        onChange={(e) => setAutoPath(e.target.checked)}
                                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600"
                                    />
                                    <label htmlFor="autoPath" className="text-xs text-gray-400">Auto-generate</label>
                                </div>
                                <input
                                    type="text"
                                    value={path}
                                    onChange={(e) => { setPath(e.target.value); setAutoPath(false); }}
                                    className={`w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white ${autoPath ? 'opacity-70 cursor-not-allowed' : ''}`}
                                    readOnly={autoPath}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-3 pt-4 border-t border-gray-800">
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="copySession"
                                    checked={copySession}
                                    onChange={(e) => setCopySession(e.target.checked)}
                                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600"
                                />
                                <label htmlFor="copySession" className="text-gray-300">Copy Session Data</label>
                            </div>
                            
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="copyClaude"
                                    checked={copyClaude}
                                    onChange={(e) => setCopyClaude(e.target.checked)}
                                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600"
                                />
                                <label htmlFor="copyClaude" className="text-gray-300">Copy .claude Directory</label>
                            </div>
                        </div>
                    </>
                ) : (
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Select Worktree</label>
                        <select
                            value={selectedWorktreePath}
                            onChange={(e) => setSelectedWorktreePath(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                            disabled={loading || worktrees.length === 0}
                        >
                            {worktrees.length === 0 && <option>No available worktrees</option>}
                            {worktrees.map(w => (
                                <option key={w.path} value={w.path}>{w.branch || w.path}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="pt-4 border-t border-gray-800">
                    <label className="block text-sm text-gray-400 mb-2">Start with Preset</label>
                    <div className="grid grid-cols-2 gap-3">
                        {presets.map(p => (
                            <button
                                type="button"
                                key={p.id}
                                onClick={() => setSelectedPresetId(p.id)}
                                className={`px-3 py-2 rounded text-sm text-left border ${
                                    selectedPresetId === p.id 
                                        ? 'bg-blue-900/30 border-blue-500 text-white' 
                                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                                }`}
                            >
                                {p.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="pt-6">
                    <button
                        type="submit"
                        disabled={submitting || (activeTab === 'existing' && !selectedWorktreePath)}
                        className="w-full px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {submitting ? 'Starting...' : (
                            <>
                                <Terminal className="w-5 h-5" /> Start Session
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};
