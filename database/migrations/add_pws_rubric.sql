-- ============================================================================
-- Migration: Add Problems Worth Solving (PWS) rubric support
-- Adds event_type column to rubric_criteria so each event type
-- can have its own unique rubric criteria.
-- ============================================================================

-- Step 1: Add event_type column (idempotent)
ALTER TABLE rubric_criteria
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) DEFAULT 'aggies-invent';

-- Step 2: Tag all existing rows as aggies-invent
UPDATE rubric_criteria
  SET event_type = 'aggies-invent'
  WHERE event_type IS NULL OR event_type = 'aggies-invent';

-- Step 3: Drop old single-column unique constraint on display_order
ALTER TABLE rubric_criteria
  DROP CONSTRAINT IF EXISTS rubric_criteria_display_order_key;

-- Step 4: Add composite unique constraint (display_order unique per event_type)
ALTER TABLE rubric_criteria
  DROP CONSTRAINT IF EXISTS rubric_criteria_display_order_event_type_key;

ALTER TABLE rubric_criteria
  ADD CONSTRAINT rubric_criteria_display_order_event_type_key
  UNIQUE (display_order, event_type);

-- Step 5: Insert PWS rubric criteria (6 criteria, 1–5 scale, 30 pts total)
INSERT INTO rubric_criteria (name, short_name, description, max_score, display_order, icon_name, guiding_question, event_type) VALUES
  ('Is the problem clear and concise?',
   'Problem',
   NULL,
   5, 1, 'Target', 'Write down thoughts here:', 'problems-worth-solving'),

  ('Is it clear what people and/or organizations have the problem?',
   'Customer',
   NULL,
   5, 2, 'Users', 'Write down thoughts here:', 'problems-worth-solving'),

  ('Is a compelling case made that customers would pay for a solution?',
   'Willingness',
   NULL,
   5, 3, 'BadgeDollarSign', 'Write down thoughts here:', 'problems-worth-solving'),

  ('Is the target market large enough to support a high-growth business?',
   'Market',
   NULL,
   5, 4, 'TrendingUp', 'Write down thoughts here:', 'problems-worth-solving'),

  ('Is it clear that the existing solutions to solve the problem are inadequate or absent?',
   'Solutions',
   NULL,
   5, 5, 'Lightbulb', 'Write down thoughts here:', 'problems-worth-solving'),

  ('Judge''s Overall Impressions',
   'Overall',
   NULL,
   5, 6, 'Sparkles', 'Write down thoughts here:', 'problems-worth-solving')

ON CONFLICT (display_order, event_type) DO NOTHING;
