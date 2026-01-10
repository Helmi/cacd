import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { GitBranch, Folder, Loader2 } from 'lucide-react'
import { generateWorktreePath as generatePath } from '@/lib/utils'

export function AddWorktreeModal() {
  const {
    addWorktreeModalOpen,
    closeAddWorktreeModal,
    addWorktreeProjectPath,
    createWorktree,
    fetchData,
    projects,
    currentProject,
    config,
  } = useAppStore()

  // Determine if project was pre-selected from context menu
  const hasPreselectedProject = !!addWorktreeProjectPath

  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('')
  const [baseBranch, setBaseBranch] = useState<string>('main')
  const [branchName, setBranchName] = useState('')
  const [copySessionData, setCopySessionData] = useState(true)
  const [copyClaudeDirectory, setCopyClaudeDirectory] = useState(true)
  const [branches, setBranches] = useState<string[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get the selected project object for display
  const selectedProject = projects.find(p => p.path === selectedProjectPath)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (addWorktreeModalOpen) {
      // Priority: pre-selected from context menu > current project > single project
      if (addWorktreeProjectPath) {
        setSelectedProjectPath(addWorktreeProjectPath)
      } else if (currentProject) {
        setSelectedProjectPath(currentProject.path)
      } else if (projects.length === 1) {
        setSelectedProjectPath(projects[0].path)
      }
    } else {
      setSelectedProjectPath('')
      setBaseBranch('main')
      setBranchName('')
      setBranches([])
      setError(null)
    }
  }, [addWorktreeModalOpen, addWorktreeProjectPath, currentProject, projects])

  // Fetch branches when project changes
  useEffect(() => {
    if (!selectedProjectPath) {
      setBranches([])
      return
    }

    setLoadingBranches(true)
    fetch(`/api/branches?projectPath=${encodeURIComponent(selectedProjectPath)}`)
      .then(res => res.json())
      .then(data => {
        setBranches(data || [])
        // Auto-select main or master
        if (data.includes('main')) setBaseBranch('main')
        else if (data.includes('master')) setBaseBranch('master')
        else if (data.length > 0) setBaseBranch(data[0])
      })
      .catch(() => setBranches(['main']))
      .finally(() => setLoadingBranches(false))
  }, [selectedProjectPath])

  // Generate worktree path based on config template and branch name
  const generateWorktreePath = useMemo(() => {
    if (!branchName || !selectedProjectPath) return ''
    return generatePath(selectedProjectPath, branchName, config.worktreePathTemplate)
  }, [branchName, selectedProjectPath, config.worktreePathTemplate])

  const handleSubmit = async () => {
    if (!selectedProjectPath || !baseBranch || !branchName.trim()) return

    setSubmitting(true)
    setError(null)

    try {
      const success = await createWorktree(
        generateWorktreePath,
        branchName.trim(),
        baseBranch,
        copySessionData,
        copyClaudeDirectory,
        selectedProjectPath
      )

      if (success) {
        fetchData()
        closeAddWorktreeModal()
      } else {
        setError('Failed to create worktree')
      }
    } catch (e) {
      setError('Failed to create worktree. Check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={addWorktreeModalOpen} onOpenChange={closeAddWorktreeModal}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            New Worktree
            {hasPreselectedProject && selectedProject && (
              <span className="text-muted-foreground font-normal text-sm">
                in {selectedProject.name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Project selection - hide if pre-selected from context menu */}
          {!hasPreselectedProject && (
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={selectedProjectPath} onValueChange={setSelectedProjectPath}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.path} value={project.path}>
                      <div className="flex items-center gap-2">
                        <Folder className="h-3 w-3" />
                        {project.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Base branch selection */}
          <div className="space-y-2">
            <Label>Base Branch</Label>
            <Select
              value={baseBranch}
              onValueChange={setBaseBranch}
              disabled={!selectedProjectPath || loadingBranches}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingBranches ? 'Loading...' : 'Select base branch'} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch} value={branch}>
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-3 w-3" />
                      {branch}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              New worktree will branch off from this branch
            </p>
          </div>

          {/* New branch name */}
          <div className="space-y-2">
            <Label htmlFor="branch-name">New Branch Name</Label>
            <Input
              id="branch-name"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="e.g., feature/new-feature"
              className="font-mono text-sm"
              disabled={!baseBranch}
            />
          </div>

          {/* Generated path preview */}
          {branchName && generateWorktreePath && (
            <div className="space-y-1">
              <Label className="text-muted-foreground">Worktree Path</Label>
              <div className="text-xs font-mono bg-secondary/50 rounded px-2 py-1.5 text-muted-foreground break-all">
                {generateWorktreePath}
              </div>
            </div>
          )}

          {/* Copy options */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="copy-session"
                checked={copySessionData}
                onCheckedChange={(checked) => setCopySessionData(checked === true)}
              />
              <Label htmlFor="copy-session" className="text-sm font-normal">
                Copy session data
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="copy-claude"
                checked={copyClaudeDirectory}
                onCheckedChange={(checked) => setCopyClaudeDirectory(checked === true)}
              />
              <Label htmlFor="copy-claude" className="text-sm font-normal">
                Copy .claude directory
              </Label>
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={closeAddWorktreeModal} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedProjectPath || !baseBranch || !branchName.trim() || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Worktree'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
