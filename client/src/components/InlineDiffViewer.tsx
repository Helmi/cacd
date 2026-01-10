import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  X,
  Columns,
  AlignJustify,
  Keyboard,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DiffLine {
  type: 'context' | 'add' | 'delete' | 'hunk' | 'header'
  content: string
  oldLineNum?: number
  newLineNum?: number
}

interface DiffStats {
  additions: number
  deletions: number
}

type ViewMode = 'unified' | 'split'

// Parse unified diff format into structured lines
function parseDiff(diffText: string): { lines: DiffLine[]; stats: DiffStats } {
  const lines: DiffLine[] = []
  const rawLines = diffText.split('\n')
  let oldLine = 0
  let newLine = 0
  let additions = 0
  let deletions = 0

  for (const line of rawLines) {
    if (line.startsWith('diff --git') || line.startsWith('index ') ||
        line.startsWith('---') || line.startsWith('+++') ||
        line.startsWith('new file') || line.startsWith('deleted file')) {
      lines.push({ type: 'header', content: line })
    } else if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = parseInt(match[1], 10)
        newLine = parseInt(match[2], 10)
      }
      lines.push({ type: 'hunk', content: line })
    } else if (line.startsWith('+')) {
      additions++
      lines.push({
        type: 'add',
        content: line.slice(1),
        newLineNum: newLine++,
      })
    } else if (line.startsWith('-')) {
      deletions++
      lines.push({
        type: 'delete',
        content: line.slice(1),
        oldLineNum: oldLine++,
      })
    } else if (line.startsWith(' ') || line === '') {
      lines.push({
        type: 'context',
        content: line.slice(1) || '',
        oldLineNum: oldLine++,
        newLineNum: newLine++,
      })
    }
  }

  return { lines, stats: { additions, deletions } }
}

function findHunkIndices(lines: DiffLine[]): number[] {
  return lines.reduce<number[]>((acc, line, idx) => {
    if (line.type === 'hunk') acc.push(idx)
    return acc
  }, [])
}

