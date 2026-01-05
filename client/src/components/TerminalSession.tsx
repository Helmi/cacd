import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'
import { useAppStore } from '@/lib/store'
import { StatusIndicator } from '@/components/StatusIndicator'
import { AgentIcon } from '@/components/AgentIcon'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { X, Maximize2, Minimize2, MoreVertical, Copy, Trash2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Session } from '@/lib/types'
import { mapSessionState } from '@/lib/types'

interface TerminalSessionProps {
  session: Session
  slotIndex?: number
  isFocused?: boolean
  onFocus?: () => void
  onRemove: () => void
}

// Get theme colors from CSS custom properties
function getTerminalTheme(): {background: string; foreground: string; cursor: string; selectionBackground: string} {
  const styles = getComputedStyle(document.documentElement)
  const bg = styles.getPropertyValue('--terminal-bg').trim() || 'hsl(222, 47%, 5%)'
  const fg = styles.getPropertyValue('--foreground').trim() || 'hsl(0, 0%, 88%)'
  const cursor = styles.getPropertyValue('--primary').trim() || 'hsl(160, 70%, 45%)'

  return {
    background: bg.startsWith('hsl') ? bg : `hsl(${bg})`,
    foreground: fg.startsWith('hsl') ? fg : `hsl(${fg})`,
    cursor: cursor.startsWith('hsl') ? cursor : `hsl(${cursor})`,
    selectionBackground: 'rgba(100, 200, 150, 0.3)',
  }
}

export function TerminalSession({ session, slotIndex, isFocused = false, onFocus, onRemove }: TerminalSessionProps) {
  const { socket, toggleContextSidebar, contextSidebarSessionId, stopSession, theme, fontScale } = useAppStore()
  const [isMaximized, setIsMaximized] = useState(false)
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  const isContextOpen = contextSidebarSessionId === session.id

  // Format name from path
  const formatName = (path: string) => path.split('/').pop() || path

  useEffect(() => {
    if (!terminalRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
      fontSize: Math.round(14 * (fontScale / 100)),
      theme: getTerminalTheme(),
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    term.open(terminalRef.current)
    fitAddon.fit()
    term.focus()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Subscribe to session
    socket.emit('subscribe_session', session.id)

    // Handle incoming data
    const handleData = (msg: { sessionId: string; data: string } | string) => {
      const content = typeof msg === 'string' ? msg : msg.data
      const msgSessionId = typeof msg === 'string' ? null : msg.sessionId

      // Strict check: Ignore data from other sessions
      if (msgSessionId && msgSessionId !== session.id) {
        return
      }

      term.write(content)
    }

    socket.on('terminal_data', handleData)

    // Handle outgoing data
    term.onData((data) => {
      socket.emit('input', { sessionId: session.id, data })
    })

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
        socket.emit('resize', {
          sessionId: session.id,
          cols: term.cols,
          rows: term.rows,
        })
      }
    }

    window.addEventListener('resize', handleResize)
    // Initial fit
    setTimeout(handleResize, 100)

    // Create resize observer for container
    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }

    return () => {
      socket.emit('unsubscribe_session', session.id)
      socket.off('terminal_data', handleData)
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [session.id, socket])

  // Re-fit when maximized state changes
  useEffect(() => {
    setTimeout(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    }, 100)
  }, [isMaximized])

  // Update terminal theme when app theme changes
  useEffect(() => {
    if (xtermRef.current) {
      // Give CSS time to apply new theme variables
      setTimeout(() => {
        if (xtermRef.current) {
          xtermRef.current.options.theme = getTerminalTheme()
        }
      }, 50)
    }
  }, [theme])

  // Update terminal font size when fontScale changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = Math.round(14 * (fontScale / 100))
      fitAddonRef.current?.fit()
    }
  }, [fontScale])

  const handleCopyOutput = () => {
    if (xtermRef.current) {
      const selection = xtermRef.current.getSelection()
      if (selection) {
        navigator.clipboard.writeText(selection)
      }
    }
  }

  const handleDeleteSession = async () => {
    await stopSession(session.id)
  }

  // Handle clicking the terminal area to focus
  const handleTerminalClick = () => {
    onFocus?.()
    xtermRef.current?.focus()
  }

  return (
    <div
      className={cn(
        'flex flex-col bg-terminal-bg outline-none',
        isMaximized && 'fixed inset-0 z-50',
        isFocused && 'ring-2 ring-primary ring-inset'
      )}
      onClick={handleTerminalClick}
    >
      {/* Terminal header */}
      <div
        className={cn(
          'flex h-7 items-center justify-between border-b border-border bg-card px-2',
          slotIndex !== undefined && 'cursor-pointer',
          isFocused && 'bg-primary/10'
        )}
      >
        <div className="flex items-center gap-2 text-xs">
          <StatusIndicator status={mapSessionState(session.state)} />
          <AgentIcon agent="claude-code" className="h-3.5 w-3.5" />
          <span className="font-medium text-card-foreground">{formatName(session.path)}</span>
          <span className="text-muted-foreground">({session.state})</span>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Info button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-5 w-5 text-muted-foreground hover:text-foreground',
              isContextOpen && 'bg-accent text-foreground'
            )}
            onClick={() => toggleContextSidebar(session.id)}
            title="Show session context"
          >
            <Info className="h-3 w-3" />
          </Button>

          {/* Maximize/Minimize */}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={() => setIsMaximized(!isMaximized)}
          >
            {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>

          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onClick={handleCopyOutput}>
                <Copy className="mr-2 h-3 w-3" />
                Copy selection
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={handleDeleteSession}
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Stop session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Close (remove from view) */}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={onRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Terminal content */}
      <div ref={terminalRef} className="flex-1 overflow-hidden" />
    </div>
  )
}
