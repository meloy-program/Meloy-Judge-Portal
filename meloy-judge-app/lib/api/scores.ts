/**
 * Scores and Rubric API endpoints
 */

import { get, post } from './client';
import type { ScoreSubmission, RubricResponse } from '../types/api';

/**
 * Get rubric criteria for a specific event type
 * @param eventType - 'aggies-invent' | 'problems-worth-solving' (default: 'aggies-invent')
 */
export async function getRubric(eventType?: string): Promise<RubricResponse> {
    const qs = eventType ? `?event_type=${encodeURIComponent(eventType)}` : '';
    return get<RubricResponse>(`/rubric/rubric${qs}`);
}

/**
 * Submit scores for a team
 * IMPORTANT: Must include judgeId (judge profile ID, not user ID)
 * @param data - Score submission data including judgeId
 */
export async function submitScore(
    data: ScoreSubmission
): Promise<{ message: string }> {
    return post<{ message: string }>('/scores', data);
}

/**
 * Get existing scores for a team by a judge (for editing)
 * @param teamId - The team ID
 * @param judgeId - The judge profile ID (not user ID)
 */
export async function getExistingScores(
    teamId: string,
    judgeId: string
): Promise<{
    scores: Array<{ criteriaId: string; score: number; reflection: string | null }>;
    comments: string | null;
    timeSpentSeconds: number;
    hasExistingScores: boolean;
}> {
    return get(`/scores/${teamId}/${judgeId}`);
}

/**
 * Submit judge heartbeat to maintain online status
 * @param eventId - The event ID
 * @param judgeId - The judge profile ID (not user ID)
 */
export async function submitHeartbeat(
    eventId: string,
    judgeId: string
): Promise<{ lastActivity: string }> {
    return post<{ lastActivity: string }>('/judge/heartbeat', { eventId, judgeId });
}