export function InlineDiffViewer() {
  const { viewingFileDiff, closeFileDiff } = useAppStore()

  const [diffText, setDiffText] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('unified')
  const [showHelp, setShowHelp] = useState(false)
  const [focusedLine, setFocusedLine] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])

  const file = viewingFileDiff?.file
  const worktreePath = viewingFileDiff?.worktreePath

  const { lines, stats } = useMemo(() => parseDiff(diffText), [diffText])
  const hunkIndices = useMemo(() => findHunkIndices(lines), [lines])

  // Fetch diff when file changes
  useEffect(() => {
    if (!file || !worktreePath) return

    const fetchDiff = async () => {
      setLoading(true)
      setError(null)
      setFocusedLine(0)
      try {
        const response = await fetch(
          `/api/worktree/diff?path=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(file.path)}`
        )
        if (!response.ok) {
          throw new Error('Failed to fetch diff')
        }
        const data = await response.json()
        setDiffText(data.diff || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchDiff()
  }, [file, worktreePath])

  // Scroll focused line into view
  useEffect(() => {
    lineRefs.current[focusedLine]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [focusedLine])

  const navigateHunk = useCallback(
    (direction: 'next' | 'prev') => {
      if (hunkIndices.length === 0) return

      if (direction === 'next') {
        const nextHunk = hunkIndices.find((i) => i > focusedLine)
        if (nextHunk !== undefined) setFocusedLine(nextHunk)
        else setFocusedLine(hunkIndices[0])
      } else {
        const prevHunk = [...hunkIndices].reverse().find((i) => i < focusedLine)
        if (prevHunk !== undefined) setFocusedLine(prevHunk)
        else setFocusedLine(hunkIndices[hunkIndices.length - 1])
      }
    },
    [focusedLine, hunkIndices]
  )

  // Keyboard navigation
  useEffect(() => {
    if (!viewingFileDiff) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 'Escape':
          closeFileDiff()
          break
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          setFocusedLine((prev) => Math.min(prev + 1, lines.length - 1))
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          setFocusedLine((prev) => Math.max(prev - 1, 0))
          break
        case 'n':
          e.preventDefault()
          navigateHunk('next')
          break
        case 'p':
          e.preventDefault()
          navigateHunk('prev')
          break
        case 'g':
          if (e.shiftKey) {
            e.preventDefault()
            setFocusedLine(lines.length - 1)
          } else {
            e.preventDefault()
            setFocusedLine(0)
          }
          break
        case '?':
          e.preventDefault()
          setShowHelp((prev) => !prev)
          break
        case 'u':
          e.preventDefault()
          setViewMode('unified')
          break
        case 's':
          e.preventDefault()
          setViewMode('split')
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewingFileDiff, closeFileDiff, lines.length, navigateHunk])

  if (!viewingFileDiff || !file) {
    return null
  }

  const fileName = file.path.split('/').pop() || file.path
  const dirPath = file.path.includes('/')
    ? file.path.slice(0, file.path.lastIndexOf('/'))
    : ''

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* Header */}
      <div className="flex h-8 items-center justify-between border-b border-border px-3 bg-card shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="font-mono text-sm truncate flex items-center gap-2">
            <span
              className={cn(
                'w-2 h-2 rounded-full shrink-0',
                file.status === 'added' && 'bg-green-500',
                file.status === 'deleted' && 'bg-red-500',
                file.status === 'modified' && 'bg-yellow-500',
                file.status === 'renamed' && 'bg-blue-500',
                file.status === 'untracked' && 'bg-purple-500'
              )}
            />
            <span className="text-muted-foreground">{dirPath && `${dirPath}/`}</span>
            <span className="text-foreground font-semibold">{fileName}</span>
          </div>

          {!loading && !error && (
            <div className="flex items-center gap-2 font-mono text-xs shrink-0">
              <span className="text-green-500">+{stats.additions}</span>
              <span className="text-red-500">-{stats.deletions}</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* View mode toggle */}
          <div className="flex items-center border border-border rounded overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 px-2 rounded-none border-r border-border',
                viewMode === 'unified' && 'bg-primary/20 text-primary'
              )}
              onClick={() => setViewMode('unified')}
              title="Unified view (u)"
            >
              <AlignJustify className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 px-2 rounded-none',
                viewMode === 'split' && 'bg-primary/20 text-primary'
              )}
              onClick={() => setViewMode('split')}
              title="Split view (s)"
            >
              <Columns className="h-3 w-3" />
            </Button>
          </div>

          {/* Help button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setShowHelp((prev) => !prev)}
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-3 w-3" />
          </Button>

          {/* Hunk navigation */}
          <div className="flex items-center border border-border rounded overflow-hidden ml-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1 rounded-none border-r border-border"
              onClick={() => navigateHunk('prev')}
              title="Previous hunk (p)"
              disabled={hunkIndices.length === 0}
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1 rounded-none"
              onClick={() => navigateHunk('next')}
              title="Next hunk (n)"
              disabled={hunkIndices.length === 0}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>

          {/* Close button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 ml-2"
            onClick={closeFileDiff}
            title="Close (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Help overlay */}
      {showHelp && (
        <div className="absolute inset-0 z-10 bg-background/95 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md shadow-xl">
            <h3 className="font-semibold text-lg mb-4">Keyboard Shortcuts</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 font-mono text-sm">
              <span className="text-muted-foreground">Navigation</span>
              <span></span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">j / ↓</kbd>
              <span>Next line</span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">k / ↑</kbd>
              <span>Previous line</span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">n</kbd>
              <span>Next hunk</span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">p</kbd>
              <span>Previous hunk</span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">g</kbd>
              <span>Go to top</span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">G</kbd>
              <span>Go to bottom</span>

              <span className="text-muted-foreground mt-2">View</span>
              <span></span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">u</kbd>
              <span>Unified view</span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">s</kbd>
              <span>Split view</span>

              <span className="text-muted-foreground mt-2">Other</span>
              <span></span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">?</kbd>
              <span>Toggle help</span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">Esc</kbd>
              <span>Close</span>
            </div>
            <Button
              className="mt-6 w-full"
              variant="secondary"
              onClick={() => setShowHelp(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Diff content */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative" tabIndex={0}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="font-mono text-sm">Loading diff...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-destructive">
            <span className="font-mono text-sm">{error}</span>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <span className="font-mono text-sm">No changes</span>
          </div>
        ) : viewMode === 'unified' ? (
          <UnifiedDiffView
            lines={lines}
            focusedLine={focusedLine}
            lineRefs={lineRefs}
            onLineClick={setFocusedLine}
          />
        ) : (
          <SplitDiffView
            lines={lines}
            focusedLine={focusedLine}
            lineRefs={lineRefs}
            onLineClick={setFocusedLine}
          />
        )}
      </div>

      {/* Footer with line info */}
      <div className="px-3 py-1 border-t border-border bg-card text-xs font-mono text-muted-foreground flex items-center justify-between shrink-0">
        <span>
          {lines.length > 0 && (
            <>Line {focusedLine + 1} of {lines.length}</>
          )}
        </span>
        <span className="text-[10px] opacity-60">
          Press <kbd className="px-1 bg-secondary rounded">?</kbd> for help
        </span>
      </div>
    </div>
  )
}

