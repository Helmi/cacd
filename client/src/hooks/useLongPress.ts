import { useCallback, useRef, useEffect } from 'react'

interface LongPressOptions {
  /** Delay before triggering (ms). Default: 400 */
  delay?: number
  /** Movement threshold to cancel (px). Default: 10 */
  threshold?: number
  /** Callback when press starts (for visual feedback) */
  onPressStart?: () => void
  /** Callback when press ends without triggering */
  onPressEnd?: () => void
}

interface LongPressResult {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerCancel: (e: React.PointerEvent) => void
  onPointerLeave: (e: React.PointerEvent) => void
}

/**
 * Hook for detecting long-press gestures using Pointer Events.
 *
 * Features per AI review:
 * - Uses Pointer Events (works for touch, mouse, pen)
 * - Cancels if movement exceeds threshold (scroll detection)
 * - Cancels on pointercancel, pointerleave
 * - Cancels on scroll events
 * - 350-400ms default delay (500ms feels laggy)
 */
export function useLongPress(
  callback: () => void,
  options: LongPressOptions = {}
): LongPressResult {
  const { delay = 400, threshold = 10, onPressStart, onPressEnd } = options

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const isActiveRef = useRef(false)
  const targetRef = useRef<EventTarget | null>(null)

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (isActiveRef.current) {
      isActiveRef.current = false
      onPressEnd?.()
    }
    startPosRef.current = null
    targetRef.current = null
  }, [onPressEnd])

  // Cancel on scroll (detects scrolling within scrollable containers)
  useEffect(() => {
    const handleScroll = () => {
      if (isActiveRef.current) {
        clearTimer()
      }
    }

    // Capture phase to catch scroll on any ancestor
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true })
      clearTimer()
    }
  }, [clearTimer])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only handle primary button (left click / touch)
    if (e.button !== 0) return

    // Prevent context menu on touch devices
    e.currentTarget.addEventListener('contextmenu', preventContextMenu, { once: true })

    startPosRef.current = { x: e.clientX, y: e.clientY }
    targetRef.current = e.currentTarget
    isActiveRef.current = true
    onPressStart?.()

    timeoutRef.current = setTimeout(() => {
      if (isActiveRef.current) {
        callback()
        clearTimer()
      }
    }, delay)
  }, [callback, delay, onPressStart, clearTimer])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPosRef.current || !isActiveRef.current) return

    const deltaX = Math.abs(e.clientX - startPosRef.current.x)
    const deltaY = Math.abs(e.clientY - startPosRef.current.y)

    // Cancel if moved beyond threshold (user is scrolling)
    if (deltaX > threshold || deltaY > threshold) {
      clearTimer()
    }
  }, [threshold, clearTimer])

  const onPointerUp = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const onPointerCancel = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const onPointerLeave = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  return {
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerCancel,
    onPointerLeave,
  }
}

function preventContextMenu(e: Event) {
  e.preventDefault()
}
