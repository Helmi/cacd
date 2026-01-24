import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentIcon } from '@/components/AgentIcon'
import { AgentOptionsForm } from '@/components/AgentOptionsForm'
import {
  GitBranch,
  X,
  Loader2,
  Folder,
  Plus,
} from 'lucide-react'
import { cn, generateWorktreePath as generatePath } from '@/lib/utils'
import type { AgentConfig } from '@/lib/types'

export function AddSessionScreen() {
  const {
    closeAddSession,
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
    openAddProject,
  } = useAppStore()

  // Animation state
  const [isVisible, setIsVisible] = useState(false)

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

  // Determine if context was pre-selected
  const hasPreselectedWorktree = !!addSessionWorktreePath
  const hasPreselectedProject = !!addSessionProjectPath

  // Get the selected project object for display
  const selectedProject = projects.find(p => p.path === selectedProjectPath)

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10)
    return () => clearTimeout(timer)
  }, [])

  // Handle close with animation
  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(closeAddSession, 200)
  }, [closeAddSession])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  // Find which project a worktree belongs to
  const getProjectForWorktree = useCallback((worktreePath: string) => {
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
  }, [projects])

  // Filter worktrees for selected project
  const projectWorktrees = useMemo(() => {
    if (!selectedProjectPath) return []
    const projectName = selectedProjectPath.split('/').pop() || ''
    return worktrees.filter(w => {
      if (w.path.includes('/.worktrees/{project}/')) return false
      return (
        w.path.startsWith(selectedProjectPath) ||
        w.path.includes(`/.worktrees/${projectName}/`)
      )
    })
  }, [worktrees, selectedProjectPath])

  // Handle pre-selected worktree
  useEffect(() => {
    if (addSessionWorktreePath) {
      setSelectedWorktreePath(addSessionWorktreePath)
      setMode('existing')
      const project = getProjectForWorktree(addSessionWorktreePath)
      if (project) {
        setSelectedProjectPath(project.path)
      }
    }
  }, [addSessionWorktreePath, getProjectForWorktree])

  // Handle pre-selected project
  useEffect(() => {
    if (addSessionProjectPath && !addSessionWorktreePath) {
      setSelectedProjectPath(addSessionProjectPath)
    }
  }, [addSessionProjectPath, addSessionWorktreePath])

  // Fetch agents on mount
  useEffect(() => {
    if (agents.length === 0) {
      fetchAgents()
    }
  }, [agents.length, fetchAgents])

  // Set default agent when agents are loaded
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      const defaultAgent = defaultAgentId || agents[0]?.id || ''
      setSelectedAgentId(defaultAgent)
    }
  }, [agents, defaultAgentId, selectedAgentId])

  // Reset options when agent changes
  useEffect(() => {
    if (selectedAgentId && selectedAgent) {
      const defaults: Record<string, boolean | string> = {}
      for (const opt of selectedAgent.options) {
        if (opt.default !== undefined) {
          defaults[opt.id] = opt.default
        }
      }
      setAgentOptions(defaults)
    }
  }, [selectedAgentId, selectedAgent])

  // Generate default session name
  const generateDefaultSessionName = (agent: AgentConfig | undefined): string => {
    if (!agent) return `Session-${Date.now().toString(36).slice(-4)}`
    const baseName = agent.name.split(' ')[0] || 'Session'
    return `${baseName}-${Date.now().toString(36).slice(-4)}`
  }

  // Update session name when agent changes
  useEffect(() => {
    const isAutoGenerated = /^[A-Za-z]+-[a-z0-9]{4}$/.test(sessionName)
    if (!sessionName || isAutoGenerated) {
      setSessionName(generateDefaultSessionName(selectedAgent))
    }
  }, [selectedAgent?.id])

  // Auto-select project if only one exists
  useEffect(() => {
    if (!hasPreselectedWorktree && !hasPreselectedProject && projects.length === 1) {
      setSelectedProjectPath(projects[0].path)
    }
  }, [hasPreselectedWorktree, hasPreselectedProject, projects])

  // Fetch branches when project changes
  useEffect(() => {
    if (!selectedProjectPath) return

    setLoadingBranches(true)
    fetch(`/api/branches?projectPath=${encodeURIComponent(selectedProjectPath)}`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => {
        setBranches(data || [])
        if (data.includes('main')) setBaseBranch('main')
        else if (data.includes('master')) setBaseBranch('master')
        else if (data.length > 0) setBaseBranch(data[0])
      })
      .catch(() => setBranches(['main']))
      .finally(() => setLoadingBranches(false))
  }, [selectedProjectPath])

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
        if (!baseBranch || !newBranchName.trim()) {
          setError('Please fill in all fields')
          setSubmitting(false)
          return
        }

        const worktreeSuccess = await createWorktree(
          generatedWorktreePath,
          newBranchName.trim(),
          baseBranch,
          true,
          true,
          selectedProjectPath
        )

        if (!worktreeSuccess) {
          setError('Failed to create worktree')
          setSubmitting(false)
          return
        }

        await fetchData()

        const updatedWorktrees = await fetch('/api/worktrees', { credentials: 'include' }).then(r => r.json())
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

      const success = await createSessionWithAgent(
        worktreePath,
        selectedAgentId,
        agentOptions,
        sessionName || undefined
      )

      if (success) {
        fetchData()
        handleClose()
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
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]',
          'transition-opacity duration-300',
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={handleClose}
      />

      {/* Main panel */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-background flex flex-col',
          'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          isVisible ? 'translate-x-0 opacity-100' : 'translate-x-[20%] opacity-0'
        )}
      >
        {/* Header */}
        <header className="flex items-center justify-between h-12 px-4 border-b border-border bg-sidebar shrink-0">
          <div className="flex items-center gap-2 text-foreground">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">New Session</span>
            {(hasPreselectedWorktree || hasPreselectedProject) && selectedProject && (
              <span className="text-muted-foreground text-sm">
                in {selectedProject.name}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {/* Main content */}
        <ScrollArea className="flex-1">
          <div className="max-w-lg mx-auto p-6 space-y-6">
            {/* Empty state - no projects exist */}
            {projects.length === 0 && !hasPreselectedWorktree && !hasPreselectedProject ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Folder className="h-16 w-16 text-muted-foreground/50 mb-6" />
                <p className="text-muted-foreground mb-6">
                  You need a project before creating a session.
                </p>
                <Button
                  onClick={() => {
                    handleClose()
                    setTimeout(openAddProject, 250)
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Project
                </Button>
              </div>
            ) : (
              <>
                {/* Project selection */}
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
                            Use existing
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="new" id="new" />
                          <Label htmlFor="new" className="font-normal cursor-pointer">
                            Create new
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {mode === 'existing' ? (
                      <div className="space-y-2">
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
                            No worktrees found. Create a new one instead.
                          </p>
                        )}
                      </div>
                    ) : (
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
                    <div className="space-y-3 pt-4 border-t border-border">
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
                                : 'border-border hover:bg-muted/50'
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
                      <div className="space-y-3 pt-4 border-t border-border">
                        <Label className="text-muted-foreground">Options</Label>
                        <AgentOptionsForm
                          options={selectedAgent.options}
                          values={agentOptions}
                          onChange={setAgentOptions}
                        />
                      </div>
                    )}

                    {/* Session name */}
                    <div className="space-y-2 pt-4 border-t border-border">
                      <Label htmlFor="session-name">Session Name</Label>
                      <Input
                        id="session-name"
                        value={sessionName}
                        onChange={(e) => setSessionName(e.target.value)}
                        placeholder="e.g., Claude-1, Feature work"
                        className="h-8"
                      />
                      <p className="text-xs text-muted-foreground">
                        A name to identify this session
                      </p>
                    </div>
                  </>
                )}

                {/* Error message */}
                {error && (
                  <div className="text-sm text-destructive">{error}</div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-sidebar shrink-0">
          <span className="text-xs text-muted-foreground mr-auto hidden sm:inline">
            Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Esc</kbd> to close
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={submitting}
            className="h-8 px-3 text-sm"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className="h-8 px-4 text-sm"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Session'
            )}
          </Button>
        </footer>
      </div>
    </>
  )
}
