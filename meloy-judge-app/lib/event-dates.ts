export const EVENT_TIME_ZONE = 'America/Chicago'

// Event forms collect calendar dates. Preserve that date even when the API
// serializes a PostgreSQL timestamp as midnight UTC.
export function getEventDate(value: string | null | undefined): string {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})(?:$|T| )/)
  if (!match) return ''
  const date = new Date(`${match[1]}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : ''
}

export function getEventDateRangeError(startDate: string, endDate: string): string | null {
  const start = getEventDate(startDate)
  const end = getEventDate(endDate)
  if (!start || !end) return 'Enter valid start and end dates.'
  return end < start ? 'End date must be on or after start date.' : null
}

export function formatEventDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  month: 'short' | 'long' = 'long',
): string {
  const start = getEventDate(startDate)
  const end = getEventDate(endDate)
  if (!start && !end) return 'Dates not set'

  const format = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${value}T00:00:00.000Z`).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' })
  const fullDate: Intl.DateTimeFormatOptions = { month, day: 'numeric', year: 'numeric' }
  if (!start || !end || start === end) return format(start || end, fullDate)

  const startOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (start.slice(0, 4) !== end.slice(0, 4)) startOptions.year = 'numeric'
  return `${format(start, startOptions)} – ${format(end, fullDate)}`
}

export function getEventToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

interface ScheduledEvent {
  start_date?: string | null
  end_date?: string | null
  status?: string
  judging_phase?: string
}

export function getEventDisplayStatus(
  event: ScheduledEvent,
  today = getEventToday(),
): 'upcoming' | 'active' | 'completed' {
  // Explicit moderator decisions take precedence over the scheduled dates.
  if (event.judging_phase === 'ended' || event.status === 'completed') return 'completed'
  if (event.judging_phase === 'in-progress' || event.status === 'active') return 'active'

  const start = getEventDate(event.start_date)
  const end = getEventDate(event.end_date)
  if (!start || !end || end < start) return 'upcoming'
  if (today < start) return 'upcoming'
  if (today > end) return 'completed'
  return 'active'
}
