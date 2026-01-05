import { useEffect } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function ErrorBanner() {
  const { error, clearError } = useAppStore()

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 8000)
      return () => clearTimeout(timer)
    }
  }, [error, clearError])

  if (!error) return null

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 px-4 py-2',
        'bg-destructive text-destructive-foreground',
        'animate-in slide-in-from-top duration-200'
      )}
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="text-sm">{error}</span>
      </div>
      <button
        onClick={clearError}
        className="rounded-sm p-1 hover:bg-destructive-foreground/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
