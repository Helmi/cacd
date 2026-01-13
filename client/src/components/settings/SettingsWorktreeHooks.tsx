import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import type { AppConfig } from '@/lib/types'

interface SettingsWorktreeHooksProps {
  localConfig: AppConfig
  setLocalConfig: (config: AppConfig) => void
}

export function SettingsWorktreeHooks({ localConfig, setLocalConfig }: SettingsWorktreeHooksProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Commands to run on worktree lifecycle events.
      </p>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="hook-post-creation" className="text-sm">
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
            className="h-9 text-sm font-mono"
            placeholder="npm install && git pull"
          />
          <p className="text-xs text-muted-foreground">
            Run after worktree is created. Use placeholders: {'{path}'}, {'{branch}'}
          </p>
        </div>
      </div>
    </div>
  )
}
