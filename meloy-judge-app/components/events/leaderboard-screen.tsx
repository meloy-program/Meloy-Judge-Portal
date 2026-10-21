"use client"

import { useState, useEffect } from "react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { JudgeProgressScreen } from "./judge-progress-screen"
import { FinalLeaderboardScreen } from "./final-leaderboard-screen"
import { getEvent } from "@/lib/api"
import type { Event } from "@/lib/types/api"
import { useAuthToken } from "@/lib/auth-context"

interface LeaderboardScreenProps {
  eventId: string
  judgeId: string | null
  onBack: () => void
  judgeName: string | null
  isAdmin?: boolean
}

/**
 * Leaderboard Screen Wrapper
 * 
 * Automatically detects judging phase from event data:
 * - "in-progress" or "not-started" → Judge Progress Screen
 * - "ended" → Final Leaderboard Screen
 * Dev toggle available to manually override
 */
export function LeaderboardScreen({ eventId, judgeId, onBack, judgeName, isAdmin = false }: LeaderboardScreenProps) {
  const [event, setEvent] = useState<Event | null>(null)
  const [manualOverride, setManualOverride] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { isTokenValid, isValidating } = useAuthToken()

  const isDev = process.env.NODE_ENV === 'development'

  // Fetch event data to check judging phase
  useEffect(() => {
    if (!isTokenValid || isValidating) return
    let cancelled = false
    async function fetchEvent() {
      try {
        const { event: eventData } = await getEvent(eventId)
        if (!cancelled) {
          setEvent(eventData)
          setError(null)
        }
      } catch (err) {
        console.error('Failed to fetch event:', err)
        if (!cancelled) setError('Unable to load the event summary. Please return to the event and try again.')
      }
    }
    fetchEvent()
    const interval = setInterval(fetchEvent, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [eventId, isTokenValid, isValidating])

  if (!event) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
        {error ? <><p className="text-red-600">{error}</p><Button onClick={onBack}>Back to Event</Button></> : <Loader2 className="h-12 w-12 animate-spin text-primary" />}
      </div>
    )
  }

  // Determine which screen to show
  // Manual override takes precedence in dev mode
  const isPostJudging = manualOverride !== null
    ? manualOverride
    : event?.judging_phase === 'ended'

  return (
    <div className="relative">
      {/* Dev-only toggle */}
      {isDev && (
        <div className="fixed bottom-8 right-8 z-50 flex items-center gap-3 rounded-full border-2 border-slate-300 bg-white px-5 py-3 shadow-2xl">
          <Label htmlFor="view-toggle" className="text-sm font-semibold text-slate-700">
            {isPostJudging ? "Final Leaderboard" : "Judge Progress"}
            {manualOverride === null && event && " (Auto)"}
          </Label>
          <Switch
            id="view-toggle"
            checked={isPostJudging}
            onCheckedChange={setManualOverride}
          />
        </div>
      )}

      {/* Conditionally render the appropriate screen */}
      {isPostJudging ? (
        <FinalLeaderboardScreen eventId={eventId} onBack={onBack} judgeName={judgeName} isAdmin={isAdmin} />
      ) : (
        <JudgeProgressScreen eventId={eventId} judgeId={judgeId} onBack={onBack} judgeName={judgeName} isAdmin={isAdmin} />
      )}
    </div>
  )
}
