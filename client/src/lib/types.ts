// Session status represents the current state of a coding agent session
export type SessionStatus = 'active' | 'idle' | 'error' | 'pending' | 'busy' | 'waiting_input'

// Agent types supported by the system
export type AgentType = 'claude-code' | 'gemini-cli' | 'codex' | 'droid' | 'cursor' | 'custom'

// Map backend state to display status
export function mapSessionState(state: string): SessionStatus {
  switch (state) {
    case 'busy':
      return 'active'
    case 'waiting_input':
      return 'pending'
    case 'idle':
      return 'idle'
    default:
      return 'idle'
  }
}

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
  name?: string
  path: string
  state: string
  isActive: boolean
  agentId?: string
}

// Git status for a worktree
export interface GitStatus {
  filesAdded: number
  filesDeleted: number
  aheadCount: number
  behindCount: number
  parentBranch: string | null
}

// Changed file in a worktree
export interface ChangedFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'
  additions: number
  deletions: number
}

// Directory entry for file browser
export interface DirectoryEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
}

// Worktree from the backend API
export interface Worktree {
  path: string
  branch?: string
  isMainWorktree: boolean
  hasSession: boolean
  gitStatus?: GitStatus
  gitStatusError?: string
}

/**
 * Project-specific metadata stored alongside the project.
 */
export interface ProjectMetadata {
  taskListNames?: string[] // Previously used Claude task list names
}

// Project from the backend API
export interface Project {
  name: string
  path: string
  description?: string
  lastAccessed: number
  isValid?: boolean
  metadata?: ProjectMetadata // Project-specific metadata
}

// Connection status for Socket.IO
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

// Agent option (single configurable parameter for an agent)
export interface AgentOption {
  id: string // Stable identity for storage/constraints
  flag: string // CLI flag (e.g., '--model') or empty for positional args
  label: string // UI label
  description?: string // Tooltip/help text
  type: 'boolean' | 'string'
  default?: boolean | string
  choices?: { value: string; label?: string }[] // If present, render as dropdown
  group?: string // Mutual exclusivity group
}

// Agent configuration (CLI tool or terminal)
export interface AgentConfig {
  id: string
  name: string
  description?: string
  kind: 'agent' | 'terminal'
  command: string // Executable (e.g., 'claude', '$SHELL')
  baseArgs?: string[] // Fixed args always passed
  options: AgentOption[]
  detectionStrategy?: string // For state detection (agents only)
  icon?: string // Brand icon ID or generic Lucide icon name
  iconColor?: string // Hex color (only for generic icons)
}

// Agents config from API
export interface AgentsConfig {
  agents: AgentConfig[]
  defaultAgentId: string
  schemaVersion: number
}

// Status hooks configuration
export interface StatusHooks {
  onIdle: string
  onBusy: string
  onWaitingInput: string
  onPendingAutoApproval: string
}

// Worktree hooks configuration
export interface WorktreeHooks {
  postCreation: string
}

// --- TD Integration Types ---

export interface TdAvailability {
  binaryAvailable: boolean
  version: string | null
  binaryPath: string | null
}

export interface TdProjectState {
  enabled: boolean
  initialized: boolean
  binaryAvailable: boolean
  todosDir: string | null
  dbPath: string | null
  tdRoot: string | null
}

export interface TdProjectConfig {
  enabled?: boolean
  autoStart?: boolean
  defaultPrompt?: string
}

export interface TdStatus {
  availability: TdAvailability
  projectState: TdProjectState | null
  projectConfig?: TdProjectConfig | null
}

export interface TdIssue {
  id: string
  title: string
  description: string
  status: string
  type: string
  priority: string
  points: number
  labels: string
  parent_id: string
  acceptance: string
  implementer_session: string
  reviewer_session: string
  created_at: string
  updated_at: string
  closed_at: string | null
  deleted_at: string | null
  minor: number
  created_branch: string
  creator_session: string
}

export interface TdHandoffParsed {
  id: string
  issueId: string
  sessionId: string
  done: string[]
  remaining: string[]
  decisions: string[]
  uncertain: string[]
  timestamp: string
}

export interface TdIssueFile {
  id: string
  issue_id: string
  file_path: string
  role: string
}

export interface TdIssueWithChildren extends TdIssue {
  children: TdIssue[]
  handoffs: TdHandoffParsed[]
  files: TdIssueFile[]
}

export interface TdPromptTemplate {
  name: string
  path: string
  source?: 'project' | 'global'
  effective?: boolean
  overridden?: boolean
  overridesGlobal?: boolean
  content?: string
}

export interface ProjectConfig {
  scripts?: {
    setup?: string
    teardown?: string
  }
  td?: {
    enabled?: boolean
    autoStart?: boolean
    defaultPrompt?: string
  }
  agentDefaults?: {
    agentId?: string
    options?: Record<string, boolean | string>
  }
  [key: string]: unknown
}

// Application configuration
export interface AppConfig {
  // Auto approval
  autoApprovalEnabled: boolean
  autoApprovalTimeout: number

  // Worktree defaults
  copySessionDataByDefault: boolean
  sortByLastSession: boolean
  autoGenerateDirectories: boolean
  worktreePathTemplate: string

  // Agents
  agents: AgentConfig[]

  // Hooks
  statusHooks: StatusHooks
  worktreeHooks: WorktreeHooks
}
