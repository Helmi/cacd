import { ReactNode } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'
import { Sidebar } from './Sidebar'
import { ContextSidebar } from '@/components/ContextSidebar'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { sidebarOpen, sidebarCollapsed, contextSidebarSessionId } = useAppStore()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main
          className={cn(
            'flex-1 overflow-hidden transition-all duration-200',
            sidebarOpen && !sidebarCollapsed && 'md:ml-0',
          )}
        >
          {children}
        </main>
        {contextSidebarSessionId && <ContextSidebar />}
      </div>
      <Footer />
    </div>
  )
}
