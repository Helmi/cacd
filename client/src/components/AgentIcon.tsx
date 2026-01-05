import type { AgentType } from '@/lib/types'
import { Bot, Brain, Code, Cpu, Sparkles, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentIconProps {
  agent: AgentType
  className?: string
}

const agentConfig: Record<AgentType, { icon: typeof Bot; color: string }> = {
  'claude-code': { icon: Sparkles, color: 'text-orange-400' },
  'gemini-cli': { icon: Brain, color: 'text-blue-400' },
  codex: { icon: Code, color: 'text-green-400' },
  droid: { icon: Bot, color: 'text-purple-400' },
  cursor: { icon: Cpu, color: 'text-cyan-400' },
  custom: { icon: Terminal, color: 'text-gray-400' },
}

export function AgentIcon({ agent, className }: AgentIconProps) {
  const config = agentConfig[agent] || agentConfig.custom
  const Icon = config.icon

  return <Icon className={cn(config.color, className)} />
}
