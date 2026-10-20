import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { query, transaction } from '../db/connection';

const router = Router();

// ==================== ADMIN UTILITIES ====================

/**
 * Run Auth Provider Migration
 * Adds support for Auth0, NetID, and other OAuth providers
 */
router.post('/migrate-auth-providers', async (_req, res) => {
    try {
        console.log('🔧 Starting auth provider migration...');

        await transaction(async (client) => {
            // Check if columns already exist
            const checkColumns = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                    AND column_name IN ('auth_provider', 'auth_provider_id', 'auth_metadata')
            `);

            if (checkColumns.rows.length === 3) {
                console.log('⚠️  Auth provider columns already exist, skipping migration');
                return;
            }

            console.log('Adding auth provider columns...');
            
            // Add new columns
            await client.query(`
                ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local' 
                        CHECK (auth_provider IN ('local', 'auth0', 'netid')),
                    ADD COLUMN IF NOT EXISTS auth_provider_id VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS auth_metadata JSONB
            `);

            // Make password_hash nullable (not needed for OAuth providers)
            await client.query(`
                ALTER TABLE users
                    ALTER COLUMN password_hash DROP NOT NULL
            `);

            // Create index for fast lookups by auth provider
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_users_auth_provider 
                    ON users(auth_provider, auth_provider_id)
            `);

            // Update existing users to 'local' provider if not already set
            await client.query(`
                UPDATE users 
                SET auth_provider = 'local' 
                WHERE auth_provider IS NULL
            `);

            // Create a unique constraint to prevent duplicate auth provider accounts
            await client.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_unique 
                    ON users(auth_provider, auth_provider_id) 
                    WHERE auth_provider_id IS NOT NULL
            `);

            console.log('✅ Auth provider migration completed successfully!');
        });

        res.json({ 
            message: 'Auth provider migration completed successfully',
            changes: [
                'Added auth_provider column (local, auth0, netid)',
                'Added auth_provider_id column',
                'Added auth_metadata JSONB column',
                'Made password_hash nullable',
                'Created indexes for performance',
                'Added unique constraint for auth providers'
            ]
        });
    } catch (error: any) {
        console.error('❌ Auth provider migration error:', error);
        res.status(500).json({ 
            error: 'Failed to run auth provider migration',
            details: error.message
        });
    }
});

/**
 * Add judge_user_id column to events table
 * Allows each event to have a dedicated judge account
 */
router.post('/migrate-judge-account', async (_req, res) => {
    try {
        console.log('🔧 Starting judge account migration...');

        await transaction(async (client) => {
            // Check if column already exists
            const checkColumn = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'events' 
                    AND column_name = 'judge_user_id'
            `);

            if (checkColumn.rows.length > 0) {
                console.log('⚠️  judge_user_id column already exists, skipping migration');
                return;
            }

            console.log('Adding judge_user_id column to events table...');
            
            await client.query(`
                ALTER TABLE events 
                ADD COLUMN judge_user_id UUID REFERENCES users(id) ON DELETE SET NULL
            `);

            console.log('✅ Judge account migration completed successfully!');
        });

        res.json({ 
            message: 'Judge account migration completed successfully',
            changes: [
                'Added judge_user_id column to events table',
                'Each event can now have a dedicated judge account'
            ]
        });
    } catch (error: any) {
        console.error('❌ Judge account migration error:', error);
        res.status(500).json({ 
            error: 'Failed to run judge account migration',
            details: error.message
        });
    }
});


/**
 * Initialize database schema
 * WARNING: Admin endpoint - drops all tables and recreates them
 */
