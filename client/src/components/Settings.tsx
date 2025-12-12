import { useEffect, useState } from 'react';
import { Save, Plus, Trash2, X, Info } from 'lucide-react';

interface SettingsProps {
    token: string;
    onClose: () => void;
}

export const Settings = ({ token, onClose }: SettingsProps) => {
    const [config, setConfig] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'general' | 'presets' | 'hooks' | 'worktreeHooks' | 'shortcuts'>('general');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
    const [activeInfo, setActiveInfo] = useState<string | null>(null);

    useEffect(() => {
        fetchConfig();
    }, [token]);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/config', {
                headers: { 'x-access-token': token }
            });
            const data = await res.json();
            setConfig(data);
        } catch (e) {
            setMessage({ type: 'error', text: 'Failed to load config' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 
                    'x-access-token': token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });
            
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save');
            }
            
            setMessage({ type: 'success', text: 'Configuration saved successfully' });
        } catch (e) {
            setMessage({ type: 'error', text: (e as Error).message });
        } finally {
            setSaving(false);
        }
    };

    const updateConfig = (path: string[], value: any) => {
        setConfig((prev: any) => {
            const next = { ...prev };
            let current = next;
            for (let i = 0; i < path.length - 1; i++) {
                if (!current[path[i]]) current[path[i]] = {};
                current = current[path[i]];
            }
            current[path[path.length - 1]] = value;
            return next;
        });
    };

    if (loading || !config) return <div className="p-8 text-gray-400">Loading settings...</div>;

    return (
        <div className="flex flex-col h-full bg-gray-900">
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-800">
                <h2 className="text-2xl font-bold text-white">Settings</h2>
                <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded text-gray-400 hover:text-white">
                    <X className="w-6 h-6" />
                </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar Tabs */}
                <div className="w-48 bg-gray-900/50 border-r border-gray-800 py-4">
                    <nav className="space-y-1 px-2">
                        {[
                            { id: 'general', label: 'General' },
                            { id: 'presets', label: 'Command Presets' },
                            { id: 'shortcuts', label: 'Shortcuts' },
                            { id: 'hooks', label: 'Status Hooks' },
                            { id: 'worktreeHooks', label: 'Worktree Hooks' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                    activeTab === tab.id
                                        ? 'bg-blue-600 text-white font-medium'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    {message && (
                        <div className={`mb-6 p-4 rounded ${
                            message.type === 'success' ? 'bg-green-900/20 border border-green-800 text-green-400' : 'bg-red-900/20 border border-red-800 text-red-400'
                        }`}>
                            {message.text}
                        </div>
                    )}

                    {activeTab === 'general' && (
                        <div className="space-y-8 max-w-2xl">
                            {/* Auto Approval */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
                                    <h3 className="text-lg font-medium text-white">Auto-Approval</h3>
                                    <button 
                                        onClick={() => setActiveInfo(activeInfo === 'autoApproval' ? null : 'autoApproval')}
                                        className={`transition-colors ${activeInfo === 'autoApproval' ? 'text-blue-400' : 'text-gray-500 hover:text-blue-400'}`}
                                        title="What is this?"
                                    >
                                        <Info className="w-4 h-4" />
                                    </button>
                                </div>

                                {activeInfo === 'autoApproval' && (
                                    <div className="bg-blue-900/20 border border-blue-800 rounded p-4 text-sm text-gray-300 space-y-2">
                                        <p>
                                            <strong className="text-blue-400">What is Auto-Approval?</strong><br/>
                                            It allows CCManager to automatically approve safe commands (like "Run npm install?") requested by the AI assistant.
                                        </p>
                                        <ul className="list-disc list-inside space-y-1 pl-2 opacity-90">
                                            <li>Scans terminal for confirmation prompts.</li>
                                            <li>Verifies if the command is safe to run.</li>
                                            <li><strong>Timeout:</strong> Limits how long the verification process can take (default 30s). If it takes longer, it defaults to manual approval for safety.</li>
                                        </ul>
                                    </div>
                                )}

                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="autoApproval"
                                        checked={config.autoApproval?.enabled || false}
                                        onChange={(e) => updateConfig(['autoApproval', 'enabled'], e.target.checked)}
                                        className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
                                    />
                                    <label htmlFor="autoApproval" className="text-gray-300">Enable Auto-Approval</label>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm text-gray-400">Timeout (seconds)</label>
                                    <input
                                        type="number"
                                        value={config.autoApproval?.timeout || 30}
                                        onChange={(e) => updateConfig(['autoApproval', 'timeout'], parseInt(e.target.value))}
                                        className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white w-32 focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            </section>

                            {/* Worktree Defaults */}
                            <section className="space-y-4">
                                <h3 className="text-lg font-medium text-white border-b border-gray-800 pb-2">Worktree Defaults</h3>
                                
                                {/* Copy Session Data */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                id="copySessionData"
                                                checked={config.worktree?.copySessionData !== false}
                                                onChange={(e) => updateConfig(['worktree', 'copySessionData'], e.target.checked)}
                                                className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
                                            />
                                            <label htmlFor="copySessionData" className="text-gray-300">Copy Session Data by Default</label>
                                        </div>
                                        <button 
                                            onClick={() => setActiveInfo(activeInfo === 'copySessionData' ? null : 'copySessionData')}
                                            className={`transition-colors ${activeInfo === 'copySessionData' ? 'text-blue-400' : 'text-gray-500 hover:text-blue-400'}`}
                                            title="More info"
                                        >
                                            <Info className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {activeInfo === 'copySessionData' && (
                                        <div className="bg-blue-900/20 border border-blue-800 rounded p-3 text-sm text-gray-300 mb-3">
                                            When creating a new worktree, automatically copy the conversation history and context from the current session to maintain continuity.
                                        </div>
                                    )}
                                </div>

                                {/* Sort by Last Session */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                id="sortByLastSession"
                                                checked={config.worktree?.sortByLastSession || false}
                                                onChange={(e) => updateConfig(['worktree', 'sortByLastSession'], e.target.checked)}
                                                className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
                                            />
                                            <label htmlFor="sortByLastSession" className="text-gray-300">Sort by Last Session</label>
                                        </div>
                                        <button 
                                            onClick={() => setActiveInfo(activeInfo === 'sortByLastSession' ? null : 'sortByLastSession')}
                                            className={`transition-colors ${activeInfo === 'sortByLastSession' ? 'text-blue-400' : 'text-gray-500 hover:text-blue-400'}`}
                                            title="More info"
                                        >
                                            <Info className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {activeInfo === 'sortByLastSession' && (
                                        <div className="bg-blue-900/20 border border-blue-800 rounded p-3 text-sm text-gray-300 mb-3">
                                            Order worktrees in the list by the time they were last accessed/opened, instead of alphabetically.
                                        </div>
                                    )}
                                </div>

                                {/* Auto Directory */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                id="autoDirectory"
                                                checked={config.worktree?.autoDirectory || false}
                                                onChange={(e) => updateConfig(['worktree', 'autoDirectory'], e.target.checked)}
                                                className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
                                            />
                                            <label htmlFor="autoDirectory" className="text-gray-300">Auto-generate Directories</label>
                                        </div>
                                        <button 
                                            onClick={() => setActiveInfo(activeInfo === 'autoDirectory' ? null : 'autoDirectory')}
                                            className={`transition-colors ${activeInfo === 'autoDirectory' ? 'text-blue-400' : 'text-gray-500 hover:text-blue-400'}`}
                                            title="More info"
                                        >
                                            <Info className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {activeInfo === 'autoDirectory' && (
                                        <div className="bg-blue-900/20 border border-blue-800 rounded p-3 text-sm text-gray-300 mb-3">
                                            Automatically suggest directory names when creating new worktrees based on the branch name.
                                        </div>
                                    )}
                                    
                                    {config.worktree?.autoDirectory && (
                                        <div className="ml-7 mt-2 space-y-1">
                                            <label className="block text-sm text-gray-400">Directory Pattern</label>
                                            <input
                                                type="text"
                                                value={config.worktree?.autoDirectoryPattern || '../{branch}'}
                                                onChange={(e) => updateConfig(['worktree', 'autoDirectoryPattern'], e.target.value)}
                                                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white w-full focus:outline-none focus:border-blue-500 text-sm"
                                                placeholder="../{branch}"
                                            />
                                            <p className="text-xs text-gray-500">Use <span className="font-mono text-gray-300">{'{branch}'}</span> as a placeholder.</p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'presets' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-medium text-white">Command Presets</h3>
                                <button
                                    onClick={() => {
                                        const newPreset = {
                                            id: crypto.randomUUID(),
                                            name: 'New Preset',
                                            command: 'claude',
                                            args: [],
                                            detectionStrategy: 'claude'
                                        };
                                        const newPresets = [...(config.commandPresets?.presets || []), newPreset];
                                        updateConfig(['commandPresets', 'presets'], newPresets);
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white"
                                >
                                    <Plus className="w-4 h-4" /> Add Preset
                                </button>
                            </div>

                            <div className="space-y-4">
                                {(config.commandPresets?.presets || []).map((preset: any, index: number) => (
                                    <div key={preset.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-4">
                                        <div className="flex justify-between items-start gap-4">
                                            <div className="flex-1 grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="text-xs text-gray-500 uppercase">Name</label>
                                                    <input
                                                        type="text"
                                                        value={preset.name}
                                                        onChange={(e) => {
                                                            const p = [...config.commandPresets.presets];
                                                            p[index].name = e.target.value;
                                                            updateConfig(['commandPresets', 'presets'], p);
                                                        }}
                                                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs text-gray-500 uppercase">Command</label>
                                                    <input
                                                        type="text"
                                                        value={preset.command}
                                                        onChange={(e) => {
                                                            const p = [...config.commandPresets.presets];
                                                            p[index].command = e.target.value;
                                                            updateConfig(['commandPresets', 'presets'], p);
                                                        }}
                                                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                                                    />
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const p = config.commandPresets.presets.filter((_:any, i:number) => i !== index);
                                                    updateConfig(['commandPresets', 'presets'], p);
                                                }}
                                                className="text-gray-500 hover:text-red-400 p-1"
                                                title="Delete Preset"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-xs text-gray-500 uppercase">Args (comma separated)</label>
                                                <input
                                                    type="text"
                                                    value={preset.args?.join(', ') || ''}
                                                    onChange={(e) => {
                                                        const p = [...config.commandPresets.presets];
                                                        p[index].args = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                                        updateConfig(['commandPresets', 'presets'], p);
                                                    }}
                                                    placeholder="--resume, --print"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-gray-500 uppercase">Detection Strategy</label>
                                                <select
                                                    value={preset.detectionStrategy || 'claude'}
                                                    onChange={(e) => {
                                                        const p = [...config.commandPresets.presets];
                                                        p[index].detectionStrategy = e.target.value;
                                                        updateConfig(['commandPresets', 'presets'], p);
                                                    }}
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                                                >
                                                    <option value="claude">Claude</option>
                                                    <option value="gemini">Gemini</option>
                                                    <option value="cursor">Cursor</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'shortcuts' && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-medium text-white border-b border-gray-800 pb-2">Keyboard Shortcuts</h3>
                            <div className="space-y-4">
                                {Object.entries(config.shortcuts || {}).map(([key, shortcut]: [string, any]) => (
                                    <div key={key} className="flex items-center justify-between bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                                        <span className="text-gray-300 font-medium capitalize">
                                            {key.replace(/([A-Z])/g, ' $1').trim()}
                                        </span>
                                        <div className="flex items-center gap-3">
                                            {['ctrl', 'alt', 'shift'].map(mod => (
                                                <div key={mod} className="flex items-center gap-1">
                                                    <input
                                                        type="checkbox"
                                                        id={`${key}-${mod}`}
                                                        checked={shortcut[mod] || false}
                                                        onChange={(e) => updateConfig(['shortcuts', key, mod], e.target.checked)}
                                                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600"
                                                    />
                                                    <label htmlFor={`${key}-${mod}`} className="text-xs text-gray-400 uppercase">{mod}</label>
                                                </div>
                                            ))}
                                            <div className="w-px h-6 bg-gray-700 mx-2" />
                                            <div className="flex items-center gap-2">
                                                <label className="text-xs text-gray-400 uppercase">Key</label>
                                                <input
                                                    type="text"
                                                    value={shortcut.key}
                                                    onChange={(e) => updateConfig(['shortcuts', key, 'key'], e.target.value)}
                                                    className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-center uppercase"
                                                    maxLength={5}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-gray-500">Note: Ctrl+C, Ctrl+D, and Ctrl+[ are reserved and cannot be used.</p>
                        </div>
                    )}

                    {activeTab === 'hooks' && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-medium text-white border-b border-gray-800 pb-2">Status Hooks</h3>
                            <p className="text-sm text-gray-400">Run shell commands when session state changes.</p>
                            
                            <div className="space-y-4">
                                {['idle', 'busy', 'waiting_input', 'pending_auto_approval'].map((status) => (
                                    <div key={status} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-300 font-medium capitalize">
                                                On {status.replace(/_/g, ' ')}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <label className="text-sm text-gray-400">Enabled</label>
                                                <input
                                                    type="checkbox"
                                                    checked={config.statusHooks?.[status]?.enabled || false}
                                                    onChange={(e) => {
                                                        const hooks = { ...(config.statusHooks || {}) };
                                                        if (!hooks[status]) hooks[status] = { command: '', enabled: false };
                                                        hooks[status].enabled = e.target.checked;
                                                        updateConfig(['statusHooks'], hooks);
                                                    }}
                                                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600"
                                                />
                                            </div>
                                        </div>
                                        <input
                                            type="text"
                                            value={config.statusHooks?.[status]?.command || ''}
                                            onChange={(e) => {
                                                const hooks = { ...(config.statusHooks || {}) };
                                                if (!hooks[status]) hooks[status] = { command: '', enabled: false };
                                                hooks[status].command = e.target.value;
                                                updateConfig(['statusHooks'], hooks);
                                            }}
                                            placeholder={`Command to run when ${status}...`}
                                            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'worktreeHooks' && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-medium text-white border-b border-gray-800 pb-2">Worktree Hooks</h3>
                            <p className="text-sm text-gray-400">Run shell commands after worktree creation.</p>
                            
                            <div className="space-y-4">
                                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-300 font-medium">Post Creation</span>
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm text-gray-400">Enabled</label>
                                            <input
                                                type="checkbox"
                                                checked={config.worktreeHooks?.post_creation?.enabled || false}
                                                onChange={(e) => {
                                                    const hooks = { ...(config.worktreeHooks || {}) };
                                                    if (!hooks.post_creation) hooks.post_creation = { command: '', enabled: false };
                                                    hooks.post_creation.enabled = e.target.checked;
                                                    updateConfig(['worktreeHooks'], hooks);
                                                }}
                                                className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600"
                                            />
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        value={config.worktreeHooks?.post_creation?.command || ''}
                                        onChange={(e) => {
                                            const hooks = { ...(config.worktreeHooks || {}) };
                                            if (!hooks.post_creation) hooks.post_creation = { command: '', enabled: false };
                                            hooks.post_creation.command = e.target.value;
                                            updateConfig(['worktreeHooks'], hooks);
                                        }}
                                        placeholder="Command to run after worktree creation (e.g. npm install)"
                                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                                    />
                                    <p className="text-xs text-gray-500">Variables available: $WORKTREE_PATH, $BRANCH_NAME, $GIT_ROOT</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-4">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white font-bold disabled:opacity-50"
                >
                    {saving ? 'Saving...' : (
                        <>
                            <Save className="w-4 h-4" /> Save Changes
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};