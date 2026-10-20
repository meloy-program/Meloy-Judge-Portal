"use client"

import { useEffect, useState } from "react"
import { Carlito } from "next/font/google"
import { ArrowLeft, Loader2, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PwsCommentSheet } from "@/components/comment-sheets/pws-comment-sheet"
import { PWS_SHEET_ROW_COUNT } from "@/lib/comment-sheets/pws-sheet-layout"
import { getEvent, getEventTeams, getRubric } from "@/lib/api"
import type { Event, RubricCriteria, Team } from "@/lib/types/api"

// Metric-compatible with Calibri (the template's font), so text wraps identically on any machine.
const sheetFont = Carlito({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-pws-sheet" })

interface CommentSheetsScreenProps {
  eventId: string
  onBack: () => void
}

export function CommentSheetsScreen({ eventId, onBack }: CommentSheetsScreenProps) {
  const [event, setEvent] = useState<Event | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [criteria, setCriteria] = useState<RubricCriteria[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [eventData, teamsData, rubricData] = await Promise.all([
          getEvent(eventId),
          getEventTeams(eventId, { activeOnly: false }),
          getRubric("problems-worth-solving"),
        ])

        if (eventData.event.event_type !== "problems-worth-solving") {
          throw new Error("Comment sheets are only available for Problems Worth Solving events.")
        }
        if (rubricData.criteria.length !== PWS_SHEET_ROW_COUNT) {
          throw new Error(`Expected ${PWS_SHEET_ROW_COUNT} PWS criteria, found ${rubricData.criteria.length}.`)
        }

        const sortedTeams = [...teamsData.teams].sort((a, b) => {
          const orderDiff = (a.presentation_order ?? Infinity) - (b.presentation_order ?? Infinity)
          return orderDiff !== 0 ? orderDiff : a.name.localeCompare(b.name)
        })

        setEvent(eventData.event)
        setTeams(sortedTeams)
        setCriteria([...rubricData.criteria].sort((a, b) => a.display_order - b.display_order))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load comment sheets")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [eventId])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-lg text-red-600">{error || "Event not found"}</p>
        <Button onClick={onBack}>Go Back</Button>
      </div>
    )
  }

  return (
    <div className={`${sheetFont.variable} min-h-screen bg-slate-100 print:bg-white`}>
      <style>{`
        @page { size: letter landscape; margin: 0; }
        @media print {
          .pws-sheet { break-after: page; box-shadow: none !important; margin: 0 !important; }
          .pws-sheet:last-child { break-after: auto; }
        }
      `}</style>

      <div className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[11.5in] items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to event">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Comment Sheets</h1>
              <p className="text-sm text-slate-500">
                {event.name} · {teams.length} {teams.length === 1 ? "sheet" : "sheets"} · print on US Letter, landscape, 100% scale
              </p>
            </div>
          </div>
          <Button onClick={() => window.print()} disabled={teams.length === 0}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {teams.length === 0 ? (
        <p className="py-16 text-center text-slate-500 print:hidden">This event has no participants yet.</p>
      ) : (
        <div className="flex flex-col items-center gap-8 overflow-x-auto py-8 print:block print:gap-0 print:p-0">
          {teams.map((team) => (
            <div key={team.id} className="pws-sheet shadow-lg">
              <PwsCommentSheet teamId={team.id} teamName={team.name} eventName={event.name} criteria={criteria} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
