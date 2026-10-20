"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  StopCircle,
  Users,
  BarChart3,
  User,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Trophy,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { getEvent, getRubric, getTeamScores, updateTeamStatus, updateEventPhase, getEventAwards, assignTop3Awards, updateTeamPresentationOrder } from "@/lib/api"
import type { Event, RubricCriteria } from "@/lib/types/api"
import { useAuthToken } from "@/lib/auth-context"
import { getScoringLimits, getScorePercentage } from "@/lib/event-judging"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ModeratorScreenProps {
  eventId: string
  onBack: () => void
  userName?: string | null
}

type TeamStatus = "waiting" | "active" | "completed"

interface Judge {
  id: string
  name: string
  isOnline: boolean
}

interface TeamScore {
  judgeId: string
  judgeName: string
  score: number | null
}

interface Team {
  id: string
  name: string
  projectTitle: string
  status: TeamStatus
  order: number | null
  scores: TeamScore[]
}

export function ModeratorScreen({ eventId, onBack, userName }: ModeratorScreenProps) {
  const [teams, setTeams] = useState<Team[]>([])
  const [judges, setJudges] = useState<Judge[]>([])
  const [event, setEvent] = useState<Event | null>(null)
  const [criteria, setCriteria] = useState<RubricCriteria[]>([])
  const { isTokenValid, isValidating } = useAuthToken()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [eventStatus, setEventStatus] = useState<"not-started" | "in-progress" | "ended">("in-progress")
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [showLeftScroll, setShowLeftScroll] = useState(false)
  const [showRightScroll, setShowRightScroll] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  
  // Awards state
  const [firstPlace, setFirstPlace] = useState<string>("")
  const [secondPlace, setSecondPlace] = useState<string>("")
  const [thirdPlace, setThirdPlace] = useState<string>("")
  const [isSavingAwards, setIsSavingAwards] = useState(false)
  const [awardsMessage, setAwardsMessage] = useState<string | null>(null)

  // Handle scroll indicators
  useEffect(() => {
    const checkScroll = () => {
      const container = scrollContainerRef.current
      if (!container) return

      const { scrollLeft, scrollWidth, clientWidth } = container
      const isAtStart = scrollLeft <= 5
      const isAtEnd = scrollLeft + clientWidth >= scrollWidth - 5

      setShowLeftScroll(!isAtStart)
      setShowRightScroll(!isAtEnd)
    }

    const container = scrollContainerRef.current
    if (container) {
      // Check initially
      checkScroll()
      
      // Add scroll listener
      container.addEventListener('scroll', checkScroll)
      
      // Check on window resize
      window.addEventListener('resize', checkScroll)
      
      return () => {
        container.removeEventListener('scroll', checkScroll)
        window.removeEventListener('resize', checkScroll)
      }
    }
  }, [teams])

  // Refresh event data through the authenticated API.
  useEffect(() => {
    if (!isTokenValid || isValidating) return
    let cancelled = false
    let fetching = false

    async function fetchData() {
      if (fetching) return
      fetching = true
      try {
        // Only show loading spinner on initial load, not on background refreshes
        if (isInitialLoad) {
          setLoading(true)
        } else {
          setIsRefreshing(true)
        }
        setError(null)
        const [eventData, scoresData] = await Promise.all([
          getEvent(eventId),
          getTeamScores(eventId)
        ])
        const rubricData = await getRubric(eventData.event.event_type)
        if (cancelled) return
        setEvent(eventData.event)
        setCriteria(rubricData.criteria)
        
        // PWS follows the presentation queue; Aggies Invent stays alphabetical.
        const isPWS = eventData.event?.event_type?.includes('problems-worth-solving') ?? false
        const sortedTeams = scoresData.teams
          .map((t: any) => ({
            ...t,
            status: t.status as TeamStatus
          }))
          .sort((a: any, b: any) => {
            if (isPWS) {
              // Sort PWS teams by presentation_order; unassigned teams go last
              const aOrder = a.order ?? 9999
              const bOrder = b.order ?? 9999
              if (aOrder !== bOrder) return aOrder - bOrder
            }
            return a.name.localeCompare(b.name)
          })
        
        setTeams(sortedTeams)
        setJudges(scoresData.judges)
        const phase = eventData.event.judging_phase || 'in-progress'
        setEventStatus(phase as 'not-started' | 'in-progress' | 'ended')
        setLastUpdate(new Date())
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load moderator data')
      } finally {
        fetching = false
        if (!cancelled) {
          if (isInitialLoad) {
            setLoading(false)
            setIsInitialLoad(false)
          }
          setIsRefreshing(false)
        }
      }
    }
    fetchData()

    // Real-time auto-refresh every 5 seconds to keep scores and judge status up-to-date
    // Uses silent background updates with visual indicator
    const intervalId = setInterval(fetchData, 5000)

    // Cleanup on unmount
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [eventId, isInitialLoad, isTokenValid, isValidating])

  // Fetch awards when judging ends
  useEffect(() => {
    async function fetchAwards() {
      if (eventStatus === 'ended') {
        try {
          const { awards } = await getEventAwards(eventId)
          const first = awards.find(a => a.award_type === 'first_place')
          const second = awards.find(a => a.award_type === 'second_place')
          const third = awards.find(a => a.award_type === 'third_place')
          
          setFirstPlace(first?.team_id || '')
          setSecondPlace(second?.team_id || '')
          setThirdPlace(third?.team_id || '')
        } catch (err) {
          console.error('Failed to fetch awards:', err)
        }
      }
    }
    fetchAwards()
  }, [eventId, eventStatus])

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

  const teamsCompleted = teams.filter((t) => t.status === "completed").length
  const teamsActive = teams.filter((t) => t.status === "active").length
  const teamsWaiting = teams.filter((t) => t.status === "waiting").length
  const completionPercent = teams.length > 0 ? Math.round((teamsCompleted / teams.length) * 100) : 0
  const { maxScorePerJudge, maxScorePerTeam } = getScoringLimits(criteria, judges.length)

  // Check if all teams are completed
  const allTeamsCompleted = teams.length > 0 && teams.every(team => team.status === "completed")

  const isPWSEvent = event?.event_type?.includes('problems-worth-solving') ?? false

  const handlePresentationOrderChange = async (teamId: string, newOrder: number) => {
    try {
      await updateTeamPresentationOrder(teamId, newOrder)
      // Optimistically update local state — mirror the swap logic from the backend
      setTeams(prev => {
        const targetTeam = prev.find(t => t.id === teamId)
        const oldOrder = targetTeam?.order ?? null
        const updated = prev.map(t => {
          if (t.id === teamId) return { ...t, order: newOrder }
          // If another team held that position, give it the displaced team's old order
          if (t.order === newOrder) return { ...t, order: oldOrder }
          return t
        })
        return updated.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      })
    } catch (err) {
      console.error('Failed to update presentation order:', err)
    }
  }

  const handleStatusChange = async (teamId: string, newStatus: TeamStatus) => {
    try {
      await updateTeamStatus(teamId, newStatus)
      setTeams(teams.map(team => team.id === teamId ? { ...team, status: newStatus } : team))
    } catch (err) {
      console.error('Failed to update team status:', err)
      // Optionally show error to user
    }
  }

  const handleEndJudging = async () => {
    try {
      await updateEventPhase(eventId, 'ended')
      setEventStatus("ended")
    } catch (err) {
      console.error('Failed to end judging:', err)
      // Optionally show error to user
    }
  }

  const handleSubmitAwards = async () => {
    // Determine which places are required based on team count
    const requiredPlaces = Math.min(teams.length, 3);
    
    if (!firstPlace) {
      setAwardsMessage('Please select first place')
      return
    }

    if (requiredPlaces >= 2 && !secondPlace) {
      setAwardsMessage('Please select second place')
      return
    }

    if (requiredPlaces >= 3 && !thirdPlace) {
      setAwardsMessage('Please select third place')
      return
    }

    // Check for duplicates among selected places
    const selectedPlaces = [firstPlace, secondPlace, thirdPlace].filter(Boolean);
    const uniquePlaces = new Set(selectedPlaces);
    if (uniquePlaces.size !== selectedPlaces.length) {
      setAwardsMessage('Each place must be a different team')
      return
    }

    try {
      setIsSavingAwards(true)
      setAwardsMessage(null)
      await assignTop3Awards(eventId, firstPlace, secondPlace || '', thirdPlace || '')
      setAwardsMessage('Awards saved successfully!')
      setTimeout(() => setAwardsMessage(null), 3000)
    } catch (err) {
      console.error('Failed to assign awards:', err)
      setAwardsMessage('Failed to save awards. Please try again.')
    } finally {
      setIsSavingAwards(false)
    }
  }

  const getTeamTotal = (team: Team) => {
    return team.scores.reduce((sum, score) => sum + (score.score || 0), 0)
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-white to-primary/5">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-lg text-slate-600">Loading moderator dashboard...</p>
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
    <div className="flex min-h-screen flex-col bg-linear-to-br from-slate-50 via-white to-primary/5">
      <div className="w-full z-30 relative bg-linear-to-b from-primary to-[#3d0000]">
        <div className="mx-auto max-w-7xl px-6 py-4 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4 lg:gap-6">
            <div className="flex items-center gap-4 lg:gap-5">
              <Button
                variant="ghost"
                onClick={onBack}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 text-white backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/20"
              >
                <ArrowLeft className="h-7 w-7" />
              </Button>
              <div className="flex h-16 lg:h-20 w-auto items-center justify-center rounded-xl border border-white/25 bg-white/15 px-3 py-2 backdrop-blur-md">
                <Image src="/meloyprogram.png" alt="Meloy Program Judging Portal" width={160} height={64} className="h-12 lg:h-16 w-auto object-contain" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-semibold text-white leading-tight">Moderator Screen</h1>
                <p className="text-sm text-white/85">{event.name} - Live Control</p>
              </div>
            </div>

            {/* User Profile */}
            <div className="hidden sm:flex items-center gap-3 rounded-full border-2 border-white/30 bg-white/10 px-4 py-2 shadow-lg backdrop-blur-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/50 bg-white/20">
                <User className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white leading-tight">{userName || "Admin"}</span>
                <span className="text-xs text-white/70">Admin</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1">
        <div className="mx-auto max-w-7xl px-6 py-5 lg:py-6 lg:px-8">
          {/* Company/Sponsor Card with Event Phase */}
          {sponsor && (
            <div className="relative mb-6 overflow-hidden rounded-2xl sm:rounded-3xl border-2 border-red-950 shadow-xl">
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
                    {eventStatus === 'ended' ? (
                      <>
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-400" />
                        </span>
                        <span className="text-[11px] sm:text-xs font-medium uppercase tracking-[0.15em] text-white/80">Judging Ended</span>
                      </>
                    ) : (
                      <>
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                        </span>
                        <span className="text-[11px] sm:text-xs font-medium uppercase tracking-[0.15em] text-white/80">Judging in Progress</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Team Queue - Horizontal Layout */}
          <Card className="relative mb-6 overflow-hidden rounded-[28px] border-2 border-primary/25 bg-white/95 shadow-lg">
            <CardHeader className="px-6 pt-5 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-primary/20 to-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl font-semibold text-slate-900">Team Queue</CardTitle>
                  <CardDescription className="text-base text-slate-600">
                    Control judging flow and team status • {teamsCompleted}/{teams.length} completed ({completionPercent}%)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5 pt-2">
              <div className="relative">
                {/* Left scroll indicator */}
                <div 
                  className={`absolute left-0 top-0 bottom-0 w-20 pointer-events-none z-10 flex items-center justify-start transition-opacity duration-300 ${
                    showLeftScroll ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <div className="absolute inset-0 bg-linear-to-r from-white/95 to-transparent" />
                  <ChevronLeft className="relative h-8 w-8 text-slate-400 ml-2" />
                </div>

                {/* Right scroll indicator */}
                <div 
                  className={`absolute right-0 top-0 bottom-0 w-20 pointer-events-none z-10 flex items-center justify-end transition-opacity duration-300 ${
                    showRightScroll ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <div className="absolute inset-0 bg-linear-to-l from-white/95 to-transparent" />
                  <ChevronRight className="relative h-8 w-8 text-slate-400 mr-2" />
                </div>
                
                {/* Scrollable container - proper padding to prevent cutoff */}
                <div 
                  ref={scrollContainerRef}
                  className="flex gap-4 overflow-x-auto pb-1 pt-1 px-1 scroll-smooth"
                  style={{ 
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    WebkitOverflowScrolling: 'touch'
                  }}
                >
                  <style jsx>{`
                    div::-webkit-scrollbar {
                      display: none;
                    }
                  `}</style>
                {teams.map((team) => {
                  const isCompleted = team.status === "completed"
                  const isActive = team.status === "active"
                  const isWaiting = team.status === "waiting"

                  return (
                    <div
                      key={team.id}
                      className="group relative shrink-0 w-[320px] overflow-visible rounded-[20px] border-2 border-primary/20 bg-linear-to-br from-primary/5 to-white p-5 transition-all hover:-translate-y-1 hover:shadow-xl hover:border-primary/30"
                    >
                      {/* Team info */}
                      <div className="flex flex-col items-center text-center mb-4">
                        <h4 className="font-bold text-lg text-slate-900">{team.name}</h4>
                        <p className="text-sm text-slate-600">{team.projectTitle}</p>
                      </div>

                      {/* Presentation Order - PWS events only */}
                      {isPWSEvent && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 text-center">
                            Presentation Order
                          </p>
                          <Select
                            value={team.order ? String(team.order) : ""}
                            onValueChange={(val) => handlePresentationOrderChange(team.id, Number(val))}
                            disabled={eventStatus === "ended"}
                          >
                            <SelectTrigger className="h-10 rounded-xl border-2 border-primary/20 text-sm font-medium disabled:opacity-50">
                              <SelectValue placeholder="Assign position…" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: teams.length }, (_, i) => i + 1).map((pos) => {
                                const takenBy = teams.find(t => t.order === pos && t.id !== team.id)
                                return (
                                  <SelectItem key={pos} value={String(pos)}>
                                    Position {pos}{takenBy ? ` ↔ swap with ${takenBy.name}` : ""}
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Status controls */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={isWaiting ? "default" : "outline"}
                          onClick={() => handleStatusChange(team.id, "waiting")}
                          disabled={eventStatus === "ended"}
                          className={`h-10 flex-1 rounded-xl text-sm font-bold shadow-sm transition-all ${isWaiting
                            ? "bg-amber-500 hover:bg-amber-600 text-white border-0 shadow-amber-200"
                            : "border-2 border-primary/20 text-slate-700 hover:bg-primary/5 hover:border-primary/30"
                            } ${eventStatus === "ended" ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          Wait
                        </Button>
                        <Button
                          size="sm"
                          variant={isActive ? "default" : "outline"}
                          onClick={() => handleStatusChange(team.id, "active")}
                          disabled={eventStatus === "ended"}
                          className={`h-10 flex-1 rounded-xl text-sm font-bold shadow-sm transition-all ${isActive
                            ? "bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-sky-200"
                            : "border-2 border-primary/20 text-slate-700 hover:bg-primary/5 hover:border-primary/30"
                            } ${eventStatus === "ended" ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          Active
                        </Button>
                        <Button
                          size="sm"
                          variant={isCompleted ? "default" : "outline"}
                          onClick={() => handleStatusChange(team.id, "completed")}
                          disabled={eventStatus === "ended"}
                          className={`h-10 flex-1 rounded-xl text-sm font-bold shadow-sm transition-all ${isCompleted
                            ? "bg-emerald-500 hover:bg-emerald-600 text-white border-0 shadow-emerald-200"
                            : "border-2 border-primary/20 text-slate-700 hover:bg-primary/5 hover:border-primary/30"
                            } ${eventStatus === "ended" ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  )
                })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Scoring - Full Width */}
          <Card className="relative mb-6 overflow-hidden rounded-[28px] border-2 border-primary/25 bg-white/95 shadow-lg">
            <CardHeader className="p-6 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-primary/20 to-primary/10">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-semibold text-slate-900">Live Scoring</CardTitle>
                    <CardDescription className="text-base text-slate-600">
                      {maxScorePerJudge > 0
                        ? judges.length > 0
                          ? `${judges.length} ${judges.length === 1 ? 'judge' : 'judges'} × ${maxScorePerJudge} points per judge (max ${maxScorePerTeam} points per team)`
                          : `No judges assigned · ${maxScorePerJudge} points per judge`
                        : 'No rubric configured for this event'}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${isRefreshing ? 'bg-sky-500 animate-pulse' : 'bg-emerald-500'}`} />
                  <span className="text-xs text-slate-500">
                    {isRefreshing ? 'Updating...' : 'Live'}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              <div className="rounded-xl border border-primary/20 bg-white overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-white border-b border-primary/20">
                      <th className="bg-linear-to-br from-primary to-[#3d0000] px-4 py-3 text-left w-[200px] border-r border-white/20">
                        <p className="text-xs font-semibold text-white">Team</p>
                      </th>
                      {judges.map((judge) => (
                        <th key={judge.id} className="bg-linear-to-br from-primary to-[#3d0000] px-3 py-3 border-r border-white/20">
                          <p className="text-xs font-semibold text-white text-center">{judge.name}</p>
                          <div className="mt-1 flex justify-center">
                            <div className={`h-2 w-2 rounded-full transition-colors ${judge.isOnline ? "bg-emerald-400" : "bg-slate-300"}`} />
                          </div>
                        </th>
                      ))}
                      <th className="bg-linear-to-br from-primary to-[#3d0000] px-3 py-3 w-[100px] border-r border-white/20">
                        <p className="text-xs font-semibold text-white text-center">Total</p>
                      </th>
                      <th className="bg-linear-to-br from-primary to-[#3d0000] px-3 py-3 w-[80px]">
                        <p className="text-xs font-semibold text-white text-center">%</p>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...teams].sort((a, b) => getTeamTotal(b) - getTeamTotal(a)).map((team, index) => {
                      const total = getTeamTotal(team)
                      const percentage = Math.round(getScorePercentage(total, maxScorePerTeam))
                      return (
                        <tr key={team.id} className="bg-primary/5 hover:bg-primary/10 transition-all duration-300 border-b border-primary/10 last:border-0">
                          <td className="bg-white px-4 py-3 border-r border-primary/10">
                            <div className="flex items-center gap-2">
                              <Badge
                                className={`h-6 w-6 rounded-lg p-0 flex items-center justify-center text-xs font-bold shrink-0 ${team.status === "completed"
                                  ? "bg-emerald-500 text-white"
                                  : team.status === "active"
                                    ? "bg-sky-500 text-white"
                                    : "bg-amber-500 text-white"
                                  }`}
                              >
                                {index + 1}
                              </Badge>
                              <p className="font-medium text-slate-900 text-sm">{team.name}</p>
                            </div>
                          </td>
                          {team.scores.map((score) => (
                            <td key={score.judgeId} className="bg-white px-3 py-3 border-r border-primary/10 transition-all duration-500">
                              <div className="flex flex-col items-center">
                                {score.score !== null ? (
                                  <>
                                    <span className="text-base font-bold text-slate-900">{score.score}</span>
                                    <span className="text-xs text-slate-500">/{maxScorePerJudge || '—'}</span>
                                    <div className="mt-1.5 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden max-w-[80px]">
                                      <div
                                        className="h-full rounded-full bg-linear-to-r from-primary to-[#3d0000] transition-all duration-500"
                                        style={{ width: `${getScorePercentage(score.score, maxScorePerJudge)}%` }}
                                      />
                                    </div>
                                  </>
                                ) : (
                                  <span className="inline-flex h-8 w-12 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400">
                                    —
                                  </span>
                                )}
                              </div>
                            </td>
                          ))}
                          <td className="bg-white px-3 py-3 border-r border-primary/10 transition-all duration-500">
                            <div className="text-center">
                              <span className="text-lg font-bold text-slate-900">{total}</span>
                              <br />
                              <span className="text-xs text-slate-500">/{maxScorePerTeam || '—'}</span>
                            </div>
                          </td>
                          <td className="bg-white px-3 py-3 transition-all duration-500">
                            <div className="text-center">
                              <span className="text-base font-semibold text-primary">{maxScorePerTeam > 0 ? `${percentage}%` : '—'}</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Event Control - Full Width */}
          <Card className="relative overflow-hidden rounded-[28px] border-2 border-primary/25 bg-white/95 shadow-lg">
            <CardHeader className="px-6 pt-5 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-primary/20 to-primary/10">
                    <StopCircle className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-semibold text-slate-900">Event Control</CardTitle>
                    <CardDescription className="text-base text-slate-600">
                      {eventStatus === "ended"
                        ? "Judging has ended. Summary available to judges."
                        : allTeamsCompleted
                          ? "All teams completed. Ready to end judging."
                          : "Waiting for all teams to be marked as completed"
                      }
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5 pt-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={eventStatus === "ended" || !allTeamsCompleted}
                    className="h-14 w-full rounded-2xl bg-gradient-to-b from-primary to-[#3d0000] text-base font-bold text-white shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 md:w-auto md:px-10"
                  >
                    <StopCircle className="mr-2 h-5 w-5" />
                    End Judging
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-2xl rounded-3xl border-2 border-slate-200 bg-white/90 backdrop-blur-xl shadow-2xl p-0">
                  <AlertDialogHeader className="p-8 pb-4">
                    <AlertDialogTitle className="text-3xl font-semibold text-slate-900">End Judging?</AlertDialogTitle>
                    <AlertDialogDescription className="mt-4 text-xl text-slate-600 leading-relaxed">
                      Are you sure you want to end the judging phase?
                    </AlertDialogDescription>
                    <div className="mt-4 rounded-xl bg-blue-50 border-2 border-blue-200 p-4">
                      <p className="text-base font-semibold text-blue-700">
                        Note: This action cannot be undone
                      </p>
                      <p className="text-sm text-blue-600 mt-2">
                        Once judging ends, team status controls will be disabled and you can assign the top 3 awards.
                      </p>
                    </div>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-col gap-3 p-8 pt-4 sm:flex-row">
                    <AlertDialogCancel className="h-16 flex-1 rounded-2xl border-2 border-slate-300 text-lg font-semibold text-slate-600 hover:border-primary/40 hover:bg-primary/5">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleEndJudging}
                      className="h-16 flex-1 rounded-2xl bg-primary text-lg font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl"
                    >
                      Yes, End Judging
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          {/* Top 3 Awards - Full Width */}
          <Card className={`relative mt-6 overflow-hidden rounded-[28px] border-2 border-primary/25 shadow-lg transition-all ${
            eventStatus === 'ended' ? 'bg-white/95' : 'bg-white/95 opacity-50'
          }`}>
            <CardHeader className="px-6 pt-5 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-primary/20 to-primary/10">
                    <Trophy className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-semibold text-slate-900">Top 3 Awards</CardTitle>
                    <CardDescription className="text-base text-slate-600">
                      {eventStatus === 'ended' 
                        ? 'Assign official rankings for this event'
                        : 'Available after judging ends'
                      }
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5 pt-2">
              <div className="space-y-3">
                {/* Show message if less than 3 teams */}
                {teams.length < 3 && teams.length > 0 && (
                  <div className="rounded-xl bg-blue-50 border-2 border-blue-200 p-3 text-center text-sm font-medium text-blue-700">
                    {teams.length === 1 
                      ? 'Only 1 team - assign 1st place only'
                      : 'Only 2 teams - assign 1st and 2nd place'
                    }
                  </div>
                )}

                {/* First Place - Always shown if there are teams */}
                {teams.length >= 1 && (
                  <div className="group relative overflow-hidden rounded-2xl border-2 border-primary/20 bg-linear-to-br from-amber-50 to-white p-4 transition-all hover:border-primary/30 hover:shadow-md">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 font-bold text-white shadow-lg">
                        <span className="text-2xl">1st</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1">First Place</p>
                        <Select
                          value={firstPlace}
                          onValueChange={setFirstPlace}
                          disabled={eventStatus !== 'ended'}
                        >
                          <SelectTrigger className="h-11 rounded-xl border-2 border-slate-200 bg-white text-base font-medium hover:border-primary/30 disabled:opacity-50">
                            <SelectValue placeholder="Select team" />
                          </SelectTrigger>
                          <SelectContent>
                            {teams.map((team) => (
                              <SelectItem key={team.id} value={team.id} className="text-base">
                                {team.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Second Place - Only shown if 2+ teams */}
                {teams.length >= 2 && (
                  <div className="group relative overflow-hidden rounded-2xl border-2 border-primary/20 bg-linear-to-br from-slate-50 to-white p-4 transition-all hover:border-primary/30 hover:shadow-md">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-300 to-slate-400 font-bold text-white shadow-lg">
                        <span className="text-2xl">2nd</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Second Place</p>
                        <Select
                          value={secondPlace}
                          onValueChange={setSecondPlace}
                          disabled={eventStatus !== 'ended'}
                        >
                          <SelectTrigger className="h-11 rounded-xl border-2 border-slate-200 bg-white text-base font-medium hover:border-primary/30 disabled:opacity-50">
                            <SelectValue placeholder="Select team" />
                          </SelectTrigger>
                          <SelectContent>
                            {teams.map((team) => (
                              <SelectItem key={team.id} value={team.id} className="text-base">
                                {team.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Third Place - Only shown if 3+ teams */}
                {teams.length >= 3 && (
                  <div className="group relative overflow-hidden rounded-2xl border-2 border-primary/20 bg-linear-to-br from-amber-50/50 to-white p-4 transition-all hover:border-primary/30 hover:shadow-md">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-amber-700 font-bold text-white shadow-lg">
                        <span className="text-2xl">3rd</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 mb-1">Third Place</p>
                        <Select
                          value={thirdPlace}
                          onValueChange={setThirdPlace}
                          disabled={eventStatus !== 'ended'}
                        >
                          <SelectTrigger className="h-11 rounded-xl border-2 border-slate-200 bg-white text-base font-medium hover:border-primary/30 disabled:opacity-50">
                            <SelectValue placeholder="Select team" />
                          </SelectTrigger>
                          <SelectContent>
                            {teams.map((team) => (
                              <SelectItem key={team.id} value={team.id} className="text-base">
                                {team.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {/* No teams message */}
                {teams.length === 0 && (
                  <div className="rounded-xl bg-slate-50 border-2 border-slate-200 p-8 text-center">
                    <p className="text-base text-slate-600">No teams in this event</p>
                  </div>
                )}

                {/* Submit Button */}
                <div className="pt-3">
                  <Button
                    onClick={handleSubmitAwards}
                    disabled={eventStatus !== 'ended' || isSavingAwards}
                    className="h-14 w-full rounded-2xl bg-gradient-to-b from-primary to-[#3d0000] text-base font-bold text-white shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    {isSavingAwards ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Saving Awards...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-5 w-5" />
                        Save Top 3 Rankings
                      </>
                    )}
                  </Button>
                </div>

                {/* Success/Error Message */}
                {awardsMessage && (
                  <div className={`rounded-xl p-4 text-center text-sm font-semibold ${
                    awardsMessage.includes('success') 
                      ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-2 border-red-200'
                  }`}>
                    {awardsMessage}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
