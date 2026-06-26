-- ============================================================================
-- Programs Marketing — DRAFT-ONLY seed for public.site_content
--
--   Stage C / step C2 (branch-only script prep). DO NOT APPLY TO PRODUCTION
--   without explicit sign-off. This file is prepared for review only.
--
-- WHAT THIS DOES
--   Seeds the Programs marketing product records + compositions into the
--   existing `site_content` table, mirroring the Integrative Care pattern:
--     Product record:  key = product:programs:{slug}
--     Composition:     key = composition:programs:{slug}
--   The composition payloads are copied verbatim from the in-repo JSON seeds:
--     data/compositions/programs--nutrition.json
--     data/compositions/programs--nutrition--baseline.json
--   The product-record payloads mirror the SEO defaults the live pages already
--   emit (pages/programs/[series]/index.tsx and [series]/[program].tsx).
--
-- WHY THIS IS SAFE (draft-only, NON-ACTIVATING)
--   * Every row is inserted with status = 'draft'. This script NEVER writes a
--     'published' row.
--   * The public routes read PUBLISHED content only
--     (getProgramsMarketingComposition/...ProductRecord called with 'published').
--     Draft rows are invisible to live pages; they surface only in admin preview.
--   * The publish gate requires BOTH a published PRODUCT RECORD and a published
--     COMPOSITION before a composition takes over a public page. Draft rows
--     satisfy neither, so this seed CANNOT open the gate or activate live pages.
--   * No offers / offer_entitlements / price_options / entitlement keys are
--     touched. These are PRESENTATION rows only — the same source-of-truth
--     boundary documented in scripts/sql/createStartPagesTable.sql.
--   * No schema changes. site_content already exists with the exact shape used
--     here (key text, data jsonb, status text CHECK in ('draft','published'),
--     UNIQUE (key, status)).
--
-- IDEMPOTENT
--   ON CONFLICT (key, status) DO UPDATE re-syncs the draft payload only. Safe to
--   rerun. It can only ever create/update the DRAFT row for each key.
--
-- TO ACTIVATE (NOT part of this script — approval-gated, future C2-apply/C3/C4)
--   Publishing (copying draft -> published for BOTH the product record AND the
--   composition) is what would open the gate. That is intentionally excluded.
-- ============================================================================

BEGIN;

-- ── Product record: Nutrition collection (DRAFT) ────────────────────────────
INSERT INTO public.site_content (key, data, status)
VALUES (
  'product:programs:nutrition',
  $prod_nutrition$
{
  "slug": "nutrition",
  "category": "programs",
  "templateFamily": "programs",
  "kind": "collection",
  "collectionSlug": "nutrition",
  "status": "draft",
  "title": "Nutrition Foundations",
  "seoTitle": "Nutrition Foundations \u2022 Fine Diet Programs",
  "seoDescription": "Built on The Fine Diet Method, Nutrition Foundations moves from a practical Baseline rhythm into focused nutrition experiments that help clarify what supports your body best.",
  "sortOrder": 10
}
$prod_nutrition$::jsonb,
  'draft'
)
ON CONFLICT (key, status) DO UPDATE
  SET data = EXCLUDED.data,
      updated_at = NOW();

-- ── Product record: Baseline program (DRAFT) ────────────────────────────────
INSERT INTO public.site_content (key, data, status)
VALUES (
  'product:programs:nutrition--baseline',
  $prod_baseline$
{
  "slug": "nutrition--baseline",
  "category": "programs",
  "templateFamily": "programs",
  "kind": "program",
  "collectionSlug": "nutrition",
  "programSlug": "baseline",
  "status": "draft",
  "title": "Baseline",
  "seoTitle": "Baseline \u2022 Nutrition Foundations \u2022 Fine Diet Programs",
  "seoDescription": "Create a practical starting rhythm and observe food, routine, and body-signal patterns before choosing a more focused path.",
  "sortOrder": 10
}
$prod_baseline$::jsonb,
  'draft'
)
ON CONFLICT (key, status) DO UPDATE
  SET data = EXCLUDED.data,
      updated_at = NOW();

