import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { TerminalView } from './components/TerminalView';
import { PresetSelector } from './components/PresetSelector';
import { Settings } from './components/Settings';
import { NewWorktree } from './components/NewWorktree';
import { Terminal, GitBranch, FolderGit2, ChevronDown, Settings as SettingsIcon, Trash2, Plus } from 'lucide-react'; 

// Helper to get token
const getToken = () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
        localStorage.setItem('ccmanager_token', token);
        window.history.replaceState({}, '', '/');
        return token;
    }
    return localStorage.getItem('ccmanager_token');
};

const token = getToken();

// Initialize socket with token
const socket: Socket = io({
    auth: { token },
    query: { token }
});

interface Session {
    id: string;
    path: string;
    state: string;
    isActive: boolean;
}

interface Worktree {
    path: string;
    branch?: string;
    isMainWorktree: boolean;
    hasSession: boolean;
}

interface Project {
    name: string;
    path: string;
}

interface ProjectsData {
    all: Project[];
    recent: Project[];
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [projectsData, setProjectsData] = useState<ProjectsData>({ all: [], recent: [] });
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'session' | 'worktree' | 'preset-selection' | 'settings' | 'new-worktree' | null>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [worktreeFilter, setWorktreeFilter] = useState('');
  
  const [authError, setAuthError] = useState<boolean>(false);

  const fetchData = () => {
     const headers = { 'x-access-token': token || '' };
     
     // Fetch State (for current project)
     fetch('/api/state', { headers }).then(res => res.json()).then(state => {
         if (state.selectedProject) setCurrentProject(state.selectedProject);
     });

     // Fetch Sessions
     fetch('/api/sessions', { headers })
      .then(res => {
          if (res.status === 401) throw new Error("Unauthorized");
          return res.json();
      })
      .then(setSessions)
      .catch(err => {
          if (err.message === "Unauthorized") setAuthError(true);
      });

     // Fetch Worktrees
     fetch('/api/worktrees', { headers })
      .then(res => res.json())
      .then(setWorktrees)
      .catch(console.error);
      
     // Fetch Projects
     fetch('/api/projects', { headers })
      .then(res => res.json())
      .then(setProjectsData)
      .catch(console.error);
  };

  useEffect(() => {
    if (!token) {
        setAuthError(true);
        return;
    }

    fetchData();

    socket.on('session_update', fetchData);
    socket.on('connect_error', (err) => {
        if (err.message === "Unauthorized") setAuthError(true);
    });

    return () => {
      socket.off('session_update');
      socket.off('connect_error');
    };
  }, []);

