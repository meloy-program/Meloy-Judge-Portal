import { Router } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { query, queryOne } from '../db/connection';

const router = Router();

// ==================== EVENTS ====================

/**
 * Get completed events with detailed recap data (admin only)
 * Returns all completed events with teams, judges, scores, and awards
 */
router.get('/recap', authenticate, requireRole(['admin']), async (_req, res): Promise<void> => {
    try {
        // Get all completed events
        const events = await query(
            `SELECT 
                e.*,
                json_build_object(
                    'name', s.name,
                    'logo_url', s.logo_url,
                    'primary_color', s.primary_color,
                    'secondary_color', s.secondary_color,
                    'text_color', s.text_color
                ) as sponsor
            FROM events e
            LEFT JOIN sponsors s ON e.sponsor_id = s.id
            WHERE e.judging_phase = 'ended' OR e.status = 'completed'
            ORDER BY e.start_date DESC`,
            []
        );

        // For each event, get teams with detailed scores
        const eventsWithData = await Promise.all(
            events.map(async (event: any) => {
                // Get teams for this event
                const teams = await query(
                    `SELECT id, name, mentor_name
                     FROM teams
                     WHERE event_id = $1
                     ORDER BY name`,
                    [event.id]
                );

                // For each team, get judge scores
                const teamsWithScores = await Promise.all(
                    teams.map(async (team: any) => {
                        const judgeScores = await query(
                            `SELECT 
                                ej.id,
                                ej.name,
                                ss.time_spent_seconds,
                                COALESCE(SUM(CASE WHEN rc.short_name = 'Communication' THEN s.score END), 0) as communication,
                                COALESCE(SUM(CASE WHEN rc.short_name = 'Funding' THEN s.score END), 0) as funding,
                                COALESCE(SUM(CASE WHEN rc.short_name = 'Presentation' THEN s.score END), 0) as presentation,
                                COALESCE(SUM(CASE WHEN rc.short_name = 'Cohesion' THEN s.score END), 0) as cohesion,
                                COALESCE(SUM(s.score), 0) as total
                            FROM score_submissions ss
                            JOIN event_judges ej ON ss.judge_id = ej.id
                            LEFT JOIN scores s ON ss.id = s.submission_id
                            LEFT JOIN rubric_criteria rc ON s.rubric_criteria_id = rc.id
                            WHERE ss.team_id = $1 AND ss.submitted_at IS NOT NULL
                            GROUP BY ej.id, ej.name, ss.time_spent_seconds`,
                            [team.id]
                        );

                        const totalScore = judgeScores.reduce((sum: number, j: any) => sum + parseFloat(j.total), 0);
                        const avgScore = judgeScores.length > 0 ? totalScore / judgeScores.length : 0;

                        return {
                            id: team.id,
                            name: team.name,
                            mentor_name: team.mentor_name,
                            judges: judgeScores.map((j: any) => ({
                                id: j.id,
                                name: j.name,
                                communication: parseFloat(j.communication),
                                funding: parseFloat(j.funding),
                                presentation: parseFloat(j.presentation),
                                cohesion: parseFloat(j.cohesion),
                                total: parseFloat(j.total),
                                time_spent_seconds: j.time_spent_seconds || 0
                            })),
                            total_score: totalScore,
                            avg_score: avgScore
                        };
                    })
                );

                // Get awards for this event
                const awards = await query(
                    `SELECT ta.award_type, ta.team_id, t.name as team_name
                     FROM team_awards ta
                     JOIN teams t ON ta.team_id = t.id
                     WHERE ta.event_id = $1`,
                    [event.id]
                );

                return {
                    id: event.id,
                    name: event.name,
                    event_type: event.event_type,
                    start_date: event.start_date,
                    end_date: event.end_date,
                    location: event.location,
                    status: event.status,
                    judging_phase: event.judging_phase,
                    sponsor: event.sponsor,
                    teams: teamsWithScores,
                    awards: awards
                };
            })
        );

        res.json({ events: eventsWithData });
    } catch (error) {
        console.error('Failed to fetch recap data:', error);
        res.status(500).json({ error: 'Failed to fetch recap data' });
    }
});

