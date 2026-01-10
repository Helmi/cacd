import { useAppStore } from '@/lib/store'
import { Circle, Wifi, Cpu, Command } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Footer() {
  const { selectedSessions, theme, font, fontScale, connectionStatus } = useAppStore()

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
    <footer className="flex h-7 items-center justify-between border-t border-border bg-sidebar px-3 text-xs text-muted-foreground">
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
        {/* Keyboard hints */}
        <div className="hidden md:flex items-center gap-1 text-muted-foreground/70">
          <Command className="h-2.5 w-2.5" />
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
          <span>v0.1.0</span>
        </div>
      </div>
    </footer>
  )
}