  const handleSelectProject = async (path: string) => {
      try {
          await fetch('/api/project/select', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'x-access-token': token || ''
              },
              body: JSON.stringify({ path })
          });
          setShowProjectMenu(false);
          // Reset local view state
          setViewMode(null);
          setSelectedId(null);
          // Fetch new data
          fetchData();
      } catch (e) {
          console.error(e);
      }
  };

  const handleStartSession = async (path: string, presetId?: string) => {
      try {
          const res = await fetch('/api/session/create', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'x-access-token': token || ''
              },
              body: JSON.stringify({ path, presetId })
          });
          const data = await res.json();
          if (data.success) {
              fetchData(); // This will trigger re-render and auto-selection
              setSelectedId(path); // This is the worktree path, will become session id
              setViewMode('session');
          } else {
              alert("Failed to start session: " + data.error);
          }
      } catch (e) {
          console.error(e);
          alert("An error occurred: " + (e as Error).message);
      }
  };

  const handleDeleteWorktree = async (path: string, e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent selection
      if (!confirm(`Are you sure you want to delete worktree: ${path}?`)) return;
      
      try {
          const res = await fetch('/api/worktree/delete', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'x-access-token': token || ''
              },
              body: JSON.stringify({ path, deleteBranch: true }) // Default to deleting branch too
          });
          
          if (!res.ok) {
              const data = await res.json();
              alert("Failed to delete: " + data.error);
          } else {
              fetchData();
              if (selectedId === path) {
                  setViewMode(null);
                  setSelectedId(null);
              }
          }
      } catch (e) {
          alert("Error: " + (e as Error).message);
      }
  };

  // Auto-select session if we created one for the selected worktree
  useEffect(() => {
      if (viewMode === 'worktree' && selectedId) {
          const matchingSession = sessions.find(s => s.path === selectedId);
          if (matchingSession) {
              setSelectedId(matchingSession.id);
              setViewMode('session');
          }
      }
  }, [sessions, viewMode, selectedId]);

  if (authError) {
      return (
          <div className="flex h-screen w-screen bg-gray-950 text-white items-center justify-center">
              <div className="text-center p-8 border border-red-900 rounded bg-red-950/20">
                  <h1 className="text-2xl font-bold text-red-500 mb-2">Unauthorized</h1>
                  <p className="text-gray-400">Please use the link provided in the CLI.</p>
              </div>
          </div>
      );
  }

  const selectedWorktree = worktrees.find(w => w.path === selectedId);

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-white font-mono">
      {/* Sidebar */}
      <div className="w-72 border-r border-gray-800 flex flex-col bg-gray-900/50">
        <div className="p-4 border-b border-gray-800">
            <h1 className="text-lg font-bold text-blue-400 flex items-center gap-2 mb-2">
                <Terminal className="w-5 h-5" />
                {currentProject ? currentProject.name : 'CCManager'}
            </h1>
            
            {/* Project Switcher */}
            <div className="relative">
                <button 
                    onClick={() => {
                        setShowProjectMenu(!showProjectMenu);
                        if (!showProjectMenu) setProjectSearch(''); // Reset search on open
                    }}
                    className="w-full flex items-center justify-between bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded text-sm transition-colors border border-gray-700"
                >
                    <span className="flex items-center gap-2 truncate">
                        <FolderGit2 className="w-4 h-4 text-gray-400" />
                        <span className="truncate">{currentProject ? currentProject.name : 'Select Project...'}</span>
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>
                
                {showProjectMenu && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 flex flex-col">
                        <div className="p-2 border-b border-gray-700 sticky top-0 bg-gray-800 rounded-t">
                            <input
                                type="text"
                                value={projectSearch}
                                onChange={(e) => setProjectSearch(e.target.value)}
                                placeholder="Filter projects..."
                                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                            {(() => {
                                const recent = projectsData.recent || [];
                                const all = projectsData.all || [];
                                
                                const filteredRecent = recent.filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase()));
                                const recentPaths = new Set(recent.map(p => p.path));
                                const filteredAll = all.filter(p => !recentPaths.has(p.path) && p.name.toLowerCase().includes(projectSearch.toLowerCase()));
                                
                                const hasRecent = filteredRecent.length > 0;
                                const hasAll = filteredAll.length > 0;
                                
                                if (!hasRecent && !hasAll) {
                                    return <div className="px-3 py-2 text-xs text-gray-500 text-center">No projects found</div>;
                                }

                                return (
                                    <>
                                        {hasRecent && (
                                            <>
                                                <div className="px-2 py-1 text-[10px] text-gray-500 uppercase font-semibold bg-gray-800/50 sticky top-0">Recent</div>
                                                {filteredRecent.map(p => (
                                                    <button
                                                        key={p.path}
                                                        onClick={() => handleSelectProject(p.path)}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 truncate"
                                                    >
                                                        {p.name}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                        
                                        {hasRecent && hasAll && <div className="h-px bg-gray-700 my-1" />}
                                        
                                        {hasAll && (
                                            <>
                                                <div className="px-2 py-1 text-[10px] text-gray-500 uppercase font-semibold bg-gray-800/50 sticky top-0">All Projects</div>
                                                {filteredAll.map(p => (
                                                    <button
                                                        key={p.path}
                                                        onClick={() => handleSelectProject(p.path)}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 truncate"
                                                    >
                                                        {p.name}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-6">
            {/* Active Sessions */}
            <div>
                <h2 className="text-xs font-semibold text-gray-500 uppercase px-2 mb-2 tracking-wider">Active Sessions</h2>
                <div className="space-y-0.5">
                    {sessions.length === 0 && <div className="px-2 text-sm text-gray-600 italic">No active sessions</div>}
                    {sessions.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => { setSelectedId(s.id); setViewMode('session'); }}
                            className={`w-full text-left px-3 py-2 rounded text-sm truncate flex items-center gap-2 transition-colors ${
                                viewMode === 'session' && selectedId === s.id 
                                    ? 'bg-blue-600 text-white' 
                                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                            }`}
                        >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                s.state === 'busy' ? 'bg-yellow-500 animate-pulse' : 
                                s.state === 'waiting_input' ? 'bg-green-500' : 'bg-gray-500'
                            }`} />
                            <span className="truncate">{s.path.split('/').pop()}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Worktrees */}
            <div>
                <div className="flex items-center justify-between px-2 mb-2">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Worktrees</h2>
                    <button 
                        onClick={() => setViewMode('new-worktree')}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2 py-1 hover:bg-blue-900/30 rounded transition-colors"
                        title="Create New Worktree"
                    >
                        <Plus className="w-3 h-3" /> New
                    </button>
                </div>
                
                <div className="px-2 mb-2">
                    <input 
                        type="text" 
                        placeholder="Filter worktrees..." 
                        value={worktreeFilter}
                        onChange={e => setWorktreeFilter(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none placeholder-gray-600"
                    />
                </div>

                <div className="space-y-0.5">
                    {worktrees
                        .filter(w => !worktreeFilter || w.path.toLowerCase().includes(worktreeFilter.toLowerCase()) || w.branch?.toLowerCase().includes(worktreeFilter.toLowerCase()))
                        .map((w) => {
                        const hasActiveSession = sessions.some(s => s.path === w.path);
                        return (
                            <button
                                key={w.path}
                                onClick={() => { 
                                    if (hasActiveSession) {
                                        const s = sessions.find(s => s.path === w.path);
                                        if (s) { setSelectedId(s.id); setViewMode('session'); }
                                    } else {
                                        setSelectedId(w.path); 
                                        setViewMode('worktree'); 
                                    }
                                }}
                                className={`w-full text-left px-3 py-2 rounded text-sm truncate flex items-center gap-2 transition-colors group ${
                                    viewMode === 'worktree' && selectedId === w.path
                                        ? 'bg-gray-700 text-white' 
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                                }`}
                            >
                                <GitBranch className="w-4 h-4 flex-shrink-0 opacity-70" />
                                <div className="flex-1 truncate">
                                    <span className={w.isMainWorktree ? "font-bold text-yellow-500" : ""}>
                                        {w.branch || w.path.split('/').pop()}
                                    </span>
                                </div>
                                {hasActiveSession ? (
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                                ) : !w.isMainWorktree && (
                                    <div 
                                        onClick={(e) => handleDeleteWorktree(w.path, e)}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 hover:bg-gray-700 rounded transition-all"
                                        title="Delete Worktree"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                    {worktrees.length > 0 && worktrees.filter(w => !worktreeFilter || w.path.toLowerCase().includes(worktreeFilter.toLowerCase()) || w.branch?.toLowerCase().includes(worktreeFilter.toLowerCase())).length === 0 && (
                        <div className="px-2 text-xs text-gray-500 italic text-center py-2">No matches</div>
                    )}
                </div>
            </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-900/30">
            <button
                onClick={() => setViewMode('settings')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                    viewMode === 'settings' 
                        ? 'bg-blue-600 text-white' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
            >
                <SettingsIcon className="w-4 h-4" />
                Settings
            </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-black">
          {viewMode === 'settings' ? (
              <Settings token={token || ''} onClose={() => setViewMode(null)} />
          ) : viewMode === 'new-worktree' ? (
              <NewWorktree 
                  token={token || ''} 
                  onClose={() => setViewMode(null)} 
                  onSuccess={() => { fetchData(); setViewMode(null); }}
                  projectName={currentProject?.name}
              />
          ) : viewMode === 'session' && selectedId ? (
              <TerminalView 
                  key={selectedId} 
                  sessionId={selectedId} 
                  socket={socket} 
              />
          ) : viewMode === 'worktree' && selectedWorktree ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <GitBranch className="w-16 h-16 text-gray-700 mb-4" />
                  <h2 className="text-2xl font-bold text-white mb-2">
                      {selectedWorktree.branch || 'Main Worktree'}
                  </h2>
                  <p className="text-gray-500 mb-8 max-w-md break-all">
                      {selectedWorktree.path}
                  </p>
                  
                  {/* Preset Selection */}
                  <PresetSelector 
                    onSelect={(presetId) => handleStartSession(selectedWorktree.path, presetId)}
                    onCancel={() => setViewMode(null)} // Close preset selector
                    token={token || ''}
                    selectedWorktreePath={selectedWorktree.path}
                  />
              </div>
          ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                  <Terminal className="w-16 h-16 mb-4 opacity-20" />
                  <p>Select a session or worktree to get started</p>
              </div>
          )}
      </div>
    </div>
  );
}

export default App;
