import { Bot, Brain, Code, Cpu, Sparkles, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import {
  GENERIC_ICONS,
  LIGHT_THEMES,
  DEFAULT_ICON_COLOR,
  isBrandIcon,
  getBrandIconColor,
  type BrandIconId,
  type GenericIconId,
} from '@/lib/iconConfig'

// Import SVGs as raw strings using Vite's ?raw suffix
// These are static imports bundled at build time - content is trusted
import claudeCodeSvg from '@/assets/icons/claude-code.svg?raw'
import googleGeminiSvg from '@/assets/icons/google-gemini.svg?raw'
import openaiCodexSvg from '@/assets/icons/openai-codex.svg?raw'
import factoryDroidSvg from '@/assets/icons/factory-droid.svg?raw'
import kilocodeSvg from '@/assets/icons/kilocode.svg?raw'
import opencodeSvg from '@/assets/icons/opencode.svg?raw'

// Map brand icon IDs to their SVG content
const BRAND_SVG_MAP: Record<BrandIconId, string> = {
  claude: claudeCodeSvg,
  gemini: googleGeminiSvg,
  openai: openaiCodexSvg,
  droid: factoryDroidSvg,
  kilo: kilocodeSvg,
  opencode: opencodeSvg,
}

// Map generic icon names to Lucide components
const LUCIDE_ICON_MAP: Record<GenericIconId, typeof Bot> = {
  terminal: Terminal,
  bot: Bot,
  brain: Brain,
  code: Code,
  cpu: Cpu,
  sparkles: Sparkles,
}

interface AgentIconProps {
  icon?: string // Icon ID (brand or generic)
  iconColor?: string // Hex color for generic icons
  className?: string
}

export function AgentIcon({ icon, iconColor, className }: AgentIconProps) {
  const { theme } = useAppStore()
  const isDark = !LIGHT_THEMES.includes(theme as (typeof LIGHT_THEMES)[number])

  // Brand icon
  if (icon && isBrandIcon(icon)) {
    const color = getBrandIconColor(icon, isDark)
    const svgContent = BRAND_SVG_MAP[icon]

    // SVG content is from static imports (trusted build-time assets)
    return (
      <span
        className={cn('inline-flex items-center justify-center', className)}
        style={{ color }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    )
  }

  // Generic Lucide icon - use thinner stroke to match brand icon weights
  if (icon && GENERIC_ICONS.includes(icon as GenericIconId)) {
    const LucideIcon = LUCIDE_ICON_MAP[icon as GenericIconId]
    return <LucideIcon className={className} style={{ color: iconColor || DEFAULT_ICON_COLOR }} strokeWidth={1.5} />
  }

  // Fallback to Bot icon
  return <Bot className={className} style={{ color: iconColor || DEFAULT_ICON_COLOR }} strokeWidth={1.5} />
}

// Legacy agent type mapping for backwards compatibility
// Maps old agent strings to new icon IDs
const LEGACY_AGENT_MAP: Record<string, { icon: string; iconColor?: string }> = {
  claude: { icon: 'claude' },
  'claude-code': { icon: 'claude' },
  gemini: { icon: 'gemini' },
  'gemini-cli': { icon: 'gemini' },
  codex: { icon: 'openai' },
  droid: { icon: 'droid' },
  cursor: { icon: 'cpu', iconColor: '#06B6D4' }, // Cyan
  terminal: { icon: 'terminal' },
}

// Export for backwards compatibility - converts old 'agent' prop to new format
export function getLegacyAgentIconProps(agent: string): { icon: string; iconColor?: string } {
  return LEGACY_AGENT_MAP[agent] || { icon: 'bot' }
}
