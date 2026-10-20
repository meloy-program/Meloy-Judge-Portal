import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import { logging } from './middleware';
import {
    authRoutes,
    authSyncRoutes,
    eventsRoutes,
    teamsRoutes,
    scoresRoutes,
    judgingRoutes,
    usersRoutes,
    adminRoutes,
    sponsorsRoutes,
    judgeProfilesRoutes,
    uploadsRoutes,
} from './routes';

const app = express();

// ==================== GLOBAL MIDDLEWARE ====================

app.use(express.json({ limit: '5mb' })); // Increased limit to support image uploads (base64 encoded)
app.use(cors());
app.use(logging);

// ==================== ROUTES ====================

// Health check (root level)
app.get('/health', async (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Auth routes
app.use('/auth', authRoutes);
app.use('/auth', authSyncRoutes); // Auth0/OAuth user sync

// Core API routes
app.use('/events', eventsRoutes);
app.use('/teams', teamsRoutes);
app.use('/scores', scoresRoutes);
app.use('/rubric', scoresRoutes); 
app.use('/judge', judgingRoutes);
app.use('/users', usersRoutes);
app.use('/admin', adminRoutes);
app.use('/sponsors', sponsorsRoutes);
app.use('/', judgeProfilesRoutes); // Judge profiles routes (includes /events/:eventId/judge-profiles)
app.use('/uploads', uploadsRoutes);

// ==================== ERROR HANDLING ====================

/**
 * Global error handler
 */
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
        error: 'Internal server error',
        message: err.message || 'An unexpected error occurred'
    });
});

/**
 * 404 handler
 */
app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// ==================== EXPORT ====================

// Export Lambda handler with basePath for API Gateway stage
export const handler = serverless(app, {
    basePath: '/prod'
});
