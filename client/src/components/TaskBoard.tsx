import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import type { TdIssue } from '@/lib/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { TaskDetailModal } from '@/components/TaskDetailModal'
import {
  ListTodo,
  LayoutGrid,
  List,
  Search,
  X,
  Circle,
  CircleDot,
  CheckCircle2,
  PauseCircle,
  AlertCircle,
  Layers,
  Tag,
} from 'lucide-react'

// Status column configuration
const STATUS_COLUMNS = [
  { key: 'open', label: 'Open', icon: Circle, color: 'text-muted-foreground', bg: 'bg-muted/30' },
  { key: 'in_progress', label: 'In Progress', icon: CircleDot, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { key: 'in_review', label: 'In Review', icon: PauseCircle, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { key: 'blocked', label: 'Blocked', icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  { key: 'closed', label: 'Closed', icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
]

const priorityColors: Record<string, string> = {
  P0: 'border-l-red-500',
  P1: 'border-l-orange-500',
  P2: 'border-l-border',
  P3: 'border-l-border/50',
}

type ViewMode = 'board' | 'list'

function IssueCard({ issue, compact, onSelect }: { issue: TdIssue; compact?: boolean; onSelect: (id: string) => void }) {
  const labels = issue.labels ? issue.labels.split(',').filter(Boolean) : []

  return (
    <button
      onClick={() => onSelect(issue.id)}
      className={cn(
        'w-full text-left rounded border border-border/50 bg-card p-2 transition-colors',
        'hover:bg-accent/50 hover:border-border',
        'border-l-2',
        priorityColors[issue.priority] || 'border-l-border',
        compact && 'p-1.5',
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className="text-[10px] font-mono text-muted-foreground shrink-0 mt-0.5">
          {issue.id}
        </span>
        <div className="flex-1 min-w-0">
          <p className={cn('text-xs leading-snug', compact ? 'line-clamp-1' : 'line-clamp-2')}>
            {issue.title}
          </p>
          {!compact && labels.length > 0 && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {labels.slice(0, 3).map(label => (
                <span
                  key={label}
                  className="inline-flex items-center gap-0.5 text-[9px] rounded-full px-1.5 py-0 bg-muted text-muted-foreground"
                >
                  <Tag className="h-2 w-2" />
                  {label.trim()}
                </span>
              ))}
            </div>
          )}
        </div>
        {issue.type === 'epic' && (
          <Layers className="h-3 w-3 text-purple-400 shrink-0" />
        )}
      </div>
    </button>
  )
}

function StatusColumn({ status, issues, onSelect }: {
  status: typeof STATUS_COLUMNS[0]
  issues: TdIssue[]
  onSelect: (id: string) => void
}) {
  const StatusIcon = status.icon

  return (
    <div className="flex flex-col min-w-[200px] max-w-[280px] flex-1">
      <div className={cn('flex items-center gap-1.5 px-2 py-1.5 rounded-t', status.bg)}>
        <StatusIcon className={cn('h-3 w-3', status.color)} />
        <span className="text-xs font-medium">{status.label}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{issues.length}</span>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-1.5 p-1.5">
          {issues.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/50 text-center py-4">
              No issues
            </p>
          ) : (
            issues.map(issue => (
              <IssueCard key={issue.id} issue={issue} onSelect={onSelect} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

export function TaskBoard() {
  const { tdStatus, tdBoardView, fetchTdBoard, fetchTdIssues, tdIssues, openAddSession, closeTaskBoard } = useAppStore()
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TdIssue[] | null>(null)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)

  // Fetch board data on mount
  useEffect(() => {
    if (tdStatus?.projectState?.enabled) {
      fetchTdBoard()
      fetchTdIssues()
    }
  }, [tdStatus?.projectState?.enabled, fetchTdBoard, fetchTdIssues])

  // Search handler
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    try {
      const res = await fetch(`/api/td/search?q=${encodeURIComponent(searchQuery)}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.issues)
      }
    } catch {
      // Silent fail
    }
  }, [searchQuery])

  if (!tdStatus?.projectState?.enabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-8">
        <ListTodo className="h-8 w-8 opacity-30" />
        <p className="text-sm">TD not enabled for this project</p>
        <p className="text-xs opacity-60">Install td and initialize a .todos/ database to use task management</p>
      </div>
    )
  }

  const displayIssues = searchResults ?? tdIssues

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1 bg-muted rounded p-0.5">
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-6 w-6', viewMode === 'board' && 'bg-background shadow-sm')}
            onClick={() => setViewMode('board')}
          >
            <LayoutGrid className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-6 w-6', viewMode === 'list' && 'bg-background shadow-sm')}
            onClick={() => setViewMode('list')}
          >
            <List className="h-3 w-3" />
          </Button>
        </div>

        <div className="flex-1 flex items-center gap-1.5">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search tasks..."
            className="h-6 text-xs border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => { setSearchQuery(''); setSearchResults(null) }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => { fetchTdBoard(); fetchTdIssues() }}
        >
          Refresh
        </Button>
      </div>

      {/* Board View */}
      {viewMode === 'board' ? (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-2 p-2 h-full min-w-max">
            {STATUS_COLUMNS.map(status => (
              <StatusColumn
                key={status.key}
                status={status}
                issues={(tdBoardView[status.key] || []).filter(i => !i.deleted_at)}
                onSelect={setSelectedIssueId}
              />
            ))}
          </div>
        </div>
      ) : (
        /* List View */
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {displayIssues.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                {searchResults !== null ? 'No matching tasks' : 'No tasks found'}
              </p>
            ) : (
              displayIssues.map(issue => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  compact
                  onSelect={setSelectedIssueId}
                />
              ))
            )}
          </div>
        </ScrollArea>
      )}

      {/* Task Detail Modal */}
      {selectedIssueId && (
        <TaskDetailModal
          issueId={selectedIssueId}
          onClose={() => setSelectedIssueId(null)}
          onNavigate={setSelectedIssueId}
          onStartWorking={(taskId) => {
            closeTaskBoard()
            openAddSession(undefined, undefined, taskId)
          }}
        />
      )}
    </div>
  )
}
