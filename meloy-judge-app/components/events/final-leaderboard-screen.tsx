"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    ArrowLeft,
    Trophy,
    User,
    Loader2,
    BarChart2
} from "lucide-react"
import { getEvent, getDetailedLeaderboard, getRubric, getTeamScores } from "@/lib/api"
import type { Event, DetailedLeaderboardEntry, RubricCriteria, SummaryJudge } from "@/lib/types/api"
import { useAuthToken } from "@/lib/auth-context"
import { getSummaryJudges, prepareLeaderboard } from "@/lib/judging-summary"
import { FinalLeaderboardRankingsTab } from "./final-leaderboard-rankings-tab"
import { FinalLeaderboardAnalyticsTab } from "./final-leaderboard-analytics-tab"

interface FinalLeaderboardScreenProps {
    eventId: string
    onBack: () => void
    judgeName: string | null
    isAdmin?: boolean
}

export function FinalLeaderboardScreen({ eventId, onBack, judgeName, isAdmin = false }: FinalLeaderboardScreenProps) {
    const [event, setEvent] = useState<Event | null>(null)
    const [leaderboard, setLeaderboard] = useState<DetailedLeaderboardEntry[]>([])
    const [rubric, setRubric] = useState<RubricCriteria[]>([])
    const [judges, setJudges] = useState<SummaryJudge[]>([])
    const { isTokenValid, isValidating } = useAuthToken()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedView, setSelectedView] = useState<'rankings' | 'analytics'>('rankings')

    useEffect(() => {
        if (!isTokenValid || isValidating) return
        let cancelled = false
        async function fetchData() {
            try {
                setLoading(true)
                setError(null)
                const [eventData, leaderboardData, scoresData] = await Promise.all([
                    getEvent(eventId),
                    getDetailedLeaderboard(eventId),
                    getTeamScores(eventId),
                ])
                const rubricData = await getRubric(eventData.event.event_type)
                if (cancelled) return
                setEvent(eventData.event)
                setRubric([...rubricData.criteria].sort((a, b) => a.display_order - b.display_order))
                setJudges(getSummaryJudges(leaderboardData.leaderboard, scoresData.judges))
                setLeaderboard(prepareLeaderboard(leaderboardData.leaderboard, rubricData.criteria))
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load leaderboard data')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        fetchData()
        return () => { cancelled = true }
    }, [eventId, isTokenValid, isValidating])

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
                    <p className="text-lg text-slate-600">Loading deliberation data...</p>
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

    return (
        <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-primary/5">
            <header className="relative overflow-hidden border-b bg-linear-to-b from-primary to-[#3d0000] shadow-xl backdrop-blur-sm">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30" />
                <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-3 sm:py-4 lg:px-8">
                    <div className="flex items-center justify-between gap-2 sm:gap-4">
                        <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 shrink-0">
                            <Button
                                variant="ghost"
                                onClick={onBack}
                                className="flex h-12 w-12 lg:h-14 lg:w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 text-white shadow-lg backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/20"
                            >
                                <ArrowLeft className="h-6 w-6 lg:h-7 lg:w-7" />
                            </Button>
                            <div className="flex h-14 sm:h-16 lg:h-20 xl:h-20 w-auto shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 px-2 sm:px-3 py-2 shadow-md backdrop-blur-md">
                                <Image src="/meloyprogram.png" alt="Meloy Program" width={160} height={64} className="h-10 sm:h-12 lg:h-14 xl:h-16 w-auto object-contain" />
                            </div>
                        </div>

                        <div className="hidden md:flex flex-col items-center flex-1 min-w-0 px-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60 mb-1">Summary Screen</p>
                            <h1 className="text-xl lg:text-2xl xl:text-3xl font-semibold text-white leading-tight text-center truncate w-full">{event.name}</h1>
                        </div>

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

                    <div className="md:hidden text-center mt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/60">Summary Screen</p>
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
                                <div className="relative border-t border-white/10">
                                    <div className="absolute inset-0 bg-black/15 backdrop-blur-sm" />
                                    <div className="relative flex items-center justify-center gap-2.5 py-2 sm:py-2.5">
                                        <span className="relative flex h-2 w-2">
                                            <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
                                        </span>
                                        <span className="text-[11px] sm:text-xs font-medium uppercase tracking-[0.15em]" style={{ color: `${sponsor.textColor}DD` }}>Judging Complete</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* View Toggle */}
                    <Tabs value={selectedView} onValueChange={(v) => setSelectedView(v as any)} className="w-full">
                        <TabsList className="grid h-16 w-full grid-cols-2 rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-lg backdrop-blur">
                            <TabsTrigger
                                value="rankings"
                                className="flex h-full items-center justify-center rounded-xl border border-transparent text-base font-semibold text-slate-600 transition-all duration-300 data-[state=active]:border-primary/30 data-[state=active]:bg-linear-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-md"
                            >
                                <Trophy className="mr-2 h-5 w-5" />
                                Rankings
                            </TabsTrigger>
                            <TabsTrigger
                                value="analytics"
                                className="flex h-full items-center justify-center rounded-xl border border-transparent text-base font-semibold text-slate-600 transition-all duration-300 data-[state=active]:border-primary/30 data-[state=active]:bg-linear-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-md"
                            >
                                <BarChart2 className="mr-2 h-5 w-5" />
                                Analytics
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="rankings" className="mt-6">
                            <FinalLeaderboardRankingsTab leaderboard={leaderboard} rubric={rubric} judges={judges} eventType={event.event_type} />
                        </TabsContent>

                        <TabsContent value="analytics" className="mt-6">
                            <FinalLeaderboardAnalyticsTab leaderboard={leaderboard} rubric={rubric} judges={judges} eventType={event.event_type} />
                        </TabsContent>
                    </Tabs>
                </div>
            </main>
        </div>
    )
}
