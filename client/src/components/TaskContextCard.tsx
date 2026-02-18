import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import type { TdIssue, TdHandoffParsed } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronRight,
  ListTodo,
  Circle,
  CircleDot,
  CheckCircle2,
  PauseCircle,
  AlertCircle,
} from 'lucide-react'

const statusIcons: Record<string, typeof Circle> = {
  open: Circle,
  in_progress: CircleDot,
  in_review: PauseCircle,
  closed: CheckCircle2,
  blocked: AlertCircle,
}

const statusColors: Record<string, string> = {
  open: 'text-muted-foreground',
  in_progress: 'text-blue-500',
  in_review: 'text-purple-500',
  closed: 'text-green-500',
  blocked: 'text-red-500',
}

const priorityColors: Record<string, string> = {
  P0: 'text-red-500 font-bold',
  P1: 'text-orange-500',
  P2: 'text-muted-foreground',
  P3: 'text-muted-foreground/50',
}

interface TaskContextCardProps {
  worktreePath?: string
}

export function TaskContextCard({ worktreePath }: TaskContextCardProps) {
  const { tdStatus } = useAppStore()
  const [expanded, setExpanded] = useState(false)
  const [task, setTask] = useState<TdIssue | null>(null)
  const [handoff, setHandoff] = useState<TdHandoffParsed | null>(null)
  const [loading, setLoading] = useState(false)

  // Don't render if td is not enabled
  if (!tdStatus?.projectState?.enabled) {
    return null
  }

  // Fetch linked task for this worktree (by matching branch to created_branch)
  useEffect(() => {
    if (!worktreePath || !tdStatus?.projectState?.enabled) {
      setTask(null)
      return
    }

    const fetchLinkedTask = async () => {
      setLoading(true)
      try {
        // Get all in-progress tasks and find one linked to this worktree
        const res = await fetch('/api/td/issues?status=in_progress', { credentials: 'include' })
        if (!res.ok) return

        const data = await res.json()
        const issues: TdIssue[] = data.issues

        // Try to match by created_branch or by worktree path containing the task's branch
        const folderName = worktreePath.split('/').pop() || ''
        const matched = issues.find(issue => {
          if (issue.created_branch && worktreePath.includes(issue.created_branch)) return true
          // Match by folder name containing issue ID
          if (folderName.includes(issue.id)) return true
          return false
        })

        if (matched) {
          setTask(matched)

          // Fetch handoff data for matched task
          const detailRes = await fetch(`/api/td/issues/${matched.id}`, { credentials: 'include' })
          if (detailRes.ok) {
            const detail = await detailRes.json()
            if (detail.issue?.handoffs?.length > 0) {
              setHandoff(detail.issue.handoffs[0])
            }
          }
        } else {
          setTask(null)
          setHandoff(null)
        }
      } catch {
        // Silent fail — td is optional
      } finally {
        setLoading(false)
      }
    }

    fetchLinkedTask()
  }, [worktreePath, tdStatus?.projectState?.enabled])

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground animate-pulse flex items-center gap-1.5">
        <ListTodo className="h-3 w-3" />
        <span>Loading task...</span>
      </div>
    )
  }

  if (!task) {
    return null
  }

  const StatusIcon = statusIcons[task.status] || Circle

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left group"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <StatusIcon className={cn('h-3 w-3 shrink-0', statusColors[task.status])} />
        <span className="text-xs font-mono text-muted-foreground shrink-0">{task.id}</span>
        <span className="text-xs truncate flex-1">{task.title}</span>
        <span className={cn('text-[10px] shrink-0', priorityColors[task.priority])}>
          {task.priority}
        </span>
      </button>

      {expanded && (
        <div className="pl-5 space-y-2 text-xs">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px]',
              task.status === 'in_progress' && 'bg-blue-500/20 text-blue-400',
              task.status === 'open' && 'bg-muted/50 text-muted-foreground',
              task.status === 'in_review' && 'bg-purple-500/20 text-purple-400',
              task.status === 'closed' && 'bg-green-500/20 text-green-400',
              task.status === 'blocked' && 'bg-red-500/20 text-red-400',
            )}>
              {task.status.replace('_', ' ')}
            </span>
            {task.type !== 'task' && (
              <span className="text-[10px] text-muted-foreground">{task.type}</span>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <p className="text-muted-foreground leading-relaxed line-clamp-3">
              {task.description}
            </p>
          )}

          {/* Handoff data (latest) */}
          {handoff && (
            <div className="space-y-1.5 border-t border-border pt-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Latest Handoff
              </span>
              {handoff.done.length > 0 && (
                <div>
                  <span className="text-green-500">Done:</span>
                  <ul className="ml-3 list-disc list-inside text-muted-foreground">
                    {handoff.done.slice(0, 3).map((item, i) => (
                      <li key={i} className="truncate">{item}</li>
                    ))}
                    {handoff.done.length > 3 && (
                      <li className="text-muted-foreground/50">+{handoff.done.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
              {handoff.remaining.length > 0 && (
                <div>
                  <span className="text-orange-500">Remaining:</span>
                  <ul className="ml-3 list-disc list-inside text-muted-foreground">
                    {handoff.remaining.slice(0, 3).map((item, i) => (
                      <li key={i} className="truncate">{item}</li>
                    ))}
                    {handoff.remaining.length > 3 && (
                      <li className="text-muted-foreground/50">+{handoff.remaining.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
              {handoff.uncertain.length > 0 && (
                <div>
                  <span className="text-yellow-500">Uncertain:</span>
                  <ul className="ml-3 list-disc list-inside text-muted-foreground">
                    {handoff.uncertain.map((item, i) => (
                      <li key={i} className="truncate">{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
