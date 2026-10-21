import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire, Module } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

// Render the actual TSX components without writing into Next's build directories.
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...rest) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, ...rest)
}
for (const extension of ['.ts', '.tsx']) {
  Module._extensions[extension] = function (module, filename) {
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    })
    module._compile(outputText, filename)
  }
}
const { TeamScorePreview } = require('../components/events/team-score-preview.tsx')
const { EventDetailScreen } = require('../components/events/event-detail-screen.tsx')
const rubric = ['Problem', 'Customer', 'Willingness', 'Market', 'Solutions', 'Overall'].map((short_name, index) => ({
  id: `criterion-${index}`, name: `PWS ${short_name}`, short_name, max_score: 5, display_order: index + 1,
}))
const entry = { teamName: 'Student One', totalScore: 24, breakdown: Object.fromEntries(rubric.map(c => [c.short_name.toLowerCase(), 4])), reflections: {} }
const preview = (props = {}) => renderToStaticMarkup(React.createElement(TeamScorePreview, {
  teamName: entry.teamName, rubric, entry, hasSubmitted: true, status: 'ready', ...props,
})).replace(/<[^>]*>/g, '')

test('mini table renders all six PWS criterion scores and a /30 total', () => {
  const text = preview()
  for (const criterion of rubric) assert.ok(text.includes(criterion.short_name))
  assert.equal(text.match(/4\/5/g)?.length, 6)
  assert.ok(text.includes('24/30'))
  assert.ok(!text.includes('/100'))
})

test('mini table uses the actual Aggies Invent rubric and /100 maximum', () => {
  const criteria = ['Communication', 'Funding', 'Presentation', 'Cohesion'].map(short_name => ({ short_name, id: short_name, name: short_name, max_score: 25 }))
  const text = preview({ rubric: criteria, entry: { ...entry, totalScore: 80, breakdown: Object.fromEntries(criteria.map(c => [c.short_name.toLowerCase(), 20])) } })
  assert.equal(text.match(/20\/25/g)?.length, 4)
  assert.ok(text.includes('80/100'))
})

test('unscored cards show dashes rather than fabricated zero scores', () => {
  const text = preview({ entry: undefined, hasSubmitted: false })
  assert.equal(text.match(/—\/5/g)?.length, 6)
  assert.ok(text.includes('—/30'))
  assert.ok(text.includes('Not scored yet'))
})

test('a saved zero remains distinct from a missing criterion', () => {
  const text = preview({ entry: { ...entry, totalScore: 0, breakdown: { problem: 0 } } })
  assert.ok(text.includes('0/5'))
  assert.equal(text.match(/—\/5/g)?.length, 5)
  assert.ok(text.includes('0/30'))
})

test('loading and failed previews do not expose a stale saved score', () => {
  for (const [status, message] of [['loading', 'Loading preview…'], ['error', 'Preview unavailable']]) {
    const text = preview({ status })
    assert.ok(text.includes(message))
    assert.ok(!text.includes('24/30'))
  }
})

test('admin cards show rubric maxima instead of claiming another judge’s scores', () => {
  const text = preview({ rubricOnly: true, entry: undefined })
  assert.ok(text.includes('Rubric preview'))
  assert.ok(text.includes('Maximum30'))
  assert.ok(!text.includes('Your scores'))
})

const event = { id: 'event', event_type: 'problems-worth-solving', name: 'PWS Event', start_date: '2026-10-21', end_date: '2026-10-21' }
const teams = [{ id: 'student', name: entry.teamName, status: 'active', presentation_order: 1, has_current_user_scored: true, members: [] }]
const snapshot = { eventId: event.id, judgeId: 'judge-a', rubric, history: [entry], status: 'ready' }
function renderEvent(scorePreview, props = {}) {
  const states = [event, teams, false, null, null, false, false, scorePreview]
  const originalUseState = React.useState
  React.useState = initial => states.length ? [states.shift(), () => {}] : originalUseState(initial)
  try {
    return renderToStaticMarkup(React.createElement(EventDetailScreen, {
      eventId: event.id, judgeId: 'judge-a', judgeName: 'Judge A', isAdmin: false,
      onSelectTeam() {}, onBack() {}, onNavigate() {}, onManageEvent() {}, onOpenModerator() {}, ...props,
    }))
  } finally {
    React.useState = originalUseState
  }
}

test('event cards replace both desktop and mobile photo placeholders with score tables', () => {
  const html = renderEvent(snapshot)
  assert.equal(html.match(/<table /g)?.length, 2)
  assert.equal(html.replace(/<[^>]*>/g, '').match(/24\/30/g)?.length, 2)
  assert.ok(!html.includes('Meloy logo placeholder'))
})

test('switching events or judge profiles never displays the previous profile’s scores', () => {
  for (const props of [{ judgeId: 'judge-b' }, { eventId: 'another-event' }]) {
    const text = renderEvent(snapshot, props).replace(/<[^>]*>/g, '')
    assert.ok(!text.includes('24/30'))
    assert.ok(text.includes('Loading preview…'))
  }
})

test('unavailable previews keep the participant roster visible', () => {
  const text = renderEvent({ ...snapshot, status: 'error' }).replace(/<[^>]*>/g, '')
  assert.ok(text.includes(entry.teamName))
  assert.ok(text.includes('Preview unavailable'))
  assert.ok(!text.includes('24/30'))
})
