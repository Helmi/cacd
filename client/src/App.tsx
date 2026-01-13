import { AppProvider, useAppStore } from '@/lib/store'
import { Layout } from '@/components/layout'
import { SessionGrid } from '@/components/SessionGrid'
import { InlineDiffViewer } from '@/components/InlineDiffViewer'
import { ErrorBanner } from '@/components/ErrorBanner'
import { AddProjectModal } from '@/components/AddProjectModal'
import { AddWorktreeModal } from '@/components/AddWorktreeModal'
import { AddSessionModal } from '@/components/AddSessionModal'
import { SettingsScreen } from '@/components/SettingsScreen'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Terminal } from 'lucide-react'

function MainContent() {
  const { selectedSessions, viewingFileDiff } = useAppStore()

  // Show diff viewer when viewing a file diff
  if (viewingFileDiff) {
    return <InlineDiffViewer />
  }

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

function AppContent() {
  const { settingsOpen } = useAppStore()

  return (
    <>
      <ErrorBanner />
      <Layout>
        <MainContent />
      </Layout>
      {/* Modals - rendered based on store state */}
      <AddProjectModal />
      <AddWorktreeModal />
      <AddSessionModal />
      {/* Settings screen - full-screen overlay */}
      {settingsOpen && <SettingsScreen />}
    </>
  )
}

function App() {
  return (
    <AppProvider>
      <TooltipProvider delayDuration={300}>
        <AppContent />
      </TooltipProvider>
    </AppProvider>
  )
}

export default App
