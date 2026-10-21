"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, MessageSquare, TrendingUp, Users, Clock, Megaphone, BadgeDollarSign, Presentation, Sparkles, User, Loader2, Target, Lightbulb } from "lucide-react"
import { getEvent, getMyProgress, getRubric } from "@/lib/api"
import type { Event, JudgeScoringHistoryEntry, RubricCriteria } from "@/lib/types/api"
import { useAuthToken } from "@/lib/auth-context"
import { getScoringLimits, getScorePercentage } from "@/lib/event-judging"
import { getProgressCriterion } from "@/lib/judging-summary"

/** Format an ISO timestamp into the user's local time */
function formatJudgedTime(isoString: string): string {
    try {
        const date = new Date(isoString)
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        })
    } catch {
        return 'Unknown'
    }
}

interface JudgeProgressScreenProps {
    eventId: string
    judgeId: string | null
    onBack: () => void
    judgeName: string | null
    isAdmin?: boolean
}

const criterionIcons: Record<string, typeof Target> = {
    communication: Megaphone,
    funding: BadgeDollarSign,
    presentation: Presentation,
    cohesion: Sparkles,
    problem: Target,
    customer: Users,
    willingness: BadgeDollarSign,
    market: TrendingUp,
    solutions: Lightbulb,
    overall: Sparkles,
}

