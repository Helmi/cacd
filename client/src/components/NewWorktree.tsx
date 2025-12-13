import React, { useEffect, useState } from 'react';
import { X, FolderPlus } from 'lucide-react';

interface NewWorktreeProps {
    token: string;
    onClose: () => void;
    onSuccess: () => void;
    projectName?: string;
}

export const NewWorktree = ({ token, onClose, onSuccess, projectName }: NewWorktreeProps) => {
    const [branches, setBranches] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pattern, setPattern] = useState('../{branch}');

    // Form State
    const [baseBranch, setBaseBranch] = useState('main');
    const [newBranch, setNewBranch] = useState('');
    const [path, setPath] = useState('');
    const [autoPath, setAutoPath] = useState(true);
    const [copySession, setCopySession] = useState(true);
    const [copyClaude, setCopyClaude] = useState(true);

    useEffect(() => {
        setLoading(true);
        // Fetch branches
        fetch('/api/branches', { headers: { 'x-access-token': token } })
            .then(res => res.json())
            .then(data => {
                setBranches(data);
                if (data.includes('main')) setBaseBranch('main');
                else if (data.includes('master')) setBaseBranch('master');
                else if (data.length > 0) setBaseBranch(data[0]);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));

        // Fetch config
        fetch('/api/config', { headers: { 'x-access-token': token } })
            .then(res => res.json())
            .then(data => {
                if (data.worktree?.autoDirectoryPattern) {
                    setPattern(data.worktree.autoDirectoryPattern);
                }
                if (data.worktree?.copySessionData !== undefined) {
                    setCopySession(data.worktree.copySessionData);
                }
            })
            .catch(console.error);
    }, [token]);

    // Auto-generate path logic
    useEffect(() => {
        if (autoPath && newBranch) {
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
    }, [newBranch, autoPath, pattern, projectName]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
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

            onSuccess();
            onClose();
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
                    <FolderPlus className="w-6 h-6 text-blue-400" />
                    New Worktree
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

            <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
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

                <div>
                    <label className="block text-sm text-gray-400 mb-1">Worktree Path</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={path}
                            onChange={(e) => { setPath(e.target.value); setAutoPath(false); }}
                            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setAutoPath(!autoPath)}
                            className={`px-3 py-2 rounded text-sm border ${autoPath ? 'bg-blue-900/30 border-blue-700 text-blue-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                        >
                            Auto
                        </button>
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

                <div className="pt-6">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold disabled:opacity-50"
                    >
                        {submitting ? 'Creating...' : 'Create Worktree'}
                    </button>
                </div>
            </form>
        </div>
    );
};
