import assert from 'node:assert/strict'
import test from 'node:test'
import { getScoringLimits, getScorePercentage, sortEventTeams } from '../lib/event-judging.ts'

const pws = 'problems-worth-solving'
const invent = 'aggies-invent'
const rubric = (...maxima) => maxima.map(max_score => ({ max_score }))
const participant = (id, order, scored = false, status = 'active') => ({
  id,
  name: id,
  presentation_order: order,
  has_current_user_scored: scored,
  status,
})
const ids = teams => teams.map(team => team.id)

test('PWS uses all six criteria and all assigned judges, including judges without submissions', () => {
  const criteria = rubric(5, 5, 5, 5, 5, 5)
  assert.deepEqual(getScoringLimits(criteria, 3), { maxScorePerJudge: 30, maxScorePerTeam: 90 })
  assert.deepEqual(getScoringLimits(criteria, 5), { maxScorePerJudge: 30, maxScorePerTeam: 150 })
  assert.equal(getScorePercentage(15, 30), 50)
  assert.equal(getScorePercentage(45, 90), 50)
})

test('Aggies Invent and rubrics with unequal criterion limits use their actual maxima', () => {
  assert.deepEqual(getScoringLimits(rubric(25, 25, 25, 25), 6), {
    maxScorePerJudge: 100,
    maxScorePerTeam: 600,
  })
  assert.deepEqual(getScoringLimits(rubric(10, 20, 5), 2), {
    maxScorePerJudge: 35,
    maxScorePerTeam: 70,
  })
})

test('empty rubrics and events without judges have no fabricated maximum or invalid percentage', () => {
  assert.deepEqual(getScoringLimits([], 3), { maxScorePerJudge: 0, maxScorePerTeam: 0 })
  assert.deepEqual(getScoringLimits(rubric(5, 5), 0), { maxScorePerJudge: 10, maxScorePerTeam: 0 })
  assert.equal(getScorePercentage(0, 0), 0)
  assert.equal(getScorePercentage(10, 0), 0)
  assert.equal(getScorePercentage(0, 30), 0)
  assert.equal(getScorePercentage(40, 30), 100)
})

test('PWS starts in presentation order, with unassigned participants last', () => {
  const teams = [participant('Unassigned', null), participant('Third', 3), participant('First', 1), participant('Second', 2)]
  assert.deepEqual(ids(sortEventTeams(teams, pws, false)), ['First', 'Second', 'Third', 'Unassigned'])
})

test('each successful submission moves that participant behind every unscored participant', () => {
  const teams = [participant('Third', 3), participant('First', 1), participant('Second', 2)]
  assert.deepEqual(ids(sortEventTeams(teams, pws, false)), ['First', 'Second', 'Third'])
  teams.find(team => team.id === 'First').has_current_user_scored = true
  assert.deepEqual(ids(sortEventTeams(teams, pws, false)), ['Second', 'Third', 'First'])
  teams.find(team => team.id === 'Second').has_current_user_scored = true
  assert.deepEqual(ids(sortEventTeams(teams, pws, false)), ['Third', 'First', 'Second'])
  teams.find(team => team.id === 'Third').has_current_user_scored = true
  assert.deepEqual(ids(sortEventTeams(teams, pws, false)), ['First', 'Second', 'Third'])
})

test('moderator Done moves an unscored PWS participant behind the next person', () => {
  for (const status of ['completed', 'done']) {
    const teams = [participant('Second', 2), participant('First', 1, false, status)]
    assert.deepEqual(ids(sortEventTeams(teams, pws, false)), ['Second', 'First'])
    assert.equal(teams[1].has_current_user_scored, false)
  }
})

test('moderator Done is authoritative across judge queues even when submissions are missing', () => {
  const judgeA = [participant('First', 1, true, 'completed'), participant('Second', 2)]
  const judgeB = judgeA.map(team => ({ ...team, has_current_user_scored: false }))
  assert.deepEqual(ids(sortEventTeams(judgeA, pws, false)), ['Second', 'First'])
  assert.deepEqual(ids(sortEventTeams(judgeB, pws, false)), ['Second', 'First'])
})

test('reopening a completed PWS participant restores the queue only for judges still missing scores', () => {
  const teams = [participant('First', 1, false, 'completed'), participant('Second', 2)]
  assert.deepEqual(ids(sortEventTeams(teams, pws, false)), ['Second', 'First'])
  teams[0].status = 'active'
  assert.deepEqual(ids(sortEventTeams(teams, pws, false)), ['First', 'Second'])
  teams[0].has_current_user_scored = true
  assert.deepEqual(ids(sortEventTeams(teams, pws, false)), ['Second', 'First'])
})

test('different judge profiles get independent PWS queues', () => {
  const judgeA = [participant('First', 1, true), participant('Second', 2), participant('Third', 3)]
  const judgeB = judgeA.map(team => ({ ...team, has_current_user_scored: team.id === 'Second' }))
  assert.deepEqual(ids(sortEventTeams(judgeA, pws, false)), ['Second', 'Third', 'First'])
  assert.deepEqual(ids(sortEventTeams(judgeB, pws, false)), ['First', 'Third', 'Second'])
})

test('PWS admin order follows moderator positions and polling can apply position changes', () => {
  const teams = [participant('First', 1, true), participant('Second', 2), participant('Third', 3)]
  assert.deepEqual(ids(sortEventTeams(teams, pws, true)), ['First', 'Second', 'Third'])
  teams[1].presentation_order = 3
  teams[2].presentation_order = 2
  assert.deepEqual(ids(sortEventTeams(teams, pws, false)), ['Third', 'Second', 'First'])
})

test('sorting is deterministic for unassigned PWS participants and never mutates React state', () => {
  const teams = Object.freeze([
    Object.freeze(participant('Zoe', null)),
    Object.freeze(participant('Amy', null)),
    Object.freeze(participant('First', 1)),
  ])
  assert.deepEqual(ids(sortEventTeams(teams, pws, false)), ['First', 'Amy', 'Zoe'])
  assert.deepEqual(ids(teams), ['Zoe', 'Amy', 'First'])
})

test('Aggies Invent keeps its existing completion grouping and original order within groups', () => {
  const teams = [
    participant('Scored', 1, true),
    participant('Done', 2, false, 'completed'),
    participant('Unscored B', 4),
    participant('Unscored A', 3),
  ]
  assert.deepEqual(ids(sortEventTeams(teams, invent, false)), ['Unscored B', 'Unscored A', 'Scored', 'Done'])
})