router.post('/init-schema', async (_req, res) => {
    try {
        console.log('🔧 Starting schema initialization...');

        await transaction(async (client) => {
            // Drop all tables
            console.log('Dropping existing tables...');
            await client.query('DROP TABLE IF EXISTS activity_log CASCADE');
            await client.query('DROP TABLE IF EXISTS judge_comments CASCADE');
            await client.query('DROP TABLE IF EXISTS scores CASCADE');
            await client.query('DROP TABLE IF EXISTS score_submissions CASCADE');
            await client.query('DROP TABLE IF EXISTS judge_sessions CASCADE');
            await client.query('DROP TABLE IF EXISTS team_members CASCADE');
            await client.query('DROP TABLE IF EXISTS teams CASCADE');
            await client.query('DROP TABLE IF EXISTS event_judges CASCADE');
            await client.query('DROP TABLE IF EXISTS sponsors CASCADE');
            await client.query('DROP TABLE IF EXISTS events CASCADE');
            await client.query('DROP TABLE IF EXISTS rubric_criteria CASCADE');
            await client.query('DROP TABLE IF EXISTS password_reset_tokens CASCADE');
            await client.query('DROP TABLE IF EXISTS users CASCADE');
            await client.query('DROP TABLE IF EXISTS schema_version CASCADE');

            console.log('Enabling extensions...');
            await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
            await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

            console.log('Creating users table...');
            await client.query(`
                CREATE TABLE users (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    role VARCHAR(20) NOT NULL DEFAULT 'judge' CHECK (role IN ('judge', 'admin', 'moderator')),
                    is_active BOOLEAN DEFAULT true,
                    last_login TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('Creating sponsors table...');
            await client.query(`
                CREATE TABLE sponsors (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name VARCHAR(255) NOT NULL,
                    logo_url TEXT,
                    primary_color VARCHAR(7) DEFAULT '#500000',
                    secondary_color VARCHAR(7) DEFAULT '#FFFFFF',
                    text_color VARCHAR(7) DEFAULT '#FFFFFF',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('Creating events table...');
            await client.query(`
                CREATE TABLE events (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name VARCHAR(255) NOT NULL,
                    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('aggies-invent', 'problems-worth-solving')),
                    duration VARCHAR(100),
                    start_date TIMESTAMP,
                    end_date TIMESTAMP,
                    location VARCHAR(255),
                    description TEXT,
                    status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed')),
                    judging_phase VARCHAR(20) DEFAULT 'not-started' CHECK (judging_phase IN ('not-started', 'in-progress', 'ended')),
                    current_active_team_id UUID,
                    sponsor_id UUID REFERENCES sponsors(id) ON DELETE SET NULL,
                    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('Creating teams table...');
            await client.query(`
                CREATE TABLE teams (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    project_title VARCHAR(255),
                    description TEXT,
                    presentation_order INTEGER,
                    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed')),
                    project_url TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(event_id, name),
                    UNIQUE(event_id, presentation_order)
                )
            `);

            console.log('Adding FK constraint for current_active_team_id...');
            await client.query(`
                ALTER TABLE events ADD CONSTRAINT fk_current_active_team 
                FOREIGN KEY (current_active_team_id) REFERENCES teams(id) ON DELETE SET NULL
            `);

            console.log('Creating team_members table...');
            await client.query(`
                CREATE TABLE team_members (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('Creating event_judges table (judge profiles)...');
            await client.query(`
                CREATE TABLE event_judges (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(event_id, name)
                )
            `);

            console.log('Creating judge_sessions table...');
            await client.query(`
                CREATE TABLE judge_sessions (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
                    judge_id UUID REFERENCES event_judges(id) ON DELETE CASCADE,
                    logged_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    logged_out_at TIMESTAMP,
                    UNIQUE(event_id, judge_id, logged_in_at)
                )
            `);

            console.log('Creating rubric_criteria table...');
            await client.query(`
                CREATE TABLE rubric_criteria (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name VARCHAR(255) NOT NULL,
                    short_name VARCHAR(50),
                    description TEXT,
                    max_score INTEGER NOT NULL DEFAULT 25,
                    display_order INTEGER NOT NULL,
                    icon_name VARCHAR(50),
                    guiding_question TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(display_order)
                )
            `);

            console.log('Creating score_submissions table...');
            await client.query(`
                CREATE TABLE score_submissions (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    judge_id UUID REFERENCES event_judges(id) ON DELETE CASCADE,
                    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
                    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    submitted_at TIMESTAMP,
                    time_spent_seconds INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(judge_id, team_id)
                )
            `);

            console.log('Creating scores table...');
            await client.query(`
                CREATE TABLE scores (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    submission_id UUID REFERENCES score_submissions(id) ON DELETE CASCADE,
                    judge_id UUID REFERENCES event_judges(id) ON DELETE CASCADE,
                    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
                    rubric_criteria_id UUID REFERENCES rubric_criteria(id) ON DELETE CASCADE,
                    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 25),
                    reflection TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(judge_id, team_id, rubric_criteria_id)
                )
            `);

            console.log('Creating judge_comments table...');
            await client.query(`
                CREATE TABLE judge_comments (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    submission_id UUID REFERENCES score_submissions(id) ON DELETE CASCADE,
                    judge_id UUID REFERENCES event_judges(id) ON DELETE CASCADE,
                    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
                    comments TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(judge_id, team_id)
                )
            `);

            console.log('Creating activity_log table...');
            await client.query(`
                CREATE TABLE activity_log (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
                    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    activity_type VARCHAR(50),
                    icon_name VARCHAR(50),
                    tone VARCHAR(20),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('Creating password_reset_tokens table...');
            await client.query(`
                CREATE TABLE password_reset_tokens (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    token VARCHAR(255) UNIQUE NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    used_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('Creating indexes...');
            await client.query('CREATE INDEX idx_users_email ON users(email)');
            await client.query('CREATE INDEX idx_users_role ON users(role)');
            await client.query('CREATE INDEX idx_events_status ON events(status)');
            await client.query('CREATE INDEX idx_events_judging_phase ON events(judging_phase)');
            await client.query('CREATE INDEX idx_teams_event ON teams(event_id)');
            await client.query('CREATE INDEX idx_teams_status ON teams(status)');
            await client.query('CREATE INDEX idx_teams_presentation_order ON teams(event_id, presentation_order)');
            await client.query('CREATE INDEX idx_team_members_team ON team_members(team_id)');
            await client.query('CREATE INDEX idx_judge_sessions_event_judge ON judge_sessions(event_id, judge_id)');
            await client.query('CREATE INDEX idx_rubric_criteria_order ON rubric_criteria(display_order)');
            await client.query('CREATE INDEX idx_score_submissions_judge_team ON score_submissions(judge_id, team_id)');
            await client.query('CREATE INDEX idx_score_submissions_event ON score_submissions(event_id)');
            await client.query('CREATE INDEX idx_scores_submission ON scores(submission_id)');
            await client.query('CREATE INDEX idx_scores_judge_team ON scores(judge_id, team_id)');
            await client.query('CREATE INDEX idx_scores_team ON scores(team_id)');
            await client.query('CREATE INDEX idx_judge_comments_submission ON judge_comments(submission_id)');
            await client.query('CREATE INDEX idx_judge_comments_judge_team ON judge_comments(judge_id, team_id)');
            await client.query('CREATE INDEX idx_activity_log_event ON activity_log(event_id)');
            await client.query('CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC)');

            console.log('Inserting default rubric criteria...');
            await client.query(`
                INSERT INTO rubric_criteria (name, short_name, description, max_score, display_order, icon_name, guiding_question, event_type) VALUES
                ('Effective Communication', 'Communication', 'Was the problem clear and important? Does the solution address the problem effectively? Are both the near and long-term impacts addressed?', 25, 1, 'Megaphone', 'Write down thoughts here:', 'aggies-invent'),
                ('Would Fund/Buy Solution', 'Funding', 'Consider technical feasibility, commercial viability, and novelty of the approach.', 25, 2, 'BadgeDollarSign', 'Write down thoughts here:', 'aggies-invent'),
                ('Presentation Quality', 'Presentation', 'How inspiring was the video? Does the prototype add to the story? How clear, organized, and engaging are the slides?', 25, 3, 'Presentation', 'Write down thoughts here:', 'aggies-invent'),
                ('Overall', 'Cohesion', 'Reflect on how compelling the pitch was. How well did the team handle Q&A?', 25, 4, 'Sparkles', 'Write down thoughts here:', 'aggies-invent'),
                ('Is the problem clear and concise?', 'Problem', NULL, 5, 1, 'Target', 'Write down thoughts here:', 'problems-worth-solving'),
                ('Is it clear what people and/or organizations have the problem?', 'Customer', NULL, 5, 2, 'Users', 'Write down thoughts here:', 'problems-worth-solving'),
                ('Is a compelling case made that customers would pay for a solution?', 'Willingness', NULL, 5, 3, 'BadgeDollarSign', 'Write down thoughts here:', 'problems-worth-solving'),
                ('Is the target market large enough to support a high-growth business?', 'Market', NULL, 5, 4, 'TrendingUp', 'Write down thoughts here:', 'problems-worth-solving'),
                ('Is it clear that the existing solutions to solve the problem are inadequate or absent?', 'Solutions', NULL, 5, 5, 'Lightbulb', 'Write down thoughts here:', 'problems-worth-solving'),
                ($$Judge's Overall Impressions$$, 'Overall', NULL, 5, 6, 'Sparkles', 'Write down thoughts here:', 'problems-worth-solving')
            `);

            console.log('Creating schema_version table...');
            await client.query(`
                CREATE TABLE schema_version (
                    version VARCHAR(10) PRIMARY KEY,
                    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await client.query("INSERT INTO schema_version (version) VALUES ('1.1')");
        });

        console.log('✅ Schema initialized successfully!');
        res.json({ 
            message: 'Schema initialized successfully with judge profile architecture',
            version: '1.1'
        });
    } catch (error: any) {
        console.error('❌ Init schema error:', error);
        res.status(500).json({ 
            error: 'Failed to initialize schema',
            details: error.message
        });
    }
});

/**
 * Seed test data
 * WARNING: Admin endpoint - populates database with test data
 */
router.post('/seed-data', async (_req, res) => {
    try {
        console.log('🌱 Starting test data seed...');

        await transaction(async (client) => {
            // Insert users
            console.log('Inserting users...');
            await client.query(`
                INSERT INTO users (id, email, password_hash, name, role) VALUES
                ('00000000-0000-0000-0000-000000000001', 'admin@tamu.edu', '$2b$10$placeholder', 'Admin User', 'admin'),
                ('00000000-0000-0000-0000-000000000002', 'moderator@tamu.edu', '$2b$10$placeholder', 'Event Moderator', 'moderator'),
                ('00000000-0000-0000-0000-000000000003', 'judges-hackathon@tamu.edu', '$2b$10$placeholder', 'Hackathon Judges', 'judge')
            `);

            // Insert sponsors
            console.log('Inserting sponsors...');
            await client.query(`
                INSERT INTO sponsors (id, name, logo_url, primary_color, secondary_color, text_color) VALUES
                ('00000000-0000-0000-0000-000000000010', 'ExxonMobil', '/ExxonLogo.png', '#b91c1c', '#7f1d1d', '#FFFFFF')
            `);

            // Insert event
            console.log('Inserting event...');
            await client.query(`
                INSERT INTO events (id, name, event_type, duration, start_date, end_date, location, description, status, judging_phase, sponsor_id, created_by) VALUES
                ('00000000-0000-0000-0000-000000000100', 'Spring 2026 Aggies Invent', 'aggies-invent', '48 hours',
                 '2026-03-15 09:00:00', '2026-03-17 17:00:00', 'Zachry Engineering Center',
                 'Annual spring innovation competition', 'active', 'in-progress',
                 '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001')
            `);

            // Insert judge profiles
            // For testing in DEV_MODE, assign to admin user (id: 000...001)
            console.log('Inserting judge profiles...');
            await client.query(`
                INSERT INTO event_judges (id, event_id, user_id, name) VALUES
                ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 'Dr. Sarah Chen'),
                ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 'Prof. Michael Roberts'),
                ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 'Dr. Emily Watson'),
                ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 'Mr. James Miller')
            `);

            // Insert teams
            console.log('Inserting teams...');
            await client.query(`
                INSERT INTO teams (id, event_id, name, project_title, description, presentation_order, status) VALUES
                ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000100', 'Code Warriors', 'AI Task Manager', 'AI-powered task manager for students', 1, 'completed'),
                ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000100', 'Debug Squad', 'CollabCode', 'Collaborative coding platform', 2, 'completed'),
                ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000100', 'Innovation Hub', 'SmartCampus', 'IoT campus solution', 3, 'active'),
                ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000100', 'Tech Pioneers', 'EcoTrack', 'Sustainability tracking app', 4, 'waiting'),
                ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000100', 'Data Miners', 'HealthPredict', 'Predictive health analytics', 5, 'waiting')
            `);

            // Insert team members
            console.log('Inserting team members...');
            await client.query(`
                INSERT INTO team_members (team_id, name, email) VALUES
                ('00000000-0000-0000-0000-000000000301', 'Alice Johnson', 'alice@tamu.edu'),
                ('00000000-0000-0000-0000-000000000301', 'Bob Smith', 'bob@tamu.edu'),
                ('00000000-0000-0000-0000-000000000302', 'David Lee', 'david@tamu.edu'),
                ('00000000-0000-0000-0000-000000000302', 'Eva Martinez', 'eva@tamu.edu'),
                ('00000000-0000-0000-0000-000000000303', 'Frank Wilson', 'frank@tamu.edu')
            `);

            // Get criteria IDs
            const criteria = await client.query('SELECT id FROM rubric_criteria ORDER BY display_order');
            const [comm_id, fund_id, pres_id, cohe_id] = criteria.rows.map((r: any) => r.id);

            // Insert score submissions and scores
            console.log('Inserting score submissions and scores...');
            const sub1 = await client.query(`
                INSERT INTO score_submissions (id, judge_id, event_id, team_id, started_at, submitted_at, time_spent_seconds)
                VALUES ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000201', 
                        '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000301',
                        NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour 45 minutes', 900)
                RETURNING id
            `);
            const sub1_id = sub1.rows[0].id;

            await client.query(`
                INSERT INTO scores (submission_id, judge_id, team_id, rubric_criteria_id, score, reflection) VALUES
                ($1, '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', $2, 22, 'Excellent articulation'),
                ($1, '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', $3, 24, 'Very viable'),
                ($1, '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', $4, 21, 'Good demo'),
                ($1, '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', $5, 23, 'Strong team')
            `, [sub1_id, comm_id, fund_id, pres_id, cohe_id]);

            await client.query(`
                INSERT INTO judge_comments (submission_id, judge_id, team_id, comments)
                VALUES ($1, '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', 'Outstanding project!')
            `, [sub1_id]);

            // Add more scores for Code Warriors from other judges...
            const sub2 = await client.query(`
                INSERT INTO score_submissions (judge_id, event_id, team_id, started_at, submitted_at, time_spent_seconds)
                VALUES ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000100', 
                        '00000000-0000-0000-0000-000000000301', NOW() - INTERVAL '1 hour 30 minutes', 
                        NOW() - INTERVAL '1 hour', 1800)
                RETURNING id
            `);

            await client.query(`
                INSERT INTO scores (submission_id, judge_id, team_id, rubric_criteria_id, score) VALUES
                ($1, '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000301', $2, 20),
                ($1, '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000301', $3, 22),
                ($1, '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000301', $4, 23),
                ($1, '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000301', $5, 21)
            `, [sub2.rows[0].id, comm_id, fund_id, pres_id, cohe_id]);

            // Judge sessions
            console.log('Inserting judge sessions...');
            await client.query(`
                INSERT INTO judge_sessions (event_id, judge_id, logged_in_at, last_activity) VALUES
                ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000201', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 minutes'),
                ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000202', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 minute')
            `);

            // Activity log
            console.log('Inserting activity log...');
            await client.query(`
                INSERT INTO activity_log (event_id, user_id, title, description, activity_type, icon_name, tone) VALUES
                ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 'Event Created', 'Spring 2026 Aggies Invent was created', 'event_created', 'Calendar', 'primary')
            `);
        });

        console.log('✅ Test data seeded successfully!');
        res.json({ message: 'Test data seeded successfully' });
    } catch (error: any) {
        console.error('❌ Seed data error:', error);
        res.status(500).json({ 
            error: 'Failed to seed data',
            details: error.message
        });
    }
});

/**
 * Get activity logs
 * Admin only - view system activity
 */
router.get('/activity', authenticate, requireRole(['admin']), async (_req, res) => {
    try {
        const activity = await query(`
            SELECT 
                al.id,
                al.event_id,
                e.name as event_name,
                al.user_id,
                u.name as user_name,
                al.title,
                al.description,
                al.activity_type,
                al.icon_name,
                al.tone,
                al.created_at as timestamp
            FROM activity_log al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN events e ON al.event_id = e.id
            ORDER BY al.created_at DESC
            LIMIT 100
        `);
        res.json({ activity });
    } catch (error) {
        console.error('Activity fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch activity' });
    }
});

/**
 * Add photo_url column to teams table
 */
router.post('/migrate-team-photo', async (_req, res) => {
    try {
        console.log('🔧 Starting team photo migration...');

        await transaction(async (client) => {
            // Check if column already exists
            const checkColumn = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'teams' 
                    AND column_name = 'photo_url'
            `);

            if (checkColumn.rows.length > 0) {
                console.log('⚠️  photo_url column already exists, skipping migration');
                return;
            }

            console.log('Adding photo_url column to teams table...');
            
            await client.query(`
                ALTER TABLE teams ADD COLUMN photo_url TEXT
            `);

            await client.query(`
                COMMENT ON COLUMN teams.photo_url IS 'URL to team photo (uploaded by admin)'
            `);

            console.log('✅ Team photo migration completed successfully!');
        });

        res.json({ 
            message: 'Team photo migration completed successfully',
            changes: [
                'Added photo_url column to teams table',
                'Teams can now have photos uploaded by admins'
            ]
        });
    } catch (error: any) {
        console.error('❌ Team photo migration error:', error);
        res.status(500).json({ 
            error: 'Failed to run team photo migration',
            details: error.message
        });
    }
});

