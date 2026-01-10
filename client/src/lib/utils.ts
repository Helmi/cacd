import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a path by replacing home directory with tilde
 */
export function formatPath(path: string): string {
  // Common home directory patterns
  const homePatterns = [
    /^\/Users\/[^/]+/,    // macOS
    /^\/home\/[^/]+/,     // Linux
    /^C:\\Users\\[^\\]+/, // Windows
  ]

  for (const pattern of homePatterns) {
    if (pattern.test(path)) {
      return path.replace(pattern, '~')
    }
  }
  return path
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Generate worktree path from template
 * Supports placeholders: {project}, {branch}, {date}
 */
export function generateWorktreePath(
  projectPath: string,
  branchName: string,
  template?: string
): string {
  const defaultTemplate = '../{branch}'
  const activeTemplate = template || defaultTemplate

  // Get project name from path
  const projectName = projectPath.split('/').pop() || 'project'

  // Sanitize branch name for filesystem
  const safeBranch = branchName
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9-_.]+/g, '')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  // Get current date in YYYY-MM-DD format
  const date = new Date().toISOString().slice(0, 10)

  // Replace placeholders
  return activeTemplate
    .replace(/\{project\}/g, projectName)
    .replace(/\{branch\}/g, safeBranch)
    .replace(/\{branch-name\}/g, safeBranch)
    .replace(/\{date\}/g, date)
}
