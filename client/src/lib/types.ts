// Session status represents the current state of a coding agent session
export type SessionStatus = 'active' | 'idle' | 'error' | 'pending' | 'busy' | 'waiting_input'

// Agent types supported by the system
export type AgentType = 'claude-code' | 'gemini-cli' | 'codex' | 'droid' | 'cursor' | 'custom'

// Theme types for terminal and UI color schemes
export type ThemeType =
  | 'default'
  | 'monokai'
  | 'solarized'
  | 'dracula'
  | 'nord'
  | 'light'
  | 'github'
  | 'solarized-light'
  | 'one-light'
  | 'atom-light'

// Monospace font options
export type FontType = 'jetbrains' | 'fira' | 'source' | 'ibm'

// Session from the backend API
export interface Session {
  id: string
  path: string
  state: string
  isActive: boolean
}

// Worktree from the backend API
export interface Worktree {
  path: string
  branch?: string
  isMainWorktree: boolean
  hasSession: boolean
}

// Project from the backend API
export interface Project {
  name: string
  path: string
  description?: string
  lastAccessed: number
  isValid?: boolean
}

// Connection status for Socket.IO
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'
