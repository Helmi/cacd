import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Label } from '@/components/ui/label'
import type { TdPromptTemplate } from '@/lib/types'
import {
  CheckCircle2,
  XCircle,
  FileText,
  FolderOpen,
  Terminal,
} from 'lucide-react'

export function SettingsTd() {
  const { tdStatus } = useAppStore()
  const [promptTemplates, setPromptTemplates] = useState<TdPromptTemplate[]>([])

  const availability = tdStatus?.availability
  const projectState = tdStatus?.projectState

  // Fetch prompt templates
  useEffect(() => {
    if (!projectState?.enabled) return
    fetch('/api/td/prompts', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setPromptTemplates(data.templates || []))
      .catch(() => setPromptTemplates([]))
  }, [projectState?.enabled])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-1">Task Management (td)</h3>
        <p className="text-xs text-muted-foreground">
          Integration with td CLI for task tracking and agent workflow
        </p>
      </div>

      {/* Installation status */}
      <div className="space-y-3">
        <Label className="text-muted-foreground">Installation</Label>
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
                v{availability.version}
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

      {/* Project status */}
      <div className="space-y-3">
        <Label className="text-muted-foreground">Project Status</Label>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {projectState?.enabled ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground" />
            )}
            <span>
              {projectState?.enabled
                ? 'TD enabled for current project'
                : 'TD not enabled for current project'}
            </span>
          </div>

          {projectState?.tdRoot && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FolderOpen className="h-3 w-3" />
              <span className="font-mono">{projectState.tdRoot}</span>
            </div>
          )}

          {availability?.binaryAvailable && !projectState?.enabled && (
            <div className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p>Initialize td in your project to enable features:</p>
              <code className="block bg-background rounded px-2 py-1 font-mono text-[11px]">
                td init
              </code>
            </div>
          )}
        </div>
      </div>

      {/* Prompt templates */}
      {projectState?.enabled && (
        <div className="space-y-3">
          <Label className="text-muted-foreground">Prompt Templates</Label>
          {promptTemplates.length > 0 ? (
            <div className="space-y-1.5">
              {promptTemplates.map(t => (
                <div
                  key={t.name}
                  className="flex items-center gap-2 rounded border border-border bg-card px-3 py-2"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">{t.name}</span>
                    <span className="text-xs text-muted-foreground ml-2 font-mono">
                      {t.path?.split('/').pop()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p>No prompt templates found. Create templates in:</p>
              <code className="block bg-background rounded px-2 py-1 font-mono text-[11px]">
                .cacd/prompts/*.md
              </code>
              <p className="mt-1">
                Templates support variables: {'{{task.id}}'}, {'{{task.title}}'}, {'{{task.description}}'}, {'{{task.status}}'}, {'{{task.priority}}'}, {'{{task.acceptance}}'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Feature overview */}
      {projectState?.enabled && (
        <div className="space-y-3">
          <Label className="text-muted-foreground">Features</Label>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500/60" />
              Task board with kanban and list views
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500/60" />
              Link sessions to tasks on creation
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500/60" />
              Auto-start tasks when launching linked sessions
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500/60" />
              Task context written to .td-task-context.md
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500/60" />
              Handoff data display in task detail modal
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500/60" />
              Task context in sidebar for active sessions
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
