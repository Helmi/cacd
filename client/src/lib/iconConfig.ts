// Icon configuration for coding agents
// Brand icons have fixed colors, generic icons allow user-selected colors

// Brand icons with theme-aware colors
export const BRAND_ICONS = {
  claude: { svg: 'claude-code', light: '#D97757', dark: '#D97757', match: ['claude'] },
  gemini: { svg: 'google-gemini', light: '#0066CC', dark: '#078EFA', match: ['gemini'] },
  openai: { svg: 'openai-codex', light: '#000000', dark: '#FFFFFF', match: ['codex', 'openai'] },
  droid: { svg: 'factory-droid', light: '#D15010', dark: '#EF6F2E', match: ['droid'] },
  kilo: { svg: 'kilocode', light: '#8B7A00', dark: '#F8F676', match: ['kilo'] },
  opencode: { svg: 'opencode', light: '#211E1E', dark: '#E5E5E5', match: ['opencode'] },
} as const

export type BrandIconId = keyof typeof BRAND_ICONS

// Generic Lucide icons for custom agents
export const GENERIC_ICONS = ['terminal', 'bot', 'brain', 'code', 'cpu', 'sparkles'] as const

export type GenericIconId = (typeof GENERIC_ICONS)[number]

export type IconId = BrandIconId | GenericIconId

// Safe color palette that works on both light and dark themes
export const COLOR_PALETTE = [
  { name: 'Orange', hex: '#F97316' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Gray', hex: '#6B7280' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Red', hex: '#EF4444' },
] as const

export const DEFAULT_ICON_COLOR = 'currentColor' // Inherit from parent text color

// Auto-match command to brand icon
export function matchCommandToIcon(command: string): BrandIconId | undefined {
  const cmd = command.toLowerCase()
  for (const [iconId, config] of Object.entries(BRAND_ICONS)) {
    if (config.match.some((m) => cmd.includes(m))) {
      return iconId as BrandIconId
    }
  }
  return undefined
}

// Check if icon is a brand icon
export function isBrandIcon(icon: string): icon is BrandIconId {
  return icon in BRAND_ICONS
}

// Check if icon is a generic icon
export function isGenericIcon(icon: string): icon is GenericIconId {
  return GENERIC_ICONS.includes(icon as GenericIconId)
}

// Get all available icons (brand + generic)
export function getAllIcons(): IconId[] {
  return [...Object.keys(BRAND_ICONS), ...GENERIC_ICONS] as IconId[]
}

// Get brand icon color based on theme
export function getBrandIconColor(iconId: BrandIconId, isDark: boolean): string {
  return isDark ? BRAND_ICONS[iconId].dark : BRAND_ICONS[iconId].light
}

// Light themes list for theme detection
export const LIGHT_THEMES = [
  'light',
  'github',
  'solarized-light',
  'one-light',
  'atom-light',
] as const
