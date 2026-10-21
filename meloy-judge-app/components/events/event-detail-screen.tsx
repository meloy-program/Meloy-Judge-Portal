"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Screen } from "@/components/app-shell"
import { ArrowLeft, BarChart3, Users, CheckCircle2, Clock, Circle, MapPin, CalendarDays, Activity, Settings, User, Loader2, Menu, Shield, ExternalLink, ChevronDown, UserCircle2, Printer, Upload } from "lucide-react"
import { getEvent, getEventTeams, getMyProgress, getRubric } from "@/lib/api"
import type { Event, Team, RubricCriteria, JudgeScoringHistoryEntry } from "@/lib/types/api"
import { useAuthToken } from "@/lib/auth-context"
import { sortEventTeams } from "@/lib/event-judging"
import { formatEventDateRange } from "@/lib/event-dates"
import { TeamScorePreview } from "./team-score-preview"

interface ScorePreviewSnapshot {
  eventId: string
  judgeId: string | null
  rubric: RubricCriteria[]
  history: JudgeScoringHistoryEntry[]
  status: 'ready' | 'error'
}

interface EventDetailScreenProps {
  eventId: string
  judgeId: string | null
  onSelectTeam: (teamId: string) => void
  onBack: () => void
  onNavigate: (screen: Screen) => void
  onManageEvent: (eventId: string) => void
  onOpenModerator: () => void
  onOpenCommentSheets?: () => void
  onOpenUploadSheets?: () => void
  isAdmin: boolean
  judgeName: string | null
}

