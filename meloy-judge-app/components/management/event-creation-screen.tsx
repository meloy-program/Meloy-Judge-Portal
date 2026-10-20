"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { useUser } from '@auth0/nextjs-auth0/client'
import { Button } from "@/components/ui/button"
import { ArrowLeft, Save, User, Loader2, Sparkles } from "lucide-react"
import { EventDetailsSection } from "./event-creation/event-details-section"
import { SponsorSection } from "./event-creation/sponsor-section"
import { JudgeAccountSection } from "./event-creation/judge-account-section"
import { createEvent, updateEvent, updateJudgeAccount } from "@/lib/api/events"
import { createSponsor } from "@/lib/api/sponsors"
import { getCurrentUser } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { getEventDateRangeError } from "@/lib/event-dates"

interface EventCreationScreenProps {
  onBack: () => void
}

type EventType = "aggies-invent" | "problems-worth-solving"

export function EventCreationScreen({ onBack }: EventCreationScreenProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { user: auth0User } = useUser()
  
  // Event Details State
  const [eventName, setEventName] = useState("")
  const [eventType, setEventType] = useState<EventType>("aggies-invent")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [eventLocation, setEventLocation] = useState("")
  const [eventDescription, setEventDescription] = useState("")

  // Sponsor State
  const [sponsorName, setSponsorName] = useState("Meloy Program")
  const [sponsorLogo, setSponsorLogo] = useState<string | null>("/meloyprogrammaroon.png")
  const [primaryColor, setPrimaryColor] = useState("#500000")
  const [secondaryColor, setSecondaryColor] = useState("#1f0000")
  const [textColor, setTextColor] = useState("#FFFFFF")

  // Judge Account State
  const [selectedJudgeEmail, setSelectedJudgeEmail] = useState<string | null>(null)

  // User State
  const [userRole, setUserRole] = useState<string>('admin')

  // UI State
  const [isCreating, setIsCreating] = useState(false)

  // Fetch user data
  useEffect(() => {
    async function fetchUserData() {
      try {
        const userData = await getCurrentUser()
        setUserRole(userData.user.role || 'admin')
      } catch (err) {
        console.error('Failed to fetch user data:', err)
      }
    }
    fetchUserData()
  }, [])

  // Get user name from Auth0 or fallback
  const userName = auth0User?.name || auth0User?.email?.split('@')[0] || 'Admin'

  const handleSubmit = async () => {
    try {
      setIsCreating(true)

      // Validate required fields
      if (!eventName || !startDate || !endDate || !eventLocation || !selectedJudgeEmail) {
        toast({
          title: "Missing Required Fields",
          description: "Please fill in event name, dates, location, and select a judge account",
          variant: "destructive",
        })
        return
      }

      const dateError = getEventDateRangeError(startDate, endDate)
      if (dateError) {
        toast({ title: "Invalid Event Dates", description: dateError, variant: "destructive" })
        return
      }

      // Step 1: Create the event with the selected calendar dates.
      const { event } = await createEvent({
        name: eventName,
        event_type: eventType,
        start_date: startDate,
        end_date: endDate,
        location: eventLocation,
        description: eventDescription || "",
      })

      // Step 2: Set the judge account for the event
      await updateJudgeAccount(event.id, selectedJudgeEmail)

      // Step 3: Create sponsor (always create sponsor with event)
      const { sponsor } = await createSponsor({
        event_id: event.id,
        name: sponsorName,
        logo_url: sponsorLogo,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        text_color: textColor,
      })

      // Step 4: Update event with sponsor_id so it shows in event manager
      await updateEvent(event.id, {
        sponsor_id: sponsor.id,
      })

      // Step 5: Navigate back to admin page with success message
      router.push(`/admin?success=true&eventName=${encodeURIComponent(eventName)}`)
    } catch (error) {
      console.error("Failed to create event:", error)
      toast({
        title: "Failed to Create Event",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const isFormValid = eventName && startDate && endDate && eventLocation && selectedJudgeEmail

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
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 text-white shadow-lg backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/20"
              >
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <div className="flex h-14 sm:h-16 lg:h-20 xl:h-20 w-auto shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 px-2 sm:px-3 py-2 shadow-md backdrop-blur-md">
                <Image src="/meloyprogram.png" alt="Meloy Program Judging Portal" width={160} height={64} className="h-10 sm:h-12 lg:h-14 xl:h-16 w-auto object-contain" />
              </div>
            </div>

            {/* Center: Title (hidden on mobile, shown on larger screens) */}
            <div className="hidden md:flex flex-col items-center flex-1 min-w-0 px-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-6 lg:h-7 xl:h-8 w-6 lg:w-7 xl:w-8 text-white opacity-60" />
                <h1 className="text-2xl lg:text-3xl xl:text-4xl font-semibold text-white leading-tight text-center truncate">Event Creator</h1>
              </div>
            </div>

            {/* Right Side: User Profile */}
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
            </div>
          </div>

          {/* Mobile Title - Centered Below */}
          <div className="md:hidden mt-3 flex flex-col items-center text-center">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-white opacity-60" />
              <h1 className="text-xl font-semibold text-white leading-tight">Event Creator</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-6 py-5 lg:py-6 lg:px-8">
        <div className="space-y-10">
          {/* Event Details Section */}
          <EventDetailsSection
            eventName={eventName}
            setEventName={setEventName}
            eventType={eventType}
            setEventType={setEventType}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            eventLocation={eventLocation}
            setEventLocation={setEventLocation}
            eventDescription={eventDescription}
            setEventDescription={setEventDescription}
          />

          {/* Judge Account Section */}
          <JudgeAccountSection
            selectedJudgeEmail={selectedJudgeEmail}
            onSelectJudge={setSelectedJudgeEmail}
          />

          {/* Sponsor Branding Section */}
          <SponsorSection
            sponsorName={sponsorName}
            setSponsorName={setSponsorName}
            sponsorLogo={sponsorLogo}
            setSponsorLogo={setSponsorLogo}
            primaryColor={primaryColor}
            setPrimaryColor={setPrimaryColor}
            secondaryColor={secondaryColor}
            setSecondaryColor={setSecondaryColor}
            textColor={textColor}
            setTextColor={setTextColor}
          />

          {/* Note: Judge Profiles and Teams will be added in the Event Manager after creation */}
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            <p className="text-base font-semibold text-slate-600">Judge Profiles and Teams</p>
            <p className="text-sm text-slate-500 mt-2">
              After creating the event, you can add judge profiles and teams in the Event Manager
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button
              variant="outline"
              onClick={onBack}
              className="h-14 flex-1 rounded-2xl border-2 border-slate-300 text-lg font-semibold text-slate-600 hover:border-primary/40 hover:bg-primary/5"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || isCreating}
              className="h-14 flex-1 rounded-2xl bg-primary text-lg font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                  Creating Event...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-6 w-6" />
                  Create Event
                </>
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
