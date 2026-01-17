import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { DirectoryEntry } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileJson,
  FileText,
  Image,
  ChevronRight,
  ChevronDown,
  Loader2,
} from 'lucide-react'

interface FileBrowserProps {
  worktreePath: string
}

// Get icon for file based on extension
function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
    case 'rb':
    case 'go':
    case 'rs':
    case 'java':
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
    case 'cs':
    case 'php':
    case 'swift':
    case 'kt':
    case 'scala':
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
      return FileCode
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'xml':
      return FileJson
    case 'md':
    case 'txt':
    case 'rst':
      return FileText
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
      return Image
    default:
      return File
  }
}

// Format file size for display
function formatSize(bytes?: number): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface TreeNodeProps {
  entry: DirectoryEntry
  level: number
  worktreePath: string
  expandedDirs: Set<string>
  childrenCache: Map<string, DirectoryEntry[]>
  loadingDirs: Set<string>
  onToggle: (path: string) => void
  onFileClick: (path: string) => void
}

function TreeNode({
  entry,
  level,
  worktreePath,
  expandedDirs,
  childrenCache,
  loadingDirs,
  onToggle,
  onFileClick,
}: TreeNodeProps) {
  const isExpanded = expandedDirs.has(entry.path)
  const isLoading = loadingDirs.has(entry.path)
  const children = childrenCache.get(entry.path)

  const handleClick = () => {
    if (entry.type === 'directory') {
      onToggle(entry.path)
    } else {
      onFileClick(entry.path)
    }
  }

  const Icon = entry.type === 'directory'
    ? (isExpanded ? FolderOpen : Folder)
    : getFileIcon(entry.name)

  return (
    <div>
      <button
        className={cn(
          'flex items-center gap-1 w-full text-left text-xs hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors group',
        )}
        style={{ paddingLeft: `${level * 12 + 4}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse indicator for directories */}
        {entry.type === 'directory' ? (
          isLoading ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          ) : isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Icon */}
        <Icon className={cn(
          'h-3.5 w-3.5 shrink-0',
          entry.type === 'directory' ? 'text-yellow-500' : 'text-muted-foreground'
        )} />

        {/* Name */}
        <span className="truncate flex-1 font-mono text-[11px]">
          {entry.name}
        </span>

        {/* Size for files */}
        {entry.type === 'file' && entry.size !== undefined && (
          <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-70 shrink-0">
            {formatSize(entry.size)}
          </span>
        )}
      </button>

      {/* Children */}
      {entry.type === 'directory' && isExpanded && children && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              level={level + 1}
              worktreePath={worktreePath}
              expandedDirs={expandedDirs}
              childrenCache={childrenCache}
              loadingDirs={loadingDirs}
              onToggle={onToggle}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileBrowser({ worktreePath }: FileBrowserProps) {
  const { openFile } = useAppStore()

  const [rootEntries, setRootEntries] = useState<DirectoryEntry[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [childrenCache, setChildrenCache] = useState<Map<string, DirectoryEntry[]>>(new Map())
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch root entries
  useEffect(() => {
    const fetchRoot = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `/api/worktree/tree?path=${encodeURIComponent(worktreePath)}`
        )
        if (!response.ok) {
          throw new Error('Failed to fetch directory')
        }
        const data = await response.json()
        setRootEntries(data.entries || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchRoot()
  }, [worktreePath])

  // Fetch children for a directory
  const fetchChildren = useCallback(async (dirPath: string) => {
    setLoadingDirs((prev) => new Set(prev).add(dirPath))
    try {
      const response = await fetch(
        `/api/worktree/tree?path=${encodeURIComponent(worktreePath)}&dir=${encodeURIComponent(dirPath)}`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch directory')
      }
      const data = await response.json()
      setChildrenCache((prev) => new Map(prev).set(dirPath, data.entries || []))
    } catch (err) {
      console.error('Failed to fetch children:', err)
    } finally {
      setLoadingDirs((prev) => {
        const next = new Set(prev)
        next.delete(dirPath)
        return next
      })
    }
  }, [worktreePath])

  // Toggle directory expansion
  const handleToggle = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
        // Fetch children if not cached
        if (!childrenCache.has(path)) {
          fetchChildren(path)
        }
      }
      return next
    })
  }, [childrenCache, fetchChildren])

  // Handle file click
  const handleFileClick = useCallback((filePath: string) => {
    openFile(worktreePath, filePath)
  }, [worktreePath, openFile])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3 text-xs text-destructive">
        {error}
      </div>
    )
  }

  if (rootEntries.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        Empty directory
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-2">
      {rootEntries.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          level={0}
          worktreePath={worktreePath}
          expandedDirs={expandedDirs}
          childrenCache={childrenCache}
          loadingDirs={loadingDirs}
          onToggle={handleToggle}
          onFileClick={handleFileClick}
        />
      ))}
    </div>
  )
}
