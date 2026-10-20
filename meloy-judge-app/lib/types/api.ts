/**
 * API Types matching backend database schema
 */

export interface Sponsor {
    name: string | null;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    text_color: string | null;
}

export interface Event {
    id: string;
    name: string;
    description: string;
    event_type: string;
    status: string;
    location: string;
    start_date: string;
    end_date: string;
    registration_deadline: string | null;
    max_team_size: number;
    min_team_size: number;
    max_teams: number | null;
    sponsor_id: string | null;
    judge_user_id: string | null;
    judging_phase: string;
    current_active_team_id: string | null;
    created_at: string;
    updated_at: string;
    sponsor?: Sponsor;  // Populated by API join
    teams_count?: string;  // Populated by API aggregation
    judges_count?: string;  // Populated by API aggregation
    judge_user?: { id: string; email: string; name: string };  // Populated by API join
}

export interface TeamMember {
    id: string;
    name: string;
    email: string;
}

export interface Team {
    id: string;
    event_id: string;
    name: string;
    description: string;
    project_url: string | null;
    photo_url: string | null;  // Team photo URL
    presentation_order: number | null;
    status: string;
    created_at: string;
    updated_at: string;
    has_current_user_scored?: boolean;  // Added for judge scoring status
    members?: TeamMember[];  // Team members
}

export interface User {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'moderator' | 'judge';
    auth_provider?: 'local' | 'auth0' | 'netid';
    is_active?: boolean;
    created_at: string;
    updated_at: string;
}

/**
 * Judge Profile - represents a named judge within an event
 * Multiple profiles can share the same user account
 */
export interface JudgeProfile {
    id: string;
    event_id: string;
    user_id: string;
    name: string;
    assigned_at: string;
}

export interface RubricCriteria {
    id: string;
    name: string;
    short_name: string;
    description: string | null;
    max_score: number;
    display_order: number;
    icon_name: string;
    guiding_question: string;
    event_type: string; // 'aggies-invent' | 'problems-worth-solving'
    created_at: string;
}

export interface ScoreSubmission {
    eventId: string;
    teamId: string;
    judgeId: string;  // Judge profile ID, not user ID
    scores: Array<{
        criteriaId: string;  // Must match backend field name
        score: number;
        reflection?: string;  // Optional reflection for this criteria
    }>;
    overallComments?: string;
    timeSpentSeconds?: number;
}

export interface LeaderboardEntry {
    team_id: string;
    team_name: string;
    total_score: number;
    avg_score: number;
    judges_scored: number;
    rank: number;
}

export interface CriteriaScore {
    criteria_id: string;
    criteria_name: string;
    score: number;
    max_score: number;
    reflection: string | null;
}

export interface JudgeScore {
    judge_name: string;
    judge_id: string;
    total_score: number;
    criteria_count: number;
    submitted_at: string;
    time_spent_seconds: number;
    criteria_scores: CriteriaScore[];
}

export interface DetailedLeaderboardEntry {
    team_id: string;
    team_name: string;
    project_title: string | null;
    description: string | null;
    rank: number;
    total_score: number;
    avg_score: number;
    judges_scored: number;
    score_stddev: number;
    judge_scores: JudgeScore[];
}

export interface ActivityLogEntry {
    id: string;
    user_id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: any;
    created_at: string;
    user_name?: string;
}

export interface EventInsights {
    total_teams: string;
    total_judges: string;
    completed_scores: string;
    average_score: number | null;
}

export interface JudgeSession {
    id: string;
    name: string;
    last_activity: string;
    is_online: boolean;
}

/**
 * Judge's scoring progress for an event
 */
export interface JudgeProgress {
    teams: Array<{
        id: string;
        name: string;
        project_name: string;
        has_scored: boolean;
    }>;
    completed: number;
    total: number;
    percentage: number;
}

// API Response wrappers
export interface ApiResponse<T> {
    [key: string]: T;
}

export interface EventsResponse {
    events: Event[];
    total: number;
}

export interface TeamsResponse {
    teams: Team[];
}

export interface LeaderboardResponse {
    leaderboard: LeaderboardEntry[];
}

export interface DetailedLeaderboardResponse {
    leaderboard: DetailedLeaderboardEntry[];
}

export interface RubricResponse {
    criteria: RubricCriteria[];
}

export interface UsersResponse {
    users: User[];
}

export interface ActivityResponse {
    activities: ActivityLogEntry[];
}

export interface InsightsResponse {
    insights: EventInsights;
}

export interface JudgesOnlineResponse {
    judges: JudgeSession[];
}

export interface JudgeProfilesResponse {
    profiles: JudgeProfile[];
}

export interface JudgeProgressResponse {
    progress: JudgeProgress;
}

export interface SessionStartResponse {
    sessionId: string;
    message: string;
}
