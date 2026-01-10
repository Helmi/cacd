import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { AgentIcon } from '@/components/AgentIcon'
import { GitBranch, Plus, Loader2, Folder } from 'lucide-react'
import { cn, generateWorktreePath as generatePath } from '@/lib/utils'

type AgentType = 'claude-code' | 'codex' | 'gemini-cli'

const agents: { value: AgentType; label: string }[] = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex CLI' },
  { value: 'gemini-cli', label: 'Gemini CLI' },
]

export function AddSessionModal() {
  const {
    addSessionModalOpen,
    closeAddSessionModal,
    addSessionWorktreePath,
    addSessionProjectPath,
    createSession,
    createWorktree,
    fetchData,
    worktrees,
    projects,
    config,
  } = useAppStore()

  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('')
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [selectedWorktreePath, setSelectedWorktreePath] = useState<string>('')
  const [baseBranch, setBaseBranch] = useState<string>('main')
  const [newBranchName, setNewBranchName] = useState('')
  const [agent, setAgent] = useState<AgentType>('claude-code')
  const [sessionName, setSessionName] = useState<string>('')
  const [branches, setBranches] = useState<string[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Determine if context was pre-selected (clicked from within a project or worktree)
  const hasPreselectedWorktree = !!addSessionWorktreePath
  const hasPreselectedProject = !!addSessionProjectPath

  // Get the selected project object for display
  const selectedProject = projects.find(p => p.path === selectedProjectPath)

  // Find which project a worktree belongs to
  const getProjectForWorktree = (worktreePath: string) => {
    for (const project of projects) {
      const projectName = project.path.split('/').pop() || ''
      if (
        worktreePath.startsWith(project.path) ||
        worktreePath.includes(`/.worktrees/${projectName}/`)
      ) {
        return project
      }
    }
    return null
  }

  // Filter worktrees for selected project
  const projectWorktrees = useMemo(() => {
    if (!selectedProjectPath) return []
    const projectName = selectedProjectPath.split('/').pop() || ''
    return worktrees.filter(w => {
      if (w.path.includes('/.worktrees/{project}/')) return false // Filter corrupted
      return (
        w.path.startsWith(selectedProjectPath) ||
        w.path.includes(`/.worktrees/${projectName}/`)
      )
    })
  }, [worktrees, selectedProjectPath])

  // Handle pre-selected worktree - auto-select its project
  useEffect(() => {
    if (addSessionWorktreePath && addSessionModalOpen) {
      setSelectedWorktreePath(addSessionWorktreePath)
      setMode('existing')
      // Find and set the project for this worktree
      const project = getProjectForWorktree(addSessionWorktreePath)
      if (project) {
        setSelectedProjectPath(project.path)
      }
    }
  }, [addSessionWorktreePath, addSessionModalOpen, projects])

  // Handle pre-selected project (from project context menu)
  useEffect(() => {
    if (addSessionProjectPath && addSessionModalOpen && !addSessionWorktreePath) {
      setSelectedProjectPath(addSessionProjectPath)
    }
  }, [addSessionProjectPath, addSessionModalOpen, addSessionWorktreePath])

  // Reset when modal closes
  useEffect(() => {
    if (!addSessionModalOpen) {
      setSelectedProjectPath('')
      setMode('existing')
      setSelectedWorktreePath('')
      setBaseBranch('main')
      setNewBranchName('')
      setAgent('claude-code')
      setSessionName('')
      setError(null)
    }
  }, [addSessionModalOpen])

  // Generate default session name based on agent
  const generateDefaultSessionName = (agentType: AgentType): string => {
    const agentNames: Record<AgentType, string> = {
      'claude-code': 'Claude',
      'codex': 'Codex',
      'gemini-cli': 'Gemini',
    }
    const baseName = agentNames[agentType] || 'Session'
    // Use a short timestamp suffix for uniqueness
    return `${baseName}-${Date.now().toString(36).slice(-4)}`
  }

  // Update session name when agent changes (if name is empty or was auto-generated)
  useEffect(() => {
    if (!sessionName || sessionName.match(/^(Claude|Codex|Gemini)-[a-z0-9]{4}$/)) {
      setSessionName(generateDefaultSessionName(agent))
    }
  }, [agent])

  // Auto-select project if only one exists
  useEffect(() => {
    if (addSessionModalOpen && !hasPreselectedWorktree && !hasPreselectedProject && projects.length === 1) {
      setSelectedProjectPath(projects[0].path)
    }
  }, [addSessionModalOpen, hasPreselectedWorktree, hasPreselectedProject, projects])

  // Fetch branches when project changes
  useEffect(() => {
    if (!addSessionModalOpen || !selectedProjectPath) return

    setLoadingBranches(true)
    fetch(`/api/branches?projectPath=${encodeURIComponent(selectedProjectPath)}`)
      .then(res => res.json())
      .then(data => {
        setBranches(data || [])
        if (data.includes('main')) setBaseBranch('main')
        else if (data.includes('master')) setBaseBranch('master')
        else if (data.length > 0) setBaseBranch(data[0])
      })
      .catch(() => setBranches(['main']))
      .finally(() => setLoadingBranches(false))
  }, [addSessionModalOpen, selectedProjectPath])

  // Generate worktree path from config template
  const generatedWorktreePath = useMemo(() => {
    if (!newBranchName || !selectedProjectPath) return ''
    return generatePath(selectedProjectPath, newBranchName, config.worktreePathTemplate)
  }, [newBranchName, selectedProjectPath, config.worktreePathTemplate])

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)

    try {
      let worktreePath = selectedWorktreePath

      if (mode === 'new') {
        // Create new worktree first
        if (!baseBranch || !newBranchName.trim()) {
          setError('Please fill in all fields')
          setSubmitting(false)
          return
        }

        const worktreeSuccess = await createWorktree(
          generatedWorktreePath,
          newBranchName.trim(),
          baseBranch,
          true, // copySessionData
          true, // copyClaudeDirectory
          selectedProjectPath // projectPath
        )

        if (!worktreeSuccess) {
          setError('Failed to create worktree')
          setSubmitting(false)
          return
        }

        // Refresh to get the new worktree path
        await fetchData()

        // The worktree path will be relative, so we need to find the actual path
        // For now, use the branch name to find it
        const updatedWorktrees = await fetch('/api/worktrees').then(r => r.json())

        const newWorktree = updatedWorktrees.find((w: { branch: string }) =>
          w.branch === newBranchName.trim()
        )

        if (newWorktree) {
          worktreePath = newWorktree.path
        } else {
          setError('Worktree created but not found')
          setSubmitting(false)
          return
        }
      }

      if (!worktreePath) {
        setError('Please select a worktree')
        setSubmitting(false)
        return
      }

      // Create session
      // Note: agent selection is for future use - currently we only support claude-code
      const success = await createSession(worktreePath, undefined, sessionName || undefined)

      if (success) {
        fetchData()
        closeAddSessionModal()
      } else {
        setError('Failed to create session')
      }
    } catch (e) {
      setError('Failed to create session. Check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  const isSubmitDisabled =
    submitting ||
    !selectedProjectPath ||
    (mode === 'existing' && !selectedWorktreePath) ||
    (mode === 'new' && (!baseBranch || !newBranchName.trim()))

  return (
    <Dialog open={addSessionModalOpen} onOpenChange={closeAddSessionModal}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Session
            {(hasPreselectedWorktree || hasPreselectedProject) && selectedProject && (
              <span className="text-muted-foreground font-normal text-sm">
                in {selectedProject.name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Project selection - show if not pre-selected from worktree or project context menu */}
          {!hasPreselectedWorktree && !hasPreselectedProject && (
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

          {/* Only show rest of form if project is selected */}
          {selectedProjectPath && (
            <>
              {/* Mode selection */}
              <div className="space-y-2">
                <Label>Worktree</Label>
                <RadioGroup
                  value={mode}
                  onValueChange={(v) => setMode(v as 'existing' | 'new')}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="existing" id="existing" />
                    <Label htmlFor="existing" className="font-normal cursor-pointer">
                      Use existing worktree
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="new" id="new" />
                    <Label htmlFor="new" className="font-normal cursor-pointer">
                      Create new worktree
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {mode === 'existing' ? (
                /* Existing worktree selection */
                <div className="space-y-2">
                  <Label>Worktree</Label>
                  <Select value={selectedWorktreePath} onValueChange={setSelectedWorktreePath}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select worktree" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectWorktrees.map((worktree) => (
                        <SelectItem key={worktree.path} value={worktree.path}>
                          <div className="flex items-center gap-2">
                            <GitBranch className="h-3 w-3" />
                            {worktree.branch || worktree.path.split('/').pop()}
                            {worktree.isMainWorktree && (
                              <span className="text-xs text-yellow-500">(main)</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {projectWorktrees.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No worktrees found for this project. Create a new worktree or check if the project has any branches.
                    </p>
                  )}
                </div>
              ) : (
                /* New worktree fields */
                <>
                  <div className="space-y-2">
                    <Label>Base Branch</Label>
                    <Select
                      value={baseBranch}
                      onValueChange={setBaseBranch}
                      disabled={loadingBranches}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loadingBranches ? 'Loading...' : 'Branch to fork from'} />
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
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-branch">New Branch Name</Label>
                    <Input
                      id="new-branch"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      placeholder="e.g., feature/my-feature"
                      className="font-mono text-sm"
                      disabled={!baseBranch}
                    />
                  </div>

                  {newBranchName && generatedWorktreePath && (
                    <div className="text-xs text-muted-foreground">
                      Path: <span className="font-mono">{generatedWorktreePath}</span>
                    </div>
                  )}
                </>
              )}

              {/* Agent selection */}
              <div className="space-y-2">
                <Label>Agent</Label>
                <div className="grid grid-cols-3 gap-2">
                  {agents.map((a) => (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => setAgent(a.value)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded border p-3 text-sm transition-colors',
                        agent === a.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-secondary'
                      )}
                    >
                      <AgentIcon agent={a.value} className="h-5 w-5" />
                      <span className="text-xs">{a.label}</span>
                    </button>
                  ))}
                </div>
                {agent !== 'claude-code' && (
                  <p className="text-xs text-muted-foreground">
                    Note: Only Claude Code is currently supported. Other agents coming soon.
                  </p>
                )}
              </div>

              {/* Session name */}
              <div className="space-y-2">
                <Label htmlFor="session-name">Session Name</Label>
                <Input
                  id="session-name"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g., Claude-1, Feature work, Bug fix"
                  className="h-8"
                />
                <p className="text-xs text-muted-foreground">
                  A name to identify this session
                </p>
              </div>
            </>
          )}

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={closeAddSessionModal} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitDisabled}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Session'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
