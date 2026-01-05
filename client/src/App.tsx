import { AppProvider, useAppStore } from '@/lib/store'
import { Layout } from '@/components/layout'
import { SessionGrid } from '@/components/SessionGrid'
import { ErrorBanner } from '@/components/ErrorBanner'
import { Terminal } from 'lucide-react'

function MainContent() {
  const { selectedSessions } = useAppStore()

  if (selectedSessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Terminal className="h-12 w-12 opacity-50" />
        <div className="text-center text-sm">
          <p>No sessions selected</p>
          <p className="text-xs">Click a session in the sidebar to view it</p>
          <p className="mt-1 text-xs opacity-70">
            Hold <kbd className="rounded bg-secondary px-1">Cmd</kbd> or{' '}
            <kbd className="rounded bg-secondary px-1">Ctrl</kbd> to select multiple
          </p>
        </div>
      </div>
    )
  }

  return <SessionGrid />
}

function App() {
  return (
    <AppProvider>
      <ErrorBanner />
      <Layout>
        <MainContent />
      </Layout>
    </AppProvider>
  )
}

export default App