// Unified diff view component
function UnifiedDiffView({
  lines,
  focusedLine,
  lineRefs,
  onLineClick,
}: {
  lines: DiffLine[]
  focusedLine: number
  lineRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
  onLineClick: (index: number) => void
}) {
  return (
    <ScrollArea className="h-full">
      <div className="font-mono text-[13px] leading-6">
        {lines.map((line, idx) => (
          <div
            key={idx}
            ref={(el) => (lineRefs.current[idx] = el)}
            className={cn(
              'flex hover:bg-muted/30 cursor-pointer transition-colors',
              idx === focusedLine && 'ring-1 ring-primary/50 ring-inset',
              line.type === 'add' && 'bg-green-500/10 border-l-4 border-green-500/60',
              line.type === 'delete' && 'bg-red-500/10 border-l-4 border-red-500/60',
              line.type === 'hunk' && 'bg-blue-500/10 border-l-4 border-blue-500/60 text-blue-400',
              line.type === 'header' && 'bg-muted/30 text-muted-foreground border-l-4 border-muted',
              line.type === 'context' && 'border-l-4 border-transparent'
            )}
            onClick={() => onLineClick(idx)}
          >
            {/* Line numbers gutter */}
            <div className="flex shrink-0 select-none text-muted-foreground/60 text-right border-r border-border bg-card/30">
              <span className="w-12 px-2 border-r border-border/50">
                {line.type === 'delete' || line.type === 'context' ? line.oldLineNum : ''}
              </span>
              <span className="w-12 px-2">
                {line.type === 'add' || line.type === 'context' ? line.newLineNum : ''}
              </span>
            </div>

            {/* Diff marker */}
            <span
              className={cn(
                'w-5 shrink-0 text-center select-none',
                line.type === 'add' && 'text-green-500',
                line.type === 'delete' && 'text-red-500'
              )}
            >
              {line.type === 'add' && '+'}
              {line.type === 'delete' && '-'}
              {line.type === 'context' && ' '}
            </span>

            {/* Content */}
            <pre className="flex-1 px-2 whitespace-pre overflow-x-auto">
              {line.content}
            </pre>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

// Split diff view component
function SplitDiffView({
  lines,
  focusedLine,
  lineRefs,
  onLineClick,
}: {
  lines: DiffLine[]
  focusedLine: number
  lineRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
  onLineClick: (index: number) => void
}) {
  const pairs = useMemo(() => {
    const result: {
      left: DiffLine | null
      right: DiffLine | null
      originalIndex: number
    }[] = []

    let i = 0
    while (i < lines.length) {
      const line = lines[i]

      if (line.type === 'header' || line.type === 'hunk') {
        result.push({ left: line, right: line, originalIndex: i })
        i++
      } else if (line.type === 'delete') {
        const deletes: DiffLine[] = []
        const adds: DiffLine[] = []
        const startIndex = i

        while (i < lines.length && lines[i].type === 'delete') {
          deletes.push(lines[i])
          i++
        }
        while (i < lines.length && lines[i].type === 'add') {
          adds.push(lines[i])
          i++
        }

        const maxLen = Math.max(deletes.length, adds.length)
        for (let j = 0; j < maxLen; j++) {
          result.push({
            left: deletes[j] || null,
            right: adds[j] || null,
            originalIndex: startIndex + j,
          })
        }
      } else if (line.type === 'add') {
        result.push({ left: null, right: line, originalIndex: i })
        i++
      } else {
        result.push({ left: line, right: line, originalIndex: i })
        i++
      }
    }

    return result
  }, [lines])

  return (
    <ScrollArea className="h-full">
      <div className="font-mono text-[13px] leading-6">
        {pairs.map((pair, idx) => {
          const isHunkOrHeader =
            pair.left?.type === 'hunk' || pair.left?.type === 'header'

          return (
            <div
              key={idx}
              ref={(el) => (lineRefs.current[pair.originalIndex] = el)}
              className={cn(
                'flex hover:bg-muted/20 cursor-pointer transition-colors',
                pair.originalIndex === focusedLine && 'ring-1 ring-primary/50 ring-inset'
              )}
              onClick={() => onLineClick(pair.originalIndex)}
            >
              {isHunkOrHeader ? (
                <div
                  className={cn(
                    'flex-1 flex border-l-4',
                    pair.left?.type === 'hunk' && 'bg-blue-500/10 border-blue-500/60 text-blue-400',
                    pair.left?.type === 'header' && 'bg-muted/30 border-muted text-muted-foreground'
                  )}
                >
                  <span className="w-12 px-2 text-right text-muted-foreground/60 border-r border-border/50 select-none shrink-0">
                    {pair.left?.oldLineNum || ''}
                  </span>
                  <pre className="flex-1 px-2 whitespace-pre overflow-x-auto">
                    {pair.left?.content}
                  </pre>
                </div>
              ) : (
                <>
                  {/* Left side (old) */}
                  <div
                    className={cn(
                      'flex-1 flex border-r border-border',
                      pair.left?.type === 'delete' && 'bg-red-500/10 border-l-4 border-l-red-500/60',
                      pair.left?.type === 'context' && 'border-l-4 border-l-transparent',
                      !pair.left && 'bg-muted/20 border-l-4 border-l-transparent'
                    )}
                  >
                    <span className="w-12 px-2 text-right text-muted-foreground/60 border-r border-border/50 select-none shrink-0">
                      {pair.left?.oldLineNum || ''}
                    </span>
                    <span
                      className={cn(
                        'w-5 shrink-0 text-center select-none',
                        pair.left?.type === 'delete' && 'text-red-500'
                      )}
                    >
                      {pair.left?.type === 'delete' && '-'}
                    </span>
                    <pre className="flex-1 px-2 whitespace-pre overflow-x-auto">
                      {pair.left?.content ?? ''}
                    </pre>
                  </div>

                  {/* Right side (new) */}
                  <div
                    className={cn(
                      'flex-1 flex',
                      pair.right?.type === 'add' && 'bg-green-500/10 border-l-4 border-l-green-500/60',
                      pair.right?.type === 'context' && 'border-l-4 border-l-transparent',
                      !pair.right && 'bg-muted/20 border-l-4 border-l-transparent'
                    )}
                  >
                    <span className="w-12 px-2 text-right text-muted-foreground/60 border-r border-border/50 select-none shrink-0">
                      {pair.right?.newLineNum || ''}
                    </span>
                    <span
                      className={cn(
                        'w-5 shrink-0 text-center select-none',
                        pair.right?.type === 'add' && 'text-green-500'
                      )}
                    >
                      {pair.right?.type === 'add' && '+'}
                    </span>
                    <pre className="flex-1 px-2 whitespace-pre overflow-x-auto">
                      {pair.right?.content ?? ''}
                    </pre>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
