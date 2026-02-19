import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { TdIssueWithChildren, TdHandoffParsed, TdIssue } from '@/lib/types'
import {
  X,
  Circle,
  CircleDot,
  CheckCircle2,
  PauseCircle,
  AlertCircle,
  ChevronRight,
  FileText,
  Tag,
  Layers,
  Clock,
  Loader2,
  Play,
  Send,
  RotateCcw,
  MessageSquare,
} from 'lucide-react'

/**
 * Parse Go-formatted timestamps like "2026-02-19 08:30:10.451538 +0100 CET m=+0.117390418"
 * into a JavaScript Date. Strips the timezone abbreviation and monotonic clock suffix.
 */
function parseGoDate(s: string): Date | null {
  if (!s) return null
  // Extract: YYYY-MM-DD HH:MM:SS +ZZZZ (ignore fractional seconds, tz name, monotonic clock)
  const match = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.\d+)?\s+([+-]\d{2})(\d{2})/)
  if (!match) return null
  const d = new Date(`${match[1]}T${match[2]}${match[3]}:${match[4]}`)
  return isNaN(d.getTime()) ? null : d
}

const statusConfig: Record<string, { icon: typeof Circle; color: string; bg: string; label: string }> = {
  open: { icon: Circle, color: 'text-muted-foreground', bg: 'bg-muted/50', label: 'Open' },
  in_progress: { icon: CircleDot, color: 'text-blue-500', bg: 'bg-blue-500/20', label: 'In Progress' },
  in_review: { icon: PauseCircle, color: 'text-purple-500', bg: 'bg-purple-500/20', label: 'In Review' },
  closed: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/20', label: 'Closed' },
  blocked: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/20', label: 'Blocked' },
}

const priorityConfig: Record<string, { color: string; label: string }> = {
  P0: { color: 'text-red-500 bg-red-500/10', label: 'Critical' },
  P1: { color: 'text-orange-500 bg-orange-500/10', label: 'High' },
  P2: { color: 'text-muted-foreground bg-muted/50', label: 'Medium' },
  P3: { color: 'text-muted-foreground/50 bg-muted/30', label: 'Low' },
}

