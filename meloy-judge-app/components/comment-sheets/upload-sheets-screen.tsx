"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, Camera, CheckCircle2, ChevronDown, ChevronUp, Loader2, RotateCcw, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getEvent, getEventTeams, getRubric } from "@/lib/api"
import {
    getPresignedUploadUrl,
    saveCommentClips,
    uploadToS3,
    getCommentClips,
    type CommentClip,
} from "@/lib/api/uploads"
import { processCommentSheet, type CropClip, type ProcessedSheet } from "@/lib/comment-sheets/sheet-processor"
import type { Event, RubricCriteria, Team } from "@/lib/types/api"

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadStatus = "idle" | "processing" | "preview" | "uploading" | "done" | "error"

interface SheetDraft {
    teamId: string
    teamName: string
    sheet: ProcessedSheet
}

interface TeamClips {
    [teamId: string]: CommentClip[]
}

// ─── Component ────────────────────────────────────────────────────────────────

interface UploadSheetsScreenProps {
    eventId: string
    onBack: () => void
}

export function UploadSheetsScreen({ eventId, onBack }: UploadSheetsScreenProps) {
    // ── Data ──────────────────────────────────────────────────────────────────
    const [event, setEvent] = useState<Event | null>(null)
    const [teams, setTeams] = useState<Team[]>([])
    const [criteria, setCriteria] = useState<RubricCriteria[]>([])
    const [existingClips, setExistingClips] = useState<TeamClips>({})
    const [dataLoading, setDataLoading] = useState(true)
    const [dataError, setDataError] = useState<string | null>(null)

    // ── Upload state ──────────────────────────────────────────────────────────
    const [status, setStatus] = useState<UploadStatus>("idle")
    const [progress, setProgress] = useState<string>("")
    const [draft, setDraft] = useState<SheetDraft | null>(null)
    const [uploadError, setUploadError] = useState<string | null>(null)

    // ── Expanded team accordion ────────────────────────────────────────────────
    const [expandedTeam, setExpandedTeam] = useState<string | null>(null)

    const fileInputRef = useRef<HTMLInputElement>(null)

    // ── Load data ─────────────────────────────────────────────────────────────
    useEffect(() => {
        async function fetchData() {
            try {
                const [eventData, teamsData, rubricData] = await Promise.all([
                    getEvent(eventId),
                    getEventTeams(eventId),
                    getRubric("problems-worth-solving"),
                ])
                const sorted = [...(teamsData.teams || [])].sort(
                    (a: Team, b: Team) =>
                        (a.presentation_order ?? 999) - (b.presentation_order ?? 999)
                )
                setEvent(eventData.event)
                setTeams(sorted)
                setCriteria(rubricData.criteria || [])

                // Fetch existing clips for all teams in parallel
                const clipResults = await Promise.all(
                    sorted.map((t: Team) => getCommentClips(t.id).then(r => ({ teamId: t.id, clips: r.clips })).catch(() => ({ teamId: t.id, clips: [] })))
                )
                const clipsMap: TeamClips = {}
                for (const { teamId, clips } of clipResults) {
                    if (clips.length > 0) clipsMap[teamId] = clips
                }
                setExistingClips(clipsMap)
            } catch (e: any) {
                setDataError(e.message || "Failed to load event data")
            } finally {
                setDataLoading(false)
            }
        }
        fetchData()
    }, [eventId])

    // ── File selection ────────────────────────────────────────────────────────
    const handleFileSelect = useCallback(
        async (file: File) => {
            setStatus("processing")
            setUploadError(null)
            setDraft(null)

            try {
                const sheet = await processCommentSheet(file, {
                    onProgress: setProgress,
                })

                const matchedTeam = teams.find(t => t.id === sheet.teamId)
                if (!matchedTeam) {
                    throw new Error(
                        `The QR code identifies a team (${sheet.teamId.slice(0, 8)}…) that is not in this event. Make sure you are uploading a sheet from the correct event.`
                    )
                }

                setDraft({ teamId: sheet.teamId, teamName: matchedTeam.name, sheet })
                setStatus("preview")
            } catch (e: any) {
                setUploadError(e.message || "Failed to process image")
                setStatus("error")
            }
        },
        [teams]
    )

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) handleFileSelect(file)
        e.target.value = "" // reset so same file can be re-selected
    }

    // ── Confirm & upload ──────────────────────────────────────────────────────
    const handleConfirmUpload = useCallback(async () => {
        if (!draft) return
        setStatus("uploading")
        setProgress("Uploading sheet image…")

        try {
            // 1. Upload full sheet
            const sheetPresign = await getPresignedUploadUrl("image/jpeg", "comment-sheets")
            await uploadToS3(sheetPresign, draft.sheet.sheetBlob)

            // 2. Upload each clip
            const clipMetas: { rubricCriteriaId: string; clipKey: string }[] = []
            for (let i = 0; i < draft.sheet.clips.length; i++) {
                const clip = draft.sheet.clips[i]
                const criterion = criteria[i]
                if (!criterion) continue
                setProgress(`Uploading clip ${i + 1} / ${draft.sheet.clips.length}…`)
                const clipPresign = await getPresignedUploadUrl("image/jpeg", "comment-clips")
                await uploadToS3(clipPresign, clip.blob)
                clipMetas.push({ rubricCriteriaId: criterion.id, clipKey: clipPresign.key })
            }

            // 3. Save metadata
            setProgress("Saving…")
            await saveCommentClips({
                eventId,
                teamId: draft.teamId,
                sheetKey: sheetPresign.key,
                clips: clipMetas,
            })

            // 4. Refresh clips for this team
            const updated = await getCommentClips(draft.teamId)
            setExistingClips(prev => ({ ...prev, [draft.teamId]: updated.clips }))

            setStatus("done")
            setExpandedTeam(draft.teamId)
        } catch (e: any) {
            setUploadError(e.message || "Upload failed")
            setStatus("error")
        }
    }, [draft, criteria, eventId])

    const reset = () => {
        setStatus("idle")
        setDraft(null)
        setUploadError(null)
        setProgress("")
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    if (dataLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#500000]" />
            </div>
        )
    }

    if (dataError) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
                <p className="text-red-600">{dataError}</p>
                <Button variant="outline" onClick={onBack}>Go Back</Button>
            </div>
        )
    }

    const teamsWithClips = Object.keys(existingClips)
    const teamsWithoutClips = teams.filter(t => !existingClips[t.id])

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-[#500000] text-white px-4 py-4 flex items-center gap-3 shadow">
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-[#600000]"
                    onClick={onBack}
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-lg font-semibold">Upload Comment Sheets</h1>
                    <p className="text-sm text-white/70">{event?.name}</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

                {/* ── Upload card ── */}
                {(status === "idle" || status === "done") && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-semibold text-[#500000]">
                                {status === "done" ? "Sheet uploaded successfully" : "Upload a comment sheet"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {status === "done" && draft && (
                                <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-md p-3">
                                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                                    <p className="text-sm">
                                        Comment clips saved for <strong>{draft.teamName}</strong>.
                                    </p>
                                </div>
                            )}
                            <p className="text-sm text-gray-600">
                                Photograph a completed comment sheet and tap the button below. The app will
                                read the QR code, correct the perspective, and crop each comment cell.
                            </p>
                            <div className="flex gap-3">
                                <Button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-[#500000] hover:bg-[#600000] text-white flex-1"
                                >
                                    <Camera className="h-4 w-4 mr-2" />
                                    {status === "done" ? "Upload another sheet" : "Take / choose photo"}
                                </Button>
                                {status === "done" && (
                                    <Button variant="outline" onClick={reset}>
                                        <RotateCcw className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                            <p className="text-xs text-gray-400">
                                {teamsWithClips.length} / {teams.length} teams have uploaded sheets.
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* ── Processing spinner ── */}
                {status === "processing" && (
                    <Card>
                        <CardContent className="py-10 flex flex-col items-center gap-4">
                            <Loader2 className="h-10 w-10 animate-spin text-[#500000]" />
                            <p className="text-sm text-gray-600">{progress}</p>
                        </CardContent>
                    </Card>
                )}

                {/* ── Preview ── */}
                {status === "preview" && draft && (
                    <PreviewCard
                        draft={draft}
                        criteria={criteria}
                        onConfirm={handleConfirmUpload}
                        onCancel={reset}
                    />
                )}

                {/* ── Uploading ── */}
                {status === "uploading" && (
                    <Card>
                        <CardContent className="py-10 flex flex-col items-center gap-4">
                            <Upload className="h-10 w-10 text-[#500000] animate-bounce" />
                            <p className="text-sm text-gray-600">{progress}</p>
                        </CardContent>
                    </Card>
                )}

                {/* ── Error ── */}
                {status === "error" && (
                    <Card className="border-red-200">
                        <CardContent className="py-6 space-y-4">
                            <div className="flex items-start gap-2 text-red-700">
                                <X className="h-5 w-5 shrink-0 mt-0.5" />
                                <p className="text-sm">{uploadError}</p>
                            </div>
                            <Button variant="outline" onClick={reset} className="w-full">
                                Try again
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* ── Teams list with clip status ── */}
                <div className="space-y-3">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
                        Teams
                    </h2>
                    {teams.map(team => {
                        const clips = existingClips[team.id] || []
                        const hasClips = clips.length > 0
                        const isExpanded = expandedTeam === team.id

                        return (
                            <Card key={team.id} className={hasClips ? "border-green-200" : ""}>
                                <button
                                    className="w-full text-left"
                                    onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                                >
                                    <CardHeader className="py-3 px-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {team.presentation_order != null && (
                                                    <span className="text-xs text-gray-400 w-6 text-right shrink-0">
                                                        #{team.presentation_order}
                                                    </span>
                                                )}
                                                <span className="text-sm font-medium text-gray-900">
                                                    {team.name}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {hasClips ? (
                                                    <Badge className="bg-green-100 text-green-700 border-0 text-xs">
                                                        {clips.length} clips
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-gray-400 text-xs">
                                                        No uploads
                                                    </Badge>
                                                )}
                                                {isExpanded ? (
                                                    <ChevronUp className="h-4 w-4 text-gray-400" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4 text-gray-400" />
                                                )}
                                            </div>
                                        </div>
                                    </CardHeader>
                                </button>

                                {isExpanded && hasClips && (
                                    <CardContent className="pt-0 pb-4 px-4 space-y-3">
                                        {clips.map(clip => (
                                            <div key={clip.id} className="space-y-1">
                                                <p className="text-xs text-gray-500 font-medium">
                                                    {clip.criteria_name}
                                                </p>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={clip.clipUrl}
                                                    alt={`Comment clip for ${clip.criteria_name}`}
                                                    className="w-full rounded border border-gray-200"
                                                    loading="lazy"
                                                />
                                            </div>
                                        ))}
                                    </CardContent>
                                )}
                            </Card>
                        )
                    })}
                </div>
            </div>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onInputChange}
            />
        </div>
    )
}

// ─── Preview Card ─────────────────────────────────────────────────────────────

interface PreviewCardProps {
    draft: SheetDraft
    criteria: RubricCriteria[]
    onConfirm: () => void
    onCancel: () => void
}

function PreviewCard({ draft, criteria, onConfirm, onCancel }: PreviewCardProps) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-[#500000]">
                    Preview — {draft.teamName}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                    Check that each cropped comment area looks correct, then tap{" "}
                    <strong>Upload</strong>.
                </p>

                <div className="space-y-4">
                    {draft.sheet.clips.map((clip: CropClip) => {
                        const criterion = criteria[clip.rowIndex]
                        return (
                            <div key={clip.rowIndex} className="space-y-1">
                                <p className="text-xs font-medium text-gray-500">
                                    {criterion?.name ?? `Row ${clip.rowIndex + 1}`}
                                </p>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={clip.previewUrl}
                                    alt={`Preview crop for row ${clip.rowIndex + 1}`}
                                    className="w-full rounded border border-gray-200 bg-white"
                                />
                            </div>
                        )
                    })}
                </div>

                <div className="flex gap-3 pt-2">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        className="flex-1"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={onConfirm}
                        className="flex-1 bg-[#500000] hover:bg-[#600000] text-white"
                    >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
