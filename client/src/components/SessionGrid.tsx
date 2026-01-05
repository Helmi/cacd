import { useAppStore } from '@/lib/store'
import { TerminalSession } from '@/components/TerminalSession'
import { cn } from '@/lib/utils'

export function SessionGrid() {
  const { sessions, selectedSessions, focusedSessionId, deselectSession, focusSession } = useAppStore()

  // Get selected session objects
  const activeSessions = selectedSessions
    .map((id) => sessions.find((s) => s.id === id))
    .filter(Boolean)

  if (activeSessions.length === 0) {
    return null
  }

  // Calculate grid layout based on session count
  // Mobile: stack vertically, Desktop: grid layout
  const getGridClass = (count: number) => {
    switch (count) {
      case 1:
        return 'grid-cols-1 grid-rows-1'
      case 2:
        // Stack on mobile, side by side on larger screens
        return 'grid-cols-1 md:grid-cols-2 grid-rows-2 md:grid-rows-1'
      case 3:
        // Stack on mobile, 2x2 on tablet, optimized on desktop
        return 'grid-cols-1 md:grid-cols-2 grid-rows-3 md:grid-rows-2'
      case 4:
        return 'grid-cols-1 md:grid-cols-2 grid-rows-4 md:grid-rows-2'
      default:
        // 5+ sessions: 3 columns on desktop
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
    }
  }

  return (
    <div
      className={cn(
        'grid h-full gap-px bg-border',
        getGridClass(activeSessions.length)
      )}
    >
      {activeSessions.map((session, index) => (
        <TerminalSession
          key={session!.id}
          session={session!}
          slotIndex={index}
          isFocused={focusedSessionId === session!.id}
          onFocus={() => focusSession(session!.id)}
          onRemove={() => deselectSession(session!.id)}
        />
      ))}
    </div>
  )
}