-- ── Composition: Nutrition collection (DRAFT) ───────────────────────────────
-- Verbatim copy of data/compositions/programs--nutrition.json
INSERT INTO public.site_content (key, data, status)
VALUES (
  'composition:programs:nutrition',
  $comp_nutrition$
{
  "key": "composition:programs:nutrition",
  "version": 1,
  "modules": [
    {
      "id": "hero",
      "type": "hero.standard.v1",
      "content": {
        "headline": "The most comprehensive,\nself-led nutrition program",
        "subheadline": "Nutrition Foundations is a staged pathway built on The Fine Diet Method. Start with Baseline, then extend into focused programs as they fit your goals.",
        "images": {
          "desktop": "https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg",
          "mobile": "https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg",
          "alt": "Fine Diet Nutrition Foundations"
        },
        "height": "medium"
      }
    },
    {
      "id": "collection-cta",
      "type": "cta.program-offer.v1",
      "content": {
        "collectionSlug": "nutrition",
        "eyebrow": "Nutrition Foundations",
        "heading": "Start by building a foundation you can extend",
        "body": "Most plans hand you one rigid protocol. Nutrition Foundations begins with a shared Baseline, then lets you add focused programs over time so progress compounds instead of resetting.",
        "align": "center",
        "surface": "light"
      }
    },
    {
      "id": "how-it-works",
      "type": "process.slide-stack.v1",
      "content": {
        "heading": "How this program works",
        "defaultOpenIndex": 0,
        "steps": [
          {
            "stepNumber": 1,
            "label": "Days 1\u201321",
            "title": "Establish your Baseline",
            "lines": [
              "Follow a practical 21-day rhythm and observe food, routine, and body-signal patterns before changing anything drastic."
            ],
            "imageDesktop": "https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg",
            "imageMobile": "https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg"
          },
          {
            "stepNumber": 2,
            "label": "After Baseline",
            "title": "Read your signals",
            "lines": [
              "Use what Baseline revealed to choose a focused next program instead of guessing or restarting from scratch."
            ],
            "imageDesktop": "https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg",
            "imageMobile": "https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg"
          },
          {
            "stepNumber": 3,
            "label": "Ongoing",
            "title": "Extend what works",
            "lines": [
              "Move into digestion, protein, sugar, or inflammation programs as they fit \u2014 each one builds on the last."
            ],
            "imageDesktop": "https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg",
            "imageMobile": "https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg"
          }
        ]
      }
    },
    {
      "id": "program-sequence",
      "type": "grid.program-cards.v1",
      "content": {
        "collectionSlug": "nutrition",
        "heading": "The Nutrition Foundations sequence",
        "subhead": "Everyone starts with Baseline. Each later program is a public overview here \u2014 delivery happens in the signed-in app."
      }
    },
    {
      "id": "app-integration",
      "type": "feature.reasons-split.v1",
      "content": {
        "heading": "Every program works with your journal",
        "items": [
          { "label": "Plan", "sentence": "Set a realistic weekly rhythm around the program you are running." },
          { "label": "Log", "sentence": "Capture meals, timing, and how your body responded as you go." },
          { "label": "Learn", "sentence": "See the patterns Baseline surfaces so the next step is informed." },
          { "label": "Repeat", "sentence": "Keep what works and extend it into the next focused program." }
        ],
        "imageDesktop": "https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg",
        "imageMobile": "https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg",
        "imageAlt": "The Fine Diet app on a tablet"
      }
    },
    {
      "id": "marquee",
      "type": "ambient.marquee-strip.v1",
      "content": {
        "text": "NOT A DETOX. NOT A DIET CHALLENGE. NOT ANOTHER TRACKER.",
        "speed": 50,
        "direction": "left",
        "pauseOnHover": true
      }
    },
    {
      "id": "differentiators",
      "type": "feature.icon-tiles.v1",
      "content": {
        "heading": "What makes Nutrition Foundations different",
        "intro": "Most nutrition programs ask you to change too much before you understand what is actually driving the pattern. The goal is not to do more. The goal is to create enough structure that your body feedback becomes useful.",
        "surface": "dark",
        "tiles": [
          { "icon": "programs", "title": "Stabilize first", "description": "Build meal rhythm before making advanced changes." },
          { "icon": "notebook", "title": "Follow the signal", "description": "Use check-ins to understand what your body needs next." },
          { "icon": "quadrants", "title": "Built into your journal", "description": "Plan, track, and repeat what works\u2014all in one place." }
        ]
      }
    },
    {
      "id": "comparison",
      "type": "comparison.table.v1",
      "content": {
        "heading": "Built differently than most nutrition programs",
        "columns": { "left": "Fine Diet Programs", "right": "Most Programs" },
        "rows": [
          { "left": "A shared Baseline you observe before changing things", "right": "A fixed protocol from day one" },
          { "left": "Staged programs you add as they fit", "right": "One plan, all-or-nothing" },
          { "left": "Compounds \u2014 each program builds on the last", "right": "Resets when the plan ends" },
          { "left": "Self-led, on your schedule", "right": "Tied to coaching cadence" }
        ]
      }
    },
    {
      "id": "faq",
      "type": "faq.accordion.v2",
      "content": {
        "title": "Frequently asked",
        "defaultOpenIndex": 0,
        "items": [
          {
            "id": "faq-0",
            "question": "Where do I start?",
            "answer": "Everyone starts with Baseline, the first program in Nutrition Foundations. It establishes a 21-day rhythm and a starting point future programs build from."
          },
          {
            "id": "faq-1",
            "question": "Is this a restriction diet?",
            "answer": "No. You add structure and observe patterns before deciding whether a more focused program fits. Nothing is removed all at once."
          },
          {
            "id": "faq-2",
            "question": "Do I need the app?",
            "answer": "These pages are public overviews. Active enrollment, check-ins, and delivery happen in the signed-in Fine Diet app once you have access."
          },
          {
            "id": "faq-3",
            "question": "When are the later programs available?",
            "answer": "Baseline is available now. Digestion, protein, sugar, and inflammation programs are staged and roll out over time."
          }
        ]
      }
    },
    {
      "id": "final-cta",
      "type": "cta.program-offer.v1",
      "content": {
        "collectionSlug": "nutrition",
        "heading": "Your nutrition will never need another restart",
        "body": "Start with Baseline and build a foundation you can extend.",
        "align": "center",
        "surface": "dark"
      }
    }
  ]
}
$comp_nutrition$::jsonb,
  'draft'
)
ON CONFLICT (key, status) DO UPDATE
  SET data = EXCLUDED.data,
      updated_at = NOW();