export function EventDetailScreen({ eventId, judgeId, onSelectTeam, onBack, onNavigate, onManageEvent, onOpenModerator, onOpenCommentSheets, onOpenUploadSheets, isAdmin, judgeName }: EventDetailScreenProps) {
  const [event, setEvent] = useState<Event | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedTeam, setExpandedTeam] = useState<Team | null>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [scorePreview, setScorePreview] = useState<ScorePreviewSnapshot | null>(null)
  const rubricCache = useRef<{ eventType: string; criteria: RubricCriteria[] } | null>(null)
  const { isTokenValid, isValidating } = useAuthToken()

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
        const [eventData, teamsData, historyResult] = await Promise.all([
          getEvent(eventId),
          getEventTeams(eventId, { activeOnly: false, judgeId: judgeId || undefined }),
          judgeId && !isAdmin
            ? getMyProgress(eventId, judgeId)
                .then(history => ({ history, failed: false }))
                .catch(() => ({ history: [], failed: true }))
            : Promise.resolve({ history: [], failed: false }),
        ])
        if (cancelled) return
        let previewFailed = historyResult.failed
        let criteria: RubricCriteria[] = []
        try {
          if (rubricCache.current?.eventType === eventData.event.event_type) {
            criteria = rubricCache.current.criteria
          } else {
            const rubricData = await getRubric(eventData.event.event_type)
            criteria = [...rubricData.criteria].sort((a, b) => a.display_order - b.display_order)
            if (!cancelled) rubricCache.current = { eventType: eventData.event.event_type, criteria }
          }
        } catch {
          // An unavailable preview must not prevent judges from opening a card.
          previewFailed = true
        }
        if (cancelled) return
        setEvent(eventData.event)
        setScorePreview({ eventId, judgeId, rubric: criteria, history: historyResult.history, status: previewFailed ? 'error' : 'ready' })
        // For judges: hide teams still in "waiting" status (not yet activated by moderator)
        // Admins see all teams regardless of status
        const filteredTeams = isAdmin
          ? teamsData.teams
          : teamsData.teams.filter(t => t.status !== 'waiting')
        setTeams(filteredTeams)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load event data')
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

    // Real-time auto-refresh every 5 seconds to keep team status up-to-date
    // When moderator changes team status, judges will see updates automatically
    const intervalId = setInterval(fetchData, 5000)

    // Cleanup on unmount
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [eventId, judgeId, isAdmin, isInitialLoad, isTokenValid, isValidating])

  // Determine event type and labels from RDS data
  const isPWSEvent = event?.event_type?.includes("problems-worth-solving") ?? false
  const participantLabel = isPWSEvent ? "Student" : "Team"
  const participantsLabel = isPWSEvent ? "Students" : "Teams"
  // Do not display another profile's scores while the selected judge changes.
  const currentPreview = scorePreview?.eventId === eventId && scorePreview.judgeId === judgeId ? scorePreview : null
  // Team names are unique within an event; the existing history endpoint uses
  // these names, so one judge-scoped request supplies every card's preview.
  const historyByTeam = new Map(currentPreview?.history.map(entry => [entry.teamName, entry]) ?? [])

  // Calculate team statistics from RDS data
  const totalCount = teams.length
  const scoredCount = teams.filter(t => t.has_current_user_scored).length

  // Get event logo based on event type
  const eventLogoSrc = isPWSEvent ? "/pws.png" : "/aggiesinvent.png"

  // Helper function to convert hex to rgba
  const hexToRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }

  // Sponsor data from RDS or fallback
  const sponsor = event?.sponsor_id && event.sponsor ? {
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

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-white to-primary/5">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-lg text-slate-600">Loading event details...</p>
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
          {/* Main Header Row - Always one line */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Left Side: Back Button + Logo */}
            <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 shrink-0">
              <Button
                variant="ghost"
                onClick={onBack}
                className="flex h-12 w-12 lg:h-14 lg:w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 text-white shadow-lg backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/20"
              >
                <ArrowLeft className="h-6 w-6 lg:h-7 lg:w-7" />
              </Button>
              <div className="flex h-14 sm:h-16 lg:h-20 xl:h-20 w-auto shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 px-2 sm:px-3 py-2 shadow-md backdrop-blur-md">
                <Image src="/meloyprogram.png" alt="Meloy Program Judging Portal" width={160} height={64} className="h-10 sm:h-12 lg:h-14 xl:h-16 w-auto object-contain" />
              </div>
            </div>

            {/* Center: Event Type Logo + Event Title (hidden on mobile, shown on larger screens) */}
            <div className="hidden md:flex flex-col items-center flex-1 min-w-0 px-4">
              <Image src={eventLogoSrc} alt="Event type" width={160} height={56} className={`w-auto object-contain brightness-0 invert mb-1 ${isPWSEvent ? "h-10 lg:h-12 xl:h-14 opacity-90" : "h-6 lg:h-7 xl:h-8 opacity-60"}`} />
              <h1 className="text-xl lg:text-2xl xl:text-3xl font-semibold text-white leading-tight text-center truncate w-full">{event.name}</h1>
            </div>

            {/* Right Side: User Profile + Menu */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* User Profile - Always visible */}
              <div className="flex items-center gap-2 sm:gap-3 rounded-full border-2 border-white/30 bg-white/10 px-2.5 sm:px-4 py-1.5 sm:py-2 shadow-lg backdrop-blur-sm">
                <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full border-2 border-white/50 bg-white/20">
                  <User className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs sm:text-sm font-semibold text-white leading-tight">{judgeName || "User"}</span>
                  <span className="text-[10px] sm:text-xs text-white/70">{isAdmin ? "Admin" : "Judge"}</span>
                </div>
              </div>

              {/* Menu Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 text-white shadow-lg backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/20"
                  >
                    <Menu className="h-6 w-6" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 rounded-2xl border-2 border-slate-200 bg-white/95 backdrop-blur-xl shadow-2xl"
                >
                  <DropdownMenuItem
                    onClick={() => onNavigate("leaderboard")}
                    className="flex items-center gap-3 px-4 py-3 text-base font-medium text-slate-700 cursor-pointer rounded-xl hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary"
                  >
                    <BarChart3 className="h-5 w-5" />
                    <span>View Summary</span>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator className="my-1 bg-slate-200" />
                      <DropdownMenuItem
                        onClick={onOpenModerator}
                        className="flex items-center gap-3 px-4 py-3 text-base font-medium text-slate-700 cursor-pointer rounded-xl hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary"
                      >
                        <Shield className="h-5 w-5" />
                        <span>Moderator Screen</span>
                      </DropdownMenuItem>
                      {isPWSEvent && onOpenCommentSheets && (
                        <DropdownMenuItem
                          onClick={onOpenCommentSheets}
                          className="flex items-center gap-3 px-4 py-3 text-base font-medium text-slate-700 cursor-pointer rounded-xl hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary"
                        >
                          <Printer className="h-5 w-5" />
                          <span>Print Comment Sheets</span>
                        </DropdownMenuItem>
                      )}
                      {isPWSEvent && onOpenUploadSheets && (
                        <DropdownMenuItem
                          onClick={onOpenUploadSheets}
                          className="flex items-center gap-3 px-4 py-3 text-base font-medium text-slate-700 cursor-pointer rounded-xl hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary"
                        >
                          <Upload className="h-5 w-5" />
                          <span>Upload Comment Sheets</span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator className="my-1 bg-slate-200" />
                      <DropdownMenuItem
                        onClick={() => onManageEvent(eventId)}
                        className="flex items-center gap-3 px-4 py-3 text-base font-medium text-slate-700 cursor-pointer rounded-xl hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary"
                      >
                        <Settings className="h-5 w-5" />
                        <span>Event Settings</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Mobile Event Title - Centered Below */}
          <div className="md:hidden mt-3 flex flex-col items-center text-center">
            <Image src={eventLogoSrc} alt="Event type" width={130} height={44} className={`w-auto object-contain brightness-0 invert mb-1 ${isPWSEvent ? "h-9 opacity-90" : "h-5 opacity-60"}`} />
            <h1 className="text-lg font-semibold text-white leading-tight">{event.name}</h1>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 sm:px-6 py-4 sm:py-5 lg:py-6">
        {/* Unified Event Info Banner - sponsor and event details in one cohesive card */}
        <div className="relative mb-4 sm:mb-6 overflow-hidden rounded-2xl sm:rounded-3xl border-2 border-red-950 shadow-xl">
          {/* Inner container with sponsor gradient - smaller radius to fit inside border */}
          <div
            className="relative rounded-[14px] sm:rounded-[22px] py-3 px-4 sm:py-4 sm:px-5 lg:py-5 lg:px-6"
            style={{
              background: `linear-gradient(to bottom, ${sponsor.primaryColor}, ${sponsor.secondaryColor})`
            }}
          >
            {/* Very subtle texture overlay */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAyIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20" />

            {/* All Sizes - Centered sponsor + event details */}
            <div className="relative flex flex-col items-center gap-3 lg:flex-row lg:justify-center lg:gap-8">
              {/* Sponsor block - centered */}
              <div className="group flex items-center gap-3 sm:gap-4 lg:gap-5 cursor-pointer transition-transform hover:scale-[1.02]">
                <div
                  className="relative flex shrink-0 items-center justify-center rounded-xl lg:rounded-2xl py-2 px-4 sm:py-3 sm:px-5 lg:py-3 lg:px-6 xl:py-4 xl:px-8 shadow-xl backdrop-blur-xl transition-all group-hover:shadow-2xl bg-white/70 border-2 border-white/80"
                >
                  <Image
                    src={sponsor.logo}
                    alt={sponsor.name ?? "Sponsor logo"}
                    width={120}
                    height={60}
                    className="relative h-8 sm:h-10 lg:h-14 xl:h-16 w-auto max-w-[100px] sm:max-w-[130px] lg:max-w-[180px] object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs uppercase tracking-[0.12em]" style={{ color: `${sponsor.textColor}CC` }}>Presented by</p>
                  <p className="text-base sm:text-lg lg:text-xl xl:text-2xl font-semibold leading-tight break-words drop-shadow-sm" style={{ color: sponsor.textColor }}>{sponsor.name}</p>
                </div>
              </div>

              {/* Divider - desktop only */}
              <div className="hidden lg:block w-px h-12" style={{ backgroundColor: hexToRgba(sponsor.textColor, 0.2) }} />

              {/* Event details - inline on all sizes */}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 lg:gap-x-6">
                <span className="flex items-center gap-1.5 text-xs sm:text-sm" style={{ color: hexToRgba(sponsor.textColor, 0.87) }}>
                  <CalendarDays className="h-3.5 w-3.5 lg:h-4 lg:w-4 shrink-0" />
                  <span>{formatEventDateRange(event.start_date, event.end_date, 'short')}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs sm:text-sm" style={{ color: hexToRgba(sponsor.textColor, 0.87) }}>
                  <MapPin className="h-3.5 w-3.5 lg:h-4 lg:w-4 shrink-0" />
                  <span>{event.location}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">{participantLabel} roster</h2>
              <p className="text-xs sm:text-sm text-slate-500">
                {scoredCount} of {totalCount} {participantsLabel.toLowerCase()} scored
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:gap-6">
            {teams.length > 0 ? sortEventTeams(teams, event.event_type, isAdmin)
              .map((team, index) => {
                const isScored = team.has_current_user_scored ?? false;
                const isDone = team.status === 'done' || team.status === 'completed';
                const isActive = team.status === 'active';
                
                // Judges can click on:
                // 1. Active teams (to score for first time)
                // 2. Teams they've already scored (to edit)
                // 3. Done/completed teams (to edit)
                // Admins can always click any team
                const canClick = isAdmin || isActive || isScored || isDone;
                const isGreyedOut = false; // Never grey out
                
                const truncatedDescription = team.description && team.description.length > 120
                  ? team.description.substring(0, 120) + '...'
                  : team.description;

                return (
                  <Card
                    key={team.id}
                    className={`group relative overflow-hidden rounded-2xl sm:rounded-3xl border-2 border-primary/25 shadow-lg transition-all py-0 gap-0 ${isGreyedOut
                      ? 'cursor-default opacity-50 grayscale'
                      : 'hover:-translate-y-1 hover:shadow-2xl cursor-pointer'
                      }`}
                    style={{
                      background: 'linear-gradient(to bottom, #ffffff, #f1f5f9)',
                      animationDelay: `${index * 50}ms`
                    }}
                    onClick={() => canClick && onSelectTeam(team.id)}
                    role="button"
                    tabIndex={canClick ? 0 : -1}
                    onKeyDown={(event) => {
                      if (!isGreyedOut && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault()
                        onSelectTeam(team.id)
                      }
                    }}
                  >
                    {/* Desktop/Tablet: Flex row layout — card grows with tallest column */}
                    <div className="hidden md:flex flex-row min-h-[180px]">
                      {/* Left Column: Current judge's saved score preview */}
                      <div className="w-48 lg:w-56 xl:w-64 shrink-0 border-r border-primary/15">
                        <TeamScorePreview
                          teamName={team.name}
                          rubric={currentPreview?.rubric ?? []}
                          entry={historyByTeam.get(team.name)}
                          hasSubmitted={isScored}
                          status={currentPreview?.status ?? 'loading'}
                          rubricOnly={isAdmin || !judgeId}
                        />
                      </div>

                      {/* Middle Column: Content */}
                      <div className="flex flex-1 flex-col gap-3 min-w-0 p-6">
                        <div className="flex-1">
                          <CardTitle className="text-2xl font-bold transition-colors text-[#500000] group-hover:text-[#3d0000]">
                            {team.name}
                          </CardTitle>
                          <CardDescription className="mt-3 text-base text-[#500000]/90 leading-relaxed">
                            {truncatedDescription || 'No description'}
                          </CardDescription>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-3 pt-2 mt-auto">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (team.project_url) {
                                window.open(team.project_url, '_blank');
                              }
                            }}
                            disabled={!team.project_url}
                            variant="outline"
                            className={`rounded-full border-2 border-white/30 px-5 py-2.5 text-base font-semibold shadow-lg backdrop-blur-sm transition-all ${team.project_url
                              ? 'text-white hover:opacity-90'
                              : 'text-white/40 cursor-not-allowed opacity-50'
                              }`}
                            style={team.project_url ? { background: 'linear-gradient(to bottom, #500000, #3d0000)' } : { background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View Presentation
                          </Button>

                          {team.description && team.description.length > 120 && (
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedTeam(team);
                              }}
                              variant="ghost"
                              className="rounded-full px-4 py-2 text-sm font-medium text-[#500000] hover:bg-slate-200/50 backdrop-blur-sm"
                            >
                              Read More
                              <ChevronDown className="ml-1 h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Right Column: Status Badge + Team Members */}
                      <div className="w-48 lg:w-56 shrink-0 p-4 lg:p-6 space-y-3">
                        {/* Status Badge */}
                        <div
                          className="flex items-center gap-2 rounded-full border-2 border-white/30 px-4 py-2 shadow-lg backdrop-blur-sm"
                          style={{ background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
                        >
                          {isScored ? (
                            <>
                              <div className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                              <span className="text-sm font-semibold text-blue-200">Scored</span>
                            </>
                          ) : isDone ? (
                            <>
                              <div className="h-2.5 w-2.5 rounded-full bg-gray-400" />
                              <span className="text-sm font-semibold text-gray-200">Done</span>
                            </>
                          ) : team.status === 'active' ? (
                            <>
                              <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                              <span className="text-sm font-semibold text-green-200">Active</span>
                            </>
                          ) : (
                            <>
                              <div className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                              <span className="text-sm font-semibold text-slate-200 capitalize">{team.status || 'waiting'}</span>
                            </>
                          )}
                        </div>

                        {/* Team Members Card */}
                        {team.members && team.members.length > 0 && (
                          <div
                            className="rounded-2xl border-2 border-white/30 backdrop-blur-sm px-3 lg:px-4 py-3 lg:py-4 shadow-lg"
                            style={{ background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
                          >
                            <div className="flex items-center gap-2 mb-2 lg:mb-3 pb-2 lg:pb-3 border-b border-white/30">
                              <Users className="h-3.5 lg:h-4 w-3.5 lg:w-4 text-white" />
                              <span className="text-xs lg:text-sm font-bold text-white">Team Members</span>
                            </div>
                            <div className="flex flex-col gap-1.5 lg:gap-2">
                              {team.members.map((member) => (
                                <div key={member.id} className="flex items-center gap-2 text-xs lg:text-sm text-white">
                                  <UserCircle2 className="h-3.5 lg:h-4 w-3.5 lg:w-4 text-white/70 shrink-0" />
                                  <span className="font-medium truncate">{member.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Mobile Layout - Completely Different */}
                    <div className="md:hidden relative flex flex-col items-center p-6 text-center">
                      {/* Team Title - Centered */}
                      <CardTitle className="text-2xl font-bold text-[#500000] mb-3">
                        {team.name}
                      </CardTitle>

                      <div className="w-full mb-4 overflow-hidden rounded-2xl border border-primary/15">
                        <TeamScorePreview
                          teamName={team.name}
                          rubric={currentPreview?.rubric ?? []}
                          entry={historyByTeam.get(team.name)}
                          hasSubmitted={isScored}
                          status={currentPreview?.status ?? 'loading'}
                          rubricOnly={isAdmin || !judgeId}
                        />
                      </div>

                      {/* Team Description - Centered */}
                      <CardDescription className="text-base text-[#500000]/90 leading-relaxed mb-4">
                        {truncatedDescription || 'No description'}
                      </CardDescription>

                      {/* Team Members - Centered */}
                      {team.members && team.members.length > 0 && (
                        <div className="w-full mb-4">
                          <div
                            className="rounded-2xl border-2 border-white/30 backdrop-blur-sm px-4 py-3 shadow-lg"
                            style={{ background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
                          >
                            <div className="flex items-center justify-center gap-2 mb-3 pb-3 border-b border-white/30">
                              <Users className="h-4 w-4 text-white" />
                              <span className="text-sm font-bold text-white">Team Members</span>
                            </div>
                            <div className="flex flex-col gap-2">
                              {team.members.map((member) => (
                                <div key={member.id} className="flex items-center justify-center gap-2 text-sm text-white">
                                  <UserCircle2 className="h-4 w-4 text-white/70" />
                                  <span className="font-medium">{member.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* View Presentation Button - Centered */}
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (team.project_url) {
                            window.open(team.project_url, '_blank');
                          }
                        }}
                        disabled={!team.project_url}
                        variant="outline"
                        className={`rounded-full border-2 border-white/30 px-6 py-3 text-base font-semibold shadow-lg backdrop-blur-sm transition-all mb-4 ${team.project_url
                          ? 'text-white hover:opacity-90'
                          : 'text-white/40 cursor-not-allowed opacity-50'
                          }`}
                        style={team.project_url ? { background: 'linear-gradient(to bottom, #500000, #3d0000)' } : { background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
                      >
                        <ExternalLink className="mr-2 h-5 w-5" />
                        View Presentation
                      </Button>

                      {team.description && team.description.length > 120 && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedTeam(team);
                          }}
                          variant="ghost"
                          className="rounded-full px-4 py-2 text-sm font-medium text-[#500000] hover:bg-slate-200/50 backdrop-blur-sm mb-4"
                        >
                          Read More
                          <ChevronDown className="ml-1 h-4 w-4" />
                        </Button>
                      )}

                      {/* Status Badge - Bottom Center on Mobile */}
                      <div className="mt-auto pt-4">
                        <div
                          className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-4 py-2 shadow-lg backdrop-blur-sm"
                          style={{ background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
                        >
                          {isScored ? (
                            <>
                              <div className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                              <span className="text-sm font-semibold text-blue-200">Scored</span>
                            </>
                          ) : isDone ? (
                            <>
                              <div className="h-2.5 w-2.5 rounded-full bg-gray-400" />
                              <span className="text-sm font-semibold text-gray-200">Done</span>
                            </>
                          ) : team.status === 'active' ? (
                            <>
                              <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                              <span className="text-sm font-semibold text-green-200">Active</span>
                            </>
                          ) : (
                            <>
                              <div className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                              <span className="text-sm font-semibold text-slate-200 capitalize">{team.status || 'waiting'}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              }) : (
              <Card className="rounded-2xl sm:rounded-[28px] border-2 border-primary/25 bg-white/95 shadow-lg">
                <CardContent className="flex flex-col items-center justify-center gap-2 sm:gap-3 py-12 sm:py-16 px-4 text-center">
                  <Clock className="h-12 w-12 sm:h-16 sm:w-16 text-slate-300" />
                  <CardTitle className="text-lg sm:text-xl font-semibold text-slate-700">No Active {participantsLabel}</CardTitle>
                  <CardDescription className="text-sm sm:text-base text-slate-500 max-w-md px-2">
                    The moderator will activate {participantsLabel.toLowerCase()} for judging when ready. Check back soon or contact the event moderator.
                  </CardDescription>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Expanded Description Dialog */}
      <Dialog open={!!expandedTeam} onOpenChange={(open) => !open && setExpandedTeam(null)}>
        <DialogContent
          className="max-w-4xl rounded-2xl sm:rounded-3xl border-2 border-primary/25 shadow-2xl max-h-[90vh] overflow-y-auto"
          style={{ background: 'linear-gradient(to bottom, #ffffff, #f1f5f9)' }}
        >
          <DialogHeader>
            <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 mb-4">
              {/* Team Photo */}
              <div className="shrink-0 mx-auto sm:mx-0">
                {expandedTeam?.photo_url ? (
                  <img
                    src={expandedTeam.photo_url}
                    alt={`${expandedTeam.name} photo`}
                    className="h-40 w-40 sm:h-48 sm:w-48 lg:h-56 lg:w-56 rounded-2xl object-cover border-2 border-slate-200 shadow-lg"
                  />
                ) : (
                  <div className="flex h-40 w-40 sm:h-48 sm:w-48 lg:h-56 lg:w-56 items-center justify-center rounded-2xl bg-slate-100 backdrop-blur-sm border-2 border-slate-200">
                    <Image src="/meloyprogram.png" alt="Meloy logo placeholder" width={100} height={100} className="brightness-0 opacity-25" />
                  </div>
                )}
              </div>

              {/* Team Info */}
              <div className="flex-1 text-center sm:text-left">
                <DialogTitle className="text-2xl sm:text-3xl font-bold text-[#500000] mb-2 sm:mb-3">
                  {expandedTeam?.name}
                </DialogTitle>

                {/* Status Badge - Glassy Pill */}
                <div
                  className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 backdrop-blur-sm px-3 sm:px-4 py-1.5 sm:py-2 shadow-lg mb-3"
                  style={{ background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
                >
                  {expandedTeam?.has_current_user_scored ? (
                    <>
                      <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-blue-400" />
                      <span className="text-xs sm:text-sm font-semibold text-blue-200">Completed</span>
                    </>
                  ) : expandedTeam?.status === 'active' ? (
                    <>
                      <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-green-400" />
                      <span className="text-xs sm:text-sm font-semibold text-green-200">Active</span>
                    </>
                  ) : (
                    <>
                      <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-slate-400" />
                      <span className="text-xs sm:text-sm font-semibold text-slate-200 capitalize">{expandedTeam?.status || 'waiting'}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6">
            {/* Project Description */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-[#500000] mb-2 sm:mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-[#500000]" />
                Project Description
              </h3>
              <DialogDescription className="text-sm sm:text-base text-[#500000]/90 leading-relaxed whitespace-pre-wrap">
                {expandedTeam?.description || 'No description provided'}
              </DialogDescription>
            </div>

            {/* Team Members */}
            {expandedTeam?.members && expandedTeam.members.length > 0 && (
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-[#500000] mb-2 sm:mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-[#500000]" />
                  Team Members ({expandedTeam.members.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  {expandedTeam.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 sm:gap-3 rounded-xl border-2 border-white/30 backdrop-blur-sm p-3 sm:p-4"
                      style={{ background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
                    >
                      <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-white/20 border border-white/30 shrink-0">
                        <UserCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-base font-semibold text-white truncate">{member.name}</p>
                        <p className="text-xs sm:text-sm text-white/80 truncate">{member.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 pt-2 sm:pt-4">
              <Button
                onClick={() => {
                  if (expandedTeam?.project_url) {
                    window.open(expandedTeam.project_url, '_blank');
                  }
                }}
                disabled={!expandedTeam?.project_url}
                className={`rounded-full px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold shadow-lg backdrop-blur-sm transition-all border-2 border-white/30 ${expandedTeam?.project_url
                  ? 'text-white hover:opacity-90'
                  : 'text-white/40 cursor-not-allowed opacity-50'
                  }`}
                style={{ background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
              >
                <ExternalLink className="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                View Presentation
              </Button>
              {!expandedTeam?.has_current_user_scored && (
                <Button
                  onClick={() => {
                    setExpandedTeam(null);
                    onSelectTeam(expandedTeam!.id);
                  }}
                  className="rounded-full text-white px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold shadow-md hover:opacity-90"
                  style={{ background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
                >
                  Score This Team
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
