import { describe, expect, it } from 'vitest'
import {
  formatTdDateValue,
  formatTdRelative,
  parseTdTimestamp,
} from './tdTimestamp'

describe('tdTimestamp', () => {
  it('parses offset-less datetime values as UTC', () => {
    const date = parseTdTimestamp('2026-02-20 08:30:10')
    expect(date).not.toBeNull()
    expect(date?.toISOString()).toBe('2026-02-20T08:30:10.000Z')
  })

  it('parses go timestamps with offsets correctly', () => {
    const date = parseTdTimestamp('2026-02-20 08:30:10.451538 +0100 CET m=+0.117390418')
    expect(date).not.toBeNull()
    expect(date?.toISOString()).toBe('2026-02-20T07:30:10.451Z')
  })

  it('parses RFC3339 colon offsets correctly', () => {
    const date = parseTdTimestamp('2026-02-20T08:30:10+01:00')
    expect(date).not.toBeNull()
    expect(date?.toISOString()).toBe('2026-02-20T07:30:10.000Z')
  })

  it('renders stable relative labels for RFC3339 comment timestamps', () => {
    const now = Date.UTC(2026, 1, 20, 9, 30, 10, 0)
    const date = parseTdTimestamp('2026-02-20T08:30:10+01:00')
    expect(date).not.toBeNull()
    expect(formatTdRelative(date!, now, 'en')).toBe('2 hours ago')
  })

  it('renders stable relative labels for UTC-normalized datetimes', () => {
    const now = Date.UTC(2026, 1, 20, 10, 30, 10, 0)
    const date = parseTdTimestamp('2026-02-20 08:30:10')
    expect(date).not.toBeNull()
    expect(formatTdRelative(date!, now, 'en')).toBe('2 hours ago')
  })

  it('formats date-only values without timezone day shift', () => {
    const formatted = formatTdDateValue('2026-02-20')
    const expected = new Date(Date.UTC(2026, 1, 20)).toLocaleDateString(undefined, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    })
    expect(formatted).toBe(expected)
  })
})
