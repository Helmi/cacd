import type { SessionStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

interface StatusIndicatorProps {
  status: SessionStatus
  size?: 'sm' | 'md'
}

export function StatusIndicator({ status, size = 'sm' }: StatusIndicatorProps) {
  const sizeClasses = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'

  return (
    <span
      className={cn(
        'inline-block rounded-full',
        sizeClasses,
        status === 'active' && 'bg-status-active animate-pulse',
        status === 'busy' && 'bg-status-active animate-pulse',
        status === 'idle' && 'bg-status-idle',
        status === 'error' && 'bg-status-error',
        status === 'pending' && 'bg-status-pending animate-pulse',
        status === 'waiting_input' && 'bg-status-pending animate-pulse',
      )}
      title={status}
    />
  )
}