export function JudgeProgressScreen({ eventId, judgeId, onBack, judgeName, isAdmin = false }: JudgeProgressScreenProps) {
    const [event, setEvent] = useState<Event | null>(null)
    const [judgeScores, setJudgeScores] = useState<JudgeScoringHistoryEntry[]>([])
    const [rubric, setRubric] = useState<RubricCriteria[]>([])
    const { isTokenValid, isValidating } = useAuthToken()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isTokenValid || isValidating) return
        let cancelled = false
        async function fetchData() {
            try {
                setLoading(true)
                setError(null)
                
                const [eventData, progressData] = await Promise.all([
                    getEvent(eventId),
                    judgeId ? getMyProgress(eventId, judgeId) : Promise.resolve([]),
                ])
                const rubricData = await getRubric(eventData.event.event_type)
                if (cancelled) return
                setEvent(eventData.event)
                setRubric([...rubricData.criteria].sort((a, b) => a.display_order - b.display_order))
                // API returns only completed submissions, use directly
                const completedScores = Array.isArray(progressData) ? progressData : []
                setJudgeScores(completedScores)
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load judge progress data')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        fetchData()
        return () => { cancelled = true }
    }, [eventId, judgeId, isTokenValid, isValidating])

    // Get sponsor data with fallback logic
    const getSponsorData = () => {
        return event?.sponsor_id && event.sponsor ? {
            name: event.sponsor.name ?? "Meloy Program",
            logo: event.sponsor.logo_url ?? "/meloyprogrammaroon.png",
            textColor: event.sponsor.text_color ?? "#FFFFFF",
            primaryColor: event.sponsor.primary_color ?? "#500000",
            secondaryColor: event.sponsor.secondary_color ?? "#1f0000"
        } : {
            name: "Meloy Program",
            logo: "/meloyprogrammaroon.png",
            textColor: "#FFFFFF",
            primaryColor: "#500000",
            secondaryColor: "#1f0000"
        }
    }

    const sponsor = getSponsorData()

    // Loading state
    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-white to-primary/5">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-lg text-slate-600">Loading your progress...</p>
                </div>
            </div>
        )
    }

    // Error state
    if (error || !event) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-white to-primary/5">
                <div className="text-center">
                    <p className="text-lg text-red-600 mb-4">{error || 'Event not found'}</p>
                    <Button onClick={onBack}>Go Back</Button>
                </div>
            </div>
        )
    }

    // Safe calculations after loading/error checks
    const participantLabel = event.event_type === 'problems-worth-solving' ? 'Student' : 'Team'
    const participantsLabel = event.event_type === 'problems-worth-solving' ? 'Students' : 'Teams'
    const { maxScorePerJudge } = getScoringLimits(rubric, 1)
    return (
        <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-primary/5">
            <header className="relative overflow-hidden border-b bg-linear-to-b from-primary to-[#3d0000] shadow-xl backdrop-blur-sm">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30" />
                <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-3 sm:py-4 lg:px-8">
                    {/* Main Header Row */}
                    <div className="flex items-center justify-between gap-2 sm:gap-4">
                        {/* Left: Back + Logo */}
                        <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 shrink-0">
                            <Button
                                variant="ghost"
                                onClick={onBack}
                                className="flex h-12 w-12 lg:h-14 lg:w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 text-white shadow-lg backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/20"
                                aria-label="Back to dashboard"
                            >
                                <ArrowLeft className="h-6 w-6 lg:h-7 lg:w-7" />
                            </Button>
                            <div className="flex h-14 sm:h-16 lg:h-20 xl:h-20 w-auto shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 px-2 sm:px-3 py-2 shadow-md backdrop-blur-md">
                                <Image src="/meloyprogram.png" alt="Meloy Program Judging Portal" width={160} height={64} className="h-10 sm:h-12 lg:h-14 xl:h-16 w-auto object-contain" />
                            </div>
                        </div>

                        {/* Center: Title (hidden on mobile) */}
                        <div className="hidden md:flex flex-col items-center flex-1 min-w-0 px-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60 mb-1">My Progress</p>
                            <h1 className="text-xl lg:text-2xl xl:text-3xl font-semibold text-white leading-tight text-center truncate w-full">{event.name}</h1>
                        </div>

                        {/* Right: User Profile */}
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            <div className="flex items-center gap-2 sm:gap-3 rounded-full border-2 border-white/30 bg-white/10 px-2.5 sm:px-4 py-1.5 sm:py-2 shadow-lg backdrop-blur-sm">
                                <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full border-2 border-white/50 bg-white/20">
                                    <User className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs sm:text-sm font-semibold text-white leading-tight">{judgeName || "User"}</span>
                                    <span className="text-[10px] sm:text-xs text-white/70">{isAdmin ? "Admin" : "Judge"}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Mobile Title Row */}
                    <div className="md:hidden text-center mt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/60">My Progress</p>
                        <h1 className="text-lg font-semibold text-white leading-tight truncate">{event.name}</h1>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
                <div className="space-y-6">
                    {/* Sponsor Card */}
                    {sponsor && (
                        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border-2 border-red-950 shadow-xl">
                            <div
                                className="relative rounded-[14px] sm:rounded-[22px]"
                                style={{
                                    background: `linear-gradient(to bottom, ${sponsor.primaryColor}, ${sponsor.secondaryColor})`
                                }}
                            >
                                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAyIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20 rounded-[14px] sm:rounded-[22px]" />
                                {/* Sponsor content */}
                                <div className="relative flex items-center justify-center py-3 px-4 sm:py-4 sm:px-5 lg:py-5 lg:px-6">
                                    <div className="group flex items-center gap-3 sm:gap-4 lg:gap-5">
                                        <div className="relative flex shrink-0 items-center justify-center rounded-xl lg:rounded-2xl py-2 px-4 sm:py-3 sm:px-5 lg:py-3 lg:px-6 xl:py-4 xl:px-8 shadow-xl backdrop-blur-xl bg-white/70 border-2 border-white/80">
                                            <Image src={sponsor.logo} alt={sponsor.name} width={120} height={60} className="relative h-8 sm:h-10 lg:h-14 xl:h-16 w-auto max-w-[100px] sm:max-w-[130px] lg:max-w-[180px] object-contain" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] sm:text-xs uppercase tracking-[0.12em]" style={{ color: `${sponsor.textColor}CC` }}>Presented by</p>
                                            <p className="text-base sm:text-lg lg:text-xl xl:text-2xl font-semibold leading-tight" style={{ color: sponsor.textColor }}>{sponsor.name}</p>
                                        </div>
                                    </div>
                                </div>
                                {/* Status strip */}
                                <div className="relative border-t border-white/10">
                                    <div className="absolute inset-0 bg-black/15 backdrop-blur-sm" />
                                    <div className="relative flex items-center justify-center gap-2.5 py-2 sm:py-2.5">
                                        <span className="relative flex h-2 w-2">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                                        </span>
                                        <span className="text-[11px] sm:text-xs font-medium uppercase tracking-[0.15em]" style={{ color: `${sponsor.textColor}DD` }}>Judging in Progress</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Section Header */}
                    <div className="pt-2">
                        <h2 className="text-[1.9rem] font-semibold text-slate-900">Your Scoring History</h2>
                        <p className="mt-2 text-base text-slate-500">
                            Review all {participantsLabel.toLowerCase()} you&apos;ve evaluated with detailed rubric breakdowns and your reflections.
                        </p>
                    </div>

                    {judgeScores.length > 0 ? (
                        <div className="space-y-6">
                            {judgeScores.map((team, index) => (
                                <Card key={index} className="relative overflow-hidden rounded-[28px] border-2 border-primary/25 bg-white/95 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-xl hover:border-primary/40">

                                    <CardHeader className="flex flex-col gap-5 p-7 pb-5">
                                        <div className="flex flex-wrap items-start justify-between gap-5">
                                            <div className="flex flex-1 items-start gap-4">
                                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-[#3d0000] text-white font-bold text-2xl shadow-lg">
                                                    {index + 1}
                                                </div>
                                                <div className="space-y-1.5">
                                                    <CardTitle className="text-[1.5rem] font-semibold text-slate-900">{team.teamName || participantLabel + ' ' + (index + 1)}</CardTitle>
                                                    <CardDescription className="text-lg text-slate-600">{team.projectTitle || 'No description'}</CardDescription>
                                                    <div className="flex items-center gap-2 mt-2 text-sm text-slate-500">
                                                        <Clock className="h-4 w-4" />
                                                        <span>Judged {team.judgedAt ? formatJudgedTime(team.judgedAt) : 'recently'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <Badge className="rounded-full bg-primary/10 px-5 py-3 text-lg font-semibold text-primary shadow-sm">
                                                {team.totalScore ?? 0}/{maxScorePerJudge || '—'}
                                            </Badge>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="space-y-6 px-7 pb-7">
                                        {/* Score Breakdown Grid */}
                                        <div className="grid gap-5 md:grid-cols-2">
                                            {rubric.map((category) => {
                                                const { score, reflection } = getProgressCriterion(team, category)
                                                const percentage = getScorePercentage(score ?? 0, category.max_score)
                                                const Icon = criterionIcons[category.short_name.toLowerCase()] || Target

                                                return (
                                                    <div key={category.id} className="space-y-4 rounded-[22px] border border-slate-200/70 bg-slate-50/70 px-5 py-4">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex items-start gap-3 flex-1">
                                                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary/20 to-primary/10">
                                                                    <Icon className="h-6 w-6 text-primary" />
                                                                </span>
                                                                <div className="space-y-1 flex-1 min-w-0">
                                                                    <p className="text-base font-semibold text-slate-900">{category.name}</p>
                                                                    <p className="text-sm text-slate-600">{category.description}</p>
                                                                </div>
                                                            </div>
                                                            <Badge className="shrink-0 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white">
                                                                {score ?? '—'}/{category.max_score}
                                                            </Badge>
                                                        </div>
                                                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                                                            <div
                                                                className="h-full rounded-full bg-primary transition-all"
                                                                style={{ width: `${percentage}%` }}
                                                            />
                                                        </div>

                                                        {/* Individual reflection for this category */}
                                                        {reflection && (
                                                            <div className="pt-2 border-t border-slate-200">
                                                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-2">Your Notes</p>
                                                                <p className="text-sm text-slate-700 leading-relaxed">{reflection}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        {/* Additional Comments Section */}
                                        {team.comments && (
                                            <div className="rounded-[22px] border-2 border-slate-200/70 bg-white px-5 py-4">
                                                <h3 className="text-base font-semibold text-slate-900 mb-3 flex items-center gap-2">
                                                    <MessageSquare className="h-5 w-5 text-primary" />
                                                    Additional Comments
                                                </h3>
                                                <p className="text-base text-slate-700 leading-relaxed">{team.comments}</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <Card className="rounded-[28px] border border-slate-200/70 bg-white/95 shadow-lg">
                            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                                <MessageSquare className="h-16 w-16 text-slate-300" />
                                <CardTitle className="text-xl font-semibold text-slate-700">{judgeId ? `No ${participantsLabel} Judged Yet` : 'No Judge Profile Selected'}</CardTitle>
                                <CardDescription className="text-base text-slate-500">
                                    {judgeId ? `${participantsLabel} will appear here as you submit your scores.` : 'Return to the event and select a judge profile to view its scoring history.'}
                                </CardDescription>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </main>
        </div>
    )
}
