import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import type { Session, Worktree, Project, ThemeType, FontType, ConnectionStatus, AppConfig, ChangedFile } from './types'
import { mapBackendToFrontend, mapFrontendToBackend, getDefaultConfig } from './configMapper'

// Get token from URL or localStorage
const getToken = () => {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  if (token) {
    localStorage.setItem('cacd_token', token)
    window.history.replaceState({}, '', '/')
    return token
  }
  return localStorage.getItem('cacd_token')
}

const token = getToken()

// Initialize socket with token
const socket: Socket = io({
  auth: { token },
  query: { token }
})

interface AppState {
  // Data
  projects: Project[]
  worktrees: Worktree[]
  sessions: Session[]
  currentProject: Project | null

  // UI State
  selectedSessions: string[]
  focusedSessionId: string | null
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  contextSidebarSessionId: string | null

  // Modal State
  addProjectModalOpen: boolean
  addWorktreeModalOpen: boolean
  addWorktreeProjectPath: string | null  // Pre-selected project context for worktree
  addSessionModalOpen: boolean
  addSessionWorktreePath: string | null  // Pre-selected worktree context
  addSessionProjectPath: string | null  // Pre-selected project context
  settingsModalOpen: boolean

  // File Diff Viewing State
  viewingFileDiff: { sessionId: string; file: ChangedFile; worktreePath: string } | null

  // Config
  config: AppConfig
  configLoading: boolean

  // Theme
  theme: ThemeType
  font: FontType
  fontScale: number

  // Connection
  connectionStatus: ConnectionStatus

  // Server info
  isDevMode: boolean

  // Error handling
  error: string | null

  // Socket
  socket: Socket
}

interface AppActions {
  // Data fetching
  fetchData: () => void
  selectProject: (path: string) => Promise<void>

  // Session selection
  selectSession: (sessionId: string) => void
  deselectSession: (sessionId: string) => void
  toggleSession: (sessionId: string) => void
  clearSessions: () => void
  focusSession: (sessionId: string) => void

  // Sidebar
  toggleSidebar: () => void
  collapseSidebar: () => void
  expandSidebar: () => void

  // Context sidebar
  openContextSidebar: (sessionId: string) => void
  closeContextSidebar: () => void
  toggleContextSidebar: (sessionId: string) => void

  // Theme
  setTheme: (theme: ThemeType) => void
  setFont: (font: FontType) => void
  setFontScale: (scale: number) => void

  // Session management
  createSession: (path: string, presetId?: string, sessionName?: string) => Promise<boolean>
  stopSession: (sessionId: string) => Promise<void>

  // Project management
  addProject: (path: string, description?: string) => Promise<boolean>
  removeProject: (path: string) => Promise<boolean>

  // Worktree management
  createWorktree: (path: string, branch: string, baseBranch: string, copySessionData: boolean, copyClaudeDirectory: boolean, projectPath?: string) => Promise<boolean>
  deleteWorktree: (path: string, deleteBranch: boolean, projectPath?: string) => Promise<boolean>

  // Modal actions
  openAddProjectModal: () => void
  closeAddProjectModal: () => void
  openAddWorktreeModal: (projectPath?: string) => void
  closeAddWorktreeModal: () => void
  openAddSessionModal: (worktreePath?: string, projectPath?: string) => void
  closeAddSessionModal: () => void
  openSettingsModal: () => void
  closeSettingsModal: () => void

  // Config
  updateConfig: (config: AppConfig) => Promise<boolean>
  configLoading: boolean

  // File diff viewing
  openFileDiff: (sessionId: string, file: ChangedFile, worktreePath: string) => void
  closeFileDiff: () => void

  // Error handling
  clearError: () => void
}

type AppStore = AppState & AppActions

