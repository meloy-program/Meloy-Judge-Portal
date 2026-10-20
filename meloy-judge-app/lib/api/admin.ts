/**
 * Admin and User Management API endpoints
 */

import { get, post, put, patch } from './client';
import type { ActivityResponse } from '../types/api';

/**
 * Get activity log (admin only)
 */
export async function getActivity(limit = 50): Promise<ActivityResponse> {
    return get<ActivityResponse>(`/admin/activity?limit=${limit}`);
}

/**
 * Initialize/reset database schema (admin only)
 * WARNING: This drops all tables and recreates them
 */
export async function initSchema(): Promise<{ message: string; version: string }> {
    return post<{ message: string; version: string }>('/admin/init-schema');
}

/**
 * Seed test data (admin only)
 * Creates sample events, teams, judge profiles, and scores
 */
export async function seedData(): Promise<{ message: string }> {
    return post<{ message: string }>('/admin/seed-data');
}

// ==================== MODERATOR ENDPOINTS ====================

/**
 * Get team scoring matrix for moderator view
 */
export async function getTeamScores(eventId: string): Promise<{
    teams: Array<{
        id: string;
        name: string;
        projectTitle: string;
        status: string;
        order: number | null;
        scores: Array<{
            judgeId: string;
            judgeName: string;
            score: number | null;
        }>;
    }>;
    judges: Array<{
        id: string;
        name: string;
        isOnline: boolean;
    }>;
}> {
    return get(`/events/${eventId}/teams/scores`);
}

/**
 * Update team status (moderator/admin only)
 */
export async function updateTeamStatus(
    teamId: string,
    status: 'waiting' | 'active' | 'completed'
): Promise<{ team: any }> {
    return patch(`/teams/${teamId}/status`, { status });
}

/**
 * Update team presentation order (moderator/admin only, PWS events)
 * Automatically swaps with any team that already holds the requested order.
 */
export async function updateTeamPresentationOrder(
    teamId: string,
    presentationOrder: number
): Promise<{ team: any }> {
    return patch(`/teams/${teamId}/presentation-order`, { presentation_order: presentationOrder });
}

/**
 * Update event judging phase (moderator/admin only)
 */
export async function updateEventPhase(
    eventId: string,
    judging_phase: 'not-started' | 'in-progress' | 'ended'
): Promise<{ event: any }> {
    return patch(`/events/${eventId}/phase`, { judging_phase });
}

/**
 * Get top 3 awards for an event
 */
export async function getEventAwards(eventId: string): Promise<{
    awards: Array<{ award_type: string; team_id: string; team_name: string }>;
}> {
    return get(`/events/${eventId}/awards`);
}

/**
 * Assign top 3 awards for an event (moderator/admin only)
 */
export async function assignTop3Awards(
    eventId: string,
    firstPlace: string,
    secondPlace: string,
    thirdPlace: string
): Promise<{ message: string }> {
    return post(`/events/${eventId}/awards`, { firstPlace, secondPlace, thirdPlace });
}
