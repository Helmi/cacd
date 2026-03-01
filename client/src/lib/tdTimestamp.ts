function parseOffsetMinutes(token: string): number | null {
  if (token === 'Z' || token === 'z') return 0

  const match = token.match(/^([+-])(\d{2}):?(\d{2})$/)
  if (!match) return null

  const sign = match[1] === '-' ? -1 : 1
  const hour = Number(match[2])
  const minute = Number(match[3])
  return sign * (hour * 60 + minute)
}

/**
 * Parse td timestamps from sqlite/go outputs.
 *
 * Normalization rule:
 * - Offset-aware datetime values are parsed with that offset.
 * - Offset-less datetime values are treated as UTC (not local time).
 */
export function parseTdTimestamp(value: string): Date | null {
  const raw = value.trim()
  if (!raw) return null

  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(.*)$/
  )
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2]) - 1
    const day = Number(match[3])
    const hour = Number(match[4])
    const minute = Number(match[5])
    const second = Number(match[6])
    const ms = Number((match[7] || '0').slice(0, 3).padEnd(3, '0'))
    const tail = match[8].trim()

    const offsetToken = tail.match(/^(Z|z|[+-]\d{2}:?\d{2})\b/)?.[1]
    const offsetMinutes = offsetToken ? parseOffsetMinutes(offsetToken) : null
    const utcMs = Date.UTC(year, month, day, hour, minute, second, ms)

    if (typeof offsetMinutes === 'number') {
      return new Date(utcMs - offsetMinutes * 60_000)
    }

    // Offset-less values are treated as UTC by convention for td timestamps.
    return new Date(utcMs)
  }

  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    return new Date(Date.UTC(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]) - 1,
      Number(dateOnlyMatch[3]),
      0,
      0,
      0,
      0
    ))
  }

  const fallback = new Date(raw)
  return isNaN(fallback.getTime()) ? null : fallback
}

export function formatTdAbsolute(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function formatTdRelative(date: Date, nowMs: number, locale?: string): string {
  const diff = date.getTime() - nowMs
  const abs = Math.abs(diff)
  if (abs < 30_000) return 'just now'

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  const month = 30 * day
  const year = 365 * day
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (abs < hour) return formatter.format(Math.round(diff / minute), 'minute')
  if (abs < day) return formatter.format(Math.round(diff / hour), 'hour')
  if (abs < week) return formatter.format(Math.round(diff / day), 'day')
  if (abs < month) return formatter.format(Math.round(diff / week), 'week')
  if (abs < year) return formatter.format(Math.round(diff / month), 'month')
  return formatter.format(Math.round(diff / year), 'year')
}

export function formatTdDateValue(value?: string | null): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return '—'

  const date = parseTdTimestamp(raw)
  if (!date) return raw

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return date.toLocaleDateString(undefined, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    })
  }

  return formatTdAbsolute(date)
}
