import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import type { AgentConfig, AgentOption } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AgentIcon } from '@/components/AgentIcon'
import {
  COLOR_PALETTE,
  matchCommandToIcon,
  isBrandIcon,
  getAllIcons,
} from '@/lib/iconConfig'

interface AgentConfigEditorProps {
  agent: AgentConfig
  onChange: (updater: (current: AgentConfig) => AgentConfig) => void
  onDelete?: () => void
  isNew?: boolean
}

const EMPTY_OPTION: AgentOption = {
  id: `opt-${Date.now()}`,
  flag: '',
  label: '',
  type: 'boolean',
}

// Generate a slug from a string (for auto-generating IDs)
const slugify = (str: string) =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `agent-${Date.now()}`

export function AgentConfigEditor({ agent, onChange, onDelete, isNew }: AgentConfigEditorProps) {
  const [optionsExpanded, setOptionsExpanded] = useState(isNew || agent.options.length > 0)
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(null)

  // Auto-generate agent ID from name for new agents
  const updateName = (name: string) => {
    onChange((current) => {
      const updates: Partial<AgentConfig> = { name }
      // Auto-generate ID from name for new agents (only if ID is empty or was auto-generated)
      if (isNew && (!current.id || current.id.startsWith('agent-'))) {
        updates.id = slugify(name)
      }
      return { ...current, ...updates }
    })
  }

  // Use callback form to always get the latest agent state
  const updateField = <K extends keyof AgentConfig>(field: K, value: AgentConfig[K]) => {
    onChange((current) => ({ ...current, [field]: value }))
  }

  // Update command and auto-match icon if not manually set
  const updateCommand = (command: string) => {
    onChange((current) => {
      const updates: Partial<AgentConfig> = { command }
      // Auto-match icon if not already set or if it was auto-matched previously
      const matchedIcon = matchCommandToIcon(command)
      if (matchedIcon && (!current.icon || matchCommandToIcon(current.command) === current.icon)) {
        updates.icon = matchedIcon
      }
      return { ...current, ...updates }
    })
  }

  const addOption = () => {
    onChange((current) => {
      const newOption: AgentOption = {
        ...EMPTY_OPTION,
        id: `option-${Date.now()}`,
      }
      setEditingOptionIndex(current.options.length)
      setOptionsExpanded(true)
      return { ...current, options: [...current.options, newOption] }
    })
  }

  const updateOption = (index: number, updates: Partial<AgentOption>) => {
    onChange((current) => {
      const newOptions = [...current.options]
      newOptions[index] = { ...newOptions[index], ...updates }
      return { ...current, options: newOptions }
    })
  }

  const removeOption = (index: number) => {
    onChange((current) => ({ ...current, options: current.options.filter((_, i) => i !== index) }))
    if (editingOptionIndex === index) {
      setEditingOptionIndex(null)
    }
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-3">
      {/* Basic Info */}
      <div className="space-y-1">
        <Label htmlFor={`agent-name-${agent.id}`} className="text-xs">Name</Label>
        <Input
          id={`agent-name-${agent.id}`}
          value={agent.name}
          onChange={(e) => updateName(e.target.value)}
          placeholder="Claude Code"
          className="h-7 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`agent-command-${agent.id}`} className="text-xs">Command</Label>
          <Input
            id={`agent-command-${agent.id}`}
            value={agent.command}
            onChange={(e) => updateCommand(e.target.value)}
            placeholder="claude"
            className="h-7 text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`agent-kind-${agent.id}`} className="text-xs">Kind</Label>
          <Select value={agent.kind} onValueChange={(v) => updateField('kind', v as 'agent' | 'terminal')}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="terminal">Terminal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`agent-desc-${agent.id}`} className="text-xs">Description</Label>
        <Input
          id={`agent-desc-${agent.id}`}
          value={agent.description || ''}
          onChange={(e) => updateField('description', e.target.value || undefined)}
          placeholder="AI coding assistant"
          className="h-7 text-xs"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`agent-prompt-arg-${agent.id}`} className="text-xs">Initial Prompt Argument</Label>
        <Input
          id={`agent-prompt-arg-${agent.id}`}
          value={agent.promptArg || ''}
          onChange={(e) => {
            const value = e.target.value.trim()
            updateField('promptArg', value || undefined)
          }}
          placeholder="Leave empty for positional (default), or use --prompt, --message, none"
          className="h-7 text-xs font-mono"
        />
        <p className="text-[11px] text-muted-foreground">
          Leave empty for positional argument (works for most CLIs). Set a flag like <code>--prompt</code> if needed, or <code>none</code> to disable startup prompt injection. Most users won&apos;t need to change this.
        </p>
      </div>

      {/* Icon Selection */}
      <IconPicker
        icon={agent.icon}
        iconColor={agent.iconColor}
        onIconChange={(icon) => updateField('icon', icon)}
        onColorChange={(color) => updateField('iconColor', color)}
      />

      {/* Options Section */}
      <div className="border-t border-border pt-2">
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          onClick={() => setOptionsExpanded(!optionsExpanded)}
        >
          {optionsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Options ({agent.options.length})
        </button>

        {optionsExpanded && (
          <div className="mt-2 space-y-2">
            {agent.options.map((option, index) => (
              <OptionEditor
                key={option.id || index}
                option={option}
                isExpanded={editingOptionIndex === index}
                onToggle={() => setEditingOptionIndex(editingOptionIndex === index ? null : index)}
                onChange={(updates) => updateOption(index, updates)}
                onRemove={() => removeOption(index)}
              />
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-xs w-full"
              onClick={addOption}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Option
            </Button>
          </div>
        )}
      </div>

      {/* Delete Button */}
      {onDelete && (
        <div className="border-t border-border pt-2 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete Agent
          </Button>
        </div>
      )}
    </div>
  )
}

interface OptionEditorProps {
  option: AgentOption
  isExpanded: boolean
  onToggle: () => void
  onChange: (updates: Partial<AgentOption>) => void
  onRemove: () => void
}

function OptionEditor({ option, isExpanded, onToggle, onChange, onRemove }: OptionEditorProps) {
  const formatChoices = (choices?: { value: string; label?: string }[]) =>
    choices?.map(c => c.label ? `${c.value}:${c.label}` : c.value).join(', ') || ''

  const [choicesText, setChoicesText] = useState(formatChoices(option.choices))

  // Sync choicesText when option.choices changes externally
  useEffect(() => {
    setChoicesText(formatChoices(option.choices))
  }, [option.choices])

  const parseChoices = (text: string) => {
    if (!text.trim()) return undefined
    return text.split(',').map(s => {
      const [value, label] = s.trim().split(':')
      return { value: value.trim(), label: label?.trim() }
    }).filter(c => c.value)
  }

  return (
    <div className={cn(
      'border border-border rounded p-2 text-xs',
      isExpanded ? 'bg-muted/30' : ''
    )}>
      <div className="flex items-center gap-2">
        <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />
        <button
          type="button"
          className="flex-1 text-left flex items-center gap-2"
          onClick={onToggle}
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="font-medium">{option.label || '(unnamed)'}</span>
          {option.flag && <code className="text-xs bg-muted px-1 rounded">{option.flag}</code>}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {isExpanded && (
        <div className="mt-2 space-y-2 pl-5">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={option.label}
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder="YOLO Mode"
                className="h-6 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={option.type} onValueChange={(v) => onChange({ type: v as 'boolean' | 'string' })}>
                <SelectTrigger className="h-6 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="boolean">Boolean (toggle)</SelectItem>
                  <SelectItem value="string">String (text/select)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input
              value={option.description || ''}
              onChange={(e) => onChange({ description: e.target.value || undefined })}
              placeholder="Skip all permission prompts"
              className="h-6 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">CLI Flag</Label>
              <Input
                value={option.flag}
                onChange={(e) => onChange({ flag: e.target.value })}
                placeholder="--dangerously-skip-permissions"
                className="h-6 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Group (for mutual exclusivity)</Label>
              <Input
                value={option.group || ''}
                onChange={(e) => onChange({ group: e.target.value || undefined })}
                placeholder="resume-mode"
                className="h-6 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default</Label>
              {option.type === 'boolean' ? (
                <div className="flex items-center h-6">
                  <Checkbox
                    checked={option.default === true}
                    onCheckedChange={(checked) => onChange({ default: checked === true })}
                  />
                  <span className="ml-2 text-muted-foreground">Enabled by default</span>
                </div>
              ) : option.choices && option.choices.length > 0 ? (
                <Select
                  value={(option.default as string) || '__none__'}
                  onValueChange={(v) => onChange({ default: v === '__none__' ? undefined : v })}
                >
                  <SelectTrigger className="h-6 text-xs">
                    <SelectValue placeholder="No default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-muted-foreground">
                      No default
                    </SelectItem>
                    {option.choices.map((choice) => (
                      <SelectItem key={choice.value} value={choice.value}>
                        {choice.label || choice.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={(option.default as string) || ''}
                  onChange={(e) => onChange({ default: e.target.value || undefined })}
                  placeholder="default value"
                  className="h-6 text-xs"
                />
              )}
            </div>
          </div>

          {option.type === 'string' && (
            <div className="space-y-1">
              <Label className="text-xs">Choices (comma-separated, value:label format)</Label>
              <Input
                value={choicesText}
                onChange={(e) => {
                  setChoicesText(e.target.value)
                  onChange({ choices: parseChoices(e.target.value) })
                }}
                placeholder="sonnet:Sonnet, opus:Opus, haiku:Haiku"
                className="h-6 text-xs font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for free text input
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Icon picker component for selecting agent icon and color
interface IconPickerProps {
  icon?: string
  iconColor?: string
  onIconChange: (icon: string | undefined) => void
  onColorChange: (color: string | undefined) => void
}

function IconPicker({ icon, iconColor, onIconChange, onColorChange }: IconPickerProps) {
  const allIcons = getAllIcons()
  const showColorPicker = icon && !isBrandIcon(icon)

  return (
    <div className="space-y-2">
      <Label className="text-xs">Icon</Label>
      <div className="flex flex-wrap gap-1">
        {allIcons.map((iconId) => {
          const isSelected = icon === iconId
          const isBrand = isBrandIcon(iconId)

          return (
            <button
              key={iconId}
              type="button"
              className={cn(
                'w-10 h-10 flex items-center justify-center rounded border transition-colors',
                isSelected
                  ? 'border-accent bg-accent/20'
                  : 'border-transparent hover:border-border hover:bg-muted'
              )}
              onClick={() => onIconChange(isSelected ? undefined : iconId)}
              title={`${iconId}${isBrand ? ' (brand)' : ''}`}
            >
              <AgentIcon
                icon={iconId}
                iconColor={showColorPicker && isSelected ? iconColor : undefined}
                className="h-6 w-6"
              />
            </button>
          )
        })}
      </div>

      {/* Color picker for generic icons */}
      {showColorPicker && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Color</Label>
          <div className="flex flex-wrap gap-1">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color.hex}
                type="button"
                className={cn(
                  'w-5 h-5 rounded border transition-all',
                  iconColor === color.hex
                    ? 'border-foreground scale-110'
                    : 'border-transparent hover:scale-105'
                )}
                style={{ backgroundColor: color.hex }}
                onClick={() => onColorChange(color.hex)}
                title={color.name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
