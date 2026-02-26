import { describe, expect, it } from 'vitest'
import type { TdIssueWithChildren } from '../lib/types'
import {
  getLinkedSessions,
  getTaskDetailLayoutCounts,
  parseAcceptanceCriteria,
} from '../lib/taskDetailLayout'

function makeIssue(overrides: Partial<TdIssueWithChildren> = {}): TdIssueWithChildren {
  return {
    id: 'td-1',
    title: 'Task title',
    description: '',
    status: 'open',
    type: 'task',
    priority: 'P1',
    points: 1,
    labels: '',
    parent_id: '',
    acceptance: '',
    implementer_session: '',
    reviewer_session: '',
    created_at: '2026-02-20 08:30:10 +0000 UTC',
    updated_at: '2026-02-20 08:30:10 +0000 UTC',
    closed_at: null,
    deleted_at: null,
    minor: 0,
    created_branch: '',
    creator_session: '',
    children: [],
    handoffs: [],
    files: [],
    ...overrides,
  }
}

describe('TaskDetailModal layout helpers', () => {
  it('parses acceptance criteria into clean list items', () => {
    expect(parseAcceptanceCriteria('')).toEqual([])
    expect(
      parseAcceptanceCriteria(`
        - has docs
        * has tests
        plain line
      `)
    ).toEqual(['has docs', 'has tests', 'plain line'])
  })

  it('returns trimmed linked sessions and skips blank entries', () => {
    expect(
      getLinkedSessions({
        implementer_session: ' ses_impl ',
        reviewer_session: '   ',
      })
    ).toEqual([{ label: 'Implementer', id: 'ses_impl' }])
  })

  it('builds tab section counts for dense issues', () => {
    const issue = makeIssue({
      description: 'Some description',
      acceptance: '- one\n- two',
      labels: 'webui, ux',
      implementer_session: 'ses_impl',
      reviewer_session: 'ses_rev',
      children: [
        makeIssue({ id: 'td-child-1', title: 'child' }),
      ],
      handoffs: [
        {
          id: 'handoff-1',
          issueId: 'td-1',
          sessionId: 'ses_impl',
          done: ['a'],
          remaining: ['b'],
          decisions: [],
          uncertain: [],
          timestamp: '2026-02-20 08:30:10 +0000 UTC',
        },
      ],
      files: [
        {
          id: 'file-1',
          issue_id: 'td-1',
          file_path: 'client/src/components/TaskDetailModal.tsx',
          role: 'implementation',
        },
      ],
    })

    expect(getTaskDetailLayoutCounts(issue)).toEqual({
      overview: 4,
      activity: 2,
      details: 2,
    })
  })

  it('keeps details tab available even when optional sections are empty', () => {
    const issue = makeIssue()
    expect(getTaskDetailLayoutCounts(issue)).toEqual({
      overview: 0,
      activity: 0,
      details: 1,
    })
  })
})
