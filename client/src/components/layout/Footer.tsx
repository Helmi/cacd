import { useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Circle, Wifi, Cpu, Command, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

// Detect Apple platforms (Mac, iPhone, iPad)
function useIsApplePlatform() {
  return useMemo(() => {
    if (typeof navigator === 'undefined') return false
    // Check userAgentData first (modern browsers)
    const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
    if (uaData?.platform) {
      return /mac|ios/i.test(uaData.platform)
    }
    // Fallback to userAgent
    return /mac|iphone|ipad|ipod/i.test(navigator.userAgent)
  }, [])
}

export function Footer() {
  const { selectedSessions, theme, font, fontScale, connectionStatus } = useAppStore()
  const isApple = useIsApplePlatform()

  const handleLock = () => {
    window.dispatchEvent(new CustomEvent('cacd-lock'))
  }

  const statusColors = {
    connected: 'fill-status-active text-status-active',
    connecting: 'fill-status-idle text-status-idle',
    disconnected: 'fill-status-error text-status-error',
    error: 'fill-status-error text-status-error',
  }

  const statusLabels = {
    connected: 'Connected',
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
    error: 'Error',
  }

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-sidebar px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        {/* Connection status */}
        <div className="flex items-center gap-1">
          <Circle className={cn('h-2 w-2', statusColors[connectionStatus])} />
          <span>{statusLabels[connectionStatus]}</span>
        </div>
        <span className="text-border">│</span>
        <div className="flex items-center gap-1">
          <Wifi className="h-3 w-3" />
          <span>Local</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Lock button */}
        <button
          onClick={handleLock}
          className="flex items-center gap-1 text-muted-foreground/70 hover:text-foreground transition-colors"
          title={`Lock screen (${isApple ? '⌘' : 'Ctrl'}+L)`}
        >
          <Lock className="h-3 w-3" />
          <span className="hidden sm:inline text-xs">{isApple ? '⌘' : '⌃'}+L</span>
        </button>
        <span className="text-border">│</span>

        {/* Keyboard hints */}
        <div className="hidden md:flex items-center gap-1 text-muted-foreground/70">
          {isApple ? (
            <span className="text-sm">⌘</span>
          ) : (
            <Command className="h-2.5 w-2.5" />
          )}
          <span>+click for split • click pane to select slot</span>
        </div>
        <span className="hidden md:block text-border">│</span>

        {/* Session count */}
        <span>
          {selectedSessions.length} session{selectedSessions.length !== 1 ? 's' : ''}
        </span>
        <span className="text-border">│</span>

        {/* Theme */}
        <span className="capitalize">{theme}</span>
        <span className="hidden sm:block text-border">│</span>

        {/* Font */}
        <span className="hidden sm:block capitalize">{font}</span>
        <span className="hidden sm:block text-border">│</span>

        {/* Font scale */}
        <span className="hidden sm:block">{fontScale}%</span>
        <span className="text-border">│</span>

        {/* Version */}
        <div className="flex items-center gap-1">
          <Cpu className="h-3 w-3" />
          <span>v{import.meta.env.VITE_APP_VERSION}</span>
        </div>
      </div>
    </footer>
  )
}
