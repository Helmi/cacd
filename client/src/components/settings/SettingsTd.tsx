import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { TdPromptTemplate } from '@/lib/types'
import {
  CheckCircle2,
  XCircle,
  Terminal,
  Plus,
  Save,
  Trash2,
  FileText,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function SettingsTd() {
  const { tdStatus, fetchTdPrompts, saveTdPrompt, deleteTdPrompt } = useAppStore()
  const [prompts, setPrompts] = useState<TdPromptTemplate[]>([])
  const [selectedPrompt, setSelectedPrompt] = useState<string>('')
  const [promptName, setPromptName] = useState('')
  const [promptContent, setPromptContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingPrompt, setLoadingPrompt] = useState(false)

  const availability = tdStatus?.availability

  const refreshPrompts = async () => {
    const data = await fetchTdPrompts('global')
    setPrompts(data)
    if (!selectedPrompt && data.length > 0) {
      setSelectedPrompt(data[0].name)
      setPromptName(data[0].name)
    }
  }

  useEffect(() => {
    refreshPrompts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedPrompt) {
      setPromptContent('')
      return
    }

    setLoadingPrompt(true)
    fetch(`/api/td/prompts/${encodeURIComponent(selectedPrompt)}?scope=global`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => {
        setPromptContent(data.template?.content || '')
        setPromptName(data.template?.name || selectedPrompt)
      })
      .catch(() => setPromptContent(''))
      .finally(() => setLoadingPrompt(false))
  }, [selectedPrompt])

  const canSave = useMemo(() => promptName.trim().length > 0, [promptName])

  const handleNew = () => {
    setSelectedPrompt('')
    setPromptName('')
    setPromptContent('')
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    const ok = await saveTdPrompt(promptName.trim(), promptContent, 'global')
    if (ok) {
      await refreshPrompts()
      setSelectedPrompt(promptName.trim())
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!selectedPrompt) return
    setSaving(true)
    const ok = await deleteTdPrompt(selectedPrompt, 'global')
    if (ok) {
      const remaining = prompts.filter(p => p.name !== selectedPrompt)
      setSelectedPrompt(remaining[0]?.name || '')
      if (remaining.length === 0) {
        setPromptName('')
        setPromptContent('')
      }
      await refreshPrompts()
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-1">Global TD Settings</h3>
        <p className="text-xs text-muted-foreground">
          Machine-wide td availability and global prompt templates.
        </p>
      </div>

      <div className="space-y-3">
        <Label className="text-muted-foreground">td Installation</Label>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {availability?.binaryAvailable ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span>
              td binary {availability?.binaryAvailable ? 'installed' : 'not found'}
            </span>
            {availability?.binaryAvailable && availability.version && (
              <span className="text-xs text-muted-foreground font-mono">
                {availability.version}
              </span>
            )}
          </div>

          {availability?.binaryAvailable && availability.binaryPath && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Terminal className="h-3 w-3" />
              <span className="font-mono">{availability.binaryPath}</span>
            </div>
          )}

          {!availability?.binaryAvailable && (
            <div className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p>Install td to enable task management features:</p>
              <code className="block bg-background rounded px-2 py-1 font-mono text-[11px]">
                go install github.com/toodoo-app/td@latest
              </code>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground">Global Prompt Templates</Label>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={refreshPrompts}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleNew}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-3">
          <div className="border border-border rounded-md max-h-64 overflow-y-auto">
            {prompts.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">No global prompts found.</div>
            ) : (
              prompts.map((p) => (
                <button
                  key={p.name}
                  className={cn(
                    'w-full text-left px-3 py-2 border-b border-border last:border-b-0 text-sm',
                    selectedPrompt === p.name ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setSelectedPrompt(p.name)}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{p.name}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="global-prompt-name" className="text-xs text-muted-foreground">Name</Label>
            <Input
              id="global-prompt-name"
              value={promptName}
              onChange={(e) => setPromptName(e.target.value)}
              className="h-8 text-sm"
              placeholder="Prompt template name"
            />

            <Label htmlFor="global-prompt-content" className="text-xs text-muted-foreground">Content</Label>
            <textarea
              id="global-prompt-content"
              value={promptContent}
              onChange={(e) => setPromptContent(e.target.value)}
              className="min-h-44 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Prompt text. Supports variables like {{task.id}}, {{task.title}}, {{task.description}}"
              disabled={loadingPrompt}
            />

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
                <Save className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={!selectedPrompt || saving}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
