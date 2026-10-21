import type { DetailedLeaderboardEntry, JudgeScoringHistoryEntry, RubricCriteria, SummaryJudge } from './types/api'

export function getSummaryJudges(leaderboard: DetailedLeaderboardEntry[], assigned: SummaryJudge[]): SummaryJudge[] {
  const judges = new Map(assigned.map(judge => [judge.id, judge]))
  for (const team of leaderboard) {
    for (const score of team.judge_scores) {
      if (!judges.has(score.judge_id)) {
        judges.set(score.judge_id, { id: score.judge_id, name: score.judge_name })
      }
    }
  }
  return [...judges.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function getProgressCriterion(
  entry: JudgeScoringHistoryEntry,
  criterion: Pick<RubricCriteria, 'short_name'>,
) {
  const key = criterion.short_name.toLowerCase()
  return { score: entry.breakdown[key] ?? null, reflection: entry.reflections[key] ?? null }
}

export function prepareLeaderboard(leaderboard: DetailedLeaderboardEntry[], rubric: RubricCriteria[]): DetailedLeaderboardEntry[] {
  const criteria = [...rubric].sort((a, b) => a.display_order - b.display_order)
  return leaderboard.map(team => ({
    ...team,
    judge_scores: team.judge_scores.map(judge => ({
      ...judge,
      // Order by the event rubric and discard empty LEFT JOIN rows. Missing
      // criterion scores stay missing rather than being converted to zero.
      criteria_scores: criteria.flatMap(criterion => {
        const score = judge.criteria_scores.find(item => item.criteria_id === criterion.id && item.score != null)
        return score ? [{ ...score, criteria_name: criterion.name, max_score: criterion.max_score }] : []
      }),
    })),
  }))
}

export function getConsensusLevel(standardDeviation: number, maximum: number, judgesScored: number) {
  if (judgesScored < 2 || maximum <= 0) return 'insufficient'
  const spread = standardDeviation / maximum
  return spread < 0.05 ? 'high' : spread < 0.1 ? 'medium' : 'low'
}