/**
 * Get all events with role-based filtering
 * - Judges: Only see events they're assigned to via event_judges table
 * - Admins/Moderators: See all events
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
    try {
        const { status, type } = req.query;
        const conditions: string[] = ['1=1'];
        const params: any[] = [];
        let paramIndex = 1;

        if (status) {
            conditions.push(`e.status = $${paramIndex++}`);
            params.push(status);
        }

        if (type) {
            conditions.push(`e.event_type = $${paramIndex++}`);
            params.push(type);
        }

        // CRITICAL: Judges should only see events they're assigned to
        if (req.user?.role === 'judge' && req.user?.id) {
            conditions.push(`e.id IN (SELECT event_id FROM event_judges WHERE user_id = $${paramIndex++})`);
            params.push(req.user.id);
            console.log('Filtering events for judge:', req.user.id);
        } else {
            console.log('Showing all events for role:', req.user?.role);
        }

        const events = await query(
            `SELECT 
        e.*,
        json_build_object(
          'name', s.name,
          'logo_url', s.logo_url,
          'primary_color', s.primary_color,
          'secondary_color', s.secondary_color,
          'text_color', s.text_color
        ) as sponsor,
        (SELECT COUNT(*) FROM teams WHERE event_id = e.id) as teams_count,
        (SELECT COUNT(*) FROM event_judges WHERE event_id = e.id) as judges_count
      FROM events e
      LEFT JOIN sponsors s ON e.sponsor_id = s.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.start_date DESC NULLS LAST, e.created_at DESC`,
            params
        );

        console.log(`Found ${events.length} events for user ${req.user?.id} (role: ${req.user?.role})`);

        res.json({ events, total: events.length });
    } catch (error) {
        console.error('Failed to fetch events:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

/**
 * Get single event by ID with teams and stats
 */
