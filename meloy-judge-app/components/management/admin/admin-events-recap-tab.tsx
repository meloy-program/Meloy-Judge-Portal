"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Calendar, BarChart3, Download, ChevronLeft, ChevronRight, Loader2, Trophy, Users, FileText, Award } from "lucide-react"
import { getCompletedEventsRecap, exportEventToExcel } from "@/lib/api/events"
import { useToast } from "@/hooks/use-toast"
import { formatEventDateRange as formatDateRange } from "@/lib/event-dates"

interface Judge {
  id: string
  name: string
  communication: number
  funding: number
  presentation: number
  cohesion: number
  total: number
  time_spent_seconds: number
}

interface Team {
  id: string
  name: string
  mentor_name: string | null
  judges: Judge[]
  total_score: number
  avg_score: number
}

interface Award {
  award_type: string
  team_id: string
  team_name: string
}

interface EventRecap {
  id: string
  name: string
  event_type: string
  start_date: string
  end_date: string
  location: string
  status: string
  judging_phase: string
  sponsor?: {
    name: string | null
    logo_url: string | null
    primary_color: string | null
    secondary_color: string | null
    text_color: string | null
  }
  teams: Team[]
  awards: Award[]
}

export function AdminEventsRecapTab() {
  const [events, setEvents] = useState<EventRecap[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [selectedEventIndex, setSelectedEventIndex] = useState(0)
  const { toast } = useToast()

  useEffect(() => {
    fetchRecapData()
  }, [])

  const fetchRecapData = async () => {
    try {
      setLoading(true)
      const data = await getCompletedEventsRecap()
      setEvents(data.events)
    } catch (error) {
      console.error('Failed to fetch recap data:', error)
      toast({
        title: "Failed to Load Data",
        description: error instanceof Error ? error.message : "Could not load event recap data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (!event) return
    
    try {
      setExporting(true)
      await exportEventToExcel(event.id, event.name)
      toast({
        title: "Export Successful",
        description: `${event.name} data has been exported to CSV`,
      })
    } catch (error) {
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export data",
        variant: "destructive",
      })
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-lg text-slate-600">Loading event recap data...</p>
        </div>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <p className="text-lg font-semibold text-slate-600">No Completed Events</p>
          <p className="text-sm text-slate-500 mt-1">Completed events will appear here</p>
        </div>
      </div>
    )
  }

  const reversedEvents = [...events].reverse()
  const event = events[events.length - 1 - selectedEventIndex]

  const getEventLogo = (eventType: string) => {
    if (eventType.includes('problems-worth-solving')) {
      return '/pws.png'
    }
    return '/aggiesinvent.png'
  }

  const getAwardLabel = (awardType: string) => {
    const labels: Record<string, string> = {
      first_place: '1st Place',
      second_place: '2nd Place',
      third_place: '3rd Place',
      most_feasible: 'Most Feasible Solution',
      best_prototype: 'Best Prototype',
      best_video: 'Best Video',
      best_presentation: 'Best Presentation'
    }
    return labels[awardType] || awardType
  }

  const allJudges = Array.from(
    new Set(
      event.teams.flatMap(team => team.judges.map(j => JSON.stringify({ id: j.id, name: j.name })))
    )
  ).map(j => JSON.parse(j))

  const rankedTeams = [...event.teams].sort((a, b) => b.avg_score - a.avg_score)

  return (
    <div className="space-y-8">
      {/* Timeline */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-slate-200/80 bg-linear-to-b from-primary to-[#3d0000] shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30" />
        
        <div className="relative p-4">
          <div className="mb-6 flex items-center justify-between">
            <div className="w-[88px]"></div>
            
            <h4 className="absolute left-1/2 -translate-x-1/2 text-lg font-semibold uppercase tracking-[0.2em] text-white/70">
              Events Timeline
            </h4>
            
            <div className="flex gap-2">
              <Button
                onClick={() => setSelectedEventIndex(Math.max(0, selectedEventIndex - 1))}
                disabled={selectedEventIndex === 0}
                className="h-10 w-10 rounded-xl border-2 border-white/30 bg-white/10 p-0 text-white shadow-md backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/20 disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                onClick={() => setSelectedEventIndex(Math.min(events.length - 1, selectedEventIndex + 1))}
                disabled={selectedEventIndex === events.length - 1}
                className="h-10 w-10 rounded-xl border-2 border-white/30 bg-white/10 p-0 text-white shadow-md backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/20 disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="relative overflow-x-auto pb-4 pt-8">
            <div className="flex items-center gap-4 px-4">
              <div className="absolute left-0 right-0 top-1/2 h-1 bg-linear-to-r from-white/20 via-white/40 to-white/20" />
            
              {reversedEvents.map((evt, index) => {
                const displayName = evt.name.length > 30 
                  ? evt.name.substring(0, 30) + '...'
                  : evt.name
                
                let eventLogo = getEventLogo(evt.event_type)
                
                return (
                  <div
                    key={evt.id}
                    className="relative z-10 flex min-w-[200px] flex-col items-center gap-3"
                  >
                    <button
                      onClick={() => setSelectedEventIndex(index)}
                      className={`group relative flex items-center justify-center transition-all duration-300 ${
                        selectedEventIndex === index
                          ? "scale-125 -translate-y-10"
                          : "hover:scale-110 -translate-y-8 hover:-translate-y-9"
                      }`}
                    >
                      <div className="relative h-28 w-28">
                        <Image
                          src={eventLogo}
                          alt={evt.name}
                          width={112}
                          height={112}
                          className={`h-full w-full object-contain transition-all duration-300 ${
                            selectedEventIndex === index ? 'drop-shadow-2xl' : 'drop-shadow-xl'
                          }`}
                          style={{
                            filter: 'brightness(0) invert(1)'
                          }}
                        />
                      </div>
                    </button>
                    
                    <div className="text-center">
                      <div className={`text-sm font-bold transition-colors ${
                        selectedEventIndex === index ? "text-white" : "text-white/80"
                      }`}>
                        {displayName}
                      </div>
                      <div className={`text-xs ${
                        selectedEventIndex === index ? "text-white/90" : "text-white/60"
                      }`}>
                        {formatDateRange(evt.start_date, evt.end_date)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Event Detail with Tabs (mimicking Excel sheets) */}
      <Card className="relative overflow-hidden rounded-[28px] border-2 border-slate-200/80 bg-white shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-2 bg-linear-to-r from-primary via-rose-400 to-orange-300" />
        
        <CardHeader className="relative border-b border-slate-100 bg-linear-to-br from-slate-50/80 via-white to-slate-50/50 p-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-primary to-rose-600 shadow-lg">
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold text-slate-900">
                    {event.name}
                  </CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-2 text-base text-slate-600">
                    <Calendar className="h-4 w-4" />
                    {formatDateRange(event.start_date, event.end_date)}
                  </CardDescription>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                onClick={handleExport}
                disabled={exporting}
                className="h-11 rounded-xl border-2 border-primary/30 bg-linear-to-br from-primary/10 to-primary/20 px-5 text-sm font-bold text-primary shadow-md transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-50"
              >
                {exporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export to CSV
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Tabs defaultValue="overview" className="w-full">
            <div className="border-b border-slate-200 bg-slate-50/50 px-8 pt-6">
              <TabsList className="h-12 bg-white border border-slate-200 rounded-xl p-1">
                <TabsTrigger value="overview" className="flex items-center gap-2 rounded-lg px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white">
                  <Users className="h-4 w-4" />
                  Judge & Team Names
                </TabsTrigger>
                <TabsTrigger value="scores" className="flex items-center gap-2 rounded-lg px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white">
                  <FileText className="h-4 w-4" />
                  Score Sheet
                </TabsTrigger>
                <TabsTrigger value="results" className="flex items-center gap-2 rounded-lg px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white">
                  <Trophy className="h-4 w-4" />
                  Final Results
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Sheet 1: Judge & Team Names */}
            <TabsContent value="overview" className="p-8 space-y-8">
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Judges
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {allJudges.map((judge, index) => (
                    <div key={judge.id} className="flex items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 py-3">
                      <Badge className="bg-primary text-white">Judge {index + 1}</Badge>
                      <span className="font-semibold text-slate-900">{judge.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Teams
                </h3>
                <div className="grid gap-3">
                  {event.teams.map((team, index) => (
                    <div key={team.id} className="rounded-xl border-2 border-slate-200 bg-white px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-primary text-white">Team {index + 1}</Badge>
                        <span className="font-semibold text-slate-900">{team.name}</span>
                      </div>
                      {team.mentor_name && (
                        <div className="mt-2 ml-20 text-sm text-slate-600">
                          Mentor: <span className="font-medium">{team.mentor_name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Sheet 2: Score Sheet */}
            <TabsContent value="scores" className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-slate-200 bg-slate-50">
                      <th className="px-6 py-4 text-left text-sm font-bold uppercase tracking-wider text-slate-700">
                        Team
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold uppercase tracking-wider text-slate-700">
                        Judge
                      </th>
                      <th className="px-4 py-4 text-center text-sm font-bold uppercase tracking-wider text-slate-700">
                        Communication
                        <div className="text-xs font-normal text-slate-500">/25</div>
                      </th>
                      <th className="px-4 py-4 text-center text-sm font-bold uppercase tracking-wider text-slate-700">
                        Funding
                        <div className="text-xs font-normal text-slate-500">/25</div>
                      </th>
                      <th className="px-4 py-4 text-center text-sm font-bold uppercase tracking-wider text-slate-700">
                        Presentation
                        <div className="text-xs font-normal text-slate-500">/25</div>
                      </th>
                      <th className="px-4 py-4 text-center text-sm font-bold uppercase tracking-wider text-slate-700">
                        Cohesion
                        <div className="text-xs font-normal text-slate-500">/25</div>
                      </th>
                      <th className="px-6 py-4 text-center text-sm font-bold uppercase tracking-wider text-slate-700">
                        Total
                        <div className="text-xs font-normal text-slate-500">/100</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {event.teams.map((team) => (
                      team.judges.map((judge, judgeIndex) => (
                        <tr key={`${team.id}-${judge.id}`} className="hover:bg-slate-50 transition-colors">
                          {judgeIndex === 0 && (
                            <td rowSpan={team.judges.length} className="px-6 py-4 border-r border-slate-200 bg-slate-50/50">
                              <div className="font-semibold text-slate-900">{team.name}</div>
                              {team.mentor_name && (
                                <div className="text-xs text-slate-500 mt-1">Mentor: {team.mentor_name}</div>
                              )}
                            </td>
                          )}
                          <td className="px-6 py-4 text-slate-700">{judge.name}</td>
                          <td className="px-4 py-4 text-center">
                            <span className="text-base font-bold text-slate-900">{judge.communication}</span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="text-base font-bold text-slate-900">{judge.funding}</span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="text-base font-bold text-slate-900">{judge.presentation}</span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="text-base font-bold text-slate-900">{judge.cohesion}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-lg font-bold text-primary">{judge.total}</span>
                          </td>
                        </tr>
                      ))
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Sheet 3: Final Results */}
            <TabsContent value="results" className="p-8 space-y-8">
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  Rankings
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-slate-200 bg-slate-50">
                        <th className="px-6 py-4 text-left text-sm font-bold uppercase tracking-wider text-slate-700">Rank</th>
                        <th className="px-6 py-4 text-left text-sm font-bold uppercase tracking-wider text-slate-700">Team Name</th>
                        <th className="px-6 py-4 text-center text-sm font-bold uppercase tracking-wider text-slate-700">Average Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rankedTeams.map((team, index) => (
                        <tr key={team.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <Badge className={`${
                              index === 0 ? 'bg-amber-500' :
                              index === 1 ? 'bg-slate-400' :
                              index === 2 ? 'bg-orange-600' :
                              'bg-slate-300'
                            } text-white`}>
                              {index + 1}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-900">{team.name}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-lg font-bold text-primary">{team.avg_score.toFixed(2)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {event.awards && event.awards.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Award className="h-5 w-5 text-amber-500" />
                    Special Awards
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {event.awards.map((award, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3"
                      >
                        <Trophy className="h-5 w-5 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                            {getAwardLabel(award.award_type)}
                          </div>
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {award.team_name}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
