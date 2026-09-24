-- ============================================================================
-- MELOY JUDGING APP - DATABASE SCHEMA
-- PostgreSQL Schema for AWS RDS
-- Version: 1.1
-- Last Updated: February 2, 2026
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLE 1: USERS & AUTHENTICATION
-- Stores all user accounts (judges, admins, moderators)
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- Nullable for OAuth providers
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'judge', 'admin')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    
    -- Multi-provider authentication support
    auth_provider VARCHAR(20) DEFAULT 'local' CHECK (auth_provider IN ('local', 'auth0', 'netid')),
    auth_provider_id VARCHAR(255), -- Auth0 sub, NetID UIN, etc.
    auth_metadata JSONB, -- Additional auth provider data
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast auth provider lookups
CREATE INDEX idx_users_auth_provider ON users(auth_provider, auth_provider_id);

-- Ensure unique auth provider accounts
CREATE UNIQUE INDEX idx_users_auth_provider_unique 
    ON users(auth_provider, auth_provider_id) 
    WHERE auth_provider_id IS NOT NULL;

COMMENT ON TABLE users IS 'All user accounts with multi-provider authentication support (local, Auth0, NetID)';
COMMENT ON COLUMN users.auth_provider IS 'Authentication provider: local (password), auth0, netid';
COMMENT ON COLUMN users.auth_provider_id IS 'Unique identifier from auth provider (Auth0 sub, NetID UIN, etc.)';
COMMENT ON COLUMN users.auth_metadata IS 'Additional metadata from auth provider (profile data, org info, etc.)';
COMMENT ON COLUMN users.role IS 'User role: judge (scores teams), admin (full access), moderator (controls event flow)';
COMMENT ON COLUMN users.is_active IS 'Soft disable for users without deletion';

-- ============================================================================
-- TABLE 2: EVENTS
-- Competition events with moderator control
-- ============================================================================

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
    
    -- Moderator control fields
    judging_phase VARCHAR(20) DEFAULT 'not-started' CHECK (judging_phase IN ('not-started', 'in-progress', 'ended')),
    current_active_team_id UUID, -- Which team is currently being judged (set by moderator)
    
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE events IS 'Competition events (Aggies Invent, Problems Worth Solving)';
COMMENT ON COLUMN events.event_type IS 'aggies-invent = team-based, problems-worth-solving = individual students';
COMMENT ON COLUMN events.judging_phase IS 'Controlled by moderator: not-started → in-progress → ended';
COMMENT ON COLUMN events.current_active_team_id IS 'Team currently presenting (moderator activates one team at a time)';

-- ============================================================================
-- TABLE 3: SPONSORS
-- Event sponsors with branding configuration
-- ============================================================================

CREATE TABLE sponsors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    primary_color VARCHAR(7) DEFAULT '#500000',
    secondary_color VARCHAR(7) DEFAULT '#FFFFFF',
    text_color VARCHAR(7) DEFAULT '#FFFFFF',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id)
);

COMMENT ON TABLE sponsors IS 'Sponsor branding per event (logo, colors)';
COMMENT ON COLUMN sponsors.logo_url IS 'S3 URL or base64-encoded image data';
COMMENT ON COLUMN sponsors.primary_color IS 'Hex color for gradients and banners';

-- ============================================================================
-- TABLE 4: JUDGE SESSIONS
-- Tracks judge profile login sessions and online status
-- ============================================================================

CREATE TABLE judge_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    judge_id UUID,  -- Will reference event_judges(id) after that table is created
    logged_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logged_out_at TIMESTAMP,
    UNIQUE(event_id, judge_id, logged_in_at)
);

COMMENT ON TABLE judge_sessions IS 'Judge profile login sessions for tracking online status';
COMMENT ON COLUMN judge_sessions.judge_id IS 'References the judge profile (event_judges) - FK added after event_judges table';
COMMENT ON COLUMN judge_sessions.last_activity IS 'Updated on each API call; judge profile is "online" if < 5 min ago';
COMMENT ON COLUMN judge_sessions.logged_out_at IS 'NULL = still logged in, NOT NULL = session ended';