router.get('/:id', async (req, res): Promise<void> => {
    try {
        const eventData = await queryOne(
            `SELECT 
        e.*,
        json_build_object(
          'name', s.name,
          'logo_url', s.logo_url,
          'primary_color', s.primary_color,
          'secondary_color', s.secondary_color,
          'text_color', s.text_color
       ) as sponsor,
        json_build_object(
          'id', ju.id,
          'email', ju.email,
          'name', ju.name
       ) as judge_user
      FROM events e
      LEFT JOIN sponsors s ON e.sponsor_id = s.id
      LEFT JOIN users ju ON e.judge_user_id = ju.id
      WHERE e.id = $1`,
            [req.params.id]
        );

        if (!eventData) {
            res.status(404).json({ error: 'Event not found' });
            return;
        }

        const teams = await query(
            `SELECT 
        t.id,
        t.name,
        t.description,
        t.status,
        t.project_url,
        COUNT(tm.id) as member_count
      FROM teams t
      LEFT JOIN team_members tm ON tm.team_id = t.id
      WHERE t.event_id = $1
      GROUP BY t.id, t.name, t.description, t.status, t.project_url
      ORDER BY t.created_at ASC`,
            [req.params.id]
        );

        const submissionStats = await queryOne<{
            total_submissions: string;
            completed_submissions: string;
        }>(
            `SELECT 
        COUNT(*) as total_submissions,
        COUNT(CASE WHEN ss.submitted_at IS NOT NULL THEN 1 END) as completed_submissions
      FROM score_submissions ss
      JOIN teams t ON ss.team_id = t.id
      WHERE t.event_id = $1`,
            [req.params.id]
        );

        res.json({
            event: eventData,
            teams,
            stats: {
                totalTeams: teams.length,
                totalSubmissions: parseInt(submissionStats?.total_submissions || '0', 10),
                completedSubmissions: parseInt(submissionStats?.completed_submissions || '0', 10),
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch event' });
    }
});

/**
 * Create new event (admin only)
 */
router.post('/', authenticate, requireRole(['admin']), async (req: AuthRequest, res) => {
    try {
        const { name, event_type, start_date, end_date, location, description } = req.body;

        const event = await queryOne(
            `INSERT INTO events (name, event_type, start_date, end_date, location, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
            [name, event_type, start_date, end_date, location, description]
        );

        res.status(201).json({ event });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create event' });
    }
});

/**
 * Update event (admin/moderator)
 */
router.put('/:eventId', authenticate, requireRole(['admin', 'moderator']), async (req, res) => {
    try {
        const updates = req.body;
        if (Object.keys(updates).length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }

        const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 2}`).join(', ');
        const values = [req.params.eventId, ...Object.values(updates)];

        const event = await queryOne(
            `UPDATE events SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`,
            values
        );

        res.json({ event });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update event' });
    }
});

/**
 * Delete event (admin only)
 */
router.delete('/:eventId', authenticate, requireRole(['admin']), async (req, res) => {
    try {
        await query('DELETE FROM events WHERE id = $1', [req.params.eventId]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

/**
 * Update event's dedicated judge account (admin only)
 */
router.put('/:eventId/judge-account', authenticate, requireRole(['admin']), async (req, res) => {
    try {
        const { eventId } = req.params;
        const { userEmail } = req.body;

        if (!userEmail) {
            res.status(400).json({ error: 'User email is required' });
            return;
        }

        // Find user by email
        const user = await queryOne(
            'SELECT id, email, name, role FROM users WHERE email = $1',
            [userEmail]
        );

        if (!user) {
            res.status(404).json({ error: 'User not found with that email' });
            return;
        }

        // Update event's judge_user_id
        const event = await queryOne(
            `UPDATE events 
             SET judge_user_id = $1, updated_at = NOW() 
             WHERE id = $2 
             RETURNING *`,
            [user.id, eventId]
        );

        if (!event) {
            res.status(404).json({ error: 'Event not found' });
            return;
        }

        // Return updated event with judge user info
        const updatedEvent = await queryOne(
            `SELECT 
                e.*,
                json_build_object(
                    'id', ju.id,
                    'email', ju.email,
                    'name', ju.name
                ) as judge_user
             FROM events e
             LEFT JOIN users ju ON e.judge_user_id = ju.id
             WHERE e.id = $1`,
            [eventId]
        );

        res.json({ event: updatedEvent });
    } catch (error) {
        console.error('Failed to update judge account:', error);
        res.status(500).json({ error: 'Failed to update judge account' });
    }
});


// ==================== MODERATOR ENDPOINTS ====================

/**
 * Get team scores matrix for moderator dashboard
 * IMPORTANT: This route must come BEFORE /:eventId/teams to avoid being shadowed
 */
router.get('/:eventId/teams/scores', async (req, res) => {
    try {
        // Get all teams for the event
        const teams = await query(
            `SELECT 
        t.id,
        t.name,
        t.project_title,
        t.status,
        t.presentation_order
      FROM teams t
      WHERE t.event_id = $1
      ORDER BY t.presentation_order`,
            [req.params.eventId]
        );

        // Get all judge profiles for this event with online status
        const judges = await query(
            `SELECT DISTINCT ON (ej.id)
        ej.id,
        ej.name,
        js.last_activity,
        CASE 
          WHEN js.last_activity > NOW() - INTERVAL '5 minutes' THEN true
          ELSE false
        END as is_online
      FROM event_judges ej
      LEFT JOIN judge_sessions js ON ej.id = js.judge_id AND js.event_id = $1 AND js.logged_out_at IS NULL
      WHERE ej.event_id = $1
      ORDER BY ej.id, js.last_activity DESC NULLS LAST, ej.name`,
            [req.params.eventId]
        );

        // Get all score submissions with total scores
        const scoreSubmissions = await query(
            `SELECT 
        ss.team_id,
        ss.judge_id,
        COALESCE(SUM(s.score), 0) as total_score,
        ss.submitted_at IS NOT NULL as is_submitted
      FROM score_submissions ss
      LEFT JOIN scores s ON ss.id = s.submission_id
      WHERE ss.event_id = $1
      GROUP BY ss.team_id, ss.judge_id, ss.submitted_at`,
            [req.params.eventId]
        );

        // Build scoring matrix
        const teamsWithScores = teams.map((team: any) => {
            const teamScores = judges.map((judge: any) => {
                const submission = scoreSubmissions.find(
                    (sub: any) => sub.team_id === team.id && sub.judge_id === judge.id
                );
                return {
                    judgeId: judge.id,
                    judgeName: judge.name,
                    score: submission?.is_submitted ? parseFloat(submission.total_score) : null
                };
            });

            return {
                id: team.id,
                name: team.name,
                projectTitle: team.project_title,
                status: team.status,
                order: team.presentation_order,
                scores: teamScores
            };
        });

        res.json({
            teams: teamsWithScores,
            judges: judges.map((j: any) => ({
                id: j.id,
                name: j.name,
                isOnline: j.is_online
            }))
        });
    } catch (error) {
        console.error('Error fetching team scores:', error);
        res.status(500).json({ error: 'Failed to fetch team scores' });
    }
});

// ==================== TEAM MANAGEMENT ====================

/**
 * Get all teams for an event
 * Supports activeOnly filter for judges
 * Optional judgeId query param to check if current judge profile has scored
 */
router.get('/:eventId/teams', authenticate, async (req: AuthRequest, res) => {
    try {
        const activeOnly = req.query.activeOnly === 'true';
        const judgeId = req.query.judgeId as string | undefined;

        // Build status filter:
        // - If activeOnly=true (judges view), only show active teams (not completed)
        // - Otherwise (admin/moderator view), show all teams
        const statusFilter = activeOnly ? "AND t.status IN ('waiting', 'active')" : '';

        // If judgeId provided, check if that judge profile has scored each team
        const hasCurrentJudgeScoredClause = judgeId
            ? `EXISTS(
                 SELECT 1 FROM score_submissions 
                 WHERE team_id = t.id 
                 AND judge_id = $2 
                 AND submitted_at IS NOT NULL
               )`
            : 'false';

        const params = judgeId
            ? [req.params.eventId, judgeId]
            : [req.params.eventId];

        const teamsData = await query(
            `SELECT 
        t.*,
        COUNT(DISTINCT ss.id) as total_scores,
        COUNT(DISTINCT CASE WHEN ss.submitted_at IS NOT NULL THEN ss.id END) as completed_scores,
        ROUND(AVG(
          CASE WHEN ss.submitted_at IS NOT NULL 
          THEN (SELECT SUM(score) FROM scores WHERE submission_id = ss.id)
          END
        ), 2) as average_score,
        ${hasCurrentJudgeScoredClause} as has_current_user_scored
      FROM teams t
      LEFT JOIN score_submissions ss ON t.id = ss.team_id
      WHERE t.event_id = $1 ${statusFilter}
      GROUP BY t.id
      ORDER BY t.presentation_order ASC, t.created_at DESC`,
            params
        );

        // Fetch members for each team
        const teams = await Promise.all(
            teamsData.map(async (team: any) => {
                const members = await query(
                    'SELECT id, name, email FROM team_members WHERE team_id = $1 ORDER BY name',
                    [team.id]
                );
                return { ...team, members };
            })
        );

        res.json({ teams });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
});

/**
 * Create new team for an event (admin only)
 */
router.post('/:eventId/teams', authenticate, requireRole(['admin']), async (req: AuthRequest, res) => {
    try {
        const { name, description, project_url, presentation_order, photo_url } = req.body;

        const team = await queryOne(
            `INSERT INTO teams (event_id, name, description, project_url, presentation_order, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
            [req.params.eventId, name, description, project_url, presentation_order, photo_url]
        );

        res.status(201).json({ team });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create team' });
    }
});

/**
 * Update event judging phase (moderator/admin)
 */
router.patch('/:eventId/phase', authenticate, requireRole(['moderator', 'admin']), async (req, res) => {
    try {
        const { judging_phase } = req.body;

        if (!['not-started', 'in-progress', 'ended'].includes(judging_phase)) {
            return res.status(400).json({ error: 'Invalid judging phase value' });
        }

        const event = await queryOne(
            'UPDATE events SET judging_phase = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [judging_phase, req.params.eventId]
        );

        return res.json({ event });
    } catch (error) {
        console.error('Error updating event phase:', error);
        return res.status(500).json({ error: 'Failed to update event phase' });
    }
});

/**
 * Get event leaderboard
 */
router.get('/:eventId/leaderboard', async (req, res) => {
    try {
        const leaderboardData = await query(
            `WITH judge_totals AS (
                SELECT 
                    ss.team_id,
                    ss.judge_id,
                    COALESCE(SUM(s.score), 0) as judge_total
                FROM score_submissions ss
                LEFT JOIN scores s ON ss.id = s.submission_id
                WHERE ss.submitted_at IS NOT NULL
                GROUP BY ss.team_id, ss.judge_id
            )
            SELECT 
                t.id,
                t.name as team_name,
                t.project_title,
                COALESCE(ROUND(AVG(jt.judge_total)::numeric, 2), 0) as avg_score,
                COUNT(DISTINCT jt.judge_id) as judges_scored,
                COALESCE(SUM(jt.judge_total)::integer, 0) as total_score
            FROM teams t
            LEFT JOIN judge_totals jt ON t.id = jt.team_id
            WHERE t.event_id = $1
            GROUP BY t.id, t.name, t.project_title
            ORDER BY avg_score DESC, t.name ASC`,
            [req.params.eventId]
        );

        // Add rank to each team
        const leaderboard = leaderboardData.map((team: any, index: number) => ({
            ...team,
            rank: index + 1,
            avg_score: parseFloat(team.avg_score),
            total_score: parseInt(team.total_score),
            judges_scored: parseInt(team.judges_scored)
        }));

        res.json({ leaderboard });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

/**
 * Get detailed leaderboard with judge-by-judge breakdown
 */
router.get('/:eventId/leaderboard/detailed', async (req, res) => {
    try {
        // Get team scores with judge breakdown
        // Uses CTE to pre-calculate each judge's total score per team
        // Then aggregates: avg_score = average of judge totals, total_score = sum of judge totals
        const teamsData = await query(
            `WITH judge_totals AS (
                SELECT 
                    ss.team_id,
                    ss.judge_id,
                    COALESCE(SUM(s.score), 0) as judge_total
                FROM score_submissions ss
                LEFT JOIN scores s ON ss.id = s.submission_id
                WHERE ss.submitted_at IS NOT NULL
                GROUP BY ss.team_id, ss.judge_id
            )
            SELECT 
                t.id as team_id,
                t.name as team_name,
                t.project_title,
                t.description,
                COALESCE(ROUND(AVG(jt.judge_total)::numeric, 2), 0) as avg_score,
                COUNT(DISTINCT jt.judge_id) as judges_scored,
                COALESCE(SUM(jt.judge_total)::integer, 0) as total_score,
                COALESCE(ROUND(STDDEV_POP(jt.judge_total)::numeric, 2), 0) as score_stddev
            FROM teams t
            LEFT JOIN judge_totals jt ON t.id = jt.team_id
            WHERE t.event_id = $1
            GROUP BY t.id, t.name, t.project_title, t.description
            ORDER BY avg_score DESC, t.name ASC`,
            [req.params.eventId]
        );

        // Get individual judge scores for each team
        // Each judge's total_score is the sum of all their criteria scores for that team
        const judgeScores = await query(
            `SELECT 
                ss.team_id,
                ej.name as judge_name,
                ej.id as judge_id,
                COALESCE(SUM(s.score), 0)::integer as total_score,
                COUNT(s.id) as criteria_count,
                ss.submitted_at,
                ss.time_spent_seconds,
                json_agg(
                    json_build_object(
                        'criteria_id', rc.id,
                        'criteria_name', rc.name,
                        'score', s.score,
                        'max_score', rc.max_score,
                        'reflection', s.reflection
                    ) ORDER BY rc.display_order
                ) as criteria_scores
            FROM score_submissions ss
            JOIN event_judges ej ON ss.judge_id = ej.id
            LEFT JOIN scores s ON ss.id = s.submission_id
            LEFT JOIN rubric_criteria rc ON s.rubric_criteria_id = rc.id
            WHERE ss.event_id = $1 AND ss.submitted_at IS NOT NULL
            GROUP BY ss.team_id, ej.id, ej.name, ss.submitted_at, ss.time_spent_seconds`,
            [req.params.eventId]
        );

        // Organize judge scores by team
        const judgeScoresByTeam: Record<string, any[]> = {};
        judgeScores.forEach((score: any) => {
            if (!judgeScoresByTeam[score.team_id]) {
                judgeScoresByTeam[score.team_id] = [];
            }
            judgeScoresByTeam[score.team_id].push({
                judge_name: score.judge_name,
                judge_id: score.judge_id,
                total_score: parseInt(score.total_score),
                criteria_count: parseInt(score.criteria_count),
                submitted_at: score.submitted_at,
                time_spent_seconds: score.time_spent_seconds,
                criteria_scores: score.criteria_scores
            });
        });

        // Add rank and judge details to each team
        const detailedLeaderboard = teamsData.map((team: any, index: number) => ({
            team_id: team.team_id,
            team_name: team.team_name,
            project_title: team.project_title,
            description: team.description,
            rank: index + 1,
            total_score: parseInt(team.total_score),
            avg_score: parseFloat(team.avg_score),
            judges_scored: parseInt(team.judges_scored),
            score_stddev: team.score_stddev ? parseFloat(team.score_stddev) : 0,
            judge_scores: judgeScoresByTeam[team.team_id] || []
        }));

        res.json({ leaderboard: detailedLeaderboard });
    } catch (error) {
        console.error('Failed to fetch detailed leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch detailed leaderboard' });
    }
});

/**
 * Get event insights (admin only)
 */
router.get('/:eventId/insights', authenticate, requireRole(['admin']), async (req, res) => {
    try {
        const insights = await queryOne(
            `SELECT 
        COUNT(DISTINCT t.id) as total_teams,
        COUNT(DISTINCT ss.judge_id) as total_judges,
        COUNT(DISTINCT ss.id) FILTER (WHERE ss.submitted_at IS NOT NULL) as completed_scores,
        AVG(s.score) as average_score
      FROM teams t
      LEFT JOIN score_submissions ss ON t.id = ss.team_id
      LEFT JOIN scores s ON ss.id = s.submission_id
      WHERE t.event_id = $1`,
            [req.params.eventId]
        );

        res.json({ insights });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch insights' });
    }
});

/**
 * Export event results to Excel (admin only)
 */
router.get('/:eventId/export-excel', authenticate, requireRole(['admin']), async (req, res): Promise<void> => {
    try {
        const eventId = req.params.eventId;

        // Get event details
        const eventData = await queryOne(
            `SELECT e.*, s.name as sponsor_name
             FROM events e
             LEFT JOIN sponsors s ON e.sponsor_id = s.id
             WHERE e.id = $1`,
            [eventId]
        );

        if (!eventData) {
            res.status(404).json({ error: 'Event not found' });
            return;
        }

        // Get teams with rankings
        const teams = await query(
            `WITH judge_totals AS (
                SELECT 
                    ss.team_id,
                    ss.judge_id,
                    COALESCE(SUM(s.score), 0) as judge_total
                FROM score_submissions ss
                LEFT JOIN scores s ON ss.id = s.submission_id
                WHERE ss.submitted_at IS NOT NULL
                GROUP BY ss.team_id, ss.judge_id
            )
            SELECT 
                t.id,
                t.name,
                t.mentor_name,
                COALESCE(ROUND(AVG(jt.judge_total)::numeric, 2), 0) as avg_score,
                ROW_NUMBER() OVER (ORDER BY AVG(jt.judge_total) DESC) as rank
            FROM teams t
            LEFT JOIN judge_totals jt ON t.id = jt.team_id
            WHERE t.event_id = $1
            GROUP BY t.id, t.name, t.mentor_name
            ORDER BY avg_score DESC`,
            [eventId]
        );

        // Get judges
        const judges = await query(
            `SELECT id, name
             FROM event_judges
             WHERE event_id = $1
             ORDER BY name`,
            [eventId]
        );

        // Get detailed scores by criteria
        const scores = await query(
            `SELECT 
                ss.team_id,
                ss.judge_id,
                ej.name as judge_name,
                COALESCE(SUM(CASE WHEN rc.short_name = 'Communication' THEN s.score END), 0) as communication,
                COALESCE(SUM(CASE WHEN rc.short_name = 'Funding' THEN s.score END), 0) as funding,
                COALESCE(SUM(CASE WHEN rc.short_name = 'Presentation' THEN s.score END), 0) as presentation,
                COALESCE(SUM(CASE WHEN rc.short_name = 'Cohesion' THEN s.score END), 0) as cohesion,
                COALESCE(SUM(s.score), 0) as total
            FROM score_submissions ss
            JOIN event_judges ej ON ss.judge_id = ej.id
            LEFT JOIN scores s ON ss.id = s.submission_id
            LEFT JOIN rubric_criteria rc ON s.rubric_criteria_id = rc.id
            WHERE ss.event_id = $1 AND ss.submitted_at IS NOT NULL
            GROUP BY ss.team_id, ss.judge_id, ej.name`,
            [eventId]
        );

        // Get awards
        const awards = await query(
            `SELECT team_id, award_type
             FROM team_awards
             WHERE event_id = $1`,
            [eventId]
        );

        // Generate CSV content
        let csv = '';
        
        // Header
        csv += `${eventData.sponsor_name || 'Meloy Program'} - ${eventData.name}\n\n`;
        
        // Judges section
        csv += 'Judges\n';
        judges.forEach((judge: any, index: number) => {
            csv += `Judge ${index + 1},${judge.name}\n`;
        });
        csv += '\n';
        
        // Teams section
        csv += 'Teams\n';
        teams.forEach((team: any, index: number) => {
            csv += `Team ${index + 1},${team.name}\n`;
            if (team.mentor_name) {
                csv += `Mentor,${team.mentor_name}\n`;
            }
        });
        csv += '\n\n';
        
        // Score Sheet
        csv += 'Score Sheet\n';
        csv += 'Team,Judge,Communication (25),Funding (25),Presentation (25),Cohesion (25),Total (100)\n';
        teams.forEach((team: any) => {
            judges.forEach((judge: any) => {
                const scoreData = scores.find((s: any) => s.team_id === team.id && s.judge_id === judge.id);
                csv += `${team.name},${judge.name},${scoreData?.communication || 0},${scoreData?.funding || 0},${scoreData?.presentation || 0},${scoreData?.cohesion || 0},${scoreData?.total || 0}\n`;
            });
        });
        csv += '\n\n';
        
        // Final Results
        csv += 'Final Results - Rankings\n';
        csv += 'Rank,Team Name,Average Score\n';
        teams.forEach((team: any) => {
            csv += `${team.rank},${team.name},${team.avg_score}\n`;
        });
        csv += '\n';
        
        // Awards
        csv += 'Special Awards\n';
        const awardTypes = [
            { type: 'first_place', label: 'First Place' },
            { type: 'second_place', label: 'Second Place' },
            { type: 'third_place', label: 'Third Place' },
            { type: 'most_feasible', label: 'Most Feasible Solution' },
            { type: 'best_prototype', label: 'Best Prototype' },
            { type: 'best_video', label: 'Best Video' },
            { type: 'best_presentation', label: 'Best Presentation' }
        ];
        
        awardTypes.forEach(({ type, label }) => {
            const award = awards.find((a: any) => a.award_type === type);
            const team = award ? teams.find((t: any) => t.id === award.team_id) : null;
            csv += `${label},${team?.name || '(Not Assigned)'}\n`;
        });

        // Send CSV
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${eventData.name.replace(/[^a-z0-9]/gi, '_')}_Results.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('CSV export error:', error);
        res.status(500).json({ error: 'Failed to generate CSV export' });
    }
});

/**
 * Get online judges for an event
 */
router.get('/:eventId/judges/online', async (req, res) => {
    try {
        const judges = await query(
            `SELECT 
        ej.id,
        ej.name,
        js.last_activity,
        CASE 
          WHEN js.last_activity > NOW() - INTERVAL '5 minutes' THEN true
          ELSE false
        END as is_online
      FROM event_judges ej
      LEFT JOIN judge_sessions js ON ej.id = js.judge_id AND js.logged_out_at IS NULL
      WHERE ej.event_id = $1
      ORDER BY js.last_activity DESC NULLS LAST`,
            [req.params.eventId]
        );

        // Return empty array if no judges, not an error
        res.json({ judges: judges || [] });
    } catch (error) {
        // If query fails (e.g., invalid event ID), still return empty array
        console.error('Error fetching online judges:', error);
        res.json({ judges: [] });
    }
});

/**
 * Update active team (moderator/admin)
 */
router.put('/:eventId/team-active', authenticate, requireRole(['moderator', 'admin']), async (req, res) => {
    try {
        const { teamId } = req.body;

        await query(
            'UPDATE events SET current_active_team_id = $1, updated_at = NOW() WHERE id = $2',
            [teamId, req.params.eventId]
        );

        res.json({ message: 'Active team updated' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update active team' });
    }
});

/**
 * Get moderator status for an event
 */
router.get('/:eventId/moderator/status', authenticate, requireRole(['moderator', 'admin']), async (req, res) => {
    try {
        const status = await queryOne(
            `SELECT 
        e.id,
        e.name,
        e.judging_phase,
        e.current_active_team_id,
        t.name as active_team_name
      FROM events e
      LEFT JOIN teams t ON e.current_active_team_id = t.id
      WHERE e.id = $1`,
            [req.params.eventId]
        );

        res.json({ status });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch moderator status' });
    }
});

/**
 * Get judge profile's progress/history for an event
 * Returns detailed scoring information including reflections and comments
 * Requires judgeId query parameter
 */
router.get('/:eventId/my-progress', authenticate, async (req: AuthRequest, res) => {
    try {
        const { eventId } = req.params;
        const judgeId = req.query.judgeId as string;

        if (!judgeId) {
            return res.status(400).json({ error: 'judgeId query parameter is required' });
        }

        // Verify judge profile belongs to the authenticated user
        const profile = await queryOne(
            'SELECT id FROM event_judges WHERE id = $1 AND event_id = $2 AND user_id = $3',
            [judgeId, eventId, req.user!.id]
        );

        if (!profile) {
            return res.status(403).json({ error: 'Invalid judge profile' });
        }

        // Get all completed submissions for this judge with total scores
        // Uses LEFT JOIN on rubric_criteria (not INNER JOIN) so scores with
        // NULL rubric_criteria_id still appear (matches moderator endpoint pattern)
        const submissions = await query(
            `SELECT 
                t.id as team_id,
                t.name as team_name,
                t.description,
                ss.id as submission_id,
                ss.submitted_at,
                COALESCE(SUM(s.score), 0) as total_score
            FROM score_submissions ss
            JOIN teams t ON ss.team_id = t.id
            LEFT JOIN scores s ON ss.id = s.submission_id
            WHERE ss.judge_id = $1
              AND ss.event_id = $2
              AND ss.submitted_at IS NOT NULL
            GROUP BY t.id, t.name, t.description, ss.id, ss.submitted_at
            ORDER BY ss.submitted_at DESC`,
            [judgeId, eventId]
        );

        // Restrict legacy positional mapping to this event's rubric.
        const allCriteria = await query(
            `SELECT rc.id, rc.short_name, rc.display_order
             FROM rubric_criteria rc
             JOIN events e ON e.event_type = rc.event_type
             WHERE e.id = $1
             ORDER BY rc.display_order`,
            [eventId]
        );

        // For each completed submission, get per-criteria breakdown
        const scoredTeams = [];
        for (const sub of submissions) {
            // Get individual scores with criteria names
            // LEFT JOIN rubric_criteria so scores with NULL criteria_id still appear
            const scores = await query(
                `SELECT 
                    s.score,
                    s.reflection,
                    s.rubric_criteria_id,
                    rc.short_name,
                    rc.display_order
                FROM scores s
                LEFT JOIN rubric_criteria rc ON s.rubric_criteria_id = rc.id
                WHERE s.submission_id = $1
                ORDER BY s.created_at ASC`,
                [sub.submission_id]
            );

            // Get overall comments
            const comment = await queryOne(
                'SELECT comments FROM judge_comments WHERE submission_id = $1',
                [sub.submission_id]
            );

            // Build breakdown object
            const breakdown: Record<string, number> = {};
            const reflections: Record<string, string> = {};

            // Track unmapped scores (NULL rubric_criteria_id) for positional assignment
            let unmappedIndex = 0;
            // Determine which criteria are already mapped
            const mappedCriteriaIds = new Set(
                scores.filter((s: any) => s.rubric_criteria_id).map((s: any) => s.rubric_criteria_id)
            );
            // Get criteria that haven't been mapped yet (for positional assignment)
            const unmappedCriteria = allCriteria.filter((c: any) => !mappedCriteriaIds.has(c.id));

            for (const score of scores) {
                let key: string;
                if (score.short_name) {
                    // Score has proper criteria mapping
                    key = score.short_name.toLowerCase();
                } else if (unmappedCriteria[unmappedIndex]) {
                    // Assign unmapped score to next available criteria by position
                    key = unmappedCriteria[unmappedIndex].short_name.toLowerCase();
                    unmappedIndex++;
                } else {
                    key = `criteria_${Object.keys(breakdown).length + 1}`;
                }
                breakdown[key] = score.score;
                if (score.reflection) {
                    reflections[key] = score.reflection;
                }
            }

            scoredTeams.push({
                teamName: sub.team_name,
                projectTitle: sub.description,
                totalScore: parseFloat(sub.total_score),
                judgedAt: sub.submitted_at,  // Return raw ISO timestamp, let frontend format in local timezone
                breakdown,
                reflections,
                comments: comment?.comments || null
            });
        }

        return res.json(scoredTeams);
    } catch (error) {
        console.error('Error fetching judge progress:', error);
        return res.status(500).json({ error: 'Failed to fetch progress' });
    }
});

// ==================== AWARDS ====================

/**
 * Get current top 3 awards for an event
 */
router.get('/:eventId/awards', authenticate, async (req, res) => {
    try {
        const awards = await query(
            `SELECT ta.award_type, ta.team_id, t.name as team_name
             FROM team_awards ta
             JOIN teams t ON ta.team_id = t.id
             WHERE ta.event_id = $1 AND ta.award_type IN ('first_place', 'second_place', 'third_place')
             ORDER BY CASE ta.award_type
                 WHEN 'first_place' THEN 1
                 WHEN 'second_place' THEN 2
                 WHEN 'third_place' THEN 3
             END`,
            [req.params.eventId]
        );

        return res.json({ awards });
    } catch (error) {
        console.error('Error fetching awards:', error);
        return res.status(500).json({ error: 'Failed to fetch awards' });
    }
});

/**
 * Assign top 3 awards for an event (moderator/admin only)
 * Body: { firstPlace: teamId, secondPlace?: teamId, thirdPlace?: teamId }
 * Note: secondPlace and thirdPlace are optional for events with fewer teams
 */
router.post('/:eventId/awards', authenticate, requireRole(['admin', 'moderator']), async (req: AuthRequest, res) => {
    try {
        const { eventId } = req.params;
        const { firstPlace, secondPlace, thirdPlace } = req.body;

        // Validate that at least first place is provided
        if (!firstPlace) {
            return res.status(400).json({ error: 'First place is required' });
        }

        // Collect all provided places
        const places = [firstPlace, secondPlace, thirdPlace].filter(Boolean);
        
        // Validate that all provided teams are different
        const uniquePlaces = new Set(places);
        if (uniquePlaces.size !== places.length) {
            return res.status(400).json({ error: 'Each place must be a different team' });
        }

        // Verify all teams belong to this event
        const teams = await query(
            'SELECT id FROM teams WHERE event_id = $1 AND id = ANY($2::uuid[])',
            [eventId, places]
        );

        if (teams.length !== places.length) {
            return res.status(400).json({ error: 'One or more teams not found in this event' });
        }

        // Delete existing top 3 awards for this event
        await query(
            `DELETE FROM team_awards 
             WHERE event_id = $1 AND award_type IN ('first_place', 'second_place', 'third_place')`,
            [eventId]
        );

        // Insert new awards (only for provided places)
        const insertValues: string[] = [];
        const insertParams: any[] = [eventId, req.user!.id];
        let paramIndex = 3;

        if (firstPlace) {
            insertValues.push(`($1, $${paramIndex}, 'first_place', $2)`);
            insertParams.push(firstPlace);
            paramIndex++;
        }
        if (secondPlace) {
            insertValues.push(`($1, $${paramIndex}, 'second_place', $2)`);
            insertParams.push(secondPlace);
            paramIndex++;
        }
        if (thirdPlace) {
            insertValues.push(`($1, $${paramIndex}, 'third_place', $2)`);
            insertParams.push(thirdPlace);
            paramIndex++;
        }

        if (insertValues.length > 0) {
            await query(
                `INSERT INTO team_awards (event_id, team_id, award_type, awarded_by)
                 VALUES ${insertValues.join(', ')}`,
                insertParams
            );
        }

        return res.json({ message: 'Awards assigned successfully' });
    } catch (error) {
        console.error('Error assigning awards:', error);
        return res.status(500).json({ error: 'Failed to assign awards' });
    }
});

export default router;
