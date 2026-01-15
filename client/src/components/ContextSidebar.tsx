import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusIndicator, statusLabels } from '@/components/StatusIndicator'
import { AgentIcon } from '@/components/AgentIcon'
import { mapSessionState, ChangedFile } from '@/lib/types'
import { X, GitBranch, Folder, Clock, Activity, Copy, Check, FileText, FilePlus, FileX, FileEdit, FileQuestion } from 'lucide-react'
import { cn, formatPath, copyToClipboard } from '@/lib/utils'

export function ContextSidebar() {
  const {
    sessions,
    worktrees,
    currentProject,
    contextSidebarSessionId,
    closeContextSidebar,
    openFileDiff,
  } = useAppStore()

  const [copied, setCopied] = useState(false)
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)

  // Find the session
  const session = contextSidebarSessionId
    ? sessions.find((s) => s.id === contextSidebarSessionId)
    : null

  // Find the worktree for this session
  const worktree = session ? worktrees.find((w) => w.path === session.path) : null

  // Fetch changed files function
  const fetchChangedFiles = useCallback(async () => {
    if (!session?.path) {
      setChangedFiles([])
      return
    }

    setFilesLoading(true)
    setFilesError(null)
    try {
      const response = await fetch(`/api/worktree/files?path=${encodeURIComponent(session.path)}`)
      if (!response.ok) {
        throw new Error('Failed to fetch changed files')
      }
      const files = await response.json()
      setChangedFiles(files)
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : 'Unknown error')
      setChangedFiles([])
    } finally {
      setFilesLoading(false)
    }
  }, [session?.path])

  // Track previous session state to detect meaningful changes
  const prevSessionStateRef = useRef<string | null>(null)

  // Fetch on session change
  useEffect(() => {
    fetchChangedFiles()
  }, [fetchChangedFiles])

  // Re-fetch when session state changes (e.g., busy -> idle means agent may have modified files)
  // This replaces the expensive socket listener that fired on every update
  useEffect(() => {
    if (!session) return

    // Only refetch if state actually changed (not on every render)
    if (prevSessionStateRef.current !== null && prevSessionStateRef.current !== session.state) {
      // State changed - files may have been modified
      // Add a small delay to allow git operations to complete
      const timer = setTimeout(() => {
        fetchChangedFiles()
      }, 500)
      return () => clearTimeout(timer)
    }

    prevSessionStateRef.current = session.state
  }, [session?.state, fetchChangedFiles, session])


  if (!session) {
    return null
  }

  // Format name from path
  const formatName = (path: string) => path.split('/').pop() || path

  // Handle path copy
  const handleCopyPath = async () => {
    const success = await copyToClipboard(session.path)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <aside className="flex w-64 flex-col border-l border-border bg-sidebar lg:w-72 xl:w-80 overflow-hidden">
      {/* Header */}
      <div className="flex h-7 items-center justify-between border-b border-border px-2">
        <span className="text-xs font-medium text-muted-foreground">Session Details</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={closeContextSidebar}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <ScrollArea className="flex-1 w-full">
        <div className="space-y-4 p-3 w-full max-w-full box-border">
          {/* Session Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 min-w-0">
              <StatusIndicator status={mapSessionState(session.state)} size="md" />
              {/* TODO: Pass actual agent icon when sessions track their agent */}
              <AgentIcon icon="claude" className="h-5 w-5 shrink-0" />
              <span className="font-medium text-sm truncate">{session.name || formatName(session.path)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn(
                'rounded-full px-2 py-0.5',
                session.state === 'busy' && 'bg-status-active/20 text-status-active',
                session.state === 'idle' && 'bg-muted/50 text-muted-foreground',
                session.state === 'waiting_input' && 'bg-status-pending/20 text-status-pending'
              )}>
                {statusLabels[mapSessionState(session.state)] || session.state}
              </span>
              <span className="text-border">•</span>
              <span>claude-code</span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Project Info */}
          <div className="space-y-2 min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Location
            </div>
            {currentProject && (
              <div className="flex items-center gap-2 text-xs min-w-0">
                <Folder className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{currentProject.name}</span>
              </div>
            )}
            {worktree && (
              <div className="flex items-center gap-2 text-xs min-w-0">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className={cn(
                  'truncate',
                  worktree.isMainWorktree && 'font-bold text-yellow-500'
                )}>
                  {worktree.branch || formatName(worktree.path)}
                </span>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCopyPath}
                  className="group flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left min-w-0"
                >
                  <span className="truncate flex-1 font-mono text-[11px]">{formatPath(session.path)}</span>
                  {copied ? (
                    <Check className="h-3 w-3 shrink-0 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-mono text-xs break-all">{session.path}</p>
                <p className="text-muted-foreground text-xs mt-1">Click to copy</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Session Stats (placeholder for Phase 2) */}
          <div className="space-y-2 min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Activity
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded bg-secondary/50 p-2 min-w-0 overflow-hidden">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="truncate">Duration</span>
                </div>
                <div className="text-xs font-medium">--:--</div>
              </div>
              <div className="rounded bg-secondary/50 p-2 min-w-0 overflow-hidden">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Activity className="h-3 w-3 shrink-0" />
                  <span className="truncate">Status</span>
                </div>
                <div className="text-xs font-medium capitalize truncate">{session.state}</div>
              </div>
            </div>
          </div>

          {/* File Changes */}
          <div className="space-y-2 min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              File Changes
            </div>

            {/* Git status summary - computed from changed files */}
            {changedFiles.length > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-500 font-mono">
                  +{changedFiles.reduce((sum, f) => sum + f.additions, 0)}
                </span>
                <span className="text-red-500 font-mono">
                  -{changedFiles.reduce((sum, f) => sum + f.deletions, 0)}
                </span>
                {/* Ahead/Behind from worktree gitStatus */}
                {worktree?.gitStatus && (worktree.gitStatus.aheadCount > 0 || worktree.gitStatus.behindCount > 0) && (
                  <>
                    <span className="text-border">|</span>
                    {worktree.gitStatus.aheadCount > 0 && (
                      <span className="text-cyan-500 text-xs">↑{worktree.gitStatus.aheadCount}</span>
                    )}
                    {worktree.gitStatus.behindCount > 0 && (
                      <span className="text-purple-500 text-xs">↓{worktree.gitStatus.behindCount}</span>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Parent branch info */}
            {worktree?.gitStatus?.parentBranch && (
              <div className="text-xs text-muted-foreground">
                vs {worktree.gitStatus.parentBranch}
              </div>
            )}

            {/* Changed files list */}
            {filesLoading ? (
              <div className="text-xs text-muted-foreground animate-pulse">
                Loading files...
              </div>
            ) : filesError ? (
              <div className="text-xs text-destructive">
                {filesError}
              </div>
            ) : changedFiles.length > 0 ? (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {changedFiles.map((file) => (
                  <button
                    key={file.path}
                    className="flex items-center gap-2 w-full text-left text-xs hover:bg-secondary/50 rounded px-1.5 py-1 transition-colors group"
                    onClick={() => openFileDiff(session.id, file, session.path)}
                  >
                    {/* File status icon */}
                    {file.status === 'added' || file.status === 'untracked' ? (
                      <FilePlus className="h-3 w-3 shrink-0 text-green-500" />
                    ) : file.status === 'deleted' ? (
                      <FileX className="h-3 w-3 shrink-0 text-red-500" />
                    ) : file.status === 'modified' ? (
                      <FileEdit className="h-3 w-3 shrink-0 text-yellow-500" />
                    ) : file.status === 'renamed' ? (
                      <FileText className="h-3 w-3 shrink-0 text-blue-500" />
                    ) : (
                      <FileQuestion className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    {/* File path */}
                    <span className="truncate flex-1 font-mono text-[11px]">
                      {file.path.split('/').pop()}
                    </span>
                    {/* Line counts */}
                    {(file.additions > 0 || file.deletions > 0) && (
                      <span className="flex items-center gap-1 text-xs opacity-70 group-hover:opacity-100">
                        {file.additions > 0 && (
                          <span className="text-green-500">+{file.additions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span className="text-red-500">-{file.deletions}</span>
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : worktree?.gitStatusError ? (
              <div className="text-xs text-destructive">
                {worktree.gitStatusError}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                No uncommitted changes
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}