/**
 * Update user roles migration
 * Changes role system from (judge, admin, moderator) to (member, judge, admin)
 */
router.post('/migrate-user-roles', async (_req, res) => {
    try {
        console.log('🔧 Starting user roles migration...');

        await transaction(async (client) => {
            // Check current constraint
            const checkConstraint = await client.query(`
                SELECT conname 
                FROM pg_constraint 
                WHERE conname = 'users_role_check' 
                AND conrelid = 'users'::regclass
            `);

            if (checkConstraint.rows.length === 0) {
                console.log('⚠️  No role constraint found, creating new one...');
            } else {
                console.log('Dropping existing role constraint...');
                await client.query('ALTER TABLE users DROP CONSTRAINT users_role_check');
            }

            // Update existing moderator users to admin
            console.log('Converting moderator users to admin...');
            const moderatorCount = await client.query(`
                UPDATE users SET role = 'admin' WHERE role = 'moderator'
            `);
            console.log(`Converted ${moderatorCount.rowCount} moderator(s) to admin`);

            // Change default role from 'judge' to 'member'
            console.log('Updating default role to member...');
            await client.query(`
                ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member'
            `);

            // Add new CHECK constraint with updated roles
            console.log('Adding new role constraint...');
            await client.query(`
                ALTER TABLE users ADD CONSTRAINT users_role_check 
                CHECK (role IN ('member', 'judge', 'admin'))
            `);

            // Get statistics
            const stats = await client.query(`
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN role = 'member' THEN 1 END) as members,
                    COUNT(CASE WHEN role = 'judge' THEN 1 END) as judges,
                    COUNT(CASE WHEN role = 'admin' THEN 1 END) as admins
                FROM users
            `);

            console.log('✅ User roles migration completed successfully!');
            console.log('Statistics:', stats.rows[0]);

            res.json({ 
                message: 'User roles migration completed successfully',
                changes: [
                    'Removed moderator role',
                    'Added member role',
                    'Updated default role to member',
                    'Converted existing moderators to admin'
                ],
                statistics: stats.rows[0]
            });
        });
    } catch (error: any) {
        console.error('❌ User roles migration error:', error);
        res.status(500).json({ 
            error: 'Failed to run user roles migration',
            details: error.message 
        });
    }
});

