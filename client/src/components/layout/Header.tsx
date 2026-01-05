import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SettingsDropdown } from '@/components/SettingsDropdown'
import { Zap, Plus, PanelLeft } from 'lucide-react'

export function Header() {
  const { projects, worktrees, sessions, toggleSidebar } = useAppStore()

  return (
    <header className="flex h-8 items-center justify-between border-b border-border bg-sidebar px-2 text-xs">
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

        {/* Logo */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium text-foreground">CA<span className="text-primary">⚡</span>CD</span>
        </div>

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
        {/* New dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem>New Session</DropdownMenuItem>
            <DropdownMenuItem>New Worktree</DropdownMenuItem>
            <DropdownMenuItem>New Project</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme/font controls */}
        <SettingsDropdown />
      </div>
    </header>
  )
}
