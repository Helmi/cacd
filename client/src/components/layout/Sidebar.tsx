import { useState, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatusIndicator } from '@/components/StatusIndicator'
import { AgentIcon } from '@/components/AgentIcon'
import { mapSessionState } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  Folder,
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
  } = useAppStore()

  // Tree expansion state
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => {
    // Start with current project expanded
    return currentProject ? new Set([currentProject.path]) : new Set()
  })
  const [expandedWorktrees, setExpandedWorktrees] = useState<Set<string>>(new Set())

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilter, setShowFilter] = useState(false)

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
  const getWorktreesForProject = (projectPath: string) => {
    return filteredData.worktrees.filter(w => w.path.startsWith(projectPath))
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
    <aside className="flex w-52 flex-col border-r border-border bg-sidebar lg:w-56">
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
                className="h-5 pl-5 pr-6 text-xs"
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
            <span className="flex-1 truncate text-xs text-muted-foreground">Sessions</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0"
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
                {/* Project row */}
                <button
                  onClick={() => toggleProject(project.path)}
                  className={cn(
                    'flex w-full items-center gap-1 px-1.5 py-1 text-xs hover:bg-secondary',
                    isCurrentProject && 'bg-secondary/50'
                  )}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <Folder className="h-3 w-3 shrink-0 text-primary" />
                  <span className="truncate font-medium">{project.name}</span>
                </button>

                {/* Worktrees */}
                {isExpanded && (
                  <div className="pl-3">
                    {projectWorktrees.length === 0 ? (
                      <div className="px-2 py-1 text-xs text-muted-foreground italic">
                        No worktrees
                      </div>
                    ) : (
                      projectWorktrees.map((worktree) => {
                        const worktreeSessions = getSessionsForWorktree(worktree.path)
                        const isWorktreeExpanded = expandedWorktrees.has(worktree.path)

                        return (
                          <div key={worktree.path}>
                            {/* Worktree row */}
                            <div className="flex items-center">
                              <button
                                onClick={() => toggleWorktree(worktree.path)}
                                className="flex flex-1 items-center gap-1 px-1 py-0.5 text-xs hover:bg-secondary"
                              >
                                {isWorktreeExpanded ? (
                                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                )}
                                <GitBranch className="h-3 w-3 shrink-0 text-accent" />
                                <span className={cn(
                                  'truncate text-muted-foreground',
                                  worktree.isMainWorktree && 'font-bold text-yellow-500'
                                )}>
                                  {worktree.branch || formatName(worktree.path)}
                                </span>
                                {worktreeSessions.length > 0 && (
                                  <span className="ml-auto text-[10px] text-muted-foreground">
                                    {worktreeSessions.length}
                                  </span>
                                )}
                              </button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 opacity-0 hover:opacity-100 group-hover:opacity-100"
                                title="New session"
                              >
                                <Plus className="h-2.5 w-2.5" />
                              </Button>
                            </div>

                            {/* Sessions */}
                            {isWorktreeExpanded && (
                              <div className="space-y-px pl-4">
                                {worktreeSessions.map((session) => {
                                  const isSelected = selectedSessions.includes(session.id)

                                  return (
                                    <div
                                      key={session.id}
                                      className={cn(
                                        'group flex items-center gap-1 rounded px-1 py-0.5 text-xs cursor-pointer',
                                        'hover:bg-secondary',
                                        isSelected && 'bg-accent/80 text-accent-foreground'
                                      )}
                                      onClick={(e) => handleSessionClick(session.id, e)}
                                      title="Click to view, Cmd/Ctrl+click for split view"
                                    >
                                      <StatusIndicator status={mapSessionState(session.state)} />
                                      <AgentIcon agent="claude-code" className="h-3 w-3" />
                                      <span className="flex-1 truncate">
                                        {formatName(session.path)}
                                      </span>
                                    </div>
                                  )
                                })}

                                {/* "+ new" button */}
                                <button
                                  className="flex w-full items-center gap-1 px-1 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                                >
                                  <Plus className="h-2.5 w-2.5" />
                                  <span>new</span>
                                </button>
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
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {searchQuery ? 'No matches found' : 'No projects'}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}
