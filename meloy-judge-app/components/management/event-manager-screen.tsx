"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import {
  ArrowLeft,
  Award,
  Building2,
  Edit,
  Users,
  User,
  SlidersHorizontal,
} from "lucide-react"
import { getEvent, updateEvent } from "@/lib/api/events"
import { createSponsor, updateSponsor } from "@/lib/api/sponsors"
import { getEventJudgeProfiles, createJudgeProfile, deleteJudgeProfile, type JudgeProfile } from "@/lib/api/judges"
import type { Event } from "@/lib/types/api"
import { getEventDate, getEventDateRangeError } from "@/lib/event-dates"
import { DetailsTab } from "./tabs/details-tab"
import { SponsorTab } from "./tabs/sponsor-tab"
import { JudgesTab } from "./tabs/judges-tab"
import { TeamsTab } from "./tabs/teams-tab"

interface EventManagerScreenProps {
  eventId: string
  userId: string
  onBack: () => void
  onSave: () => void
  userName: string
  userRole: string
}

type EventType = "aggies-invent" | "problems-worth-solving"

export function EventManagerScreen({ eventId, userId, onBack, onSave, userName, userRole }: EventManagerScreenProps) {
  // Loading state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Event data
  const [event, setEvent] = useState<Event | null>(null)
  const [sponsorId, setSponsorId] = useState<string | null>(null)
  
  // Event Details State
  const [eventName, setEventName] = useState("")
  const [eventType, setEventType] = useState<EventType>("aggies-invent")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [eventLocation, setEventLocation] = useState("")
  const [eventDescription, setEventDescription] = useState("")

  // Sponsor State
  const [sponsorName, setSponsorName] = useState("")
  const [sponsorLogo, setSponsorLogo] = useState<string | null>(null)
  const [primaryColor, setPrimaryColor] = useState("#500000")
  const [secondaryColor, setSecondaryColor] = useState("#FFFFFF")
  const [textColor, setTextColor] = useState("#FFFFFF")

  // Judges State
  const [judgeProfiles, setJudgeProfiles] = useState<JudgeProfile[]>([])
  const [newJudgeName, setNewJudgeName] = useState("")

  // Teams State
  const [teams, setTeams] = useState<any[]>([])

  // Dialog state
  const [showExitDialog, setShowExitDialog] = useState(false)

  // Load event data on mount
  useEffect(() => {
    async function loadEventData() {
      try {
        setLoading(true)
        const { event: eventData } = await getEvent(eventId)
        setEvent(eventData)
        
        // Set event details
        setEventName(eventData.name)
        setEventType(eventData.event_type as EventType)
        // Keep the stored calendar dates unchanged when editing.
        setStartDate(getEventDate(eventData.start_date))
        setEndDate(getEventDate(eventData.end_date))
        setEventLocation(eventData.location)
        setEventDescription(eventData.description)
        
        // Set sponsor data if exists
        if (eventData.sponsor && eventData.sponsor.name) {
          setSponsorId(eventData.sponsor_id)
          setSponsorName(eventData.sponsor.name)
          setSponsorLogo(eventData.sponsor.logo_url)
          setPrimaryColor(eventData.sponsor.primary_color || "#500000")
          setSecondaryColor(eventData.sponsor.secondary_color || "#FFFFFF")
          setTextColor(eventData.sponsor.text_color || "#FFFFFF")
        } else {
          // Set default Meloy Program branding if no sponsor
          setSponsorId(null)
          setSponsorName("Meloy Program")
          setSponsorLogo("/meloyprogrammaroon.png")
          setPrimaryColor("#500000")
          setSecondaryColor("#1f0000")
          setTextColor("#FFFFFF")
        }
        
        // Load judge profiles
        const { profiles } = await getEventJudgeProfiles(eventId)
        setJudgeProfiles(profiles)

        // Load teams
        await loadTeams()
      } catch (error) {
        console.error('Failed to load event data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadEventData()
  }, [eventId])

  const loadTeams = async () => {
    try {
      const response = await fetch(`/api/proxy/events/${eventId}/teams`)
      const data = await response.json()
      const teamsData = data.teams || []
      
      // Load members for each team
      const teamsWithMembers = await Promise.all(
        teamsData.map(async (team: any) => {
          try {
            const teamResponse = await fetch(`/api/proxy/teams/${team.id}`)
            const teamData = await teamResponse.json()
            return { ...team, members: teamData.members || [] }
          } catch (error) {
            console.error(`Failed to load members for team ${team.id}:`, error)
            return { ...team, members: [] }
          }
        })
      )
      
      setTeams(teamsWithMembers)
    } catch (error) {
      console.error('Failed to load teams:', error)
    }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setSponsorLogo(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const addJudge = async () => {
    if (!newJudgeName.trim()) return
    if (!event?.judge_user_id) {
      alert('Please set up a judge account for this event first')
      return
    }
    
    try {
      const { profile } = await createJudgeProfile(eventId, {
        name: newJudgeName,
        user_id: event.judge_user_id, // Use the event's dedicated judge account
      })
      setJudgeProfiles([...judgeProfiles, profile])
      setNewJudgeName("")
    } catch (error) {
      console.error('Failed to add judge:', error)
      alert('Failed to add judge profile')
    }
  }

  const removeJudge = async (profileId: string) => {
    try {
      await deleteJudgeProfile(profileId)
      setJudgeProfiles(judgeProfiles.filter((profile) => profile.id !== profileId))
    } catch (error) {
      console.error('Failed to remove judge:', error)
      alert('Failed to remove judge profile')
    }
  }

  const updateJudgeAccount = async (email: string) => {
    try {
      const { updateJudgeAccount: updateJudgeAccountAPI } = await import('@/lib/api/events')
      const { event: updatedEvent } = await updateJudgeAccountAPI(eventId, email)
      setEvent(updatedEvent)
      alert('Judge account updated successfully!')
    } catch (error) {
      console.error('Failed to update judge account:', error)
      throw error // Re-throw to let the tab handle the error
    }
  }

  const handleSaveDetails = async () => {
    try {
      setSaving(true)
      const dateError = getEventDateRangeError(startDate, endDate)
      if (dateError) {
        alert(dateError)
        return
      }
      await updateEvent(eventId, {
        name: eventName,
        event_type: eventType,
        start_date: startDate,
        end_date: endDate,
        location: eventLocation,
        description: eventDescription,
      })
      alert('Event details saved successfully!')
    } catch (error) {
      console.error('Failed to save event details:', error)
      alert('Failed to save event details')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSponsor = async () => {
    try {
      setSaving(true)
      
      const sponsorData = {
        name: sponsorName,
        logo_url: sponsorLogo,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        text_color: textColor,
      }
      
      let updatedSponsorId = sponsorId
      
      if (sponsorId) {
        await updateSponsor(sponsorId, sponsorData)
      } else {
        // Include event_id when creating new sponsor
        const { sponsor } = await createSponsor({
          event_id: eventId,
          ...sponsorData
        })
        updatedSponsorId = sponsor.id
        setSponsorId(sponsor.id)
        await updateEvent(eventId, {
          sponsor_id: sponsor.id,
        })
      }
      
      // Reload event data to get updated sponsor information
      const { event: updatedEvent } = await getEvent(eventId)
      setEvent(updatedEvent)
      
      // Update sponsor state with fresh data
      if (updatedEvent.sponsor && updatedEvent.sponsor.name) {
        setSponsorName(updatedEvent.sponsor.name)
        setSponsorLogo(updatedEvent.sponsor.logo_url)
        setPrimaryColor(updatedEvent.sponsor.primary_color || "#500000")
        setSecondaryColor(updatedEvent.sponsor.secondary_color || "#FFFFFF")
        setTextColor(updatedEvent.sponsor.text_color || "#FFFFFF")
      }
      
      alert('Sponsor settings saved successfully!')
    } catch (error) {
      console.error('Failed to save sponsor:', error)
      alert('Failed to save sponsor settings')
    } finally {
      setSaving(false)
    }
  }

  const handleExitAttempt = () => {
    setShowExitDialog(true)
  }

  const confirmExit = () => {
    setShowExitDialog(false)
    onBack()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-600">Loading event data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-primary/5">
      <header className="relative z-30 border-b bg-linear-to-b from-primary to-[#3d0000] shadow-xl overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-3 sm:py-4 lg:px-8">
          {/* Main Header Row - Always one line */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Left Side: Back Button + Logo */}
            <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 shrink-0">
              <Button
                variant="ghost"
                onClick={handleExitAttempt}
                className="flex h-12 w-12 lg:h-14 lg:w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 text-white shadow-lg backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/20"
              >
                <ArrowLeft className="h-6 w-6 lg:h-7 lg:w-7" />
              </Button>
              <div className="flex h-14 sm:h-16 lg:h-20 xl:h-20 w-auto shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 px-2 sm:px-3 py-2 shadow-md backdrop-blur-md">
                <Image src="/meloyprogram.png" alt="Meloy Program Judging Portal" width={160} height={64} className="h-10 sm:h-12 lg:h-14 xl:h-16 w-auto object-contain" />
              </div>
            </div>

            {/* Center: Event Manager Title (hidden on mobile, shown on larger screens) */}
            <div className="hidden md:flex items-center justify-center gap-3 flex-1 min-w-0 px-4">
              <SlidersHorizontal className="h-6 w-6 lg:h-7 lg:w-7 text-white opacity-60" strokeWidth={2.5} />
              <h1 className="text-xl lg:text-2xl xl:text-3xl font-semibold text-white leading-tight text-center truncate">Event Manager</h1>
            </div>

            {/* Right Side: User Profile */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* User Profile - Always visible */}
              <div className="flex items-center gap-2 sm:gap-3 rounded-full border-2 border-white/30 bg-white/10 px-2.5 sm:px-4 py-1.5 sm:py-2 shadow-lg backdrop-blur-sm">
                <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full border-2 border-white/50 bg-white/20">
                  <User className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs sm:text-sm font-semibold text-white leading-tight">{userName}</span>
                  <span className="text-[10px] sm:text-xs text-white/70">{userRole.charAt(0).toUpperCase() + userRole.slice(1)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Event Manager Title - Centered Below */}
          <div className="md:hidden mt-3 flex items-center justify-center gap-2 text-center">
            <SlidersHorizontal className="h-5 w-5 text-white opacity-60" strokeWidth={2.5} />
            <h1 className="text-lg font-semibold text-white leading-tight">Event Manager</h1>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-6 py-5 lg:py-6 lg:px-8">
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid h-16 w-full grid-cols-4 rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-lg backdrop-blur">
            <TabsTrigger
              value="details"
              className="flex h-full items-center justify-center rounded-xl border border-transparent text-base font-semibold text-slate-600 transition-all duration-300 data-[state=active]:border-primary/30 data-[state=active]:bg-linear-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-md"
            >
              <Edit className="mr-2 h-5 w-5" />
              Details
            </TabsTrigger>
            <TabsTrigger
              value="sponsor"
              className="flex h-full items-center justify-center rounded-xl border border-transparent text-base font-semibold text-slate-600 transition-all duration-300 data-[state=active]:border-primary/30 data-[state=active]:bg-linear-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-md"
            >
              <Building2 className="mr-2 h-5 w-5" />
              Sponsor
            </TabsTrigger>
            <TabsTrigger
              value="judges"
              className="flex h-full items-center justify-center rounded-xl border border-transparent text-base font-semibold text-slate-600 transition-all duration-300 data-[state=active]:border-primary/30 data-[state=active]:bg-linear-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-md"
            >
              <Award className="mr-2 h-5 w-5" />
              Judges
            </TabsTrigger>
            <TabsTrigger
              value="teams"
              className="flex h-full items-center justify-center rounded-xl border border-transparent text-base font-semibold text-slate-600 transition-all duration-300 data-[state=active]:border-primary/30 data-[state=active]:bg-linear-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-md"
            >
              <Users className="mr-2 h-5 w-5" />
              Teams
            </TabsTrigger>
          </TabsList>

          <div className="mt-10 space-y-8">
            <DetailsTab
              eventName={eventName}
              setEventName={setEventName}
              eventType={eventType}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              eventLocation={eventLocation}
              setEventLocation={setEventLocation}
              eventDescription={eventDescription}
              setEventDescription={setEventDescription}
              saving={saving}
              onSave={handleSaveDetails}
            />

            <SponsorTab
              sponsorName={sponsorName}
              setSponsorName={setSponsorName}
              sponsorLogo={sponsorLogo}
              primaryColor={primaryColor}
              setPrimaryColor={setPrimaryColor}
              secondaryColor={secondaryColor}
              setSecondaryColor={setSecondaryColor}
              textColor={textColor}
              setTextColor={setTextColor}
              saving={saving}
              onLogoUpload={handleLogoUpload}
              onSave={handleSaveSponsor}
            />

            <JudgesTab
              judgeProfiles={judgeProfiles}
              judgeAccountEmail={event?.judge_user?.email || null}
              newJudgeName={newJudgeName}
              setNewJudgeName={setNewJudgeName}
              onAddJudge={addJudge}
              onRemoveJudge={removeJudge}
              onUpdateJudgeAccount={updateJudgeAccount}
            />

            <TeamsTab 
              eventId={eventId}
              teams={teams}
              onTeamsChange={loadTeams}
            />
          </div>
        </Tabs>
      </main>

      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent className="max-w-2xl rounded-3xl border-2 border-white/30 bg-white/90 backdrop-blur-xl shadow-2xl p-0">
          <AlertDialogHeader className="p-8 pb-4">
            <AlertDialogTitle className="text-3xl font-semibold text-slate-900">Are you sure?</AlertDialogTitle>
            <AlertDialogDescription className="mt-4 text-xl text-slate-600 leading-relaxed">
              You're about to leave the event manager.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-3 p-8 pt-4 sm:flex-row">
            <AlertDialogCancel className="h-16 flex-1 rounded-2xl border-2 border-slate-300 text-lg font-semibold text-slate-600 hover:border-primary/40 hover:bg-primary/5">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmExit}
              className="h-16 flex-1 rounded-2xl bg-primary text-lg font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl"
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