function HandoffSection({ handoff }: { handoff: TdHandoffParsed }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>{parseGoDate(handoff.timestamp)?.toLocaleString() ?? '—'}</span>
        {handoff.sessionId && (
          <span className="font-mono">{handoff.sessionId}</span>
        )}
      </div>

      {handoff.done.length > 0 && (
        <div>
          <span className="text-xs font-medium text-green-500">Done</span>
          <ul className="mt-1 space-y-0.5">
            {handoff.done.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {handoff.remaining.length > 0 && (
        <div>
          <span className="text-xs font-medium text-orange-500">Remaining</span>
          <ul className="mt-1 space-y-0.5">
            {handoff.remaining.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Circle className="h-3 w-3 text-orange-500 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {handoff.decisions.length > 0 && (
        <div>
          <span className="text-xs font-medium text-blue-500">Decisions</span>
          <ul className="mt-1 space-y-0.5">
            {handoff.decisions.map((item, i) => (
              <li key={i} className="text-xs text-muted-foreground pl-4">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {handoff.uncertain.length > 0 && (
        <div>
          <span className="text-xs font-medium text-yellow-500">Uncertain</span>
          <ul className="mt-1 space-y-0.5">
            {handoff.uncertain.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertCircle className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface TaskDetailModalProps {
  issueId: string
  onClose: () => void
  onNavigate?: (issueId: string) => void
  onStartWorking?: (issueId: string) => void
  onRefresh?: () => void
}

export function TaskDetailModal({ issueId, onClose, onNavigate, onStartWorking, onRefresh }: TaskDetailModalProps) {
  const [issue, setIssue] = useState<TdIssueWithChildren | null>(null)
  const [loading, setLoading] = useState(true)
  const [isVisible, setIsVisible] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [showCommentInput, setShowCommentInput] = useState(false)
  const [commentText, setCommentText] = useState('')

  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10)
    return () => clearTimeout(timer)
  }, [])

  // Close with animation
  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onClose, 200)
  }, [onClose])

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  // Fetch issue details
  useEffect(() => {
    setLoading(true)
    fetch(`/api/td/issues/${issueId}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => setIssue(data.issue || null))
      .catch(() => setIssue(null))
      .finally(() => setLoading(false))
  }, [issueId])

  const status = issue ? statusConfig[issue.status] : null
  const StatusIcon = status?.icon || Circle
  const priority = issue ? priorityConfig[issue.priority] : null
  const labels = issue?.labels ? issue.labels.split(',').filter(Boolean) : []

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]',
          'transition-opacity duration-200',
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={cn(
          'fixed inset-y-4 right-4 z-[61] w-full max-w-md bg-background border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden',
          'transition-all duration-200 ease-out',
          isVisible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {issue && <StatusIcon className={cn('h-4 w-4 shrink-0', status?.color)} />}
            <span className="font-mono text-sm text-muted-foreground shrink-0">{issueId}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !issue ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Task not found</p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Title */}
              <h2 className="text-base font-medium leading-snug">{issue.title}</h2>

              {/* Status + Priority + Type badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('text-[11px] rounded-full px-2 py-0.5', status?.bg, status?.color)}>
                  {status?.label}
                </span>
                <span className={cn('text-[11px] rounded-full px-2 py-0.5', priority?.color)}>
                  {issue.priority} — {priority?.label}
                </span>
                {issue.type !== 'task' && (
                  <span className="flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-purple-500/10 text-purple-400">
                    <Layers className="h-3 w-3" />
                    {issue.type}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {onStartWorking && issue.status !== 'closed' && issue.status !== 'in_review' && (
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        onStartWorking(issue.id)
                        handleClose()
                      }}
                    >
                      <Play className="h-3 w-3 mr-1.5" />
                      Start Working
                    </Button>
                  )}
                  {issue.status === 'in_progress' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={actionLoading}
                      onClick={async () => {
                        setActionLoading(true)
                        try {
                          const res = await fetch(`/api/td/issues/${issue.id}/review`, {
                            method: 'POST',
                            credentials: 'include',
                          })
                          if (res.ok) {
                            const data = await fetch(`/api/td/issues/${issue.id}`, { credentials: 'include' }).then(r => r.json())
                            if (data.issue) setIssue(data.issue)
                            onRefresh?.()
                          }
                        } catch { /* silent */ }
                        setActionLoading(false)
                      }}
                    >
                      <Send className="h-3 w-3 mr-1.5" />
                      {actionLoading ? 'Submitting...' : 'Submit for Review'}
                    </Button>
                  )}
                  {issue.status === 'in_review' && (
                    <>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={actionLoading}
                        onClick={async () => {
                          setActionLoading(true)
                          try {
                            const res = await fetch(`/api/td/issues/${issue.id}/approve`, {
                              method: 'POST',
                              credentials: 'include',
                            })
                            if (res.ok) {
                              const data = await fetch(`/api/td/issues/${issue.id}`, { credentials: 'include' }).then(r => r.json())
                              if (data.issue) setIssue(data.issue)
                              onRefresh?.()
                            }
                          } catch { /* silent */ }
                          setActionLoading(false)
                        }}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1.5" />
                        {actionLoading ? 'Approving...' : 'Approve & Close'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={actionLoading}
                        onClick={() => setShowCommentInput(!showCommentInput)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1.5" />
                        Request Changes
                      </Button>
                    </>
                  )}
                </div>

                {/* Request Changes comment input */}
                {showCommentInput && issue.status === 'in_review' && (
                  <div className="space-y-2 rounded border border-border p-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      <span>Add feedback (optional)</span>
                    </div>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Describe what needs to change..."
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      rows={3}
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        onClick={() => {
                          setShowCommentInput(false)
                          setCommentText('')
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 text-xs"
                        disabled={actionLoading}
                        onClick={async () => {
                          setActionLoading(true)
                          try {
                            const res = await fetch(`/api/td/issues/${issue.id}/request-changes`, {
                              method: 'POST',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ comment: commentText.trim() || undefined }),
                            })
                            if (res.ok) {
                              const data = await fetch(`/api/td/issues/${issue.id}`, { credentials: 'include' }).then(r => r.json())
                              if (data.issue) setIssue(data.issue)
                              setShowCommentInput(false)
                              setCommentText('')
                              onRefresh?.()
                            }
                          } catch { /* silent */ }
                          setActionLoading(false)
                        }}
                      >
                        {actionLoading ? 'Sending...' : 'Send Back'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Labels */}
              {labels.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {labels.map(label => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-muted text-muted-foreground"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {label.trim()}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              {issue.description && (
                <div className="space-y-1">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {issue.description}
                  </p>
                </div>
              )}

              {/* Children / Subtasks */}
              {issue.children?.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Subtasks ({issue.children.length})
                  </h3>
                  <div className="space-y-1">
                    {issue.children.map((child: TdIssue) => {
                      const childStatus = statusConfig[child.status]
                      const ChildIcon = childStatus?.icon || Circle
                      return (
                        <button
                          key={child.id}
                          onClick={() => onNavigate?.(child.id)}
                          className="flex items-center gap-2 w-full text-left rounded px-2 py-1.5 hover:bg-accent/50 transition-colors"
                        >
                          <ChildIcon className={cn('h-3 w-3 shrink-0', childStatus?.color)} />
                          <span className="text-[10px] font-mono text-muted-foreground shrink-0">{child.id}</span>
                          <span className="text-xs truncate flex-1">{child.title}</span>
                          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Files */}
              {issue.files?.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Files ({issue.files.length})
                  </h3>
                  <div className="space-y-1">
                    {issue.files.map(file => (
                      <div key={file.id} className="flex items-center gap-2 text-xs">
                        <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-mono text-muted-foreground truncate">{file.file_path}</span>
                        {file.role && (
                          <span className="text-[10px] text-muted-foreground/50 shrink-0">{file.role}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Handoffs */}
              {issue.handoffs?.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Handoffs ({issue.handoffs.length})
                  </h3>
                  {issue.handoffs.map((handoff, i) => (
                    <div key={handoff.id} className={cn(
                      'rounded border border-border p-3',
                      i === 0 && 'border-primary/30'
                    )}>
                      {i === 0 && (
                        <span className="text-[9px] uppercase tracking-wider text-primary mb-1.5 block">Latest</span>
                      )}
                      <HandoffSection handoff={handoff} />
                    </div>
                  ))}
                </div>
              )}

              {/* Metadata */}
              <div className="space-y-1 pt-2 border-t border-border">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Details</h3>
                <div className="grid grid-cols-2 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Created</span>
                  <span>{parseGoDate(issue.created_at)?.toLocaleString() ?? '—'}</span>
                  <span className="text-muted-foreground">Updated</span>
                  <span>{parseGoDate(issue.updated_at)?.toLocaleString() ?? '—'}</span>
                  {issue.created_branch && (
                    <>
                      <span className="text-muted-foreground">Branch</span>
                      <span className="font-mono">{issue.created_branch}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </>
  )
}
