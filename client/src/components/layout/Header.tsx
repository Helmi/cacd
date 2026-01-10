import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { ThemeSelector } from '@/components/ThemeSelector'
import { FontSelector } from '@/components/FontSelector'
import { FontScaleControl } from '@/components/FontScaleControl'
import { PanelLeft, Settings } from 'lucide-react'

export function Header() {
  const { projects, worktrees, sessions, toggleSidebar, isDevMode, openSettingsModal } = useAppStore()

  return (
    <header className="flex h-9 items-center justify-between border-b border-border bg-sidebar px-3 text-sm">
      <div className="flex items-center gap-2">
        {/* Sidebar toggle for mobile */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 md:hidden"
          onClick={toggleSidebar}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </Button>

        {/* DEV indicator */}
        {isDevMode && (
          <span className="rounded bg-yellow-500 px-1.5 py-0.5 text-xs font-bold text-black">
            DEV
          </span>
        )}

        {/* Logo */}
        <span className="font-semibold text-foreground">CA<span className="text-lg">⚡</span>CD</span>

        {/* Stats */}
        <div className="ml-4 hidden items-center gap-3 text-muted-foreground sm:flex">
          <span>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
          <span className="text-border">│</span>
          <span>{worktrees.length} worktree{worktrees.length !== 1 ? 's' : ''}</span>
          <span className="text-border">│</span>
          <span>{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={openSettingsModal}
          title="Settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>

        {/* Theme/font controls */}
        <ThemeSelector />
        <FontSelector />
        <FontScaleControl />
      </div>
    </header>
  )
}
