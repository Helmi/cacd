import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GitBranch, Check, X, Loader2 } from 'lucide-react'

type ValidationStatus = 'idle' | 'checking' | 'valid' | 'invalid'

export function AddProjectModal() {
  const { addProjectModalOpen, closeAddProjectModal, fetchData } = useAppStore()
  const [path, setPath] = useState('')
  const [description, setDescription] = useState('')
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!addProjectModalOpen) {
      setPath('')
      setDescription('')
      setValidationStatus('idle')
      setError(null)
    }
  }, [addProjectModalOpen])

  // Debounced validation on path input
  useEffect(() => {
    if (!path) {
      setValidationStatus('idle')
      return
    }

    setValidationStatus('checking')
    const timer = setTimeout(async () => {
      // Simple validation: check if path looks valid (starts with / or ~)
      if (path.startsWith('/') || path.startsWith('~')) {
        setValidationStatus('valid')
      } else {
        setValidationStatus('invalid')
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [path])

  const handleSubmit = async () => {
    if (validationStatus !== 'valid') return

    setSubmitting(true)
    setError(null)

    try {
      // Call API directly to get detailed error message
      const res = await fetch('/api/project/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, description: description || undefined })
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to add project. Make sure the path is a valid git repository.')
        return
      }

      fetchData()
      closeAddProjectModal()
    } catch (e) {
      setError('Failed to add project. Check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={addProjectModalOpen} onOpenChange={closeAddProjectModal}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Add Project
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="path">Project Path</Label>
            <div className="relative">
              <Input
                id="path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/path/to/your/project"
                className="pr-8 font-mono text-sm"
                autoFocus
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                {validationStatus === 'checking' && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {validationStatus === 'valid' && <Check className="h-4 w-4 text-green-500" />}
                {validationStatus === 'invalid' && <X className="h-4 w-4 text-destructive" />}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the absolute path to a git repository
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of the project"
              className="text-sm"
            />
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={closeAddProjectModal} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={validationStatus !== 'valid' || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Project'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