-- ============================================================================
-- TABLE 4.5: EVENT JUDGES (Judge Profiles)
-- Judge profiles for each event - multiple profiles can share one login account
-- ============================================================================

CREATE TABLE event_judges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- The shared login account for this event
    name VARCHAR(255) NOT NULL,  -- Judge profile name (e.g., "Dr. Smith", "Prof. Chen")
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, name)  -- Each judge profile name must be unique within an event
);

COMMENT ON TABLE event_judges IS 'Judge profiles for events - multiple profiles share one login account per event';
COMMENT ON COLUMN event_judges.user_id IS 'The shared judge account that all profiles for this event log into';
COMMENT ON COLUMN event_judges.name IS 'Display name for this judge profile (selected when entering event)';
COMMENT ON COLUMN event_judges.assigned_at IS 'Timestamp when judge profile was created';

-- Add FK constraint for judge_sessions now that event_judges exists
ALTER TABLE judge_sessions ADD CONSTRAINT fk_judge_sessions_judge 
    FOREIGN KEY (judge_id) REFERENCES event_judges(id) ON DELETE CASCADE;


-- ============================================================================
-- TABLE 5: TEAMS
-- Participating teams or individual students
-- ============================================================================

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    project_title VARCHAR(255),
    description TEXT,
    presentation_order INTEGER, -- Order set by admin/moderator (nullable in actual RDS)
    
    -- Status controlled by moderator
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed')),
    
    -- Project URL and photo
    project_url TEXT, -- Added to match actual RDS schema
    photo_url TEXT, -- Team photo URL (uploaded by admin)
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, name),
    UNIQUE(event_id, presentation_order)
);

COMMENT ON TABLE teams IS 'Teams (Aggies Invent) or individual students (PWS)';
COMMENT ON COLUMN teams.presentation_order IS 'Moderator sets presentation sequence (1, 2, 3, ...)';
COMMENT ON COLUMN teams.status IS 'waiting = not yet presented, active = currently presenting, completed = finished';

-- Add FK constraint for events.current_active_team_id (after teams table exists)
ALTER TABLE events ADD CONSTRAINT fk_current_active_team 
    FOREIGN KEY (current_active_team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- ============================================================================
-- TABLE 6: TEAM MEMBERS
-- Individual students on a team
-- ============================================================================

CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE team_members IS 'Students on a team (for PWS events, only 1 member per team)';

-- ============================================================================
-- TABLE 7: RUBRIC CRITERIA
-- Scoring categories (global, locked once event starts)
-- ============================================================================

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
);

COMMENT ON TABLE rubric_criteria IS 'Scoring categories (Communication, Funding, Presentation, Cohesion)';
COMMENT ON COLUMN rubric_criteria.icon_name IS 'Lucide icon name for UI (e.g., Megaphone, BadgeDollarSign)';
COMMENT ON COLUMN rubric_criteria.guiding_question IS 'Placeholder text for judge reflection input';

-- ============================================================================
-- TABLE 8: SCORE SUBMISSIONS
-- Tracks judge profile progress per team (started, completed, time spent)
-- ============================================================================

CREATE TABLE score_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    judge_id UUID REFERENCES event_judges(id) ON DELETE CASCADE,  -- Judge profile, not user account
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP, -- NULL = in progress, NOT NULL = completed
    time_spent_seconds INTEGER, -- Auto-calculated on submission
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(judge_id, team_id)  -- One submission per judge profile per team
);

COMMENT ON TABLE score_submissions IS 'Judge profile scoring progress (one per judge profile per team)';
COMMENT ON COLUMN score_submissions.judge_id IS 'References the judge profile (event_judges), not the user account';
COMMENT ON COLUMN score_submissions.submitted_at IS 'NULL = judge is still scoring, NOT NULL = judge submitted final scores';
COMMENT ON COLUMN score_submissions.time_spent_seconds IS 'Calculated as (submitted_at - started_at) for analytics';

-- ============================================================================
-- TABLE 9: SCORES
-- Individual rubric criteria scores
-- ============================================================================

CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES score_submissions(id) ON DELETE CASCADE,
    judge_id UUID REFERENCES event_judges(id) ON DELETE CASCADE,  -- Judge profile, not user account
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    rubric_criteria_id UUID REFERENCES rubric_criteria(id) ON DELETE CASCADE,
    
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 25),
    reflection TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(judge_id, team_id, rubric_criteria_id)  -- One score per judge profile per team per criteria
);

COMMENT ON TABLE scores IS 'Individual scores per judge profile per team per criteria';
COMMENT ON COLUMN scores.judge_id IS 'References the judge profile (event_judges), not the user account';
COMMENT ON COLUMN scores.reflection IS 'Judge notes/feedback for this specific criteria';

-- ============================================================================
-- TABLE 10: JUDGE COMMENTS
-- Overall feedback per team
-- ============================================================================

CREATE TABLE judge_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES score_submissions(id) ON DELETE CASCADE,
    judge_id UUID REFERENCES event_judges(id) ON DELETE CASCADE,  -- Judge profile, not user account
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    
    comments TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(judge_id, team_id)  -- One comment per judge profile per team
);

COMMENT ON TABLE judge_comments IS 'Overall comments from judge profile about the team (separate from per-criteria reflections)';
COMMENT ON COLUMN judge_comments.judge_id IS 'References the judge profile (event_judges), not the user account';

-- ============================================================================
-- TABLE 11: ACTIVITY LOG
-- Admin activity feed
-- ============================================================================

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
);

COMMENT ON TABLE activity_log IS 'Admin screen "Recent Activity" feed';
COMMENT ON COLUMN activity_log.activity_type IS 'event_created, judge_added, team_activated, scoring_completed, etc.';
COMMENT ON COLUMN activity_log.tone IS 'UI color tone: primary, success, warning, error';

-- ============================================================================
-- TABLE 12: PASSWORD RESET TOKENS
-- For forgot password flow
-- ============================================================================

CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE password_reset_tokens IS 'Temporary tokens for password reset flow';
COMMENT ON COLUMN password_reset_tokens.used_at IS 'NULL = unused, NOT NULL = already used (prevent reuse)';

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Events
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_judging_phase ON events(judging_phase);
CREATE INDEX idx_events_created_by ON events(created_by);

-- Judge Sessions
CREATE INDEX idx_judge_sessions_event_judge ON judge_sessions(event_id, judge_id);
CREATE INDEX idx_judge_sessions_active ON judge_sessions(event_id, judge_id, last_activity) 
    WHERE logged_out_at IS NULL;

-- Teams
CREATE INDEX idx_teams_event ON teams(event_id);
CREATE INDEX idx_teams_status ON teams(status);
CREATE INDEX idx_teams_presentation_order ON teams(event_id, presentation_order);

-- Team Members
CREATE INDEX idx_team_members_team ON team_members(team_id);

-- Rubric Criteria
CREATE INDEX idx_rubric_criteria_order ON rubric_criteria(display_order);

-- Score Submissions
CREATE INDEX idx_score_submissions_judge_team ON score_submissions(judge_id, team_id);
CREATE INDEX idx_score_submissions_event ON score_submissions(event_id);
CREATE INDEX idx_score_submissions_completed ON score_submissions(submitted_at) 
    WHERE submitted_at IS NOT NULL;

-- Scores
CREATE INDEX idx_scores_submission ON scores(submission_id);
CREATE INDEX idx_scores_judge_team ON scores(judge_id, team_id);
CREATE INDEX idx_scores_team ON scores(team_id);

-- Judge Comments
CREATE INDEX idx_judge_comments_submission ON judge_comments(submission_id);
CREATE INDEX idx_judge_comments_judge_team ON judge_comments(judge_id, team_id);

-- Activity Log
CREATE INDEX idx_activity_log_event ON activity_log(event_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);

-- Password Reset Tokens
CREATE INDEX idx_password_reset_active ON password_reset_tokens(token, expires_at) 
    WHERE used_at IS NULL;