/**
 * Verify migration - Check database schema
 * Tests that mentor_name and team_awards exist
 */
router.get('/verify-migration', async (_req, res) => {
    try {
        console.log('🔍 Verifying database schema...');

        const results: any = {};

        // Check mentor_name column
        const mentorCheck = await query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'teams' AND column_name = 'mentor_name'
        `);
        results.mentor_name_column = mentorCheck.length > 0 ? mentorCheck[0] : null;

        // Check team_awards table
        const awardsTableCheck = await query(`
            SELECT table_name, table_type
            FROM information_schema.tables 
            WHERE table_name = 'team_awards'
        `);
        results.team_awards_table = awardsTableCheck.length > 0 ? awardsTableCheck[0] : null;

        // Check team_awards columns
        const awardsColumnsCheck = await query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'team_awards'
            ORDER BY ordinal_position
        `);
        results.team_awards_columns = awardsColumnsCheck;

        // Check indexes
        const indexesCheck = await query(`
            SELECT indexname, indexdef
            FROM pg_indexes 
            WHERE tablename = 'team_awards'
        `);
        results.team_awards_indexes = indexesCheck;

        // Check view
        const viewCheck = await query(`
            SELECT table_name, table_type
            FROM information_schema.tables 
            WHERE table_name = 'event_awards_summary'
        `);
        results.event_awards_summary_view = viewCheck.length > 0 ? viewCheck[0] : null;

        // Test inserting a team with mentor
        const testTeam = await query(`
            SELECT id, name, mentor_name 
            FROM teams 
            LIMIT 1
        `);
        results.sample_team = testTeam.length > 0 ? testTeam[0] : null;

        // Summary
        results.summary = {
            mentor_name_exists: !!results.mentor_name_column,
            team_awards_exists: !!results.team_awards_table,
            view_exists: !!results.event_awards_summary_view,
            indexes_count: results.team_awards_indexes.length,
            columns_count: results.team_awards_columns.length
        };

        res.json({
            message: 'Schema verification complete',
            verified: results.summary.mentor_name_exists && 
                     results.summary.team_awards_exists && 
                     results.summary.view_exists,
            details: results
        });
    } catch (error: any) {
        console.error('❌ Verification error:', error);
        res.status(500).json({ 
            error: 'Failed to verify schema',
            details: error.message 
        });
    }
});

