import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { TerminalView } from './components/TerminalView';
import { PresetSelector } from './components/PresetSelector';
import { Terminal, GitBranch } from 'lucide-react'; 

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

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'session' | 'worktree' | 'preset-selection' | null>(null);
  const [authError, setAuthError] = useState<boolean>(false);

  const fetchData = () => {
     const headers = { 'x-access-token': token || '' };
     
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
            <h1 className="text-lg font-bold text-blue-400 flex items-center gap-2">
                <Terminal className="w-5 h-5" />
                Gemini Explorer
            </h1>
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
                <h2 className="text-xs font-semibold text-gray-500 uppercase px-2 mb-2 tracking-wider">Worktrees</h2>
                <div className="space-y-0.5">
                    {worktrees.map((w) => {
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
                                className={`w-full text-left px-3 py-2 rounded text-sm truncate flex items-center gap-2 transition-colors ${
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
                                {hasActiveSession && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-black">
          {viewMode === 'session' && selectedId ? (
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
