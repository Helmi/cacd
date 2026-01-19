import * as React from 'react'
import { useState, useCallback, useRef } from 'react'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { useLongPress } from '@/hooks/useLongPress'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'

interface TouchContextMenuProps {
  children: React.ReactNode
  /** Content to show in the menu */
  content: React.ReactNode
  /** Optional class for the trigger wrapper */
  triggerClassName?: string
  /** Optional class for the content */
  contentClassName?: string
  /** Called when menu opens */
  onOpenChange?: (open: boolean) => void
}

/**
 * Context menu with long-press support for touch devices.
 *
 * - On desktop: opens on right-click (standard ContextMenu behavior)
 * - On mobile: opens on long-press using DropdownMenu (which supports controlled state)
 */
export function TouchContextMenu({
  children,
  content,
  triggerClassName,
  contentClassName,
  onOpenChange,
}: TouchContextMenuProps) {
  const [open, setOpen] = useState(false)
  const [isPressing, setIsPressing] = useState(false)
  const isMobile = useIsMobile()
  const triggerRef = useRef<HTMLDivElement>(null)

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen)
    onOpenChange?.(newOpen)
  }, [onOpenChange])

  const handleLongPress = useCallback(() => {
    setIsPressing(false)
    handleOpenChange(true)
  }, [handleOpenChange])

  const longPressHandlers = useLongPress(handleLongPress, {
    delay: 400,
    threshold: 10,
    onPressStart: () => setIsPressing(true),
    onPressEnd: () => setIsPressing(false),
  })

  // On mobile, use DropdownMenu with long-press trigger
  // (DropdownMenu supports controlled state, ContextMenu doesn't)
  if (isMobile) {
    return (
      <DropdownMenuPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuPrimitive.Trigger asChild>
          <div
            ref={triggerRef}
            className={cn(
              'touch-none select-none transition-transform',
              isPressing && 'scale-[0.97]',
              triggerClassName
            )}
            onPointerDown={longPressHandlers.onPointerDown}
            onPointerUp={longPressHandlers.onPointerUp}
            onPointerMove={longPressHandlers.onPointerMove}
            onPointerCancel={longPressHandlers.onPointerCancel}
            onPointerLeave={longPressHandlers.onPointerLeave}
          >
            {children}
          </div>
        </DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            className={cn(
              'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
              'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
              'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
              'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
              contentClassName
            )}
            sideOffset={4}
          >
            {content}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    )
  }

  // On desktop, use standard Radix ContextMenu behavior (right-click)
  return (
    <ContextMenuPrimitive.Root onOpenChange={(newOpen) => onOpenChange?.(newOpen)}>
      <ContextMenuPrimitive.Trigger asChild className={triggerClassName}>
        <div>{children}</div>
      </ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          className={cn(
            'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
            'animate-in fade-in-80 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
            'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            contentClassName
          )}
        >
          {content}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  )
}

// Re-export menu item components for convenience
export {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuShortcut,
} from '@/components/ui/context-menu'