-- ── Composition: Baseline program (DRAFT) ───────────────────────────────────
-- Verbatim copy of data/compositions/programs--nutrition--baseline.json
INSERT INTO public.site_content (key, data, status)
VALUES (
  'composition:programs:nutrition--baseline',
  $comp_baseline$
{
  "key": "composition:programs:nutrition--baseline",
  "version": 1,
  "modules": [
    {
      "id": "hero",
      "type": "hero.standard.v1",
      "content": {
        "headline": "Baseline",
        "subheadline": "Your 21-day starting rhythm",
        "body": "Create a practical starting rhythm and observe food, routine, and body-signal patterns before choosing a more focused path.",
        "images": {
          "desktop": "https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg",
          "mobile": "https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg",
          "alt": "Fine Diet Baseline program"
        },
        "height": "medium"
      }
    },
    {
      "id": "program-cta",
      "type": "cta.program-offer.v1",
      "content": {
        "collectionSlug": "nutrition",
        "programSlug": "baseline",
        "eyebrow": "Program",
        "heading": "Baseline",
        "body": "Create a practical starting rhythm and observe food, routine, and body-signal patterns before choosing a more focused path.",
        "align": "left",
        "surface": "light"
      }
    },
    {
      "id": "pathway",
      "type": "nav.program-pathway.v1",
      "content": {
        "collectionSlug": "nutrition",
        "programSlug": "baseline"
      }
    },
    {
      "id": "who-for",
      "type": "grid.cards.v1",
      "content": {
        "title": "Who it is for",
        "items": [
          { "id": "who-0", "title": "People beginning the Fine Diet Method for the first time." },
          { "id": "who-1", "title": "Members who want structure without jumping into a specialized protocol." },
          { "id": "who-2", "title": "Anyone who needs a clearer starting point before comparing future changes." }
        ]
      }
    },
    {
      "id": "what-you-will-do",
      "type": "grid.cards.v1",
      "content": {
        "title": "What you will do",
        "items": [
          { "id": "do-0", "title": "Follow a simple 21-day meal and reflection rhythm." },
          { "id": "do-1", "title": "Track repeatable signals that can inform the next program choice." },
          { "id": "do-2", "title": "Use the baseline period to notice patterns without diagnosing or over-correcting." }
        ]
      }
    },
    {
      "id": "final-cta",
      "type": "cta.program-offer.v1",
      "content": {
        "collectionSlug": "nutrition",
        "programSlug": "baseline",
        "heading": "Start with Baseline",
        "body": "Establish your 21-day rhythm and a starting point future programs build from.",
        "align": "center",
        "surface": "dark"
      }
    }
  ]
}
$comp_baseline$::jsonb,
  'draft'
)
ON CONFLICT (key, status) DO UPDATE
  SET data = EXCLUDED.data,
      updated_at = NOW();

COMMIT;

-- ============================================================================
-- Verification (read-only — run after applying in a non-prod environment)
-- ============================================================================
-- Expect exactly 4 rows, every one status = 'draft', zero 'published':
--
-- SELECT key, status, jsonb_typeof(data) AS data_type
-- FROM public.site_content
-- WHERE key IN (
--   'product:programs:nutrition',
--   'product:programs:nutrition--baseline',
--   'composition:programs:nutrition',
--   'composition:programs:nutrition--baseline'
-- )
-- ORDER BY key, status;
--
-- Gate-closed assertion (MUST return 0 — no published programs marketing rows):
--
-- SELECT count(*) AS published_programs_rows
-- FROM public.site_content
-- WHERE key LIKE '%:programs:%' AND status = 'published';
-- ============================================================================