-- ============================================================================
-- TRIGGERS - Auto-update updated_at timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_score_submissions_updated_at BEFORE UPDATE ON score_submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scores_updated_at BEFORE UPDATE ON scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_judge_comments_updated_at BEFORE UPDATE ON judge_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGERS - Auto-calculate time_spent_seconds
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_time_spent()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.submitted_at IS NOT NULL AND OLD.submitted_at IS NULL THEN
        NEW.time_spent_seconds = EXTRACT(EPOCH FROM (NEW.submitted_at - NEW.started_at))::INTEGER;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_calculate_time_spent BEFORE UPDATE ON score_submissions
    FOR EACH ROW EXECUTE FUNCTION calculate_time_spent();

-- ============================================================================
-- SEED DATA - Default Rubric Criteria
-- ============================================================================

INSERT INTO rubric_criteria (name, short_name, description, max_score, display_order, icon_name, guiding_question) VALUES
('Effective Communication', 'Communication', 'Was the problem clear and important? Does the solution address the problem effectively? Are the both the near and long-term impacts addressed?', 25, 1, 'Megaphone', 'Write down thoughts here:'),
('Would Fund/Buy Solution', 'Funding', 'Consider technical feasibility, commercial viability, and novelty of the approach.', 25, 2, 'BadgeDollarSign', 'Write down thoughts here:'),
('Presentation Quality', 'Presentation', 'How inspiring was the video? Does the prototype add to the story? How clear, organized, and engaging are the slides?', 25, 3, 'Presentation', 'Write down thoughts here:'),
('Overall', 'Cohesion', 'Reflect on how compelling the pitch was. How well did the team handle Q&A?', 25, 4, 'Sparkles', 'Write down thoughts here:');

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- View: Judge profile online status for moderator screen
CREATE VIEW judge_online_status AS
SELECT 
    ej.event_id,
    ej.id as judge_id,
    ej.name as judge_name,
    js.last_activity,
    CASE 
        WHEN js.logged_out_at IS NULL AND js.last_activity > NOW() - INTERVAL '5 minutes' 
        THEN true 
        ELSE false 
    END as is_online
FROM event_judges ej
LEFT JOIN judge_sessions js ON ej.id = js.judge_id AND ej.event_id = js.event_id
WHERE js.logged_out_at IS NULL OR js.id IS NULL;

COMMENT ON VIEW judge_online_status IS 'Real-time judge profile online status (online if last_activity < 5 min ago)';

-- View: Team scoring progress for event detail and moderator screens
CREATE VIEW team_scoring_progress AS
SELECT 
    t.id as team_id,
    t.event_id,
    t.name as team_name,
    t.project_title,
    t.status as moderator_status,
    t.presentation_order,
    COUNT(DISTINCT ss.judge_id) FILTER (WHERE ss.submitted_at IS NOT NULL) as judges_completed,
    (SELECT COUNT(*) FROM event_judges WHERE event_id = t.event_id) as total_judges,
    COALESCE(SUM(s.score), 0) as total_score,
    COALESCE(AVG(s.score), 0) as average_score,
    -- Derived status for UI
    CASE 
        WHEN t.status = 'waiting' THEN 'not-scored'
        WHEN COUNT(DISTINCT ss.judge_id) FILTER (WHERE ss.submitted_at IS NOT NULL) = 0 THEN 'not-scored'
        WHEN COUNT(DISTINCT ss.judge_id) FILTER (WHERE ss.submitted_at IS NOT NULL) < 
             (SELECT COUNT(*) FROM event_judges WHERE event_id = t.event_id) THEN 'in-progress'
        ELSE 'scored'
    END as scoring_status
FROM teams t
LEFT JOIN score_submissions ss ON t.id = ss.team_id
LEFT JOIN scores s ON t.id = s.team_id
GROUP BY t.id, t.event_id, t.name, t.project_title, t.status, t.presentation_order;

COMMENT ON VIEW team_scoring_progress IS 'Team scoring status with judge profile completion counts';

-- ============================================================================
-- SCHEMA COMPLETE
-- ============================================================================

-- Verify schema version
CREATE TABLE schema_version (
    version VARCHAR(10) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_version (version) VALUES ('1.0');

COMMENT ON TABLE schema_version IS 'Schema version tracking for migrations';
