import type { SessionStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

interface StatusIndicatorProps {
  status: SessionStatus
  size?: 'sm' | 'md'
}

// Human-readable status labels
export const statusLabels: Record<SessionStatus, string> = {
  active: 'Working',
  busy: 'Working',
  idle: 'Idle',
  error: 'Error',
  pending: 'Waiting',
  waiting_input: 'Needs Input',
}

export function StatusIndicator({ status, size = 'sm' }: StatusIndicatorProps) {
  const sizeClasses = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'

  // Status meanings:
  // - active/busy: Agent is working (green, blinking)
  // - idle: Agent is not doing anything (gray outline, like "off")
  // - pending/waiting_input: User action needed (orange, double-flash)
  // - error: Something went wrong (red)

  return (
    <span
      className={cn(
        'inline-block rounded-full',
        sizeClasses,
        status === 'active' && 'bg-status-active animate-blink',
        status === 'busy' && 'bg-status-active animate-blink',
        status === 'idle' && 'bg-transparent border border-muted-foreground/50',
        status === 'error' && 'bg-status-error',
        status === 'pending' && 'bg-status-pending animate-double-flash',
        status === 'waiting_input' && 'bg-status-pending animate-double-flash',
      )}
      title={statusLabels[status] || status}
    />
  )
}
