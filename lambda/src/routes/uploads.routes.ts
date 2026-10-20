import { Router } from 'express';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authenticate, AuthRequest } from '../middleware/auth';
import { query, queryOne } from '../db/connection';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const s3 = new S3Client({ region: 'us-east-1' });
const BUCKET = process.env.UPLOADS_BUCKET!;
const CF_URL = (process.env.CLOUDFRONT_UPLOADS_URL || '').replace(/\/$/, '');

// ==================== PRESIGNED UPLOAD URL ====================

/**
 * POST /uploads/presign
 * Returns a short-lived presigned PUT URL for direct browser → S3 upload.
 * Body: { filename: string, contentType: 'image/jpeg' | 'image/png' | 'image/webp', folder: string }
 */
router.post('/presign', authenticate, async (req: AuthRequest, res) => {
    try {
        const { contentType = 'image/jpeg', folder = 'comment-sheets' } = req.body;

        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(contentType)) {
            return res.status(400).json({ error: 'Invalid content type' });
        }

        const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
        const key = `${folder}/${uuidv4()}.${ext}`;

        const command = new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ContentType: contentType,
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min

        return res.json({ uploadUrl, key, cloudFrontUrl: `${CF_URL}/${key}` });
    } catch (error: any) {
        console.error('Presign error:', error);
        return res.status(500).json({ error: 'Failed to generate upload URL' });
    }
});

// ==================== COMMENT CLIPS ====================

/**
 * POST /uploads/comment-clips
 * Saves clip metadata after the browser has uploaded images to S3.
 * Body: { eventId, teamId, clips: [{ rubricCriteriaId, clipKey, sheetKey }] }
 */
router.post('/comment-clips', authenticate, async (req: AuthRequest, res) => {
    try {
        const { eventId, teamId, clips, sheetKey } = req.body;

        if (!eventId || !teamId || !Array.isArray(clips) || clips.length === 0) {
            return res.status(400).json({ error: 'eventId, teamId, and clips array are required' });
        }

        // Delete any pre-existing clips for this team (one set of sheets per team)
        await query(
            'DELETE FROM judge_comment_clips WHERE team_id = $1 AND event_id = $2',
            [teamId, eventId]
        );

        // Insert new clips
        const inserted = [];
        for (const clip of clips) {
            const { rubricCriteriaId, clipKey } = clip;
            const row = await queryOne(
                `INSERT INTO judge_comment_clips
                   (event_id, team_id, rubric_criteria_id, sheet_image_key, clip_image_key)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [eventId, teamId, rubricCriteriaId, sheetKey || null, clipKey]
            );
            inserted.push(row);
        }

        return res.status(201).json({ clips: inserted });
    } catch (error: any) {
        console.error('Save clips error:', error);
        return res.status(500).json({ error: 'Failed to save comment clips' });
    }
});

/**
 * GET /uploads/comment-clips/:teamId
 * Returns all comment clips for a team, with CloudFront URLs.
 */
router.get('/comment-clips/:teamId', authenticate, async (req: AuthRequest, res) => {
    try {
        const clips = await query(
            `SELECT jcc.*, rc.name as criteria_name, rc.display_order
             FROM judge_comment_clips jcc
             JOIN rubric_criteria rc ON jcc.rubric_criteria_id = rc.id
             WHERE jcc.team_id = $1
             ORDER BY rc.display_order`,
            [req.params.teamId]
        );

        const withUrls = clips.map((c: any) => ({
            ...c,
            clipUrl: `${CF_URL}/${c.clip_image_key}`,
            sheetUrl: c.sheet_image_key ? `${CF_URL}/${c.sheet_image_key}` : null,
        }));

        return res.json({ clips: withUrls });
    } catch (error: any) {
        console.error('Fetch clips error:', error);
        return res.status(500).json({ error: 'Failed to fetch comment clips' });
    }
});

/**
 * DELETE /uploads/comment-clips/:teamId
 * Removes all clips for a team (admin only — allows re-uploading a corrected sheet).
 */
router.delete('/comment-clips/:teamId', authenticate, async (req: AuthRequest, res) => {
    try {
        const clips = await query(
            'DELETE FROM judge_comment_clips WHERE team_id = $1 RETURNING clip_image_key, sheet_image_key',
            [req.params.teamId]
        );

        // Fire-and-forget: delete actual S3 objects
        const keys = new Set<string>();
        for (const c of clips as any[]) {
            if (c.clip_image_key) keys.add(c.clip_image_key);
            if (c.sheet_image_key) keys.add(c.sheet_image_key);
        }
        for (const key of keys) {
            s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {});
        }

        return res.json({ deleted: clips.length });
    } catch (error: any) {
        console.error('Delete clips error:', error);
        return res.status(500).json({ error: 'Failed to delete comment clips' });
    }
});

/**
 * POST /uploads/migrate-comment-clips  (ONE-TIME — remove after running)
 * Creates the judge_comment_clips table.
 */
router.post('/migrate-comment-clips', async (_req, res) => {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS judge_comment_clips (
                id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
                team_id             UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                rubric_criteria_id  UUID NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
                sheet_image_key     TEXT,
                clip_image_key      TEXT NOT NULL,
                created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await query(`
            CREATE INDEX IF NOT EXISTS idx_jcc_team ON judge_comment_clips(team_id);
            CREATE INDEX IF NOT EXISTS idx_jcc_event ON judge_comment_clips(event_id);
        `);
        return res.json({ message: 'judge_comment_clips table created' });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

export default router;
