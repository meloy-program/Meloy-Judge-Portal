"use client"

import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "lucide-react"

type EventType = "aggies-invent" | "problems-worth-solving"

interface EventDetailsSectionProps {
  eventName: string
  setEventName: (value: string) => void
  eventType: EventType
  setEventType: (value: EventType) => void
  startDate: string
  setStartDate: (value: string) => void
  endDate: string
  setEndDate: (value: string) => void
  eventLocation: string
  setEventLocation: (value: string) => void
  eventDescription: string
  setEventDescription: (value: string) => void
}

const eventTypes = [
  { value: "aggies-invent" as const, label: "Aggies Invent", logo: "/aggiesinvent.png" },
  { value: "problems-worth-solving" as const, label: "Problems Worth Solving", logo: "/pws.png" },
]

export function EventDetailsSection({
  eventName,
  setEventName,
  eventType,
  setEventType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  eventLocation,
  setEventLocation,
  eventDescription,
  setEventDescription,
}: EventDetailsSectionProps) {
  return (
    <Card className="overflow-hidden rounded-3xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-white shadow-2xl p-0">
      <CardHeader className="relative overflow-hidden border-b-2 border-primary/10 bg-gradient-to-b from-primary to-[#3d0000] p-8 m-0">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30" />
        <div className="relative">
          <CardTitle className="flex items-center gap-3 text-2xl font-bold text-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <Calendar className="h-6 w-6 text-white" />
            </div>
            Event Details
          </CardTitle>
          <CardDescription className="text-base text-white/80 mt-2">
            Capture the core attributes that define your event experience
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-8">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <Label htmlFor="event-name" className="text-sm font-bold uppercase tracking-[0.15em] text-slate-700">
              Event Name
            </Label>
            <Input
              id="event-name"
              placeholder="e.g., Aggies Invent Spring 2025"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="h-14 rounded-2xl border-2 border-slate-200 px-5 text-lg shadow-inner focus:border-primary/40 transition-colors"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-sm font-bold uppercase tracking-[0.15em] text-slate-700">Event Type</Label>
            <div className="grid grid-cols-2 gap-4">
              {eventTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setEventType(type.value)}
                  className={`flex items-center justify-center rounded-xl border-2 p-6 transition-all relative ${
                    eventType === type.value
                      ? "border-primary/50 bg-primary/10 shadow-md"
                      : "border-slate-200 bg-white hover:border-primary/30 hover:bg-primary/5"
                  }`}
                >
                  <Image
                    src={type.logo}
                    alt={type.label}
                    width={180}
                    height={60}
                    className="object-contain"
                    style={{
                      filter: eventType === type.value ? "none" : "grayscale(100%) opacity(0.5)",
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <Label htmlFor="start-date" className="text-sm font-bold uppercase tracking-[0.15em] text-slate-700">
              Start Date
            </Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-14 rounded-2xl border-2 border-slate-200 px-5 text-lg shadow-inner focus:border-primary/40 transition-colors"
            />
          </div>
          <div className="space-y-3">
            <Label htmlFor="end-date" className="text-sm font-bold uppercase tracking-[0.15em] text-slate-700">
              End Date
            </Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-14 rounded-2xl border-2 border-slate-200 px-5 text-lg shadow-inner focus:border-primary/40 transition-colors"
            />
          </div>
        </div>

        <div className="space-y-3">
          <Label htmlFor="event-location" className="text-sm font-bold uppercase tracking-[0.15em] text-slate-700">
            Event Location
          </Label>
          <Input
            id="event-location"
            placeholder="e.g., Zachry Engineering Center"
            value={eventLocation}
            onChange={(e) => setEventLocation(e.target.value)}
            className="h-14 rounded-2xl border-2 border-slate-200 px-5 text-lg shadow-inner focus:border-primary/40 transition-colors"
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="event-description" className="text-sm font-bold uppercase tracking-[0.15em] text-slate-700">
            Event Description
          </Label>
          <Textarea
            id="event-description"
            placeholder="Provide a brief overview of what this event is about..."
            value={eventDescription}
            onChange={(e) => setEventDescription(e.target.value)}
            rows={4}
            className="rounded-2xl border-2 border-slate-200 px-5 py-3 text-base shadow-inner focus:border-primary/40 transition-colors"
          />
        </div>
      </CardContent>
    </Card>
  )
}
