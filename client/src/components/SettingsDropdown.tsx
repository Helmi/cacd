import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { Settings, Palette, Type, ZoomIn } from 'lucide-react'
import type { ThemeType, FontType } from '@/lib/types'

const themes: { value: ThemeType; label: string; group: 'dark' | 'light' }[] = [
  { value: 'default', label: 'Default', group: 'dark' },
  { value: 'monokai', label: 'Monokai', group: 'dark' },
  { value: 'solarized', label: 'Solarized Dark', group: 'dark' },
  { value: 'dracula', label: 'Dracula', group: 'dark' },
  { value: 'nord', label: 'Nord', group: 'dark' },
  { value: 'light', label: 'Light', group: 'light' },
  { value: 'github', label: 'GitHub', group: 'light' },
  { value: 'solarized-light', label: 'Solarized Light', group: 'light' },
  { value: 'one-light', label: 'One Light', group: 'light' },
  { value: 'atom-light', label: 'Atom Light', group: 'light' },
]

const fonts: { value: FontType; label: string }[] = [
  { value: 'jetbrains', label: 'JetBrains Mono' },
  { value: 'fira', label: 'Fira Code' },
  { value: 'source', label: 'Source Code Pro' },
  { value: 'ibm', label: 'IBM Plex Mono' },
]

const fontScales = [50, 75, 100, 125, 150]

export function SettingsDropdown() {
  const { theme, font, fontScale, setTheme, setFont, setFontScale } = useAppStore()

  const darkThemes = themes.filter((t) => t.group === 'dark')
  const lightThemes = themes.filter((t) => t.group === 'light')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Settings className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Theme Picker */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette className="mr-2 h-4 w-4" />
            Theme
            <span className="ml-auto text-xs text-muted-foreground capitalize">{theme}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuLabel className="text-[10px] text-muted-foreground">Dark Themes</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeType)}>
              {darkThemes.map((t) => (
                <DropdownMenuRadioItem key={t.value} value={t.value}>
                  {t.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] text-muted-foreground">Light Themes</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeType)}>
              {lightThemes.map((t) => (
                <DropdownMenuRadioItem key={t.value} value={t.value}>
                  {t.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Font Picker */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Type className="mr-2 h-4 w-4" />
            Font
            <span className="ml-auto text-xs text-muted-foreground capitalize">{font}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuRadioGroup value={font} onValueChange={(v) => setFont(v as FontType)}>
              {fonts.map((f) => (
                <DropdownMenuRadioItem key={f.value} value={f.value}>
                  {f.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Font Scale */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ZoomIn className="mr-2 h-4 w-4" />
            Font Size
            <span className="ml-auto text-xs text-muted-foreground">{fontScale}%</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-32">
            <DropdownMenuRadioGroup value={String(fontScale)} onValueChange={(v) => setFontScale(Number(v))}>
              {fontScales.map((scale) => (
                <DropdownMenuRadioItem key={scale} value={String(scale)}>
                  {scale}%
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
