import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ProjectConfig, TdPromptTemplate } from '@/lib/types'
import { CheckCircle2, XCircle, Play, Save, RefreshCw, FileText, Trash2, Plus, Code2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SettingsProject() {
  const {
    currentProject,
    tdStatus,
    agents,
    projectConfig,
    projectConfigPath,
    fetchProjectConfig,
    saveProjectConfig,
    initializeTdProject,
    fetchTdPrompts,
    saveTdPrompt,
    deleteTdPrompt,
  } = useAppStore()

  const [localConfig, setLocalConfig] = useState<ProjectConfig>({})
  const [rawJson, setRawJson] = useState('{}')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)

  const [allPrompts, setAllPrompts] = useState<TdPromptTemplate[]>([])
  const [effectivePrompts, setEffectivePrompts] = useState<TdPromptTemplate[]>([])
  const [selectedProjectPrompt, setSelectedProjectPrompt] = useState('')
  const [projectPromptName, setProjectPromptName] = useState('')
  const [projectPromptContent, setProjectPromptContent] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)

  const projectState = tdStatus?.projectState
  const availability = tdStatus?.availability
  const projectPrompts = useMemo(
    () => allPrompts.filter(t => t.source === 'project'),
    [allPrompts]
  )

  const refreshPromptData = async () => {
    const [all, effective] = await Promise.all([
      fetchTdPrompts('all'),
      fetchTdPrompts('effective'),
    ])
    setAllPrompts(all)
    setEffectivePrompts(effective)
  }

  useEffect(() => {
    if (!currentProject) return
    fetchProjectConfig()
    refreshPromptData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.path])

  useEffect(() => {
    const cfg = projectConfig || {}
    setLocalConfig(cfg)
    setRawJson(JSON.stringify(cfg, null, 2))
  }, [projectConfig])

  useEffect(() => {
    if (!selectedProjectPrompt) {
      setProjectPromptContent('')
      return
    }

    fetch(`/api/td/prompts/${encodeURIComponent(selectedProjectPrompt)}?scope=project`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => {
        setProjectPromptName(data.template?.name || selectedProjectPrompt)
        setProjectPromptContent(data.template?.content || '')
      })
      .catch(() => setProjectPromptContent(''))
  }, [selectedProjectPrompt])

  if (!currentProject) {
    return (
      <div className="rounded border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Select a project to edit project-level settings.
      </div>
    )
  }

  const updateConfig = (nextConfig: ProjectConfig) => {
    setLocalConfig(nextConfig)
    setRawJson(JSON.stringify(nextConfig, null, 2))
  }

  const setTdEnabled = (enabled: boolean) => {
    updateConfig({
      ...localConfig,
      td: {
        ...localConfig.td,
        enabled,
      },
    })
  }

  const setTdAutoStart = (autoStart: boolean) => {
    updateConfig({
      ...localConfig,
      td: {
        ...localConfig.td,
        autoStart,
      },
    })
  }

  const setDefaultPrompt = (defaultPrompt: string) => {
    updateConfig({
      ...localConfig,
      td: {
        ...localConfig.td,
        defaultPrompt: defaultPrompt || undefined,
      },
    })
  }

  const setHook = (field: 'setup' | 'teardown', value: string) => {
    updateConfig({
      ...localConfig,
      scripts: {
        ...localConfig.scripts,
        [field]: value,
      },
    })
  }

  const setAgentDefault = (agentId: string) => {
    updateConfig({
      ...localConfig,
      agentDefaults: {
        ...localConfig.agentDefaults,
        agentId: agentId || undefined,
      },
    })
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    await saveProjectConfig(localConfig)
    setSavingConfig(false)
  }

  const handleApplyJson = () => {
    try {
      const parsed = JSON.parse(rawJson) as ProjectConfig
      setJsonError(null)
      setLocalConfig(parsed)
    } catch (err) {
      setJsonError(String(err))
    }
  }

  const handleInitTd = async () => {
    const ok = await initializeTdProject()
    if (ok) {
      await refreshPromptData()
    }
  }

  const handleNewPrompt = () => {
    setSelectedProjectPrompt('')
    setProjectPromptName('')
    setProjectPromptContent('')
  }

  const handleSavePrompt = async () => {
    if (!projectPromptName.trim()) return
    setSavingPrompt(true)
    const ok = await saveTdPrompt(projectPromptName.trim(), projectPromptContent, 'project')
    if (ok) {
      setSelectedProjectPrompt(projectPromptName.trim())
      await refreshPromptData()
    }
    setSavingPrompt(false)
  }

  const handleDeletePrompt = async () => {
    if (!selectedProjectPrompt) return
    setSavingPrompt(true)
    const ok = await deleteTdPrompt(selectedProjectPrompt, 'project')
    if (ok) {
      setSelectedProjectPrompt('')
      setProjectPromptName('')
      setProjectPromptContent('')
      await refreshPromptData()
    }
    setSavingPrompt(false)
  }

  const tdEnabled = localConfig.td?.enabled !== false
  const tdAutoStart = localConfig.td?.autoStart !== false

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-1">Project Settings</h3>
        <p className="text-xs text-muted-foreground">
          Settings for <span className="font-mono">{currentProject.name}</span>.
        </p>
        {projectConfigPath && (
          <p className="text-xs text-muted-foreground mt-1">
            Config file: <span className="font-mono">{projectConfigPath}</span>
          </p>
        )}
      </div>

      <div className="space-y-3">
        <Label className="text-muted-foreground">TD Project Status</Label>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            {projectState?.initialized ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground" />
            )}
            <span>{projectState?.initialized ? 'td initialized' : 'td not initialized'}</span>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="project-td-enabled"
              checked={tdEnabled}
              onCheckedChange={(checked) => setTdEnabled(checked === true)}
            />
            <label htmlFor="project-td-enabled" className="cursor-pointer">Enable td integration for this project</label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="project-td-autostart"
              checked={tdAutoStart}
              onCheckedChange={(checked) => setTdAutoStart(checked === true)}
            />
            <label htmlFor="project-td-autostart" className="cursor-pointer">Auto-start linked td task for new sessions</label>
          </div>

          {availability?.binaryAvailable && !projectState?.initialized && (
            <Button variant="outline" size="sm" onClick={handleInitTd}>
              <Play className="h-3.5 w-3.5 mr-1" />
              Initialize td
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <Label className="text-muted-foreground">Defaults and Hooks</Label>

        <div className="space-y-2">
          <Label htmlFor="project-default-prompt" className="text-xs text-muted-foreground">Default Prompt Template</Label>
          <Select
            value={localConfig.td?.defaultPrompt || '__none__'}
            onValueChange={(v) => setDefaultPrompt(v === '__none__' ? '' : v)}
          >
            <SelectTrigger id="project-default-prompt" className="h-8">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {effectivePrompts.map((prompt) => (
                <SelectItem key={prompt.name} value={prompt.name}>
                  {prompt.name} {prompt.source === 'global' ? '(global)' : '(project)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="project-agent-default" className="text-xs text-muted-foreground">Default Agent</Label>
          <Select
            value={localConfig.agentDefaults?.agentId || '__none__'}
            onValueChange={(v) => setAgentDefault(v === '__none__' ? '' : v)}
          >
            <SelectTrigger id="project-agent-default" className="h-8">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="project-hook-setup" className="text-xs text-muted-foreground">Setup Hook</Label>
          <Input
            id="project-hook-setup"
            value={localConfig.scripts?.setup || ''}
            onChange={(e) => setHook('setup', e.target.value)}
            className="h-8 font-mono"
            placeholder="command to run after worktree creation"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="project-hook-teardown" className="text-xs text-muted-foreground">Teardown Hook</Label>
          <Input
            id="project-hook-teardown"
            value={localConfig.scripts?.teardown || ''}
            onChange={(e) => setHook('teardown', e.target.value)}
            className="h-8 font-mono"
            placeholder="command to run before worktree deletion"
          />
        </div>

        <Button size="sm" onClick={handleSaveConfig} disabled={savingConfig}>
          <Save className="h-3.5 w-3.5 mr-1" />
          Save Project Config
        </Button>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground">Project Prompt Templates</Label>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={refreshPromptData}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleNewPrompt}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Merged prompt visibility (source + override state):</p>
          <div className="flex flex-wrap gap-2">
            {allPrompts.map((prompt) => (
              <span
                key={`${prompt.source}-${prompt.name}`}
                className={cn(
                  'text-[11px] rounded border px-2 py-1',
                  prompt.source === 'project' && prompt.overridesGlobal && 'border-blue-500/40 text-blue-500',
                  prompt.source === 'project' && !prompt.overridesGlobal && 'border-green-500/40 text-green-500',
                  prompt.source === 'global' && prompt.overridden && 'border-orange-500/40 text-orange-500',
                  prompt.source === 'global' && !prompt.overridden && 'border-border text-muted-foreground'
                )}
              >
                {prompt.name}
                {' · '}
                {prompt.source}
                {prompt.source === 'project' && prompt.overridesGlobal ? ' override' : ''}
                {prompt.source === 'global' && prompt.overridden ? ' overridden' : ''}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-3">
          <div className="border border-border rounded-md max-h-64 overflow-y-auto">
            {projectPrompts.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">No project prompts yet.</div>
            ) : (
              projectPrompts.map((prompt) => (
                <button
                  key={prompt.name}
                  className={cn(
                    'w-full text-left px-3 py-2 border-b border-border last:border-b-0 text-sm',
                    selectedProjectPrompt === prompt.name ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setSelectedProjectPrompt(prompt.name)}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{prompt.name}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-prompt-name" className="text-xs text-muted-foreground">Name</Label>
            <Input
              id="project-prompt-name"
              value={projectPromptName}
              onChange={(e) => setProjectPromptName(e.target.value)}
              className="h-8"
              placeholder="Prompt template name"
            />

            <Label htmlFor="project-prompt-content" className="text-xs text-muted-foreground">Content</Label>
            <textarea
              id="project-prompt-content"
              value={projectPromptContent}
              onChange={(e) => setProjectPromptContent(e.target.value)}
              className="min-h-44 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Prompt text with task variables"
            />

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSavePrompt} disabled={!projectPromptName.trim() || savingPrompt}>
                <Save className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeletePrompt} disabled={!selectedProjectPrompt || savingPrompt}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <Label className="text-muted-foreground">Raw Config JSON</Label>
        <div className="rounded border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Code2 className="h-3.5 w-3.5" />
            For advanced fields not covered in the structured form.
          </div>
          <textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            className="min-h-48 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
          />
          {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
          <Button size="sm" variant="outline" onClick={handleApplyJson}>
            Apply JSON to Form
          </Button>
        </div>
      </div>
    </div>
  )
}
