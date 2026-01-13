import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { AgentIcon } from '@/components/AgentIcon'
import { AgentOptionsForm } from '@/components/AgentOptionsForm'
import { GitBranch, Plus, Loader2, Folder } from 'lucide-react'
import { cn, generateWorktreePath as generatePath } from '@/lib/utils'
import type { AgentConfig } from '@/lib/types'

export function AddSessionModal() {
  const {
    addSessionModalOpen,
    closeAddSessionModal,
    addSessionWorktreePath,
    addSessionProjectPath,
    createSessionWithAgent,
    createWorktree,
    fetchData,
    fetchAgents,
    worktrees,
    projects,
    config,
    agents,
    defaultAgentId,
  } = useAppStore()

  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('')
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [selectedWorktreePath, setSelectedWorktreePath] = useState<string>('')
  const [baseBranch, setBaseBranch] = useState<string>('main')
  const [newBranchName, setNewBranchName] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [agentOptions, setAgentOptions] = useState<Record<string, boolean | string>>({})
  const [sessionName, setSessionName] = useState<string>('')
  const [branches, setBranches] = useState<string[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get the currently selected agent config
  const selectedAgent = agents.find(a => a.id === selectedAgentId)

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

  // Fetch agents when modal opens
  useEffect(() => {
    if (addSessionModalOpen && agents.length === 0) {
      fetchAgents()
    }
  }, [addSessionModalOpen, agents.length, fetchAgents])

  // Set default agent when agents are loaded
  useEffect(() => {
    if (addSessionModalOpen && agents.length > 0 && !selectedAgentId) {
      const defaultAgent = defaultAgentId || agents[0]?.id || ''
      setSelectedAgentId(defaultAgent)
    }
  }, [addSessionModalOpen, agents, defaultAgentId, selectedAgentId])

  // Reset options when agent changes
  useEffect(() => {
    if (selectedAgentId && selectedAgent) {
      // Initialize options with defaults
      const defaults: Record<string, boolean | string> = {}
      for (const opt of selectedAgent.options) {
        if (opt.default !== undefined) {
          defaults[opt.id] = opt.default
        }
      }
      setAgentOptions(defaults)
    }
  }, [selectedAgentId, selectedAgent])

  // Reset when modal closes
  useEffect(() => {
    if (!addSessionModalOpen) {
      setSelectedProjectPath('')
      setMode('existing')
      setSelectedWorktreePath('')
      setBaseBranch('main')
      setNewBranchName('')
      setSelectedAgentId('')
      setAgentOptions({})
      setSessionName('')
      setError(null)
    }
  }, [addSessionModalOpen])

  // Generate default session name based on selected agent
  const generateDefaultSessionName = (agent: AgentConfig | undefined): string => {
    if (!agent) return `Session-${Date.now().toString(36).slice(-4)}`
    // Use first word of agent name
    const baseName = agent.name.split(' ')[0] || 'Session'
    return `${baseName}-${Date.now().toString(36).slice(-4)}`
  }

  // Update session name when agent changes (if name is empty or was auto-generated)
  useEffect(() => {
    // Check if current name looks auto-generated (word-xxxx pattern)
    const isAutoGenerated = /^[A-Za-z]+-[a-z0-9]{4}$/.test(sessionName)
    if (!sessionName || isAutoGenerated) {
      setSessionName(generateDefaultSessionName(selectedAgent))
    }
  }, [selectedAgent?.id])

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

      if (!selectedAgentId) {
        setError('Please select an agent')
        setSubmitting(false)
        return
      }

      // Create session with selected agent and options
      const success = await createSessionWithAgent(
        worktreePath,
        selectedAgentId,
        agentOptions,
        sessionName || undefined
      )

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
    !selectedAgentId ||
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
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded border p-3 text-sm transition-colors',
                        selectedAgentId === agent.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-secondary'
                      )}
                    >
                      <AgentIcon
                        icon={agent.icon || (agent.kind === 'terminal' ? 'terminal' : undefined)}
                        iconColor={agent.iconColor}
                        className="h-6 w-6"
                      />
                      <span className="text-xs">{agent.name}</span>
                    </button>
                  ))}
                </div>
                {agents.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Loading agents...
                  </p>
                )}
              </div>

              {/* Agent options */}
              {selectedAgent && selectedAgent.options.length > 0 && (
                <div className="space-y-2 border-t border-border pt-3">
                  <Label className="text-xs text-muted-foreground">Options</Label>
                  <AgentOptionsForm
                    options={selectedAgent.options}
                    values={agentOptions}
                    onChange={setAgentOptions}
                  />
                </div>
              )}

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
