import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import type { Session, Worktree, Project, ThemeType, FontType, ConnectionStatus } from './types'

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
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  contextSidebarSessionId: string | null

  // Theme
  theme: ThemeType
  font: FontType
  fontScale: number

  // Connection
  connectionStatus: ConnectionStatus

  // Socket
  socket: Socket
}

interface AppActions {
  // Data fetching
  fetchData: () => void
  selectProject: (path: string) => Promise<void>

  // Session selection
  selectSession: (sessionId: string) => void
  toggleSession: (sessionId: string) => void
  clearSessions: () => void

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
  createSession: (path: string, presetId?: string) => Promise<boolean>
  stopSession: (sessionId: string) => Promise<void>
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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [contextSidebarSessionId, setContextSidebarSessionId] = useState<string | null>(null)

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

  const fetchData = useCallback(() => {
    const headers = { 'x-access-token': token || '' }

    // Fetch State
    fetch('/api/state', { headers }).then(res => res.json()).then(state => {
      if (state.selectedProject) setCurrentProject(state.selectedProject)
    }).catch(console.error)

    // Fetch Sessions
    fetch('/api/sessions', { headers })
      .then(res => res.json())
      .then(setSessions)
      .catch(console.error)

    // Fetch Worktrees
    fetch('/api/worktrees', { headers })
      .then(res => res.json())
      .then(setWorktrees)
      .catch(console.error)

    // Fetch Projects
    fetch('/api/projects', { headers })
      .then(res => res.json())
      .then((data: { projects: Project[] }) => setProjects(data.projects || []))
      .catch(console.error)
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
      await fetch('/api/project/select', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token || ''
        },
        body: JSON.stringify({ path })
      })
      setSelectedSessions([])
      fetchData()
    } catch (e) {
      console.error(e)
    }
  }

  const selectSession = (sessionId: string) => {
    setSelectedSessions([sessionId])
    setContextSidebarSessionId(sessionId)
  }

  const toggleSession = (sessionId: string) => {
    setSelectedSessions(prev => {
      if (prev.includes(sessionId)) {
        const newSessions = prev.filter(id => id !== sessionId)
        if (newSessions.length === 1) {
          setContextSidebarSessionId(newSessions[0])
        }
        return newSessions
      }
      const newSessions = [...prev, sessionId]
      if (newSessions.length > 2) {
        setContextSidebarSessionId(null)
      }
      return newSessions
    })
  }

  const clearSessions = () => {
    setSelectedSessions([])
    setContextSidebarSessionId(null)
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

  const createSession = async (path: string, presetId?: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/session/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token || ''
        },
        body: JSON.stringify({ path, presetId })
      })
      const data = await res.json()
      if (data.success) {
        fetchData()
        setSelectedSessions([data.id])
        return true
      }
      return false
    } catch (e) {
      console.error(e)
      return false
    }
  }

  const stopSession = async (sessionId: string) => {
    try {
      await fetch('/api/session/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token || ''
        },
        body: JSON.stringify({ id: sessionId })
      })
      fetchData()
    } catch (e) {
      console.error(e)
    }
  }

  const store: AppStore = {
    // State
    projects,
    worktrees,
    sessions,
    currentProject,
    selectedSessions,
    sidebarOpen,
    sidebarCollapsed,
    contextSidebarSessionId,
    theme,
    font,
    fontScale,
    connectionStatus,
    socket,

    // Actions
    fetchData,
    selectProject,
    selectSession,
    toggleSession,
    clearSessions,
    toggleSidebar,
    collapseSidebar,
    expandSidebar,
    openContextSidebar,
    closeContextSidebar,
    toggleContextSidebar,
    setTheme,
    setFont,
    setFontScale,
    createSession,
    stopSession,
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

export { socket }
