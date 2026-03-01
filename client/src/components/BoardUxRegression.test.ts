import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Board UX regression checks', () => {
  it('keeps the task board button always visible in the session title bar', () => {
    const source = readSource('client/src/components/TerminalSession.tsx')
    expect(source).toContain('title="Task board"')
    expect(source).not.toContain('{tdStatus?.projectState?.enabled && (')
  })

  it('uses plain "Show more" text for closed-column progressive reveal', () => {
    const source = readSource('client/src/components/TaskBoard.tsx')
    expect(source).toContain('Show more')
    expect(source).not.toContain('Show {issues.length - visibleIssues.length} older')
  })
})
