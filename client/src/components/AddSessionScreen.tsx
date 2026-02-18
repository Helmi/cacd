import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  AlertTriangle,
  ListTodo,
  Circle,
  CircleDot,
  CheckCircle2,
} from 'lucide-react'
import { cn, generateWorktreePath as generatePath } from '@/lib/utils'
import type { AgentConfig, TdIssue } from '@/lib/types'

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
    tdStatus,
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

  // TD task linking state
  const [selectedTdTaskId, setSelectedTdTaskId] = useState<string>('')
  const [tdTasks, setTdTasks] = useState<TdIssue[]>([])
  const [tdTaskSearch, setTdTaskSearch] = useState('')
  const [showTdTaskDropdown, setShowTdTaskDropdown] = useState(false)
  const [loadingTdTasks, setLoadingTdTasks] = useState(false)
  const tdTaskDropdownRef = useRef<HTMLDivElement>(null)
  const tdTaskInputRef = useRef<HTMLInputElement>(null)

  // Task list state (Claude-specific)
  const [taskListName, setTaskListName] = useState('')
  const [taskListSuggestions, setTaskListSuggestions] = useState<string[]>([])
  const [showTaskListDropdown, setShowTaskListDropdown] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ name: string } | null>(null)
  const taskListInputRef = useRef<HTMLInputElement>(null)
  const taskListDropdownRef = useRef<HTMLDivElement>(null)

  // Get the currently selected agent config
  const selectedAgent = agents.find(a => a.id === selectedAgentId)

  // Check if this is a Claude agent
  const isClaudeAgent = useMemo(() => {
    if (!selectedAgent) return false
    return (
      selectedAgentId === 'claude' ||
      selectedAgent.command === 'claude' ||
      selectedAgent.detectionStrategy === 'claude'
    )
  }, [selectedAgentId, selectedAgent])

  // Determine if context was pre-selected
  const hasPreselectedWorktree = !!addSessionWorktreePath
  const preselectedProject = addSessionProjectPath
    ? projects.find(p => p.path === addSessionProjectPath)
    : undefined
  const hasPreselectedProject =
    !!addSessionProjectPath && preselectedProject?.isValid !== false

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
    if (!addSessionProjectPath || addSessionWorktreePath) return
    if (selectedProjectPath) return
    if (projects.length === 0) return

    const project = projects.find(p => p.path === addSessionProjectPath)
    if (project?.isValid === false) {
      setError(`Project path is invalid or missing: ${addSessionProjectPath}`)
      return
    }
    if (!project) {
      setError(`Project not found: ${addSessionProjectPath}`)
      return
    }

    setSelectedProjectPath(addSessionProjectPath)
  }, [addSessionProjectPath, addSessionWorktreePath, projects, selectedProjectPath])

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

  // Fetch task list suggestions when project changes and Claude is selected
  useEffect(() => {
    if (!selectedProjectPath || !isClaudeAgent) {
      setTaskListSuggestions([])
      return
    }

    fetch(`/api/project/task-list-names?projectPath=${encodeURIComponent(selectedProjectPath)}`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        setTaskListSuggestions(data.taskListNames || [])
      })
      .catch(() => setTaskListSuggestions([]))
  }, [selectedProjectPath, isClaudeAgent])

  // Clear task list when switching away from Claude agent
  useEffect(() => {
    if (!isClaudeAgent) {
      setTaskListName('')
      setShowTaskListDropdown(false)
    }
  }, [isClaudeAgent])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        taskListDropdownRef.current &&
        !taskListDropdownRef.current.contains(event.target as Node) &&
        taskListInputRef.current &&
        !taskListInputRef.current.contains(event.target as Node)
      ) {
        setShowTaskListDropdown(false)
      }
    }

    if (showTaskListDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTaskListDropdown])

  // Fetch td tasks when td is enabled
  const tdEnabled = !!tdStatus?.projectState?.enabled
  useEffect(() => {
    if (!tdEnabled) {
      setTdTasks([])
      return
    }
    setLoadingTdTasks(true)
    fetch('/api/td/issues?status=open,in_progress', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setTdTasks(data.issues || []))
      .catch(() => setTdTasks([]))
      .finally(() => setLoadingTdTasks(false))
  }, [tdEnabled])

  // Filter td tasks by search
  const filteredTdTasks = useMemo(() => {
    if (!tdTaskSearch) return tdTasks
    const q = tdTaskSearch.toLowerCase()
    return tdTasks.filter(t =>
      t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)
    )
  }, [tdTasks, tdTaskSearch])

  // Close td task dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        tdTaskDropdownRef.current &&
        !tdTaskDropdownRef.current.contains(event.target as Node) &&
        tdTaskInputRef.current &&
        !tdTaskInputRef.current.contains(event.target as Node)
      ) {
        setShowTdTaskDropdown(false)
      }
    }
    if (showTdTaskDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTdTaskDropdown])

  // Get selected td task for display
  const selectedTdTask = tdTasks.find(t => t.id === selectedTdTaskId)

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
    if (hasPreselectedWorktree || hasPreselectedProject) return
    if (selectedProjectPath) return

    const validProjects = projects.filter(p => p.isValid !== false)
    if (validProjects.length === 1) {
      setSelectedProjectPath(validProjects[0].path)
    }
  }, [hasPreselectedWorktree, hasPreselectedProject, projects, selectedProjectPath])

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

  // Task list name validation (alphanumeric + underscores, max 64 chars)
  const TASK_LIST_PATTERN = /^[a-zA-Z0-9_]*$/
  const MAX_TASK_LIST_LENGTH = 64

  const handleTaskListNameChange = (value: string) => {
    if (value.length <= MAX_TASK_LIST_LENGTH && TASK_LIST_PATTERN.test(value)) {
      setTaskListName(value)
    }
  }

  // Filter suggestions based on current input
  const filteredSuggestions = useMemo(() => {
    if (!taskListName) return taskListSuggestions
    return taskListSuggestions.filter(s =>
      s.toLowerCase().includes(taskListName.toLowerCase())
    )
  }, [taskListName, taskListSuggestions])

  // Delete a task list name suggestion
  const handleDeleteTaskListName = async (name: string) => {
    if (!selectedProjectPath) return

    try {
      const res = await fetch('/api/project/task-list-names', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: selectedProjectPath, taskListName: name })
      })

      if (res.ok) {
        setTaskListSuggestions(prev => prev.filter(s => s !== name))
        if (taskListName === name) {
          setTaskListName('')
        }
      }
    } catch {
      // Silently fail - suggestion remains in list
    }
    setShowDeleteConfirm(null)
  }

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
        sessionName || undefined,
        taskListName || undefined,
        selectedTdTaskId || undefined
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
    selectedProject?.isValid === false ||
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
                    <Select
                      value={selectedProjectPath}
                      onValueChange={(v) => {
                        setSelectedProjectPath(v)
                        setError(null)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => {
                          const isInvalid = project.isValid === false
                          return (
                            <SelectItem
                              key={project.path}
                              value={project.path}
                              disabled={isInvalid}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Folder className="h-3 w-3 shrink-0" />
                                <span className="truncate">{project.name}</span>
                                {isInvalid && (
                                  <span className="flex items-center gap-1 text-xs text-yellow-600 shrink-0">
                                    <AlertTriangle className="h-3 w-3" />
                                    invalid
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          )
                        })}
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

                    {/* TD Task Link */}
                    {tdEnabled && (
                      <div className="space-y-2">
                        <Label>Link to Task</Label>
                        {selectedTdTask ? (
                          <div className="flex items-center gap-2 rounded border border-border bg-card p-2">
                            {selectedTdTask.status === 'in_progress' ? (
                              <CircleDot className="h-3 w-3 text-blue-500 shrink-0" />
                            ) : (
                              <Circle className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">{selectedTdTask.id}</span>
                            <span className="text-xs truncate flex-1">{selectedTdTask.title}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 shrink-0"
                              onClick={() => { setSelectedTdTaskId(''); setTdTaskSearch('') }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="relative">
                            <Input
                              ref={tdTaskInputRef}
                              value={tdTaskSearch}
                              onChange={(e) => { setTdTaskSearch(e.target.value); setShowTdTaskDropdown(true) }}
                              onFocus={() => setShowTdTaskDropdown(true)}
                              placeholder={loadingTdTasks ? 'Loading tasks...' : 'Search tasks by ID or title...'}
                              className="h-8 text-sm"
                              disabled={loadingTdTasks}
                            />
                            <ListTodo className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />

                            {showTdTaskDropdown && filteredTdTasks.length > 0 && (
                              <div
                                ref={tdTaskDropdownRef}
                                className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
                              >
                                {filteredTdTasks.map((task) => (
                                  <button
                                    key={task.id}
                                    type="button"
                                    className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-secondary"
                                    onClick={() => {
                                      setSelectedTdTaskId(task.id)
                                      setTdTaskSearch('')
                                      setShowTdTaskDropdown(false)
                                    }}
                                  >
                                    {task.status === 'in_progress' ? (
                                      <CircleDot className="h-3 w-3 text-blue-500 shrink-0" />
                                    ) : (
                                      <Circle className="h-3 w-3 text-muted-foreground shrink-0" />
                                    )}
                                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{task.id}</span>
                                    <span className="text-xs truncate flex-1">{task.title}</span>
                                    <span className={cn(
                                      'text-[10px] shrink-0',
                                      task.priority === 'P0' && 'text-red-500',
                                      task.priority === 'P1' && 'text-orange-500',
                                    )}>
                                      {task.priority}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {showTdTaskDropdown && !loadingTdTasks && filteredTdTasks.length === 0 && tdTaskSearch && (
                              <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg p-3">
                                <p className="text-xs text-muted-foreground text-center">No matching tasks</p>
                              </div>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Link this session to a td task for context tracking
                        </p>
                      </div>
                    )}

                    {/* Task List Name (Claude only) */}
                    {isClaudeAgent && (
                      <div className="space-y-2">
                        <Label htmlFor="task-list-name">Task List Name</Label>
                        <div className="relative">
                          <Input
                            ref={taskListInputRef}
                            id="task-list-name"
                            value={taskListName}
                            onChange={(e) => handleTaskListNameChange(e.target.value)}
                            onFocus={() => setShowTaskListDropdown(true)}
                            placeholder="e.g., feature_auth, bugfix_123"
                            className="h-8 font-mono text-sm"
                          />

                          {/* Dropdown for suggestions */}
                          {showTaskListDropdown && filteredSuggestions.length > 0 && (
                            <div
                              ref={taskListDropdownRef}
                              className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg"
                            >
                              {filteredSuggestions.map((suggestion) => (
                                <div
                                  key={suggestion}
                                  className="flex items-center justify-between px-3 py-2 hover:bg-secondary cursor-pointer"
                                >
                                  <span
                                    className="font-mono text-sm flex-1"
                                    onClick={() => {
                                      setTaskListName(suggestion)
                                      setShowTaskListDropdown(false)
                                    }}
                                  >
                                    {suggestion}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setShowDeleteConfirm({ name: suggestion })
                                    }}
                                    className="ml-2 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                    title="Remove from suggestions"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Delete confirmation dialog */}
                          {showDeleteConfirm && (
                            <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg p-3">
                              <div className="flex items-start gap-2 mb-3">
                                <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                                <div className="text-sm">
                                  <p className="font-medium">Remove "{showDeleteConfirm.name}"?</p>
                                  <p className="text-muted-foreground text-xs mt-1">
                                    This task list may still be in use by other sessions.
                                  </p>
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowDeleteConfirm(null)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteTaskListName(showDeleteConfirm.name)}
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Share a task list across sessions. Only letters, numbers, and underscores.
                        </p>
                      </div>
                    )}
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
