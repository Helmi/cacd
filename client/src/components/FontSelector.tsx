import { useAppStore } from '@/lib/store'
import type { FontType } from '@/lib/types'
import { Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const fonts: { value: FontType; label: string }[] = [
  { value: 'jetbrains', label: 'JetBrains Mono' },
  { value: 'fira', label: 'Fira Code' },
  { value: 'source', label: 'Source Code Pro' },
  { value: 'ibm', label: 'IBM Plex Mono' },
]

export function FontSelector() {
  const { font, setFont } = useAppStore()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <Type className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 text-sm">
        {fonts.map((f) => (
          <DropdownMenuItem
            key={f.value}
            onClick={() => setFont(f.value)}
            className={cn(font === f.value && 'bg-accent')}
          >
            {f.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