const AppContext = createContext<AppStore | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  // Data state
  const [projects, setProjects] = useState<Project[]>([])
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentProject, setCurrentProject] = useState<Project | null>(null)

  // UI state
  const [selectedSessions, setSelectedSessions] = useState<string[]>([])
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [contextSidebarSessionId, setContextSidebarSessionId] = useState<string | null>(null)

  // Modal state
  const [addProjectModalOpen, setAddProjectModalOpen] = useState(false)
  const [addWorktreeModalOpen, setAddWorktreeModalOpen] = useState(false)
  const [addWorktreeProjectPath, setAddWorktreeProjectPath] = useState<string | null>(null)
  const [addSessionModalOpen, setAddSessionModalOpen] = useState(false)
  const [addSessionWorktreePath, setAddSessionWorktreePath] = useState<string | null>(null)
  const [addSessionProjectPath, setAddSessionProjectPath] = useState<string | null>(null)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [viewingFileDiff, setViewingFileDiff] = useState<{ sessionId: string; file: ChangedFile; worktreePath: string } | null>(null)

  // Config state - loaded from backend API
  const [config, setConfig] = useState<AppConfig>(getDefaultConfig())
  const [configLoading, setConfigLoading] = useState(true)

  // Theme state - load from localStorage
  const [theme, setThemeState] = useState<ThemeType>(() => {
    return (localStorage.getItem('cacd_theme') as ThemeType) || 'default'
  })
  const [font, setFontState] = useState<FontType>(() => {
    return (localStorage.getItem('cacd_font') as FontType) || 'jetbrains'
  })
  const [fontScale, setFontScaleState] = useState(() => {
    return parseInt(localStorage.getItem('cacd_fontScale') || '100', 10)
  })

  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')

  // Server info
  const [isDevMode, setIsDevMode] = useState(false)

  // Error state
  const [error, setError] = useState<string | null>(null)

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    root.className = root.className.replace(/theme-\w+/g, '')
    if (theme !== 'default') {
      root.classList.add(`theme-${theme}`)
    }
    localStorage.setItem('cacd_theme', theme)
  }, [theme])

  // Apply font to body
  useEffect(() => {
    const body = document.body
    body.className = body.className.replace(/font-\w+/g, '')
    body.classList.add(`font-${font}`)
    localStorage.setItem('cacd_font', font)
  }, [font])

  // Apply font scale
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale}%`
    localStorage.setItem('cacd_fontScale', String(fontScale))
  }, [fontScale])

  const fetchData = useCallback(async () => {
    const headers = { 'x-access-token': token || '' }

    const handleFetchError = (endpoint: string) => (err: Error) => {
      console.error(`Failed to fetch ${endpoint}:`, err)
      setError(`Failed to load data from server. Check your connection.`)
    }

    try {
      // Fetch all data in parallel (including config)
      const [stateRes, sessionsRes, worktreesRes, projectsRes, configRes] = await Promise.all([
        fetch('/api/state', { headers }),
        fetch('/api/sessions', { headers }),
        fetch('/api/worktrees', { headers }),
        fetch('/api/projects', { headers }),
        fetch('/api/config', { headers }),
      ])

      // Check for HTTP errors
      if (!stateRes.ok || !sessionsRes.ok || !worktreesRes.ok || !projectsRes.ok) {
        setError('Failed to load data from server. Some requests returned errors.')
        return
      }

      const [state, sessionsData, worktreesData, projectsData] = await Promise.all([
        stateRes.json(),
        sessionsRes.json(),
        worktreesRes.json(),
        projectsRes.json(),
      ])

      if (state.selectedProject) setCurrentProject(state.selectedProject)
      if (state.isDevMode !== undefined) setIsDevMode(state.isDevMode)
      setSessions(sessionsData)
      setWorktrees(worktreesData)
      setProjects(projectsData.projects || [])

      // Load config from backend
      if (configRes.ok) {
        const configData = await configRes.json()
        setConfig(mapBackendToFrontend(configData))
      }
      setConfigLoading(false)

      // Clear any previous error on success
      setError(null)
    } catch (err) {
      handleFetchError('data')(err as Error)
      setConfigLoading(false)
    }
  }, [])

  // Socket.IO event handlers
  useEffect(() => {
    socket.on('connect', () => setConnectionStatus('connected'))
    socket.on('disconnect', () => setConnectionStatus('disconnected'))
    socket.on('connect_error', () => setConnectionStatus('error'))
    socket.on('session_update', fetchData)

    fetchData()

    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('connect_error')
      socket.off('session_update')
    }
  }, [fetchData])

  const selectProject = async (path: string) => {
    try {
      const res = await fetch('/api/project/select', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token || ''
        },
        body: JSON.stringify({ path })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to select project')
        return
      }
      setSelectedSessions([])
      fetchData()
    } catch (e) {
      console.error(e)
      setError('Failed to select project. Check your connection.')
    }
  }

  const selectSession = (sessionId: string) => {
    setSelectedSessions([sessionId])
    setFocusedSessionId(sessionId)
    setContextSidebarSessionId(sessionId)
  }

  const deselectSession = (sessionId: string) => {
    setSelectedSessions(prev => {
      const newSessions = prev.filter(id => id !== sessionId)
      // If we removed the focused session, focus the first remaining one
      if (focusedSessionId === sessionId && newSessions.length > 0) {
        setFocusedSessionId(newSessions[0])
      } else if (newSessions.length === 0) {
        setFocusedSessionId(null)
      }
      return newSessions
    })
    if (contextSidebarSessionId === sessionId) {
      setContextSidebarSessionId(null)
    }
  }

  const toggleSession = (sessionId: string) => {
    setSelectedSessions(prev => {
      if (prev.includes(sessionId)) {
        const newSessions = prev.filter(id => id !== sessionId)
        if (focusedSessionId === sessionId && newSessions.length > 0) {
          setFocusedSessionId(newSessions[0])
        }
        if (newSessions.length === 1) {
          setContextSidebarSessionId(newSessions[0])
        }
        return newSessions
      }
      const newSessions = [...prev, sessionId]
      // Focus the newly added session
      setFocusedSessionId(sessionId)
      if (newSessions.length > 2) {
        setContextSidebarSessionId(null)
      }
      return newSessions
    })
  }

  const clearSessions = () => {
    setSelectedSessions([])
    setFocusedSessionId(null)
    setContextSidebarSessionId(null)
  }

  const focusSession = (sessionId: string) => {
    setFocusedSessionId(sessionId)
  }

  const toggleSidebar = () => setSidebarOpen(prev => !prev)
  const collapseSidebar = () => setSidebarCollapsed(true)
  const expandSidebar = () => setSidebarCollapsed(false)

  const openContextSidebar = (sessionId: string) => setContextSidebarSessionId(sessionId)
  const closeContextSidebar = () => setContextSidebarSessionId(null)
  const toggleContextSidebar = (sessionId: string) => {
    setContextSidebarSessionId(prev => prev === sessionId ? null : sessionId)
  }

  const setTheme = (t: ThemeType) => setThemeState(t)
  const setFont = (f: FontType) => setFontState(f)
  const setFontScale = (s: number) => setFontScaleState(s)

  const createSession = async (path: string, presetId?: string, sessionName?: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/session/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token || ''
        },
        body: JSON.stringify({ path, presetId, sessionName })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create session')
        return false
      }
      if (data.success) {
        fetchData()
        setSelectedSessions([data.id])
        setFocusedSessionId(data.id)
        setContextSidebarSessionId(data.id) // Auto-open context sidebar for new sessions
        return true
      }
      return false
    } catch (e) {
      console.error(e)
      setError('Failed to create session. Check your connection.')
      return false
    }
  }

  const stopSession = async (sessionId: string) => {
    try {
      const res = await fetch('/api/session/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token || ''
        },
        body: JSON.stringify({ id: sessionId })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to stop session')
        return
      }
      fetchData()
    } catch (e) {
      console.error(e)
      setError('Failed to stop session. Check your connection.')
    }
  }

  const clearError = () => setError(null)

  // Modal actions
  const openAddProjectModal = () => setAddProjectModalOpen(true)
  const closeAddProjectModal = () => setAddProjectModalOpen(false)
  const openAddWorktreeModal = (projectPath?: string) => {
    setAddWorktreeProjectPath(projectPath || null)
    setAddWorktreeModalOpen(true)
  }
  const closeAddWorktreeModal = () => {
    setAddWorktreeModalOpen(false)
    setAddWorktreeProjectPath(null)
  }
  const openAddSessionModal = (worktreePath?: string, projectPath?: string) => {
    setAddSessionWorktreePath(worktreePath || null)
    setAddSessionProjectPath(projectPath || null)
    setAddSessionModalOpen(true)
  }
  const closeAddSessionModal = () => {
    setAddSessionModalOpen(false)
    setAddSessionWorktreePath(null)
    setAddSessionProjectPath(null)
  }
  const openSettingsModal = () => setSettingsModalOpen(true)
  const closeSettingsModal = () => setSettingsModalOpen(false)

  const openFileDiff = (sessionId: string, file: ChangedFile, worktreePath: string) => {
    setViewingFileDiff({ sessionId, file, worktreePath })
  }
  const closeFileDiff = () => setViewingFileDiff(null)

  const updateConfig = async (newConfig: AppConfig): Promise<boolean> => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token || ''
        },
        body: JSON.stringify(mapFrontendToBackend(newConfig))
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to save configuration')
        return false
      }
      setConfig(newConfig)
      return true
    } catch (e) {
      console.error(e)
      setError('Failed to save configuration. Check your connection.')
      return false
    }
  }

  const addProject = async (path: string, description?: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/project/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token || ''
        },
        body: JSON.stringify({ path, description })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to add project')
        return false
      }
      if (data.success) {
        fetchData()
        return true
      }
      return false
    } catch (e) {
      console.error(e)
      setError('Failed to add project. Check your connection.')
      return false
    }
  }

  const removeProject = async (path: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/project/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token || ''
        },
        body: JSON.stringify({ path })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to remove project')
        return false
      }
      if (data.success) {
        fetchData()
        return true
      }
      return false
    } catch (e) {
      console.error(e)
      setError('Failed to remove project. Check your connection.')
      return false
    }
  }

  const createWorktree = async (
    path: string,
    branch: string,
    baseBranch: string,
    copySessionData: boolean,
    copyClaudeDirectory: boolean,
    projectPath?: string
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/worktree/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token || ''
        },
        body: JSON.stringify({ path, branch, baseBranch, copySessionData, copyClaudeDirectory, projectPath })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create worktree')
        return false
      }
      if (data.success) {
        fetchData()
        return true
      }
      return false
    } catch (e) {
      console.error(e)
      setError('Failed to create worktree. Check your connection.')
      return false
    }
  }

  const deleteWorktree = async (path: string, deleteBranch: boolean, projectPath?: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/worktree/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token || ''
        },
        body: JSON.stringify({ path, deleteBranch, projectPath })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to delete worktree')
        return false
      }
      if (data.success) {
        fetchData()
        return true
      }
      return false
    } catch (e) {
      console.error(e)
      setError('Failed to delete worktree. Check your connection.')
      return false
    }
  }

  const store: AppStore = {
    // State
    projects,
    worktrees,
    sessions,
    currentProject,
    selectedSessions,
    focusedSessionId,
    sidebarOpen,
    sidebarCollapsed,
    contextSidebarSessionId,
    addProjectModalOpen,
    addWorktreeModalOpen,
    addWorktreeProjectPath,
    addSessionModalOpen,
    addSessionWorktreePath,
    addSessionProjectPath,
    settingsModalOpen,
    viewingFileDiff,
    config,
    configLoading,
    theme,
    font,
    fontScale,
    connectionStatus,
    isDevMode,
    error,
    socket,

    // Actions
    fetchData,
    selectProject,
    selectSession,
    deselectSession,
    toggleSession,
    clearSessions,
    focusSession,
    toggleSidebar,
    collapseSidebar,
    expandSidebar,
    openContextSidebar,
    closeContextSidebar,
    toggleContextSidebar,
    openAddProjectModal,
    closeAddProjectModal,
    openAddWorktreeModal,
    closeAddWorktreeModal,
    openAddSessionModal,
    closeAddSessionModal,
    openSettingsModal,
    closeSettingsModal,
    openFileDiff,
    closeFileDiff,
    updateConfig,
    setTheme,
    setFont,
    setFontScale,
    createSession,
    stopSession,
    addProject,
    removeProject,
    createWorktree,
    deleteWorktree,
    clearError,
  }

  return <AppContext.Provider value={store}>{children}</AppContext.Provider>
}

export function useAppStore() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppStore must be used within an AppProvider')
  }
  return context
}

export { socket, token }
