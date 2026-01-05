import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronsRight, Folder, PanelLeftClose } from 'lucide-react'

export function Sidebar() {
  const {
    projects,
    sidebarOpen,
    sidebarCollapsed,
    expandSidebar,
    toggleSidebar,
  } = useAppStore()

  if (!sidebarOpen) return null

  // Collapsed sidebar (icon-only mode)
  if (sidebarCollapsed) {
    return (
      <aside className="flex w-10 flex-col border-r border-border bg-sidebar">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-full rounded-none border-b border-border"
          onClick={expandSidebar}
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
        <ScrollArea className="flex-1">
          <div className="flex flex-col items-center gap-1 py-2">
            {projects.map((project) => (
              <Button
                key={project.path}
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={project.name}
              >
                <Folder className="h-3.5 w-3.5" />
              </Button>
            ))}
          </div>
        </ScrollArea>
      </aside>
    )
  }

  // Expanded sidebar
  return (
    <aside className="flex w-52 flex-col border-r border-border bg-sidebar lg:w-56">
      {/* Sidebar header */}
      <div className="flex items-center gap-1 border-b border-border px-1 py-1">
        <span className="flex-1 truncate px-1 text-xs text-muted-foreground">Sessions</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={toggleSidebar}
          title="Close sidebar"
        >
          <PanelLeftClose className="h-3 w-3" />
        </Button>
      </div>

      {/* Sidebar content - placeholder for tree navigation */}
      <ScrollArea className="flex-1">
        <div className="py-2 px-2">
          <p className="text-xs text-muted-foreground text-center py-8">
            Project tree will be rendered here
          </p>
        </div>
      </ScrollArea>
    </aside>
  )
}
