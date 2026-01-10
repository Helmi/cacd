import { useAppStore } from '@/lib/store'
import type { ThemeType } from '@/lib/types'
import { Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const darkThemes: { value: ThemeType; label: string; colors: string[] }[] = [
  { value: 'default', label: 'Default', colors: ['#1a1a1a', '#4ade80', '#a78bfa'] },
  { value: 'monokai', label: 'Monokai', colors: ['#272822', '#f92672', '#a6e22e'] },
  { value: 'solarized', label: 'Solarized Dark', colors: ['#002b36', '#268bd2', '#b58900'] },
  { value: 'dracula', label: 'Dracula', colors: ['#282a36', '#ff79c6', '#50fa7b'] },
  { value: 'nord', label: 'Nord', colors: ['#2e3440', '#88c0d0', '#a3be8c'] },
]

const lightThemes: { value: ThemeType; label: string; colors: string[] }[] = [
  { value: 'light', label: 'Light', colors: ['#fafafa', '#6366f1', '#8b5cf6'] },
  { value: 'github', label: 'GitHub', colors: ['#ffffff', '#0969da', '#8250df'] },
  { value: 'solarized-light', label: 'Solarized Light', colors: ['#fdf6e3', '#268bd2', '#b58900'] },
  { value: 'one-light', label: 'One Light', colors: ['#fafafa', '#4078f2', '#a626a4'] },
  { value: 'atom-light', label: 'Atom Light', colors: ['#f9f9f9', '#3d8fd1', '#9c27b0'] },
]

export function ThemeSelector() {
  const { theme, setTheme } = useAppStore()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <Palette className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 text-sm">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">Dark Themes</DropdownMenuLabel>
        {darkThemes.map((t) => (
          <DropdownMenuItem
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={cn('flex items-center justify-between', theme === t.value && 'bg-secondary/50')}
          >
            <span>{t.label}</span>
            <div className="flex gap-0.5">
              {t.colors.map((color, i) => (
                <div key={i} className="h-3 w-3 rounded-sm border border-border" style={{ backgroundColor: color }} />
              ))}
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">Light Themes</DropdownMenuLabel>
        {lightThemes.map((t) => (
          <DropdownMenuItem
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={cn('flex items-center justify-between', theme === t.value && 'bg-secondary/50')}
          >
            <span>{t.label}</span>
            <div className="flex gap-0.5">
              {t.colors.map((color, i) => (
                <div key={i} className="h-3 w-3 rounded-sm border border-border" style={{ backgroundColor: color }} />
              ))}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
