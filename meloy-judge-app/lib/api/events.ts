/**
 * Events API endpoints
 */

import { get, post, put, patch, del } from './client';
import type {
    EventsResponse,
    Event,
    TeamsResponse,
    LeaderboardResponse,
    DetailedLeaderboardResponse,
    JudgeScoringHistoryEntry,
    InsightsResponse,
    JudgesOnlineResponse,
    JudgeProgressResponse,
} from '../types/api';

/**
 * Get all events with optional filters
 */
export async function getEvents(filters?: {
    status?: string;
    type?: string;
}): Promise<EventsResponse> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.type) params.append('type', filters.type);

    const query = params.toString();
    return get<EventsResponse>(`/events${query ? `?${query}` : ''}`);
}

/**
 * Get a single event by ID
 */
export async function getEvent(id: string): Promise<{ event: Event }> {
    return get<{ event: Event }>(`/events/${id}`);
}

/**
 * Create a new event (admin only)
 */
export async function createEvent(data: Partial<Event>): Promise<{ event: Event }> {
    return post<{ event: Event }>('/events', data);
}

/**
 * Update an event (admin/moderator)
 */
export async function updateEvent(
    id: string,
    data: Partial<Event>
): Promise<{ event: Event }> {
    return put<{ event: Event }>(`/events/${id}`, data);
}

/**
 * Delete an event (admin only)
 */
export async function deleteEvent(id: string): Promise<void> {
    await del<void>(`/events/${id}`);
}

/**
 * Get all teams for an event
 * @param eventId - The event ID
 * @param options - Query options
 * @param options.activeOnly - If true, only returns teams with status='active' (for judges)
 * @param options.judgeId - Optional judge profile ID to filter has_scored status
 */
export async function getEventTeams(
    eventId: string,
    options?: { activeOnly?: boolean; judgeId?: string }
): Promise<TeamsResponse> {
    const params = new URLSearchParams();
    if (options?.activeOnly) params.append('activeOnly', 'true');
    if (options?.judgeId) params.append('judgeId', options.judgeId);
    
    const query = params.toString();
    return get<TeamsResponse>(`/events/${eventId}/teams${query ? `?${query}` : ''}`);
}

/**
 * Get leaderboard for an event
 */
export async function getEventLeaderboard(
    eventId: string
): Promise<LeaderboardResponse> {
    return get<LeaderboardResponse>(`/events/${eventId}/leaderboard`);
}

/**
 * Get detailed leaderboard with judge-by-judge breakdown
 */
export async function getDetailedLeaderboard(
    eventId: string
): Promise<DetailedLeaderboardResponse> {
    return get<DetailedLeaderboardResponse>(`/events/${eventId}/leaderboard/detailed`);
}

/**
 * Get insights for an event (admin only)
 */
export async function getEventInsights(
    eventId: string
): Promise<InsightsResponse> {
    return get<InsightsResponse>(`/events/${eventId}/insights`);
}

/**
 * Get online judges for an event
 */
export async function getOnlineJudges(
    eventId: string
): Promise<JudgesOnlineResponse> {
    return get<JudgesOnlineResponse>(`/events/${eventId}/judges/online`);
}

/**
 * Update active team (moderator)
 */
export async function updateActiveTeam(
    eventId: string,
    teamId: string | null
): Promise<{ event: Event }> {
    return put<{ event: Event }>(`/events/${eventId}/team-active`, {
        current_active_team_id: teamId,
    });
}

/**
 * Update judging phase (moderator)
 * Note: This wraps the main updateEventPhase function for backwards compatibility
 */
export async function updateJudgingPhase(
    eventId: string,
    phase: string
): Promise<{ event: Event }> {
    return patch<{ event: Event }>(`/events/${eventId}/phase`, {
        judging_phase: phase,
    });
}

/**
 * Get moderator status for an event
 */
export async function getModeratorStatus(eventId: string): Promise<any> {
    return get<any>(`/events/${eventId}/moderator/status`);
}

/**
 * Get judge's progress for an event
 * @param eventId - The event ID
 * @param judgeId - The judge profile ID
 */
export async function getMyProgress(
    eventId: string,
    judgeId: string
): Promise<JudgeScoringHistoryEntry[]> {
    return get<JudgeScoringHistoryEntry[]>(`/events/${eventId}/my-progress?judgeId=${encodeURIComponent(judgeId)}`);
}

/**
 * Update event's dedicated judge account (admin only)
 * @param eventId - The event ID
 * @param userEmail - Email of the user to set as judge account
 */
export async function updateJudgeAccount(
    eventId: string,
    userEmail: string
): Promise<{ event: Event }> {
    return put<{ event: Event }>(`/events/${eventId}/judge-account`, { userEmail });
}

/**
 * Export event results to Excel (admin only)
 * Downloads an Excel file with judge names, teams, scores, and awards
 * @param eventId - The event ID
 * @param eventName - The event name (used for filename)
 */
export async function exportEventToExcel(
    eventId: string,
    eventName: string
): Promise<void> {
    try {
        // Don't use the API client - make a direct fetch request to handle binary data
        const response = await fetch(`/api/proxy/events/${eventId}/export-excel`, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error('Failed to export event data');
        }

        // Get the blob from response (binary data)
        const blob = await response.blob();
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${eventName.replace(/[^a-z0-9]/gi, '_')}_Results.csv`;
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Export error:', error);
        throw error;
    }
}

/**
 * Get completed events with detailed scoring data for recap view (admin only)
 * Returns events with teams, judges, scores, and awards
 */
export async function getCompletedEventsRecap(): Promise<{
    events: Array<{
        id: string;
        name: string;
        event_type: string;
        start_date: string;
        end_date: string;
        location: string;
        status: string;
        judging_phase: string;
        sponsor?: {
            name: string | null;
            logo_url: string | null;
            primary_color: string | null;
            secondary_color: string | null;
            text_color: string | null;
        };
        teams: Array<{
            id: string;
            name: string;
            mentor_name: string | null;
            judges: Array<{
                id: string;
                name: string;
                communication: number;
                funding: number;
                presentation: number;
                cohesion: number;
                total: number;
                time_spent_seconds: number;
            }>;
            total_score: number;
            avg_score: number;
        }>;
        awards: Array<{
            award_type: string;
            team_id: string;
            team_name: string;
        }>;
    }>;
}> {
    return get<any>('/events/recap');
}
