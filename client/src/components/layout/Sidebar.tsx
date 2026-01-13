import { useState, useMemo, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
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

  // Data passthrough (filtering removed for now)
  const filteredData = useMemo(() => {
    return { projects, worktrees, sessions }
  }, [projects, worktrees, sessions])

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
    <aside className="flex w-56 flex-col border-r border-border bg-sidebar lg:w-64 overflow-hidden">
      {/* Pattern separator bar with actions */}
      <div className="flex items-center gap-1 px-2 py-1.5 pattern-dots border-b border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 gap-1.5 text-xs" title="Add new...">
              <Plus className="h-3 w-3" />
              <span className="hidden lg:inline">New</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="text-xs">
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

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 md:hidden"
          onClick={toggleSidebar}
          title="Close sidebar"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Tree content */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {filteredData.projects.map((project, projectIndex) => {
            const projectWorktrees = getWorktreesForProject(project.path)
            const isExpanded = expandedProjects.has(project.path)
            const isCurrentProject = currentProject?.path === project.path

            return (
              <div key={project.path} className={cn(projectIndex > 0 && 'mt-2')}>
                {/* Project header - prominent separator */}
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      onClick={() => toggleProject(project.path)}
                      className={cn(
                        'group flex w-full min-w-0 items-center gap-2 px-2 py-2 text-sm',
                        'bg-muted/50 hover:bg-muted transition-colors',
                        isCurrentProject && 'bg-muted'
                      )}
                    >
                      {/* Folder icon with badge background */}
                      <div className={cn(
                        'flex items-center justify-center w-6 h-6 rounded shrink-0',
                        'transition-all duration-150',
                        isExpanded ? 'bg-primary' : 'bg-muted-foreground/20 group-hover:bg-muted-foreground/30'
                      )}>
                        <Folder className={cn(
                          'h-3.5 w-3.5',
                          isExpanded ? 'text-primary-foreground' : 'text-muted-foreground'
                        )} />
                      </div>
                      <span className="truncate font-medium flex-1 text-left">{project.name}</span>
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
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
                  <div className="py-1 min-w-0">
                    {projectWorktrees.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground italic">
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
                                  className="flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-sm hover:bg-secondary/50 transition-colors"
                                >
                                  {isWorktreeExpanded ? (
                                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                  )}
                                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-accent" />
                                  <span className={cn(
                                    'truncate flex-1 text-left',
                                    worktree.isMainWorktree
                                      ? 'font-medium text-foreground'
                                      : 'text-muted-foreground'
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
                              <div className="py-0.5 pl-6 min-w-0">
                                {worktreeSessions.map((session) => {
                                  const isSelected = selectedSessions.includes(session.id)

                                  return (
                                    <ContextMenu key={session.id}>
                                      <ContextMenuTrigger asChild>
                                        <div
                                          className={cn(
                                            'group relative flex min-w-0 items-center gap-2 pl-2 pr-3 py-1.5 text-sm cursor-pointer rounded-l transition-colors',
                                            isSelected
                                              ? 'bg-primary/10'
                                              : 'hover:bg-secondary/50'
                                          )}
                                          onClick={(e) => handleSessionClick(session.id, e)}
                                          title="Click to view, Cmd/Ctrl+click for split view"
                                        >
                                          {/* Agent icon with status indicator overlay */}
                                          <div className="relative shrink-0">
                                            <AgentIcon icon="claude" className="h-4 w-4" />
                                            <div className="absolute -bottom-0.5 -right-0.5">
                                              <StatusIndicator status={mapSessionState(session.state)} size="sm" />
                                            </div>
                                          </div>
                                          <span className={cn(
                                            'flex-1 truncate text-xs',
                                            isSelected ? 'text-primary font-medium' : 'text-foreground'
                                          )}>
                                            {session.name || formatName(session.path)}
                                          </span>
                                          {/* Selection indicator - subtle bar on right */}
                                          <div className={cn(
                                            'absolute right-0 top-1 bottom-1 w-[3px] rounded-full transition-all duration-150',
                                            isSelected
                                              ? 'bg-primary'
                                              : 'bg-transparent group-hover:bg-muted-foreground/30'
                                          )} />
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
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              No projects added yet
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
