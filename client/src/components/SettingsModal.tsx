import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings, Loader2 } from 'lucide-react'
import type { AppConfig } from '@/lib/types'

export function SettingsModal() {
  const { settingsModalOpen, closeSettingsModal, config, configLoading, updateConfig } = useAppStore()
  const [localConfig, setLocalConfig] = useState<AppConfig>(config)
  const [saving, setSaving] = useState(false)

  // Reset local state when modal opens
  useEffect(() => {
    if (settingsModalOpen) {
      setLocalConfig(config)
    }
  }, [settingsModalOpen, config])

  const handleSave = async () => {
    setSaving(true)
    const success = await updateConfig(localConfig)
    setSaving(false)
    if (success) {
      closeSettingsModal()
    }
  }

  return (
    <Dialog open={settingsModalOpen} onOpenChange={closeSettingsModal}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1">
          <TabsList className="grid w-full grid-cols-4 h-8">
            <TabsTrigger value="general" className="text-xs">
              General
            </TabsTrigger>
            <TabsTrigger value="agents" className="text-xs">
              Agents
            </TabsTrigger>
            <TabsTrigger value="status-hooks" className="text-xs">
              Status Hooks
            </TabsTrigger>
            <TabsTrigger value="worktree-hooks" className="text-xs">
              Worktree Hooks
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px] mt-2">
            {configLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* GENERAL TAB */}
                <TabsContent value="general" className="space-y-4 p-1">
                  {/* Auto Approval */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Auto Approval</Label>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="auto-approval"
                        checked={localConfig.autoApprovalEnabled}
                        onCheckedChange={(checked) =>
                          setLocalConfig({ ...localConfig, autoApprovalEnabled: checked === true })
                        }
                      />
                      <label htmlFor="auto-approval" className="text-xs cursor-pointer">
                        Enable auto approval
                      </label>
                    </div>
                    {localConfig.autoApprovalEnabled && (
                      <div className="flex items-center gap-2 pl-6">
                        <Label htmlFor="timeout" className="text-xs whitespace-nowrap">
                          Timeout (seconds):
                        </Label>
                        <Input
                          id="timeout"
                          type="number"
                          value={localConfig.autoApprovalTimeout}
                          onChange={(e) =>
                            setLocalConfig({ ...localConfig, autoApprovalTimeout: parseInt(e.target.value) || 0 })
                          }
                          className="h-7 text-xs w-20"
                        />
                      </div>
                    )}
                  </div>

                  {/* Worktree Defaults */}
                  <div className="space-y-2 border-t border-border pt-3">
                    <Label className="text-xs font-medium">Worktree Defaults</Label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="copy-session"
                          checked={localConfig.copySessionDataByDefault}
                          onCheckedChange={(checked) =>
                            setLocalConfig({ ...localConfig, copySessionDataByDefault: checked === true })
                          }
                        />
                        <label htmlFor="copy-session" className="text-xs cursor-pointer">
                          Copy session data by default
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="sort-by-last"
                          checked={localConfig.sortByLastSession}
                          onCheckedChange={(checked) =>
                            setLocalConfig({ ...localConfig, sortByLastSession: checked === true })
                          }
                        />
                        <label htmlFor="sort-by-last" className="text-xs cursor-pointer">
                          Sort by last session
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="auto-gen"
                          checked={localConfig.autoGenerateDirectories}
                          onCheckedChange={(checked) =>
                            setLocalConfig({ ...localConfig, autoGenerateDirectories: checked === true })
                          }
                        />
                        <label htmlFor="auto-gen" className="text-xs cursor-pointer">
                          Auto-generate directories
                        </label>
                      </div>
                    </div>

                    {localConfig.autoGenerateDirectories && (
                      <div className="space-y-1 pl-6">
                        <Label htmlFor="path-template" className="text-xs">
                          Path Template
                        </Label>
                        <Input
                          id="path-template"
                          value={localConfig.worktreePathTemplate}
                          onChange={(e) => setLocalConfig({ ...localConfig, worktreePathTemplate: e.target.value })}
                          className="h-7 text-xs font-mono"
                          placeholder="../{branch}"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Use placeholders: {'{project}'}, {'{branch}'}, {'{date}'}
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* AGENTS TAB */}
                <TabsContent value="agents" className="space-y-3 p-1">
                  <p className="text-xs text-muted-foreground">
                    Available agents and their command configurations.
                  </p>
                  {localConfig.agents.map((agent) => (
                    <div key={agent.id} className="border border-border rounded p-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">{agent.name}</Label>
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{agent.command}</code>
                      </div>
                      {agent.parameters.length > 0 && (
                        <div className="space-y-1.5 pl-2 border-l-2 border-muted">
                          {agent.parameters.map((param, paramIndex) => (
                            <div key={paramIndex} className="text-[10px] text-muted-foreground">
                              <span className="font-medium">{param.flag}</span> - {param.name}
                              {param.description && <span className="opacity-70"> ({param.description})</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground italic pt-2">
                    Agent configuration editing coming soon.
                  </p>
                </TabsContent>

                {/* STATUS HOOKS TAB */}
                <TabsContent value="status-hooks" className="space-y-3 p-1">
                  <p className="text-xs text-muted-foreground">Commands to run when session status changes.</p>

                  <div className="space-y-1">
                    <Label htmlFor="hook-idle" className="text-xs">
                      On Idle
                    </Label>
                    <Input
                      id="hook-idle"
                      value={localConfig.statusHooks.onIdle}
                      onChange={(e) =>
                        setLocalConfig({
                          ...localConfig,
                          statusHooks: { ...localConfig.statusHooks, onIdle: e.target.value },
                        })
                      }
                      className="h-7 text-xs font-mono"
                      placeholder="echo 'Session idle'"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="hook-busy" className="text-xs">
                      On Busy
                    </Label>
                    <Input
                      id="hook-busy"
                      value={localConfig.statusHooks.onBusy}
                      onChange={(e) =>
                        setLocalConfig({
                          ...localConfig,
                          statusHooks: { ...localConfig.statusHooks, onBusy: e.target.value },
                        })
                      }
                      className="h-7 text-xs font-mono"
                      placeholder="notify-send 'Agent is working'"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="hook-waiting" className="text-xs">
                      On Waiting Input
                    </Label>
                    <Input
                      id="hook-waiting"
                      value={localConfig.statusHooks.onWaitingInput}
                      onChange={(e) =>
                        setLocalConfig({
                          ...localConfig,
                          statusHooks: { ...localConfig.statusHooks, onWaitingInput: e.target.value },
                        })
                      }
                      className="h-7 text-xs font-mono"
                      placeholder="osascript -e 'beep'"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="hook-pending" className="text-xs">
                      On Pending Auto Approval
                    </Label>
                    <Input
                      id="hook-pending"
                      value={localConfig.statusHooks.onPendingAutoApproval}
                      onChange={(e) =>
                        setLocalConfig({
                          ...localConfig,
                          statusHooks: { ...localConfig.statusHooks, onPendingAutoApproval: e.target.value },
                        })
                      }
                      className="h-7 text-xs font-mono"
                      placeholder="notify-send 'Awaiting approval'"
                    />
                  </div>
                </TabsContent>

                {/* WORKTREE HOOKS TAB */}
                <TabsContent value="worktree-hooks" className="space-y-3 p-1">
                  <p className="text-xs text-muted-foreground">Commands to run on worktree lifecycle events.</p>

                  <div className="space-y-1">
                    <Label htmlFor="hook-post-creation" className="text-xs">
                      Post Creation
                    </Label>
                    <Input
                      id="hook-post-creation"
                      value={localConfig.worktreeHooks.postCreation}
                      onChange={(e) =>
                        setLocalConfig({
                          ...localConfig,
                          worktreeHooks: { ...localConfig.worktreeHooks, postCreation: e.target.value },
                        })
                      }
                      className="h-7 text-xs font-mono"
                      placeholder="npm install && git pull"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Run after worktree is created. Use placeholders: {'{path}'}, {'{branch}'}
                    </p>
                  </div>
                </TabsContent>
              </>
            )}
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={closeSettingsModal} className="h-7 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || configLoading} className="h-7 text-xs">
            {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