/**
 * Run mentor and awards migration
 * Adds mentor_name to teams and creates team_awards table
 */
router.post('/migrate-mentor-awards', async (_req, res) => {
    try {
        console.log('🔧 Running mentor and awards migration...');

        await transaction(async (client) => {
            // Check if mentor_name column already exists
            const checkMentor = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'teams' AND column_name = 'mentor_name'
            `);

            if (checkMentor.rows.length === 0) {
                console.log('Adding mentor_name column to teams table...');
                await client.query(`
                    ALTER TABLE teams ADD COLUMN mentor_name VARCHAR(255)
                `);
                await client.query(`
                    COMMENT ON COLUMN teams.mentor_name IS 'Name of team mentor/advisor (optional)'
                `);
            } else {
                console.log('⚠️  mentor_name column already exists, skipping...');
            }

            // Check if team_awards table already exists
            const checkAwards = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_name = 'team_awards'
            `);

            if (checkAwards.rows.length === 0) {
                console.log('Creating team_awards table...');
                await client.query(`
                    CREATE TABLE team_awards (
                        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                        event_id UUID REFERENCES events(id) ON DELETE CASCADE,
                        team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
                        award_type VARCHAR(50) NOT NULL CHECK (award_type IN (
                            'first_place',
                            'second_place', 
                            'third_place',
                            'most_feasible',
                            'best_prototype',
                            'best_video',
                            'best_presentation'
                        )),
                        awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        awarded_by UUID REFERENCES users(id) ON DELETE SET NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(event_id, award_type)
                    )
                `);

                await client.query(`
                    COMMENT ON TABLE team_awards IS 'Official event rankings and special awards assigned by admins'
                `);
                await client.query(`
                    COMMENT ON COLUMN team_awards.award_type IS 'Type of award: first_place, second_place, third_place, most_feasible, best_prototype, best_video, best_presentation'
                `);
                await client.query(`
                    COMMENT ON COLUMN team_awards.awarded_by IS 'Admin user who assigned the award'
                `);

                console.log('Creating indexes...');
                await client.query(`
                    CREATE INDEX idx_team_awards_event ON team_awards(event_id)
                `);
                await client.query(`
                    CREATE INDEX idx_team_awards_team ON team_awards(team_id)
                `);
                await client.query(`
                    CREATE INDEX idx_team_awards_type ON team_awards(event_id, award_type)
                `);

                console.log('Creating event_awards_summary view...');
                await client.query(`
                    CREATE VIEW event_awards_summary AS
                    SELECT 
                        e.id as event_id,
                        e.name as event_name,
                        ta.award_type,
                        t.id as team_id,
                        t.name as team_name,
                        t.project_title,
                        ta.awarded_at,
                        u.name as awarded_by_name
                    FROM events e
                    LEFT JOIN team_awards ta ON e.id = ta.event_id
                    LEFT JOIN teams t ON ta.team_id = t.id
                    LEFT JOIN users u ON ta.awarded_by = u.id
                    ORDER BY e.id, 
                        CASE ta.award_type
                            WHEN 'first_place' THEN 1
                            WHEN 'second_place' THEN 2
                            WHEN 'third_place' THEN 3
                            WHEN 'most_feasible' THEN 4
                            WHEN 'best_prototype' THEN 5
                            WHEN 'best_video' THEN 6
                            WHEN 'best_presentation' THEN 7
                        END
                `);

                await client.query(`
                    COMMENT ON VIEW event_awards_summary IS 'Summary of all awards for all events with team details'
                `);
            } else {
                console.log('⚠️  team_awards table already exists, skipping...');
            }

            console.log('✅ Migration completed successfully!');
        });

        return res.json({
            message: 'Mentor and awards migration completed successfully',
            changes: [
                'Added mentor_name column to teams table',
                'Created team_awards table',
                'Created indexes for team_awards',
                'Created event_awards_summary view'
            ],
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('❌ Migration error:', error);
        return res.status(500).json({ 
            error: `Failed to run migration: ${error.message}`,
            details: error.message,
            stack: error.stack
        });
    }
});

/**
 * Run database migration
 * Executes a migration file from database/migrations/
 * Usage: POST /admin/migrate/add_mentor_and_awards
 */
router.post('/migrate/:migrationName', async (req, res) => {
    try {
        const { migrationName } = req.params;
        
        if (!migrationName) {
            return res.status(400).json({ error: 'Migration name required' });
        }

        console.log(`🔧 Running migration: ${migrationName}`);

        // Read migration file from database/migrations/
        const fs = require('fs');
        const path = require('path');
        const migrationPath = path.join(__dirname, '../../../database/migrations', `${migrationName}.sql`);
        
        if (!fs.existsSync(migrationPath)) {
            return res.status(404).json({ 
                error: `Migration file not found: ${migrationName}.sql`,
                path: migrationPath
            });
        }

        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        await transaction(async (client) => {
            // Split SQL into individual statements
            const statements = migrationSQL
                .split(';')
                .map((s: string) => s.trim())
                .filter((s: string) => s && !s.startsWith('--') && s.length > 0);

            console.log(`Executing ${statements.length} SQL statements...`);

            for (let i = 0; i < statements.length; i++) {
                const statement = statements[i];
                console.log(`Statement ${i + 1}/${statements.length}:`, statement.substring(0, 100) + '...');
                await client.query(statement);
            }

            console.log('✅ Migration completed successfully!');
        });

        return res.json({
            message: `Migration '${migrationName}' completed successfully`,
            migration: migrationName,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('❌ Migration error:', error);
        return res.status(500).json({ 
            error: `Failed to run migration: ${error.message}`,
            details: error.message,
            stack: error.stack
        });
    }
});

/**
 * Delete test users
 * TEMPORARY: Remove test accounts from database
 */
router.post('/delete-test-users', async (_req, res) => {
    try {
        console.log('🗑️  Deleting test users...');

        const testEmails = [
            'admin@tamu.edu',
            'judges-hackathon@tamu.edu',
            'moderator@tamu.edu'
        ];

        await transaction(async (client) => {
            const result = await client.query(
                'DELETE FROM users WHERE email = ANY($1) RETURNING email',
                [testEmails]
            );

            console.log(`✅ Deleted ${result.rowCount} test users`);
            
            res.json({ 
                message: 'Test users deleted successfully',
                deleted: result.rows.map((r: any) => r.email),
                count: result.rowCount
            });
        });
    } catch (error: any) {
        console.error('❌ Delete test users error:', error);
        res.status(500).json({ 
            error: 'Failed to delete test users',
            details: error.message 
        });
    }
});

export default router;
