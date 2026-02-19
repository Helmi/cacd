import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentConfigEditor } from '@/components/AgentConfigEditor'
import { Plus, Loader2, Star } from 'lucide-react'
import type { AgentConfig } from '@/lib/types'
import { cn } from '@/lib/utils'

interface SettingsAgentsProps {
  localAgents: AgentConfig[]
  setLocalAgents: (agents: AgentConfig[]) => void
  defaultAgentId: string | null
  agentsLoading: boolean
  onDeleteAgent: (agentId: string) => Promise<void>
  onSetDefault: (agentId: string) => Promise<void>
  newAgent: AgentConfig | null
  setNewAgent: (agent: AgentConfig | null) => void
  startNewAgent: () => void
}

export function SettingsAgents({
  localAgents,
  setLocalAgents,
  defaultAgentId,
  agentsLoading,
  onDeleteAgent,
  onSetDefault,
  newAgent,
  setNewAgent,
  startNewAgent,
}: SettingsAgentsProps) {
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const enabledCount = localAgents.filter((agent) => agent.enabled !== false).length

  const setAgentEnabled = (agentId: string, enabled: boolean) => {
    setLocalAgents(
      localAgents.map((agent) =>
        agent.id === agentId ? { ...agent, enabled } : agent
      )
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-1">Agents</h3>
        <p className="text-xs text-muted-foreground">Configure agents and their launch options.</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        onClick={startNewAgent}
        disabled={!!newAgent}
      >
        <Plus className="h-4 w-4 mr-1" />
        Add Agent
      </Button>

      {agentsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* New agent form */}
          {newAgent && (
            <div className="space-y-3 p-4 border border-primary/50 rounded-lg bg-primary/5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-primary">New Agent</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-sm text-muted-foreground"
                  onClick={() => setNewAgent(null)}
                >
                  Cancel
                </Button>
              </div>
              <AgentConfigEditor
                agent={newAgent}
                onChange={(updater) => setNewAgent(updater(newAgent))}
                isNew
              />
              {(!newAgent.name || !newAgent.command) && (
                <p className="text-xs text-muted-foreground">
                  Fill in Name and Command to save this agent.
                </p>
              )}
            </div>
          )}

          {/* Existing agents */}
          {localAgents.map((agent) => {
            const isEditing = editingAgentId === agent.id
            const isEnabled = agent.enabled !== false
            const isDefault = defaultAgentId === agent.id
            const isLastEnabled = isEnabled && enabledCount === 1
            const toggleTooltip = isLastEnabled
              ? 'At least one agent must remain enabled.'
              : 'Disable to hide this agent from session creation. The agent configuration is preserved.'
            return (
              <div
                key={agent.id}
                className={cn(
                  'space-y-3 p-4 border rounded-lg transition-colors',
                  isEditing
                    ? 'border-muted-foreground/50 bg-muted/30'
                    : 'border-border hover:border-muted-foreground/30',
                  !isEnabled && 'opacity-60'
                )}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={cn(
                      'p-1 rounded transition-colors',
                      isDefault ? 'text-yellow-500' : 'text-muted-foreground',
                      isEnabled ? 'hover:bg-muted' : 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={() => onSetDefault(agent.id)}
                    title={isDefault ? 'Default agent' : 'Set as default'}
                    disabled={!isEnabled}
                  >
                    <Star className={cn('h-4 w-4', isDefault && 'fill-current')} />
                  </button>
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => setEditingAgentId(isEditing ? null : agent.id)}
                  >
                    <span className="text-sm font-medium">{agent.name}</span>
                    {isDefault && (
                      <span className="ml-2 rounded bg-yellow-500/15 text-yellow-600 px-1.5 py-0.5 text-[10px] font-medium">
                        Default
                      </span>
                    )}
                    <code className="text-xs bg-muted px-2 py-1 rounded ml-2">{agent.command}</code>
                  </button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isEnabled}
                        aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${agent.name}`}
                        disabled={isLastEnabled}
                        onClick={() => setAgentEnabled(agent.id, !isEnabled)}
                        className={cn(
                          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isEnabled ? 'bg-emerald-500/80' : 'bg-muted',
                          isLastEnabled && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform',
                            isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                          )}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs text-xs">
                      {toggleTooltip}
                    </TooltipContent>
                  </Tooltip>
                </div>

                {isEditing && (
                  <AgentConfigEditor
                    agent={agent}
                    onChange={(updater) => setLocalAgents(
                      localAgents.map(a => a.id === agent.id ? updater(a) : a)
                    )}
                    onDelete={() => onDeleteAgent(agent.id)}
                  />
                )}
              </div>
            )
          })}

          {localAgents.length === 0 && !newAgent && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No agents configured.</p>
              <p className="text-xs mt-1">Click "Add Agent" to create one.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
