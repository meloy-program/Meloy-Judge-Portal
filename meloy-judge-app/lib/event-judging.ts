import type { RubricCriteria, Team } from './types/api'

export function getScoringLimits(
  criteria: Pick<RubricCriteria, 'max_score'>[],
  judgeCount: number,
) {
  const maxScorePerJudge = criteria.reduce((total, criterion) => total + criterion.max_score, 0)
  return { maxScorePerJudge, maxScorePerTeam: maxScorePerJudge * judgeCount }
}

export function getScorePercentage(score: number, maximum: number): number {
  return maximum > 0 ? Math.min(100, Math.max(0, (score / maximum) * 100)) : 0
}

export function sortEventTeams(teams: Team[], eventType: string, isAdmin: boolean): Team[] {
  const isPWS = eventType === 'problems-worth-solving'

  return [...teams].sort((a, b) => {
    const aDone = a.has_current_user_scored || a.status === 'done' || a.status === 'completed'
    const bDone = b.has_current_user_scored || b.status === 'done' || b.status === 'completed'

    if (isPWS) {
      // A judge's submission or the moderator's Done status completes their queue entry.
      if (!isAdmin) {
        const completionDifference = Number(!!aDone) - Number(!!bDone)
        if (completionDifference !== 0) return completionDifference
      }

      const aOrder = a.presentation_order ?? Infinity
      const bOrder = b.presentation_order ?? Infinity
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.name.localeCompare(b.name)
    }

    // Keep the existing Aggies Invent grouping and API order within each group.
    return Number(!!aDone) - Number(!!bDone)
  })
}
