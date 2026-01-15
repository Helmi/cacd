import { useRef, useState, useEffect, memo } from 'react'
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

// Memoized to prevent unnecessary re-renders
export const StatusIndicator = memo(function StatusIndicator({ status, size = 'sm' }: StatusIndicatorProps) {
  const sizeClasses = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'
  const ref = useRef<HTMLSpanElement>(null)
  const [isVisible, setIsVisible] = useState(true)

  // Pause animations when element is not visible (off-screen)
  // This reduces GPU composite work for sidebar with many sessions
  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Only observe if status has animations
    const hasAnimation = status === 'active' || status === 'busy' ||
                         status === 'pending' || status === 'waiting_input'
    if (!hasAnimation) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
      },
      { threshold: 0 }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [status])

  // Status meanings:
  // - active/busy: Agent is working (green, blinking)
  // - idle: Agent is not doing anything (gray outline, like "off")
  // - pending/waiting_input: User action needed (orange, double-flash)
  // - error: Something went wrong (red)

  // Only animate when visible
  const shouldAnimate = isVisible

  return (
    <span
      ref={ref}
      className={cn(
        'inline-block rounded-full',
        sizeClasses,
        status === 'active' && 'bg-status-active',
        status === 'busy' && 'bg-status-active',
        status === 'idle' && 'bg-transparent border border-muted-foreground/50',
        status === 'error' && 'bg-status-error',
        status === 'pending' && 'bg-status-pending',
        status === 'waiting_input' && 'bg-status-pending',
        // Only apply animation classes when visible
        shouldAnimate && (status === 'active' || status === 'busy') && 'animate-blink',
        shouldAnimate && (status === 'pending' || status === 'waiting_input') && 'animate-double-flash',
      )}
      title={statusLabels[status] || status}
    />
  )
})
