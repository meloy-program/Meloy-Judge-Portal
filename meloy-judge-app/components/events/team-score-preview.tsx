"use client"

import type { JudgeScoringHistoryEntry, RubricCriteria } from "@/lib/types/api"
import { getScoringLimits } from "@/lib/event-judging"
import { getProgressCriterion } from "@/lib/judging-summary"

interface TeamScorePreviewProps {
  teamName: string
  rubric: RubricCriteria[]
  entry?: JudgeScoringHistoryEntry
  hasSubmitted: boolean
  status: 'loading' | 'ready' | 'error'
  rubricOnly?: boolean
}

export function TeamScorePreview({ teamName, rubric, entry, hasSubmitted, status, rubricOnly = false }: TeamScorePreviewProps) {
  const { maxScorePerJudge } = getScoringLimits(rubric, 1)
  const savedEntry = status === 'ready' ? entry : undefined
  const message = status === 'error'
    ? 'Preview unavailable'
    : status === 'loading'
      ? 'Loading preview…'
      : rubric.length === 0
        ? 'No rubric configured'
        : rubricOnly
          ? 'Maximum points per judge'
          : savedEntry
            ? 'Saved scores'
            : hasSubmitted
              ? 'Scores refreshing…'
              : 'Not scored yet'

  return (
    <section className="h-full w-full bg-primary/5 p-4 text-left" aria-label={`${rubricOnly ? 'Rubric' : 'Your scores'} for ${teamName}`}>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">
        {rubricOnly ? 'Rubric preview' : 'Your scores'}
      </p>
      <table className="w-full text-xs sm:text-sm">
        <caption className="sr-only">{rubricOnly ? 'Scoring rubric' : 'Saved criterion scores'} for {teamName}</caption>
        <thead>
          <tr className="border-b border-primary/15 text-slate-500">
            <th scope="col" className="py-1.5 pr-2 text-left font-medium">Criterion</th>
            <th scope="col" className="py-1.5 text-right font-medium">{rubricOnly ? 'Max' : 'Score'}</th>
          </tr>
        </thead>
        <tbody>
          {rubric.map(criterion => {
            const score = savedEntry ? getProgressCriterion(savedEntry, criterion).score : null
            return (
              <tr key={criterion.id} className="border-b border-primary/10 last:border-0">
                <th scope="row" title={criterion.name} className="py-1.5 pr-2 text-left font-medium text-slate-600">
                  {criterion.short_name || criterion.name}
                </th>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                  <span className="font-semibold text-primary">{rubricOnly ? criterion.max_score : score ?? '—'}</span>
                  {!rubricOnly && <span className="text-slate-500">/{criterion.max_score}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-primary/20 text-primary">
            <th scope="row" className="pt-2 pr-2 text-left font-bold">{rubricOnly ? 'Maximum' : 'Total'}</th>
            <td className="whitespace-nowrap pt-2 text-right font-bold tabular-nums">
              {rubricOnly ? maxScorePerJudge || '—' : <>{savedEntry?.totalScore ?? '—'}<span className="font-medium text-slate-500">/{maxScorePerJudge || '—'}</span></>}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-[11px] leading-snug text-slate-500" role="status">{message}</p>
    </section>
  )
}
