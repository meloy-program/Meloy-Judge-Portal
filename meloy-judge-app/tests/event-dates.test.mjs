import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import {
  formatEventDateRange,
  getEventDate,
  getEventDateRangeError,
  getEventDisplayStatus,
  getEventToday,
} from '../lib/event-dates.ts'

const event = (start = '2026-10-21', end = start) => ({
  start_date: start,
  end_date: end,
  status: 'upcoming',
  judging_phase: 'not-started',
})
const statusAt = (scheduledEvent, instant) =>
  getEventDisplayStatus(scheduledEvent, getEventToday(new Date(instant)))

test('October 21 stays October 21 for both saved timestamps and date inputs', () => {
  for (const value of ['2026-10-21', '2026-10-21T00:00:00.000Z', '2026-10-21 00:00:00']) {
    assert.equal(getEventDate(value), '2026-10-21')
    assert.equal(formatEventDateRange(value, value), 'October 21, 2026')
  }
  assert.equal(formatEventDateRange('2026-10-21', '2026-10-21T00:00:00.000Z', 'short'), 'Oct 21, 2026')
})

test('event cards preserve their selected dates in different viewer time zones', () => {
  const moduleUrl = new URL('../lib/event-dates.ts', import.meta.url).href
  const script = `
    import assert from 'node:assert/strict';
    import { formatEventDateRange, getEventToday } from ${JSON.stringify(moduleUrl)};
    assert.equal(formatEventDateRange('2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z'), 'October 21, 2026');
    assert.equal(getEventToday(new Date('2026-10-21T04:30:00Z')), '2026-10-20');
  `
  for (const timeZone of ['America/Chicago', 'America/Los_Angeles', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ: timeZone },
      stdio: 'pipe',
    })
  }
})

test('multi-day and cross-year ranges show the correct dates', () => {
  assert.equal(formatEventDateRange('2026-10-21T00:00:00Z', '2026-10-23T00:00:00Z'), 'Oct 21 – October 23, 2026')
  assert.equal(formatEventDateRange('2026-12-31', '2027-01-01'), 'Dec 31, 2026 – January 1, 2027')
})

test('missing and invalid dates are handled without displaying Invalid Date', () => {
  for (const value of [null, undefined, '', 'not-a-date', '2026-02-30', '2026-13-01']) {
    assert.equal(getEventDate(value), '')
    assert.equal(formatEventDateRange(value, value), 'Dates not set')
  }
  assert.equal(formatEventDateRange('2026-10-21', null), 'October 21, 2026')
  assert.equal(getEventDate('2028-02-29'), '2028-02-29')
})

test('create and edit validation accepts one-day events and rejects reversed or invalid dates', () => {
  assert.equal(getEventDateRangeError('2026-10-21', '2026-10-21'), null)
  assert.equal(getEventDateRangeError('2026-10-21', '2026-10-23'), null)
  assert.ok(getEventDateRangeError('2026-10-23', '2026-10-21'))
  assert.ok(getEventDateRangeError('', '2026-10-21'))
  assert.ok(getEventDateRangeError('2026-02-30', '2026-03-01'))
})

test('a one-day event is active from Central midnight through the entire end date', () => {
  const scheduledEvent = event()
  assert.equal(statusAt(scheduledEvent, '2026-10-21T04:59:59.999Z'), 'upcoming')
  assert.equal(statusAt(scheduledEvent, '2026-10-21T05:00:00.000Z'), 'active')
  assert.equal(statusAt(scheduledEvent, '2026-10-21T18:00:00.000Z'), 'active')
  assert.equal(statusAt(scheduledEvent, '2026-10-22T04:59:59.999Z'), 'active')
  assert.equal(statusAt(scheduledEvent, '2026-10-22T05:00:00.000Z'), 'completed')
})

test('multi-day events include both start and end dates and every day in between', () => {
  const scheduledEvent = event('2026-10-21T00:00:00.000Z', '2026-10-23T00:00:00.000Z')
  for (const day of ['2026-10-21', '2026-10-22', '2026-10-23']) {
    assert.equal(getEventDisplayStatus(scheduledEvent, day), 'active')
  }
  assert.equal(getEventDisplayStatus(scheduledEvent, '2026-10-20'), 'upcoming')
  assert.equal(getEventDisplayStatus(scheduledEvent, '2026-10-24'), 'completed')
})

test('Central date boundaries account for both daylight saving transitions', () => {
  const springEvent = event('2026-03-08')
  assert.equal(statusAt(springEvent, '2026-03-08T05:59:59.999Z'), 'upcoming')
  assert.equal(statusAt(springEvent, '2026-03-08T06:00:00.000Z'), 'active')
  assert.equal(statusAt(springEvent, '2026-03-09T04:59:59.999Z'), 'active')
  assert.equal(statusAt(springEvent, '2026-03-09T05:00:00.000Z'), 'completed')

  const fallEvent = event('2026-11-01')
  assert.equal(statusAt(fallEvent, '2026-11-01T04:59:59.999Z'), 'upcoming')
  assert.equal(statusAt(fallEvent, '2026-11-01T05:00:00.000Z'), 'active')
  assert.equal(statusAt(fallEvent, '2026-11-02T05:59:59.999Z'), 'active')
  assert.equal(statusAt(fallEvent, '2026-11-02T06:00:00.000Z'), 'completed')
})

test('explicitly ended events remain ended even during their scheduled date range', () => {
  assert.equal(getEventDisplayStatus({ ...event(), judging_phase: 'ended' }, '2026-10-21'), 'completed')
  assert.equal(getEventDisplayStatus({ ...event(), status: 'completed', judging_phase: 'in-progress' }, '2026-10-21'), 'completed')
})

test('manual activation remains supported and missing dates do not fabricate an active event', () => {
  assert.equal(getEventDisplayStatus({ ...event(), judging_phase: 'in-progress' }, '2026-10-20'), 'active')
  assert.equal(getEventDisplayStatus({ ...event(), status: 'active' }, '2026-10-24'), 'active')
  assert.equal(getEventDisplayStatus({}, '2026-10-21'), 'upcoming')
  assert.equal(getEventDisplayStatus(event('2026-10-23', '2026-10-21'), '2026-10-22'), 'upcoming')
})
