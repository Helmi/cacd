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

            const data = await res.json();

            // Show warnings if any (e.g., hook failures)
            if (data.worktree?.warnings?.length > 0) {
                alert(`Worktree created with warnings:\n${data.worktree.warnings.join('\n')}`);
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
                    <p className="text-xs text-gray-500 mt-1">The existing branch to branch off from (source of code).</p>
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
                    <p className="text-xs text-gray-500 mt-1">The name of the new git branch to be created.</p>
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
                            <label htmlFor="autoPath" className="text-xs text-gray-400">Auto-generate from branch name</label>
                        </div>
                        <input
                            type="text"
                            value={path}
                            onChange={(e) => { setPath(e.target.value); setAutoPath(false); }}
                            className={`w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white ${autoPath ? 'opacity-70 cursor-not-allowed' : ''}`}
                            readOnly={autoPath}
                        />
                    </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-gray-800">
                    <div>
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
                        <p className="ml-7 text-xs text-gray-500 mt-1">
                            Preserves the conversation history, context, and memory from your currently active session, so you don't lose context when switching branches.
                        </p>
                    </div>
                    
                    <div>
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
                        <p className="ml-7 text-xs text-gray-500 mt-1">
                            Copies the <code>.claude</code> configuration directory from the base branch to the new worktree. This ensures project-specific settings and memories are carried over.
                        </p>
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
