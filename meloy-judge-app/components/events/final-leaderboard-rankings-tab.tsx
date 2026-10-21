"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    ChevronDown,
    ChevronUp,
    AlertCircle,
    CheckCircle,
    Target,
    Activity,
    User
} from "lucide-react"
import type { DetailedLeaderboardEntry, RubricCriteria, SummaryJudge } from "@/lib/types/api"
import { getScoringLimits, getScorePercentage } from "@/lib/event-judging"
import { getConsensusLevel } from "@/lib/judging-summary"

interface RankingsTabProps {
    leaderboard: DetailedLeaderboardEntry[]
    rubric: RubricCriteria[]
    judges: SummaryJudge[]
    eventType: string
}

export function FinalLeaderboardRankingsTab({ leaderboard, rubric, judges: allJudges, eventType }: RankingsTabProps) {
    const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
    const { maxScorePerJudge, maxScorePerTeam } = getScoringLimits(rubric, allJudges.length)
    const participantLabel = eventType === 'problems-worth-solving' ? 'Student' : 'Team'

    const toggleTeamExpanded = (teamId: string) => {
        setExpandedTeams(prev => {
            const newSet = new Set(prev)
            if (newSet.has(teamId)) {
                newSet.delete(teamId)
            } else {
                newSet.add(teamId)
            }
            return newSet
        })
    }

    if (leaderboard.length === 0) {
        return (
            <Card className="rounded-[28px] border border-slate-200/70 bg-white/95 shadow-lg">
                <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <Target className="h-16 w-16 text-slate-300" />
                    <CardTitle className="text-xl font-semibold text-slate-700">No Rankings Yet</CardTitle>
                    <CardDescription className="text-base text-slate-500">
                        Rankings will appear after judging is complete.
                    </CardDescription>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <div className="pt-2">
                <h2 className="text-[2.2rem] font-semibold text-slate-900">{participantLabel} Rankings</h2>
                <p className="mt-2 text-lg text-slate-500">
                    {allJudges.length} {allJudges.length === 1 ? 'judge' : 'judges'} · {maxScorePerJudge} points per judge · {maxScorePerTeam} possible points per {participantLabel.toLowerCase()}
                </p>
            </div>

            {/* Comprehensive Rankings Table */}
            <Card className="relative overflow-hidden rounded-[28px] border-2 border-primary/25 bg-white/95 shadow-lg">
                <CardContent className="p-8">
                    <div className="rounded-xl border border-primary/20 bg-white overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-white border-b border-primary/20">
                                        <th className="bg-linear-to-br from-primary to-[#3d0000] px-6 py-4 text-left w-[80px] border-r border-white/20">
                                            <p className="text-sm font-semibold text-white text-center">Rank</p>
                                        </th>
                                        <th className="bg-linear-to-br from-primary to-[#3d0000] px-6 py-4 text-left min-w-[240px] border-r border-white/20">
                                            <p className="text-sm font-semibold text-white">{participantLabel}</p>
                                        </th>
                                        {allJudges.map((judge) => (
                                            <th key={judge.id} className="bg-linear-to-br from-primary to-[#3d0000] px-5 py-4 border-r border-white/20 min-w-[120px]">
                                                <p className="text-sm font-semibold text-white text-center">{judge.name}</p>
                                            </th>
                                        ))}
                                        <th className="bg-linear-to-br from-primary to-[#3d0000] px-5 py-4 w-[120px] border-r border-white/20">
                                            <p className="text-sm font-semibold text-white text-center">Avg</p>
                                        </th>
                                        <th className="bg-linear-to-br from-primary to-[#3d0000] px-5 py-4 w-[120px] border-r border-white/20">
                                            <p className="text-sm font-semibold text-white text-center">Total</p>
                                        </th>
                                        <th className="bg-linear-to-br from-primary to-[#3d0000] px-5 py-4 w-[160px] border-r border-white/20">
                                            <p className="text-sm font-semibold text-white text-center">Consensus</p>
                                        </th>
                                        <th className="bg-linear-to-br from-primary to-[#3d0000] px-5 py-4 w-[100px]">
                                            <p className="text-sm font-semibold text-white text-center">Details</p>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map((team) => {
                                        const isExpanded = expandedTeams.has(team.team_id)
                                        const consensusLevel = getConsensusLevel(team.score_stddev, maxScorePerJudge, team.judges_scored)

                                        return (
                                            <React.Fragment key={team.team_id}>
                                                <tr className="bg-primary/5 hover:bg-primary/10 transition-all duration-300 border-b border-primary/10">
                                                    <td className="bg-white px-6 py-4 border-r border-primary/10">
                                                        <div className="flex items-center justify-center">
                                                            <div
                                                                className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-base ${team.rank === 1
                                                                    ? "bg-primary text-white shadow-md"
                                                                    : team.rank === 2
                                                                        ? "bg-primary/80 text-white shadow-sm"
                                                                        : team.rank === 3
                                                                            ? "bg-primary/60 text-white shadow-sm"
                                                                            : "bg-slate-100 text-slate-600"
                                                                    }`}
                                                            >
                                                                {team.judges_scored > 0 ? team.rank : '—'}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="bg-white px-6 py-4 border-r border-primary/10">
                                                        <div>
                                                            <p className="font-semibold text-slate-900 text-base">{team.team_name}</p>
                                                            {team.project_title && (
                                                                <p className="text-sm text-slate-500 mt-1">{team.project_title}</p>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {allJudges.map((judge) => {
                                                        const judgeScore = team.judge_scores.find(js => js.judge_id === judge.id)
                                                        return (
                                                            <td key={judge.id} className="bg-white px-5 py-4 border-r border-primary/10">
                                                                <div className="flex flex-col items-center">
                                                                    {judgeScore ? (
                                                                        <>
                                                                            <span className="text-lg font-bold text-slate-900">{judgeScore.total_score}</span>
                                                                            <span className="text-sm text-slate-500">/{maxScorePerJudge || '—'}</span>
                                                                            <div className="mt-2 h-2 w-full bg-slate-200 rounded-full overflow-hidden max-w-[90px]">
                                                                                <div
                                                                                    className="h-full rounded-full bg-linear-to-r from-primary to-[#3d0000] transition-all duration-500"
                                                                                    style={{ width: `${getScorePercentage(judgeScore.total_score, maxScorePerJudge)}%` }}
                                                                                />
                                                                            </div>
                                                                        </>
                                                                    ) : (
                                                                        <span className="inline-flex h-10 w-14 items-center justify-center rounded-lg bg-slate-100 text-base text-slate-400">
                                                                            —
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        )
                                                    })}
                                                    <td className="bg-white px-5 py-4 border-r border-primary/10">
                                                        <div className="text-center">
                                                            <span className="text-xl font-bold text-slate-900">{team.judges_scored > 0 ? team.avg_score.toFixed(1) : '—'}</span>
                                                            <br />
                                                            <span className="text-sm text-slate-500">/{maxScorePerJudge || '—'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="bg-white px-5 py-4 border-r border-primary/10">
                                                        <div className="text-center">
                                                            <Badge className="bg-primary text-white font-bold text-lg px-4 py-1.5">
                                                                {team.judges_scored > 0 ? team.total_score : '—'}/{maxScorePerTeam || '—'}
                                                            </Badge>
                                                            <p className="mt-1 text-xs text-slate-500">{team.judges_scored}/{allJudges.length} judges scored</p>
                                                        </div>
                                                    </td>
                                                    <td className="bg-white px-5 py-4 border-r border-primary/10">
                                                        <div className="flex justify-center">
                                                            <Badge
                                                                className={`text-sm px-3 py-1.5 ${consensusLevel === 'insufficient'
                                                                    ? 'bg-slate-100 text-slate-600'
                                                                    : consensusLevel === 'high'
                                                                    ? 'bg-emerald-100 text-emerald-700'
                                                                    : consensusLevel === 'medium'
                                                                        ? 'bg-blue-100 text-blue-700'
                                                                        : 'bg-amber-100 text-amber-700'
                                                                    }`}
                                                            >
                                                                {consensusLevel === 'insufficient' ? 'Pending' : consensusLevel === 'high' ? (
                                                                    <>
                                                                        <CheckCircle className="h-4 w-4 mr-1 inline" />
                                                                        High
                                                                    </>
                                                                ) : consensusLevel === 'medium' ? (
                                                                    <>
                                                                        <Activity className="h-4 w-4 mr-1 inline" />
                                                                        Moderate
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <AlertCircle className="h-4 w-4 mr-1 inline" />
                                                                        Discuss
                                                                    </>
                                                                )}
                                                            </Badge>
                                                        </div>
                                                    </td>
                                                    <td className="bg-white px-5 py-4">
                                                        <div className="flex justify-center">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => toggleTeamExpanded(team.team_id)}
                                                                className="h-10 w-10 p-0 rounded-lg hover:bg-primary/10"
                                                            >
                                                                {isExpanded ? (
                                                                    <ChevronUp className="h-5 w-5 text-primary" />
                                                                ) : (
                                                                    <ChevronDown className="h-5 w-5 text-primary" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="bg-slate-50">
                                                        <td colSpan={allJudges.length + 6} className="px-4 sm:px-8 py-6">
                                                            <div className="space-y-5">
                                                                <h4 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                                                    <Target className="h-5 w-5 text-primary" />
                                                                    Criteria Breakdown by Judge
                                                                </h4>
                                                                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                                                                    {team.judge_scores.map((judgeScore) => (
                                                                        <div
                                                                            key={judgeScore.judge_id}
                                                                            className="rounded-xl border-2 border-slate-200 bg-white p-5 space-y-4"
                                                                        >
                                                                            <div className="flex items-start justify-between">
                                                                                <div className="flex items-center gap-3">
                                                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                                                                        <User className="h-5 w-5 text-primary" />
                                                                                    </div>
                                                                                    <div>
                                                                                        <p className="font-semibold text-slate-900 text-base">
                                                                                            {judgeScore.judge_name}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                                <Badge className="bg-primary text-white font-bold text-base px-3 py-1.5">
                                                                                    {judgeScore.total_score}/{maxScorePerJudge || '—'}
                                                                                </Badge>
                                                                            </div>

                                                                            <div className="space-y-3 pt-3 border-t border-slate-200">
                                                                                {judgeScore.criteria_scores.map((criteria) => (
                                                                                    <div
                                                                                        key={criteria.criteria_id}
                                                                                        className="flex flex-wrap items-start justify-between gap-2 text-base"
                                                                                    >
                                                                                        <span className="text-slate-600 flex-1 min-w-[150px] mr-3 break-words">
                                                                                            {criteria.criteria_name}
                                                                                        </span>
                                                                                        <div className="flex items-center gap-2">
                                                                                            <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                                                                <div
                                                                                                    className="h-full bg-primary rounded-full"
                                                                                                    style={{
                                                                                                        width: `${getScorePercentage(criteria.score, criteria.max_score)}%`
                                                                                                    }}
                                                                                                />
                                                                                            </div>
                                                                                            <span className="font-semibold text-slate-900 w-14 text-right">
                                                                                                {criteria.score}/{criteria.max_score}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
