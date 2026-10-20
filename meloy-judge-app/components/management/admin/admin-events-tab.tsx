"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Edit, Calendar, MapPin, Loader2, Clock, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { getEvents, deleteEvent } from "@/lib/api"
import type { Event } from "@/lib/types/api"
import { formatEventDateRange as formatDateRange, getEventDisplayStatus } from "@/lib/event-dates"
import { useEventToday } from "@/hooks/use-event-today"

interface EventWithTeams extends Event {
  teams?: Array<{ id: string; name: string }>
}

interface AdminEventsTabProps {
  onCreateEvent: () => void
  onManageEvent: (eventId: string) => void
}

export function AdminEventsTab({ onCreateEvent, onManageEvent }: AdminEventsTabProps) {
  const [events, setEvents] = useState<EventWithTeams[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [eventToDelete, setEventToDelete] = useState<EventWithTeams | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()
  const today = useEventToday()

  const fetchEvents = async () => {
    try {
      setLoading(true)
      const eventsData = await getEvents()

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
  }, [])

  const handleDeleteClick = (event: EventWithTeams, e: React.MouseEvent) => {
    e.stopPropagation()
    setEventToDelete(event)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!eventToDelete) return

    try {
      setDeleting(true)
      await deleteEvent(eventToDelete.id)

      toast({
        title: "Event Deleted",
        description: `${eventToDelete.name} has been successfully deleted.`,
      })

      // Refresh events list
      await fetchEvents()
      setDeleteDialogOpen(false)
      setEventToDelete(null)
    } catch (err) {
      toast({
        title: "Delete Failed",
        description: err instanceof Error ? err.message : "Failed to delete event",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

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
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-3xl font-semibold text-slate-800"></h3>
        <Button
          onClick={onCreateEvent}
          className="h-14 rounded-2xl bg-primary px-8 text-lg font-semibold shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
        >
          <Plus className="mr-2 h-6 w-6" />
          Create New Event
        </Button>
      </div>

      {loading && (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-lg text-slate-600">Loading events...</p>
          </div>
        </div>
      )}

      {error && (
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
                onClick={() => onManageEvent(event.id)}
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
                  <CardTitle className="text-[1.3rem] font-semibold leading-snug text-[#500000] transition-colors duration-200 group-hover:text-[#3d0000] line-clamp-2 mb-3">
                    {event.name}
                  </CardTitle>
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
                            <Edit className="h-5 w-5" />
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
                    <div className="flex gap-3">
                      <div
                        className="flex flex-1 items-center justify-between rounded-xl px-6 py-3 text-white transition-all duration-300 group-hover:opacity-90 shadow-lg"
                        style={{ background: 'linear-gradient(to bottom, #500000, #3d0000)' }}
                      >
                        <span className="text-sm font-semibold uppercase tracking-[0.24em]">Manage Event</span>
                        <Edit className="h-5 w-5" />
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-[52px] w-[52px] rounded-xl shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
                        onClick={(e) => handleDeleteClick(event, e)}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
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

      {/* Recent Activity - Coming Soon */}
      <Card className="rounded-3xl border border-slate-200/80 bg-white/90 shadow-lg">
        <CardHeader className="p-6 pb-4">
          <CardTitle className="text-xl font-semibold text-slate-900">Recent Activity</CardTitle>
          <CardDescription className="text-sm text-slate-500">
            Track the most recent moves across events, judges, and scoring workflows.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
            <div className="text-center">
              <Clock className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              <p className="text-lg font-semibold text-slate-600">Coming Soon</p>
              <p className="text-sm text-slate-500 mt-1">Activity tracking will be available in a future update</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-md rounded-3xl border-2 border-slate-200 bg-white shadow-2xl">
          <AlertDialogHeader className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-8 w-8 text-red-600" />
            </div>
            <AlertDialogTitle className="text-center text-2xl font-bold text-slate-900">
              Delete Event
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base text-slate-600 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-slate-900">{eventToDelete?.name}</span>? This action cannot be undone and will remove all associated teams, judges, and scores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-3 mt-6">
            <AlertDialogCancel
              className="h-12 rounded-xl border-2 border-slate-200 text-base font-semibold hover:bg-slate-50 sm:flex-1"
              disabled={deleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="h-12 rounded-xl bg-red-600 text-base font-semibold text-white hover:bg-red-700 sm:flex-1"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Yes, delete event"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
