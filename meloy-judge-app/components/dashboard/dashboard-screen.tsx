"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useUser } from '@auth0/nextjs-auth0/client'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Screen } from "@/components/app-shell"
import { Calendar, MapPin, Users, Shield, ChevronRight, User, Loader2, LogOut, Menu, CalendarDays } from "lucide-react"
import { getEvents, getCurrentUser } from "@/lib/api"
import type { Event } from "@/lib/types/api"
import { formatEventDateRange as formatDateRange, getEventDisplayStatus } from "@/lib/event-dates"
import { useEventToday } from "@/hooks/use-event-today"

interface DashboardScreenProps {
  onSelectEvent: (eventId: string) => void
  onNavigate: (screen: Screen) => void
  isAdmin: boolean
  shouldFetchData?: boolean // Add flag to control when to fetch
}

interface EventWithTeams extends Event {
  teams?: Array<{ id: string; name: string }>
}

export function DashboardScreen({ onSelectEvent, onNavigate, isAdmin, shouldFetchData = true }: DashboardScreenProps) {
  const { user: auth0User } = useUser()
  const [events, setEvents] = useState<EventWithTeams[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('judge')
  const today = useEventToday()

  useEffect(() => {
    // Don't fetch if we shouldn't (waiting for token validation)
    if (!shouldFetchData) {
      return
    }

    async function fetchData() {
      try {
        setLoading(true)
        const [eventsData, userData] = await Promise.all([
          getEvents(),
          getCurrentUser()
        ])

        // Fetch teams for each event
        const eventsWithTeams = await Promise.all(
          eventsData.events.map(async (event: Event) => {
            try {
              const teamsResponse = await fetch(`/api/proxy/events/${event.id}/teams`)
              if (teamsResponse.ok) {
                const teamsData = await teamsResponse.json()
                return {
                  ...event,
                  teams: teamsData.teams?.map((t: any) => ({ id: t.id, name: t.name })) || []
                }
              }
            } catch (err) {
              console.error(`Failed to fetch teams for event ${event.id}:`, err)
            }
            return { ...event, teams: [] }
          })
        )

        setEvents(eventsWithTeams)
        setUserRole(userData.user.role || 'judge')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [shouldFetchData])

  // Get user name from Auth0 or fallback
  const userName = auth0User?.name || auth0User?.email?.split('@')[0] || 'User'

  // Map event type to logo
  const getEventLogo = (eventType: string) => {
    if (eventType.includes('problems-worth-solving')) {
      return '/pws.png'
    }
    return '/aggiesinvent.png'
  }

  // Get sponsor data with fallback logic
  const getSponsorData = (event: Event) => {
    return event.sponsor_id && event.sponsor ? {
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


  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-primary/5">
      <header className="relative overflow-hidden border-b bg-linear-to-b from-primary to-[#3d0000] shadow-xl backdrop-blur-sm">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-3 sm:py-4 lg:px-8">
          {/* Main Header Row - Always one line */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Left Side: Logo */}
            <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 shrink-0">
              <div className="flex h-14 sm:h-16 lg:h-20 xl:h-20 w-auto shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 px-2 sm:px-3 py-2 shadow-md backdrop-blur-md">
                <Image src="/meloyprogram.png" alt="Meloy Program Judging Portal" width={160} height={64} className="h-10 sm:h-12 lg:h-14 xl:h-16 w-auto object-contain" />
              </div>
            </div>

            {/* Center: Title (hidden on mobile, shown on larger screens) */}
            <div className="hidden md:flex flex-col items-center flex-1 min-w-0 px-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-6 lg:h-7 xl:h-8 w-6 lg:w-7 xl:w-8 text-white opacity-60" />
                <h1 className="text-2xl lg:text-3xl xl:text-4xl font-semibold text-white leading-tight text-center truncate">My Events</h1>
              </div>
            </div>

            {/* Right Side: User Profile + Menu */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* User Profile - Always visible */}
              <div className="flex items-center gap-2 sm:gap-3 rounded-full border-2 border-white/30 bg-white/10 px-3 sm:px-4 py-2 shadow-lg backdrop-blur-sm">
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full border-2 border-white/50 bg-white/20">
                  <User className="h-5 w-5 text-white" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-white leading-tight truncate">{userName}</span>
                  <span className="text-xs text-white/70 capitalize truncate">{userRole}</span>
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
                  {isAdmin && (
                    <>
                      <DropdownMenuItem
                        onClick={() => onNavigate("admin")}
                        className="flex items-center gap-3 px-4 py-3 text-base font-medium text-slate-700 cursor-pointer rounded-xl hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary"
                      >
                        <Shield className="h-5 w-5" />
                        <span>Admin Panel</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="my-1 bg-slate-200" />
                    </>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        onSelect={(e) => e.preventDefault()}
                        className="flex items-center gap-3 px-4 py-3 text-base font-medium text-slate-700 cursor-pointer rounded-xl hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary"
                      >
                        <LogOut className="h-5 w-5" />
                        <span>Logout</span>
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-md rounded-3xl border-2 border-slate-200 bg-white shadow-2xl">
                      <AlertDialogHeader className="space-y-4">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                          <LogOut className="h-8 w-8 text-primary" />
                        </div>
                        <AlertDialogTitle className="text-center text-2xl font-bold text-slate-900">
                          Logout
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-center text-base text-slate-600 leading-relaxed">
                          Are you sure you want to logout? You will need to sign in again to access your events.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-col sm:flex-row gap-3 mt-6">
                        <AlertDialogCancel className="h-12 rounded-xl border-2 border-slate-200 text-base font-semibold hover:bg-slate-50 sm:flex-1">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => window.location.href = '/api/auth/logout'}
                          className="h-12 rounded-xl text-base font-semibold text-white hover:opacity-90 sm:flex-1"
                          style={{ background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
                        >
                          Yes, logout
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Mobile Title - Centered Below */}
          <div className="md:hidden mt-3 flex flex-col items-center text-center">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-white opacity-60" />
              <h1 className="text-xl font-semibold text-white leading-tight">My Events</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-6 py-5 lg:py-6 lg:px-8">

        {loading && (
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
              <p className="mt-4 text-lg text-slate-600">Loading events...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex min-h-[400px] items-center justify-center">
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <p className="text-red-600">Error: {error}</p>
                <Button
                  className="mt-4"
                  onClick={() => window.location.reload()}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-slate-600">No events found</p>
            </div>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event, index) => {
              const sponsor = getSponsorData(event)

              return (
                <Card
                  key={event.id}
                  className="group relative cursor-pointer overflow-hidden rounded-[28px] border-2 border-primary/25 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl p-0"
                  onClick={() => onSelectEvent(event.id)}
                  style={{
                    background: 'linear-gradient(to bottom, #ffffff, #f1f5f9)',
                    animationDelay: `${index * 100}ms`
                  }}
                >
                  {/* Sponsor gradient section at top with status strip */}
                  <div className="relative overflow-hidden rounded-t-[28px] border-b-2 border-red-950">
                    <div
                      className="relative rounded-t-[26px]"
                      style={{
                        background: `linear-gradient(to bottom, ${sponsor.primaryColor}, ${sponsor.secondaryColor})`
                      }}
                    >
                      {/* Subtle texture overlay */}
                      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAyIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20 rounded-t-[26px]" />

                      {/* Sponsor content */}
                      <div className="relative flex items-center justify-center py-4 px-4">
                        <div className="group flex items-center gap-3">
                          <div className="relative flex shrink-0 items-center justify-center rounded-xl py-2 px-4 shadow-xl backdrop-blur-xl bg-white/70 border-2 border-white/80">
                            <Image
                              src={sponsor.logo}
                              alt={sponsor.name}
                              width={80}
                              height={40}
                              className="h-10 w-auto max-w-[80px] object-contain"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: `${sponsor.textColor}CC` }}>Presented by</p>
                            <p className="text-base font-semibold leading-tight" style={{ color: sponsor.textColor }}>{sponsor.name}</p>
                          </div>
                        </div>
                      </div>

                      {/* Status strip */}
                      <div className="relative border-t border-white/10">
                        <div className="absolute inset-0 bg-black/15 backdrop-blur-sm" />
                        <div className="relative flex items-center justify-center gap-2 py-2">
                          {(() => {
                            const effectiveStatus = getEventDisplayStatus(event, today)

                            if (effectiveStatus === 'active') {
                              return (
                                <>
                                  <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                                  </span>
                                  <span className="text-[11px] font-medium uppercase tracking-[0.15em]" style={{ color: `${sponsor.textColor}DD` }}>Active</span>
                                </>
                              )
                            } else if (effectiveStatus === 'completed') {
                              return (
                                <>
                                  <span className="relative flex h-2 w-2">
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-400" />
                                  </span>
                                  <span className="text-[11px] font-medium uppercase tracking-[0.15em]" style={{ color: `${sponsor.textColor}DD` }}>Ended</span>
                                </>
                              )
                            } else {
                              return (
                                <>
                                  <span className="relative flex h-2 w-2">
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                                  </span>
                                  <span className="text-[11px] font-medium uppercase tracking-[0.15em] capitalize" style={{ color: `${sponsor.textColor}DD` }}>{effectiveStatus || 'Upcoming'}</span>
                                </>
                              )
                            }
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <CardHeader className="relative px-6 pb-3 pt-4">
                    {/* Fixed-height title area so cards with 1-line vs 2-line titles stay aligned */}
                    <div className="min-h-[3.75rem] mb-3 flex items-start">
                      <CardTitle className="text-[1.3rem] font-semibold leading-snug text-[#500000] transition-colors duration-200 group-hover:text-[#3d0000] line-clamp-2">
                        {event.name}
                      </CardTitle>
                    </div>
                    <CardDescription className="flex items-center gap-3 text-base font-medium text-[#500000]/80">
                      <Calendar className="h-5 w-5 text-primary" />
                      {formatDateRange(event.start_date, event.end_date)}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="relative px-6 pb-4 pt-1">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 rounded-2xl border-2 border-primary/20 bg-white px-4 py-4 shadow-sm transition-all duration-300 group-hover:border-primary/40 group-hover:shadow-md">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
                          <MapPin className="h-5 w-5" />
                        </div>
                        <span className="flex-1 text-base font-medium text-[#500000] leading-tight">
                          {event.location}
                        </span>
                      </div>

                      {/* Teams list */}
                      {event.teams && event.teams.length > 0 && (
                        <div className="rounded-2xl border-2 border-primary/20 bg-white px-4 py-4 shadow-sm transition-all duration-300 group-hover:border-primary/40 group-hover:shadow-md">
                          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-primary/10">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
                              <Users className="h-5 w-5" />
                            </div>
                            <span className="flex-1 text-base font-semibold text-[#500000]">
                              Teams ({event.teams.length})
                            </span>
                          </div>
                          <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
                            {event.teams.slice(0, 5).map((team) => (
                              <div key={team.id} className="flex items-center gap-2 text-sm text-[#500000]/80">
                                <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                                <span className="font-medium truncate">{team.name}</span>
                              </div>
                            ))}
                            {event.teams.length > 5 && (
                              <div className="text-xs text-[#500000]/60 italic mt-1">
                                +{event.teams.length - 5} more teams
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 border-t border-primary/10 pt-5">
                      <div
                        className="flex items-center justify-between rounded-xl px-6 py-3 text-white transition-all duration-300 group-hover:opacity-90 shadow-lg"
                        style={{ background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
                      >
                        <span className="text-sm font-semibold uppercase tracking-[0.24em]">View Event</span>
                        <ChevronRight className="h-5 w-5" />
                      </div>
                    </div>

                    {/* Event logo moved to bottom */}
                    <div className="mt-3 flex justify-center">
                      <div className="flex h-20 min-h-20 w-full items-center justify-center rounded-xl border-2 border-primary/20 bg-slate-50/70 px-6 py-3 shadow-sm">
                        <Image
                          src={getEventLogo(event.event_type)}
                          alt={event.name}
                          width={180}
                          height={64}
                          className={`w-auto max-w-full object-contain ${event.event_type.includes("problems-worth-solving") ? "h-16" : "h-14"
                            }`}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
