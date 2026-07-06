-- One-time cleanup for /integrative-care landing composition ghost modules.
-- Removes stale modules from both draft and published rows.

update site_content
set
  data = jsonb_set(
    data,
    '{modules}',
    (
      select coalesce(jsonb_agg(module order by ordinality), '[]'::jsonb)
      from jsonb_array_elements(data->'modules') with ordinality as x(module, ordinality)
      where module->>'id' not in (
        'final-cta-1',
        'process.numbered-cards.v1-1782879166787'
      )
    )
  ),
  updated_at = now()
where key = 'composition:integrative-care:integrative-care-landing'
  and status in ('draft', 'published');
