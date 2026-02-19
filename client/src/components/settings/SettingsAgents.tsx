import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AgentConfigEditor } from '@/components/AgentConfigEditor'
import { Plus, Loader2, Star } from 'lucide-react'
import type { AgentConfig } from '@/lib/types'

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
            return (
              <div
                key={agent.id}
                className={`space-y-3 p-4 border rounded-lg transition-colors ${
                  isEditing ? 'border-muted-foreground/50 bg-muted/30' : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={`p-1 rounded hover:bg-muted transition-colors ${
                      defaultAgentId === agent.id ? 'text-yellow-500' : 'text-muted-foreground'
                    }`}
                    onClick={() => onSetDefault(agent.id)}
                    title={defaultAgentId === agent.id ? 'Default agent' : 'Set as default'}
                  >
                    <Star className={`h-4 w-4 ${defaultAgentId === agent.id ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => setEditingAgentId(isEditing ? null : agent.id)}
                  >
                    <span className="text-sm font-medium">{agent.name}</span>
                    <code className="text-xs bg-muted px-2 py-1 rounded ml-2">{agent.command}</code>
                  </button>
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
