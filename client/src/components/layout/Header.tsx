import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { ThemeSelector } from '@/components/ThemeSelector'
import { FontSelector } from '@/components/FontSelector'
import { FontScaleControl } from '@/components/FontScaleControl'
import { cn } from '@/lib/utils'
import { PanelLeft, Settings, Zap, ListTodo } from 'lucide-react'

export function Header() {
  const { toggleSidebar, isDevMode, openSettings, tdStatus, taskBoardOpen, openTaskBoard, closeTaskBoard } = useAppStore()

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

        {/* Logo */}
        <span className="text-lg font-bold tracking-tight text-foreground flex items-center">
          CA<Zap className="h-4 w-4 mx-0.5 text-yellow-500 fill-yellow-500" />CD
        </span>

        {/* DEV indicator */}
        {isDevMode && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            DEV
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Task Board toggle (only when td is enabled) */}
        {tdStatus?.projectState?.enabled && (
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-6 w-6', taskBoardOpen && 'bg-muted text-foreground')}
            onClick={() => taskBoardOpen ? closeTaskBoard() : openTaskBoard()}
            title="Task Board"
          >
            <ListTodo className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => openSettings()}
          title="Settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>

        {/* Theme/font controls - hidden on mobile, accessible via Settings */}
        <div className="hidden md:flex items-center gap-1">
          <ThemeSelector />
          <FontSelector />
          <FontScaleControl />
        </div>
      </div>
    </header>
  )
}
