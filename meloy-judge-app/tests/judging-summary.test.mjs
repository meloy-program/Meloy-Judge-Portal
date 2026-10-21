import assert from 'node:assert/strict'
import test from 'node:test'
import { getSummaryJudges, getProgressCriterion, prepareLeaderboard, getConsensusLevel } from '../lib/judging-summary.ts'

const rubric = ['Problem', 'Customer', 'Willingness', 'Market', 'Solutions', 'Overall'].map((name, index) => ({
  id: `criterion-${index}`,
  name: `PWS ${name} question`,
  short_name: name,
  max_score: 5,
  display_order: index + 1,
}))
const history = {
  breakdown: { problem: 1, customer: 2, willingness: 3, market: 4, solutions: 5, overall: 5 },
  reflections: { problem: 'Clear problem statement', overall: 'Strong overall impression' },
}
const judgeScore = (id, criteria = []) => ({ judge_id: id, judge_name: id, total_score: 20, criteria_scores: criteria })
const participant = (id, judges = []) => ({ team_id: id, judge_scores: judges })

test('PWS history reads all six actual scores and their notes instead of Aggies Invent categories', () => {
  assert.deepEqual(rubric.map(criterion => getProgressCriterion(history, criterion).score), [1, 2, 3, 4, 5, 5])
  assert.equal(getProgressCriterion(history, rubric[0]).reflection, 'Clear problem statement')
  assert.equal(getProgressCriterion(history, rubric[5]).reflection, 'Strong overall impression')
})

test('history distinguishes a saved zero from a missing criterion', () => {
  const entry = { breakdown: { problem: 0 }, reflections: {} }
  assert.deepEqual(getProgressCriterion(entry, rubric[0]), { score: 0, reflection: null })
  assert.deepEqual(getProgressCriterion(entry, rubric[1]), { score: null, reflection: null })
})

test('Aggies Invent history keeps working with its own rubric short names', () => {
  const entry = { breakdown: { communication: 20, funding: 22, presentation: 23, cohesion: 24 }, reflections: {} }
  assert.deepEqual(['Communication', 'Funding', 'Presentation', 'Cohesion'].map(short_name =>
    getProgressCriterion(entry, { short_name }).score), [20, 22, 23, 24])
})

test('final summary includes assigned judges without scores and judges missing from the first participant', () => {
  const leaderboard = [participant('first'), participant('second', [judgeScore('Judge B')])]
  const judges = getSummaryJudges(leaderboard, [{ id: 'Judge A', name: 'Judge A' }, { id: 'Judge C', name: 'Judge C' }])
  assert.deepEqual(judges.map(judge => judge.id), ['Judge A', 'Judge B', 'Judge C'])
})

test('judge identity is deduplicated by ID and preserves separate judges with matching display names', () => {
  const leaderboard = [participant('first', [judgeScore('a'), judgeScore('b')]), participant('second', [judgeScore('a')])]
  const judges = getSummaryJudges(leaderboard, [{ id: 'a', name: 'Guest Judge' }, { id: 'b', name: 'Guest Judge' }])
  assert.equal(judges.length, 2)
  assert.deepEqual(judges.map(judge => judge.name), ['Guest Judge', 'Guest Judge'])
})

test('final breakdown follows all six PWS criteria and corrects stale names and maxima', () => {
  const scores = [...rubric].reverse().map(criterion => ({
    criteria_id: criterion.id, criteria_name: 'Stale title', max_score: 25, score: 4, reflection: 'Saved note',
  }))
  const original = [participant('first', [judgeScore('Judge A', scores)])]
  const result = prepareLeaderboard(original, rubric)
  const criteria = result[0].judge_scores[0].criteria_scores
  assert.deepEqual(criteria.map(criterion => criterion.criteria_id), rubric.map(criterion => criterion.id))
  assert.deepEqual(criteria.map(criterion => criterion.max_score), [5, 5, 5, 5, 5, 5])
  assert.equal(criteria[0].criteria_name, 'PWS Problem question')
  assert.equal(criteria[0].reflection, 'Saved note')
  assert.equal(original[0].judge_scores[0].criteria_scores[0].max_score, 25)
})

test('empty joined rows and other event rubrics do not create fake criterion scores', () => {
  const scores = [
    { criteria_id: null, score: null, max_score: null },
    { criteria_id: 'aggies-communication', score: 25 },
    { criteria_id: rubric[0].id, score: 0 },
  ]
  const criteria = prepareLeaderboard([participant('first', [judgeScore('Judge A', scores)])], rubric)[0].judge_scores[0].criteria_scores
  assert.equal(criteria.length, 1)
  assert.equal(criteria[0].score, 0)
  assert.equal(criteria[0].max_score, 5)
})

test('missing submissions stay absent rather than becoming zero scores', () => {
  assert.deepEqual(prepareLeaderboard([participant('first')], rubric)[0].judge_scores, [])
})

test('consensus uses the same relative thresholds on 30-point and 100-point rubrics', () => {
  assert.equal(getConsensusLevel(1.2, 30, 3), 'high')
  assert.equal(getConsensusLevel(4, 100, 3), 'high')
  assert.equal(getConsensusLevel(2.4, 30, 3), 'medium')
  assert.equal(getConsensusLevel(8, 100, 3), 'medium')
  assert.equal(getConsensusLevel(3.6, 30, 3), 'low')
  assert.equal(getConsensusLevel(12, 100, 3), 'low')
})

test('zero or one judge cannot establish consensus', () => {
  assert.equal(getConsensusLevel(0, 30, 0), 'insufficient')
  assert.equal(getConsensusLevel(0, 30, 1), 'insufficient')
  assert.equal(getConsensusLevel(0, 0, 3), 'insufficient')
})
