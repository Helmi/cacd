import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatusIndicator } from '@/components/StatusIndicator'
import { AgentIcon } from '@/components/AgentIcon'
import { mapSessionState } from '@/lib/types'
import { X, GitBranch, Folder, Clock, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ContextSidebar() {
  const {
    sessions,
    worktrees,
    currentProject,
    contextSidebarSessionId,
    closeContextSidebar,
  } = useAppStore()

  // Find the session
  const session = contextSidebarSessionId
    ? sessions.find((s) => s.id === contextSidebarSessionId)
    : null

  if (!session) {
    return null
  }

  // Find the worktree for this session
  const worktree = worktrees.find((w) => w.path === session.path)

  // Format name from path
  const formatName = (path: string) => path.split('/').pop() || path

  return (
    <aside className="flex w-56 flex-col border-l border-border bg-sidebar lg:w-64">
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

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {/* Session Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusIndicator status={mapSessionState(session.state)} size="md" />
              <AgentIcon agent="claude-code" className="h-4 w-4" />
              <span className="font-medium text-sm">{formatName(session.path)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn(
                'rounded-full px-2 py-0.5',
                session.state === 'busy' && 'bg-status-active/20 text-status-active',
                session.state === 'idle' && 'bg-status-idle/20 text-status-idle',
                session.state === 'waiting_input' && 'bg-status-pending/20 text-status-pending'
              )}>
                {session.state}
              </span>
              <span className="text-border">•</span>
              <span>claude-code</span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Project Info */}
          <div className="space-y-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Location
            </div>
            {currentProject && (
              <div className="flex items-center gap-2 text-xs">
                <Folder className="h-3.5 w-3.5 text-primary" />
                <span className="truncate">{currentProject.name}</span>
              </div>
            )}
            {worktree && (
              <div className="flex items-center gap-2 text-xs">
                <GitBranch className="h-3.5 w-3.5 text-accent" />
                <span className={cn(
                  'truncate',
                  worktree.isMainWorktree && 'font-bold text-yellow-500'
                )}>
                  {worktree.branch || formatName(worktree.path)}
                </span>
              </div>
            )}
            <div className="text-xs text-muted-foreground truncate">
              {session.path}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Session Stats (placeholder for Phase 2) */}
          <div className="space-y-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Activity
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded bg-secondary/50 p-2">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Duration
                </div>
                <div className="text-xs font-medium">--:--</div>
              </div>
              <div className="rounded bg-secondary/50 p-2">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Activity className="h-3 w-3" />
                  Status
                </div>
                <div className="text-xs font-medium capitalize">{session.state}</div>
              </div>
            </div>
          </div>

          {/* File Changes (placeholder for Phase 2) */}
          <div className="space-y-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              File Changes
            </div>
            <div className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              <p>Git integration coming soon</p>
              <p className="text-[10px] opacity-70">View modified files and diffs</p>
            </div>
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}
