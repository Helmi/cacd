import { useState, useMemo, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatusIndicator } from '@/components/StatusIndicator'
import { AgentIcon } from '@/components/AgentIcon'
import { mapSessionState, type Project, type Worktree, type Session } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  GitBranch,
  PanelLeftClose,
  Plus,
  Search,
  X,
} from 'lucide-react'

export function Sidebar() {
  const {
    projects,
    worktrees,
    sessions,
    currentProject,
    selectedSessions,
    sidebarOpen,
    sidebarCollapsed,
    expandSidebar,
    toggleSidebar,
    selectSession,
    toggleSession,
    openAddProjectModal,
    openAddWorktreeModal,
    openAddSessionModal,
    removeProject,
    deleteWorktree,
    stopSession,
  } = useAppStore()

  // Separate dialog states for different actions
  const [removeProjectDialog, setRemoveProjectDialog] = useState<{
    open: boolean
    project: Project | null
  }>({ open: false, project: null })

  const [deleteWorktreeDialog, setDeleteWorktreeDialog] = useState<{
    open: boolean
    worktree: Worktree | null
    deleteBranch: boolean
    projectPath: string | null
  }>({ open: false, worktree: null, deleteBranch: false, projectPath: null })

  const [stopSessionDialog, setStopSessionDialog] = useState<{
    open: boolean
    session: Session | null
  }>({ open: false, session: null })

  // Confirm remove project
  const confirmRemoveProject = (project: Project) => {
    setRemoveProjectDialog({ open: true, project })
  }

  // Confirm delete worktree
  const confirmDeleteWorktree = (worktree: Worktree, projectPath: string) => {
    setDeleteWorktreeDialog({ open: true, worktree, deleteBranch: false, projectPath })
  }

  // Confirm stop session
  const confirmStopSession = (session: Session) => {
    setStopSessionDialog({ open: true, session })
  }

  // Tree expansion state - persisted to localStorage
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('cacd-expanded-projects')
      if (saved) {
        return new Set(JSON.parse(saved) as string[])
      }
    } catch {
      // Ignore parse errors
    }
    // Default: expand all projects
    return new Set(projects.map(p => p.path))
  })
  const [expandedWorktrees, setExpandedWorktrees] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('cacd-expanded-worktrees')
      if (saved) {
        return new Set(JSON.parse(saved) as string[])
      }
    } catch {
      // Ignore parse errors
    }
    // Default: expand all worktrees
    return new Set(worktrees.map(w => w.path))
  })

  // Track known projects and worktrees to detect newly added ones
  const [knownProjectPaths, setKnownProjectPaths] = useState<Set<string>>(() => new Set(projects.map(p => p.path)))
  const [knownWorktreePaths, setKnownWorktreePaths] = useState<Set<string>>(() => new Set(worktrees.map(w => w.path)))

  // Persist expanded state to localStorage
  useEffect(() => {
    localStorage.setItem('cacd-expanded-projects', JSON.stringify([...expandedProjects]))
  }, [expandedProjects])

  useEffect(() => {
    localStorage.setItem('cacd-expanded-worktrees', JSON.stringify([...expandedWorktrees]))
  }, [expandedWorktrees])

  // Auto-expand newly added projects and handle initial load
  useEffect(() => {
    const currentPaths = new Set(projects.map(p => p.path))
    const newProjects = projects.filter(p => !knownProjectPaths.has(p.path))

    // On first load when projects arrive and no saved state exists, expand all
    const hasSavedState = localStorage.getItem('cacd-expanded-projects') !== null
    if (!hasSavedState && projects.length > 0 && knownProjectPaths.size === 0) {
      setExpandedProjects(new Set(projects.map(p => p.path)))
    } else if (newProjects.length > 0) {
      // Auto-expand newly added projects
      setExpandedProjects(prev => {
        const next = new Set(prev)
        newProjects.forEach(p => next.add(p.path))
        return next
      })
    }

    setKnownProjectPaths(currentPaths)
  }, [projects, knownProjectPaths])

  // Auto-expand newly added worktrees and handle initial load
  useEffect(() => {
    const currentPaths = new Set(worktrees.map(w => w.path))
    const newWorktrees = worktrees.filter(w => !knownWorktreePaths.has(w.path))

    // On first load when worktrees arrive and no saved state exists, expand all
    const hasSavedState = localStorage.getItem('cacd-expanded-worktrees') !== null
    if (!hasSavedState && worktrees.length > 0 && knownWorktreePaths.size === 0) {
      setExpandedWorktrees(new Set(worktrees.map(w => w.path)))
    } else if (newWorktrees.length > 0) {
      // Auto-expand newly added worktrees
      setExpandedWorktrees(prev => {
        const next = new Set(prev)
        newWorktrees.forEach(w => next.add(w.path))
        return next
      })
    }

    setKnownWorktreePaths(currentPaths)
  }, [worktrees, knownWorktreePaths])

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilter, setShowFilter] = useState(false)

  // Auto-expand tree to show sessions
  useEffect(() => {
    if (sessions.length === 0) return

    // Find all worktree paths that have sessions
    const worktreePathsWithSessions = new Set(sessions.map(s => s.path))

    // Auto-expand worktrees with sessions
    setExpandedWorktrees(prev => {
      const next = new Set(prev)
      worktreePathsWithSessions.forEach(path => next.add(path))
      return next
    })

    // Find projects containing these worktrees and expand them
    const projectPathsToExpand = new Set<string>()
    worktreePathsWithSessions.forEach(wtPath => {
      // Find matching project
      for (const project of projects) {
        const projectName = project.path.split('/').pop() || ''
        if (wtPath.startsWith(project.path) || wtPath.includes(`/.worktrees/${projectName}/`)) {
          projectPathsToExpand.add(project.path)
          break
        }
      }
    })

    setExpandedProjects(prev => {
      const next = new Set(prev)
      projectPathsToExpand.forEach(path => next.add(path))
      return next
    })
  }, [sessions, projects])

  // Toggle project expansion
  const toggleProject = (path: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // Toggle worktree expansion
  const toggleWorktree = (path: string) => {
    setExpandedWorktrees((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery) {
      return { projects, worktrees, sessions }
    }

    const query = searchQuery.toLowerCase()

    // Filter sessions by path (which includes worktree name)
    const filteredSessions = sessions.filter(s =>
      s.path.toLowerCase().includes(query) || s.id.toLowerCase().includes(query)
    )

    // Get paths of filtered sessions
    const sessionPaths = new Set(filteredSessions.map(s => s.path))

    // Filter worktrees that have matching sessions or match the query
    const filteredWorktrees = worktrees.filter(w =>
      sessionPaths.has(w.path) ||
      w.path.toLowerCase().includes(query) ||
      w.branch?.toLowerCase().includes(query)
    )

    // For simplicity, show all projects when filtering
    // (sessions are linked to worktrees, not directly to projects)
    return {
      projects,
      worktrees: filteredWorktrees,
      sessions: filteredSessions,
    }
  }, [projects, worktrees, sessions, searchQuery])

  // Helper to get sessions for a worktree
  const getSessionsForWorktree = (worktreePath: string) => {
    return filteredData.sessions.filter(s => s.path === worktreePath)
  }

  // Helper to get worktrees for a project
  // Worktrees can be:
  // 1. Under the project path (main worktree or nested .worktrees/)
  // 2. In ~/.worktrees/projectName/ (global worktree location)
  // 3. Sibling directories with project name prefix (../{project}-{branch} pattern)
  //
  // The backend should ideally return project association with each worktree,
  // but for now we use path-based heuristics.
  const getWorktreesForProject = (projectPath: string) => {
    const projectName = projectPath.split('/').pop() || ''
    const parentDir = projectPath.split('/').slice(0, -1).join('/')

    return filteredData.worktrees.filter(w => {
      // Main worktree or nested under project
      if (w.path.startsWith(projectPath)) return true

      // Global worktree location: ~/.worktrees/projectName/
      if (w.path.includes(`/.worktrees/${projectName}/`)) return true

      // Sibling worktree with project name prefix: ../{project}-{branch}
      if (w.path.startsWith(`${parentDir}/${projectName}-`)) return true

      // Sibling directory with project name: ../{project}/{branch}
      if (w.path.startsWith(`${parentDir}/${projectName}/`)) return true

      // Handle legacy {project} placeholder in path (corrupted data)
      if (w.path.includes('/.worktrees/{project}/')) return false

      return false
    })
  }

  // Handle session click
  const handleSessionClick = (sessionId: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      toggleSession(sessionId)
    } else {
      selectSession(sessionId)
    }
  }

  // Extract name from path
  const formatName = (path: string) => path.split('/').pop() || path

  if (!sidebarOpen) return null

  // Collapsed sidebar (icon-only mode)
  if (sidebarCollapsed) {
    return (
      <aside className="flex w-10 flex-col border-r border-border bg-sidebar">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-full rounded-none border-b border-border"
          onClick={expandSidebar}
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
        <ScrollArea className="flex-1">
          <div className="flex flex-col items-center gap-1 py-2">
            {projects.map((project) => (
              <Button
                key={project.path}
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={project.name}
              >
                <Folder className="h-3.5 w-3.5" />
              </Button>
            ))}
          </div>
        </ScrollArea>
      </aside>
    )
  }

  // Expanded sidebar
  return (
    <aside className="flex w-52 flex-col border-r border-border bg-sidebar lg:w-56 overflow-hidden">
      {/* Sidebar header with filter */}
      <div className="flex items-center gap-1 border-b border-border px-1 py-1">
        {showFilter ? (
          <>
            <div className="relative flex-1">
              <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-6 pl-6 pr-6 text-sm"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0"
              onClick={() => {
                setShowFilter(false)
                setSearchQuery('')
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setShowFilter(true)}
              title="Filter sessions"
            >
              <Search className="h-3 w-3" />
            </Button>
            <span className="flex-1 truncate text-sm text-muted-foreground">Sessions</span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" title="Add new...">
                  <Plus className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem onClick={() => openAddSessionModal()} className="text-xs">
                  <Plus className="h-3 w-3 mr-2" />
                  New Session
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openAddWorktreeModal()} className="text-xs">
                  <GitBranch className="h-3 w-3 mr-2" />
                  New Worktree
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openAddProjectModal} className="text-xs">
                  <FolderPlus className="h-3 w-3 mr-2" />
                  Add Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 md:hidden"
              onClick={toggleSidebar}
              title="Close sidebar"
            >
              <PanelLeftClose className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>

      {/* Tree content */}
      <ScrollArea className="flex-1">
        <div className="py-0.5">
          {filteredData.projects.map((project, projectIndex) => {
            const projectWorktrees = getWorktreesForProject(project.path)
            const isExpanded = expandedProjects.has(project.path)
            const isCurrentProject = currentProject?.path === project.path

            return (
              <div key={project.path} className={projectIndex > 0 ? 'border-t border-border' : ''}>
                {/* Project row with context menu */}
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      onClick={() => toggleProject(project.path)}
                      className={cn(
                        'flex w-full min-w-0 items-center gap-1.5 px-2 py-1.5 text-sm hover:bg-secondary',
                        isCurrentProject && 'bg-secondary/50'
                      )}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <Folder className="h-3 w-3 shrink-0 text-primary" />
                      <span className="truncate font-medium flex-1 text-left">{project.name}</span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => openAddWorktreeModal(project.path)}>
                      <GitBranch className="h-3.5 w-3.5 mr-2" />
                      New Worktree
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => openAddSessionModal(undefined, project.path)}>
                      <Plus className="h-3.5 w-3.5 mr-2" />
                      New Session
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      destructive
                      onClick={() => confirmRemoveProject(project)}
                    >
                      <X className="h-3.5 w-3.5 mr-2" />
                      Remove Project
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>

                {/* Worktrees */}
                {isExpanded && (
                  <div className="pl-3 min-w-0">
                    {projectWorktrees.length === 0 ? (
                      <div className="px-2 py-1 text-sm text-muted-foreground italic">
                        No worktrees
                      </div>
                    ) : (
                      projectWorktrees.map((worktree) => {
                        const worktreeSessions = getSessionsForWorktree(worktree.path)
                        const isWorktreeExpanded = expandedWorktrees.has(worktree.path)

                        return (
                          <div key={worktree.path}>
                            {/* Worktree row with context menu */}
                            <ContextMenu>
                              <ContextMenuTrigger asChild>
                                <button
                                  onClick={() => toggleWorktree(worktree.path)}
                                  className="flex w-full min-w-0 items-center gap-1.5 px-1 py-1 text-sm hover:bg-secondary rounded"
                                >
                                  {isWorktreeExpanded ? (
                                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                  )}
                                  <GitBranch className="h-3 w-3 shrink-0 text-accent" />
                                  <span className={cn(
                                    'truncate text-muted-foreground flex-1 text-left',
                                    worktree.isMainWorktree && 'font-medium text-foreground/70'
                                  )}>
                                    {worktree.branch || formatName(worktree.path)}
                                  </span>
                                </button>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem onClick={() => openAddSessionModal(worktree.path)}>
                                  <Plus className="h-3.5 w-3.5 mr-2" />
                                  New Session
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  destructive
                                  onClick={() => confirmDeleteWorktree(worktree, project.path)}
                                  disabled={worktree.isMainWorktree}
                                >
                                  <X className="h-3.5 w-3.5 mr-2" />
                                  Delete Worktree
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>

                            {/* Sessions */}
                            {isWorktreeExpanded && worktreeSessions.length > 0 && (
                              <div className="space-y-px pl-4 min-w-0">
                                {worktreeSessions.map((session) => {
                                  const isSelected = selectedSessions.includes(session.id)

                                  return (
                                    <ContextMenu key={session.id}>
                                      <ContextMenuTrigger asChild>
                                        <div
                                          className={cn(
                                            'group relative flex min-w-0 items-center gap-1.5 px-1 py-1 text-sm cursor-pointer transition-colors',
                                            isSelected
                                              ? 'bg-primary/5'
                                              : 'hover:bg-secondary/50'
                                          )}
                                          onClick={(e) => handleSessionClick(session.id, e)}
                                          title="Click to view, Cmd/Ctrl+click for split view"
                                        >
                                          <StatusIndicator status={mapSessionState(session.state)} />
                                          <AgentIcon agent="claude-code" className="h-3 w-3 shrink-0" />
                                          <span className={cn(
                                            'flex-1 truncate',
                                            isSelected && 'text-primary font-medium'
                                          )}>
                                            {session.name || formatName(session.path)}
                                          </span>
                                          {/* Selection pointer triangle - points left */}
                                          <svg
                                            viewBox="0 0 6 10"
                                            className={cn(
                                              'absolute right-0 top-1/2 -translate-y-1/2 h-2.5 w-1.5 fill-primary transition-opacity',
                                              isSelected
                                                ? 'opacity-80'
                                                : 'opacity-0 group-hover:opacity-30'
                                            )}
                                          >
                                            <polygon points="6,0 6,10 0,5" />
                                          </svg>
                                        </div>
                                      </ContextMenuTrigger>
                                      <ContextMenuContent>
                                        <ContextMenuItem onClick={() => selectSession(session.id)}>
                                          View Terminal
                                        </ContextMenuItem>
                                        <ContextMenuSeparator />
                                        <ContextMenuItem
                                          destructive
                                          onClick={() => confirmStopSession(session)}
                                        >
                                          <X className="h-3.5 w-3.5 mr-2" />
                                          Stop Session
                                        </ContextMenuItem>
                                      </ContextMenuContent>
                                    </ContextMenu>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Show message if no projects */}
          {filteredData.projects.length === 0 && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              {searchQuery ? 'No matches found' : 'No projects'}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Remove Project Dialog */}
      <ConfirmDialog
        open={removeProjectDialog.open}
        onOpenChange={(open) => setRemoveProjectDialog(prev => ({ ...prev, open }))}
        title="Remove Project"
        description={`Remove "${removeProjectDialog.project?.name}" from CACD? This doesn't delete any files.`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (removeProjectDialog.project) {
            removeProject(removeProjectDialog.project.path)
          }
        }}
      />

      {/* Delete Worktree Dialog */}
      <ConfirmDialog
        open={deleteWorktreeDialog.open}
        onOpenChange={(open) => setDeleteWorktreeDialog(prev => ({ ...prev, open }))}
        title="Delete Worktree"
        description={`Delete worktree for branch "${deleteWorktreeDialog.worktree?.branch || deleteWorktreeDialog.worktree?.path.split('/').pop()}"? This removes the directory.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteWorktreeDialog.worktree) {
            deleteWorktree(
              deleteWorktreeDialog.worktree.path,
              deleteWorktreeDialog.deleteBranch,
              deleteWorktreeDialog.projectPath || undefined
            )
          }
        }}
      >
        <div className="flex items-center space-x-2">
          <Checkbox
            id="delete-branch"
            checked={deleteWorktreeDialog.deleteBranch}
            onCheckedChange={(checked) =>
              setDeleteWorktreeDialog(prev => ({ ...prev, deleteBranch: checked === true }))
            }
          />
          <label
            htmlFor="delete-branch"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Also delete the git branch
          </label>
        </div>
      </ConfirmDialog>

      {/* Stop Session Dialog */}
      <ConfirmDialog
        open={stopSessionDialog.open}
        onOpenChange={(open) => setStopSessionDialog(prev => ({ ...prev, open }))}
        title="Stop Session"
        description={`Stop session "${stopSessionDialog.session?.name || stopSessionDialog.session?.path.split('/').pop()}"?`}
        confirmLabel="Stop"
        variant="destructive"
        onConfirm={() => {
          if (stopSessionDialog.session) {
            stopSession(stopSessionDialog.session.id)
          }
        }}
      />
    </aside>
  )
}
