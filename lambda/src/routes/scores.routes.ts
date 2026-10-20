import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { query, transaction } from '../db/connection';

const router = Router();

// ==================== SCORES ====================

/**
 * Submit scores for a team
 * Requires judgeId (judge profile ID from event_judges) in request body
 */
router.post('/', authenticate, async (req: AuthRequest, res) => {
    try {
        const { eventId, teamId, judgeId, scores, overallComments, timeSpentSeconds } = req.body;

        // Admins and moderators cannot submit scores — only judges can
        if (req.user?.role === 'admin' || req.user?.role === 'moderator') {
            return res.status(403).json({ error: 'Only judges can submit scores' });
        }

        // Validate judgeId is provided
        if (!judgeId) {
            return res.status(400).json({ error: 'judgeId is required - select a judge profile first' });
        }

        // Verify judge profile belongs to this event and the authenticated user
        const judgeProfile = await query(
            'SELECT id FROM event_judges WHERE id = $1 AND event_id = $2 AND user_id = $3',
            [judgeId, eventId, req.user!.id]
        );

        if (!judgeProfile || judgeProfile.length === 0) {
            return res.status(403).json({ error: 'Invalid judge profile for this event/user' });
        }

        await transaction(async (client) => {
            // Create or update score submission
            const submissionResult = await client.query(
                `INSERT INTO score_submissions (judge_id, event_id, team_id, started_at, submitted_at, time_spent_seconds)
                 VALUES ($1, $2, $3, NOW(), NOW(), $4)
                 ON CONFLICT (judge_id, team_id) 
                 DO UPDATE SET submitted_at = NOW(), time_spent_seconds = $4
                 RETURNING id`,
                [judgeId, eventId, teamId, timeSpentSeconds || 0]
            );

            const submissionId = submissionResult.rows[0].id;

            // Delete existing scores
            await client.query('DELETE FROM scores WHERE submission_id = $1', [submissionId]);

            // Insert new scores
            for (const score of scores) {
                console.log(`[score-submit] Saving score: criteriaId=${score.criteriaId}, score=${score.score}, reflection=${score.reflection ? 'YES (' + score.reflection.length + ' chars)' : 'NONE'}`);
                await client.query(
                    `INSERT INTO scores (submission_id, judge_id, team_id, rubric_criteria_id, score, reflection)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [submissionId, judgeId, teamId, score.criteriaId, score.score, score.reflection || null]
                );
            }

            // Insert or update overall comment
            if (overallComments) {
                await client.query(
                    `INSERT INTO judge_comments (submission_id, judge_id, team_id, comments)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (judge_id, team_id)
                     DO UPDATE SET comments = $4, updated_at = NOW()`,
                    [submissionId, judgeId, teamId, overallComments]
                );
            }
        });

        return res.json({ message: 'Scores submitted successfully' });
    } catch (error: any) {
        console.error('Score submission error:', error);
        return res.status(500).json({ error: 'Failed to submit scores', details: error.message });
    }
});

/**
 * Get rubric criteria for a specific event type
 * @query event_type - 'aggies-invent' | 'problems-worth-solving' (default: 'aggies-invent')
 */
router.get('/rubric', async (req, res) => {
    try {
        const event_type = (req.query.event_type as string) || 'aggies-invent';
        const criteria = await query(
            'SELECT * FROM rubric_criteria WHERE event_type = $1 ORDER BY display_order',
            [event_type]
        );
        res.json({ criteria });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rubric' });
    }
});

/**
 * Get existing scores for a team by a judge (for editing)
 */
router.get('/:teamId/:judgeId', authenticate, async (req: AuthRequest, res) => {
    try {
        const { teamId, judgeId } = req.params;
        const isAdminUser = req.user?.role === 'admin' || req.user?.role === 'moderator';

        if (!isAdminUser) {
            // For regular judges, verify the profile belongs to the authenticated user
            const judgeProfile = await query(
                'SELECT id, event_id FROM event_judges WHERE id = $1 AND user_id = $2',
                [judgeId, req.user!.id]
            );

            if (!judgeProfile || judgeProfile.length === 0) {
                return res.status(403).json({ error: 'Invalid judge profile' });
            }
        }

        // Get the score submission
        const submission = await query(
            `SELECT id, time_spent_seconds, submitted_at 
             FROM score_submissions 
             WHERE judge_id = $1 AND team_id = $2`,
            [judgeId, teamId]
        );

        if (!submission || submission.length === 0) {
            return res.json({ scores: [], comments: null, hasExistingScores: false });
        }

        const submissionId = submission[0].id;

        // Get individual scores
        const scores = await query(
            `SELECT rubric_criteria_id, score, reflection 
             FROM scores 
             WHERE submission_id = $1`,
            [submissionId]
        );

        // Get overall comments
        const comments = await query(
            `SELECT comments 
             FROM judge_comments 
             WHERE judge_id = $1 AND team_id = $2`,
            [judgeId, teamId]
        );

        return res.json({
            scores: scores.map((s: any) => ({
                criteriaId: s.rubric_criteria_id,
                score: s.score,
                reflection: s.reflection
            })),
            comments: comments.length > 0 ? comments[0].comments : null,
            timeSpentSeconds: submission[0].time_spent_seconds,
            hasExistingScores: true
        });
    } catch (error: any) {
        console.error('Fetch scores error:', error);
        return res.status(500).json({ error: 'Failed to fetch scores', details: error.message });
    }
});

export default router;
