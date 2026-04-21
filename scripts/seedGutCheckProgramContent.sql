-- ============================================================================
-- Packet 13 QA seed: Gut Check program content items
--
-- The Gut Check program and its 4 modules were already seeded, but no
-- content_items were published underneath them, which made the
-- user-facing detail page render every module as "More content coming
-- soon." and left Packet 13 progress controls unreachable.
--
-- This script seeds 2-3 published items per module covering all four
-- Packet 12 item_types (article, guidance, video, milestone) so the
-- progress UI can be QA'd end to end. It is idempotent: it re-uses the
-- titles as a soft dedupe key inside (module_id, title).
-- ============================================================================

DO $$
DECLARE
  v_program_id UUID;
  v_mod_orientation UUID;
  v_mod_reset UUID;
  v_mod_reintroduction UUID;
  v_mod_consolidation UUID;
BEGIN
  SELECT id INTO v_program_id FROM public.programs WHERE slug = 'gut-check';
  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'gut-check program not found';
  END IF;

  SELECT id INTO v_mod_orientation
    FROM public.program_modules
   WHERE program_id = v_program_id AND title = 'Orientation & baseline';
  SELECT id INTO v_mod_reset
    FROM public.program_modules
   WHERE program_id = v_program_id AND title = 'Reset week';
  SELECT id INTO v_mod_reintroduction
    FROM public.program_modules
   WHERE program_id = v_program_id AND title = 'Reintroduction sequence';
  SELECT id INTO v_mod_consolidation
    FROM public.program_modules
   WHERE program_id = v_program_id AND title = 'Consolidation';
END $$;

-- Idempotent insert helper: (module_id, title) acts as a soft key.
-- We delete any previous row with the same (module_id, title) and
-- re-insert with the current body so re-running the script refreshes
-- content without duplicating.

WITH mods AS (
  SELECT
    pm.id,
    pm.title
  FROM public.program_modules pm
  JOIN public.programs p ON p.id = pm.program_id
  WHERE p.slug = 'gut-check'
)
DELETE FROM public.program_content_items
WHERE (module_id, title) IN (
  SELECT m.id, x.title
  FROM mods m
  JOIN (VALUES
    ('Orientation & baseline', 'Welcome to Gut Check'),
    ('Orientation & baseline', 'How this program works'),
    ('Orientation & baseline', 'Set your baseline week'),
    ('Reset week', 'What to eat during the reset'),
    ('Reset week', 'Meal spacing during the reset'),
    ('Reset week', 'Complete the reset week'),
    ('Reintroduction sequence', 'How reintroduction works'),
    ('Reintroduction sequence', 'Tracking prompts during reintroduction'),
    ('Reintroduction sequence', 'Finish a full reintroduction cycle'),
    ('Consolidation', 'Build your maintenance rhythm'),
    ('Consolidation', 'Graduate from Gut Check')
  ) AS x(module_title, title) ON x.module_title = m.title
);

INSERT INTO public.program_content_items
  (module_id, item_type, title, summary, body, video_url, video_provider, estimated_minutes, ordinal, status)
SELECT pm.id, x.item_type, x.title, x.summary, x.body, x.video_url, x.video_provider, x.minutes, x.ordinal, 'published'
FROM public.program_modules pm
JOIN public.programs p ON p.id = pm.program_id
JOIN (VALUES
  -- Orientation & baseline
  ('Orientation & baseline', 'article'::text, 'Welcome to Gut Check',
    'What the next few weeks will look like and how to get the most out of the program.',
    E'Gut Check is a structured four-phase program: orientation, a reset week, a staged reintroduction sequence, and consolidation.\n\nSet aside ~15 minutes now to read each module''s intro items. After that, most check-ins take under two minutes.',
    NULL::text, NULL::text, 10::int, 0::int),
  ('Orientation & baseline', 'video', 'How this program works',
    'A short walkthrough of how to pace the program week by week.',
    NULL,
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 6, 1),
  ('Orientation & baseline', 'milestone', 'Set your baseline week',
    'Mark complete when you have logged 3 baseline days.',
    E'A baseline is 3 typical days of eating logged without changing anything. This is what we compare later phases against.',
    NULL, NULL, 15, 2),

  -- Reset week
  ('Reset week', 'article', 'What to eat during the reset',
    'The short list of foods that almost always go down easy, plus what to avoid this week.',
    E'Focus on: cooked vegetables, white rice, eggs, simple proteins, broths.\nAvoid: alcohol, ultra-processed snacks, high-FODMAP produce, added sugar.\n\nKeep portions moderate and meals evenly spaced.',
    NULL, NULL, 8, 0),
  ('Reset week', 'guidance', 'Meal spacing during the reset',
    'Aim for ~4 hours between meals with no grazing in between.',
    E'Three clearly defined meals, no snacks, last meal ~3 hours before bed. This gives the migrating motor complex room to work, which matters more than calorie counts during the reset.',
    NULL, NULL, 5, 1),
  ('Reset week', 'milestone', 'Complete the reset week',
    'Mark complete when you have finished 7 consecutive reset-week days.',
    NULL, NULL, NULL, NULL, 2),

  -- Reintroduction sequence
  ('Reintroduction sequence', 'article', 'How reintroduction works',
    'One trigger category at a time, with a small challenge and a 48-hour watch window.',
    E'You''ll introduce one category (e.g. gluten, dairy, alliums) with a small portion, then a normal portion the next day, then wait 48 hours while logging symptoms.\n\nIf nothing fires, the category passes and you continue eating it normally. If something fires, that category stays out for now.',
    NULL, NULL, 12, 0),
  ('Reintroduction sequence', 'guidance', 'Tracking prompts during reintroduction',
    'Log these specific signals each evening while a category is live.',
    E'Log nightly:\n- Bloating 0-3\n- Bowel pattern change yes/no\n- Sleep quality 0-3\n- Energy the next morning 0-3\n\nThese four beat long free-text journaling every time during reintroductions.',
    NULL, NULL, 4, 1),
  ('Reintroduction sequence', 'milestone', 'Finish a full reintroduction cycle',
    'Mark complete when you have run at least 4 category cycles end to end.',
    NULL, NULL, NULL, NULL, 2),

  -- Consolidation
  ('Consolidation', 'article', 'Build your maintenance rhythm',
    'Turning what worked into a sustainable default pattern.',
    E'Pick the 3-5 guardrails that consistently kept you feeling well and write them down. Most people''s list is boring: meal spacing, one trigger that stays out, protein at each meal, alcohol only on weekends.\n\nBoring is the point.',
    NULL, NULL, 7, 0),
  ('Consolidation', 'milestone', 'Graduate from Gut Check',
    'Mark complete when your maintenance rhythm has held for 2 weeks.',
    NULL, NULL, NULL, NULL, 1)
) AS x(module_title, item_type, title, summary, body, video_url, video_provider, minutes, ordinal)
  ON x.module_title = pm.title
WHERE p.slug = 'gut-check';

-- Normalize module ordering to the natural program flow so the
-- Packet 13 resume target lands on the first orientation item.
UPDATE public.program_modules
SET ordinal = CASE title
  WHEN 'Orientation & baseline' THEN 0
  WHEN 'Reset week' THEN 1
  WHEN 'Reintroduction sequence' THEN 2
  WHEN 'Consolidation' THEN 3
  ELSE ordinal
END
WHERE program_id = (SELECT id FROM public.programs WHERE slug = 'gut-check');

NOTIFY pgrst, 'reload schema';
