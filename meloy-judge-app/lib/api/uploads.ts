/**
 * Upload / Comment Clips API endpoints
 */

import { get, post } from './client';

export interface PresignResponse {
    uploadUrl: string;
    key: string;
    cloudFrontUrl: string;
}

export interface CommentClip {
    id: string;
    event_id: string;
    team_id: string;
    rubric_criteria_id: string;
    criteria_name: string;
    display_order: number;
    clip_image_key: string;
    sheet_image_key: string | null;
    clipUrl: string;
    sheetUrl: string | null;
    created_at: string;
}

/**
 * Get a presigned S3 PUT URL for direct browser upload.
 */
export async function getPresignedUploadUrl(
    contentType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
    folder = 'comment-sheets'
): Promise<PresignResponse> {
    return post<PresignResponse>('/uploads/presign', { contentType, folder });
}

/**
 * Upload a blob directly to S3 using a presigned PUT URL.
 * Returns the CloudFront URL.
 */
export async function uploadToS3(presigned: PresignResponse, blob: Blob): Promise<string> {
    const res = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'image/jpeg' },
        body: blob,
    });
    if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
    return presigned.cloudFrontUrl;
}

/**
 * Save comment clip metadata to the database after S3 upload.
 */
export async function saveCommentClips(params: {
    eventId: string;
    teamId: string;
    sheetKey: string;
    clips: { rubricCriteriaId: string; clipKey: string }[];
}): Promise<{ clips: CommentClip[] }> {
    return post('/uploads/comment-clips', params);
}

/**
 * Fetch all comment clips for a team (with CloudFront URLs).
 */
export async function getCommentClips(teamId: string): Promise<{ clips: CommentClip[] }> {
    return get(`/uploads/comment-clips/${teamId}`);
}

/**
 * Run one-time DB migration to create judge_comment_clips table.
 */
export async function runCommentClipsMigration(): Promise<{ message: string }> {
    return post('/uploads/migrate-comment-clips', {});
}
