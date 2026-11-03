-- Fine Diet: read-only schema fingerprint, no member data or raw function bodies returned.
-- Compare production with QA only after a reviewed, schema-only baseline is installed.
-- SHA-256 digests are drift indicators, not formal proof of equivalent security behavior.
WITH app_objects AS (
SELECT 'relations' AS category, n.nspname||'.'||c.relname AS object_name,
  concat_ws('|',c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,
    c.relreplident,COALESCE(c.reloptions::text,''),
    COALESCE(c.relacl::text,''),
    CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE '' END) AS definition
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','programs_private') AND c.relkind IN ('r','p','v','m','S','f')
UNION ALL
SELECT 'columns', n.nspname||'.'||c.relname||'.'||a.attname,
  concat_ws('|',a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,
  a.attidentity,a.attgenerated,COALESCE(pg_get_expr(d.adbin,d.adrelid),''), a.attcollation::regcollation::text)
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
WHERE n.nspname IN ('public','programs_private') AND a.attnum>0 AND NOT a.attisdropped
AND c.relkind IN ('r','p','v','m','f')
UNION ALL
SELECT 'constraints', n.nspname||'.'||c.relname||'.'||co.conname,
  concat_ws('|',co.contype,pg_get_constraintdef(co.oid,true),co.convalidated,co.condeferrable,co.condeferred)
FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','programs_private')
UNION ALL
SELECT 'indexes',n.nspname||'.'||c.relname||'.'||ic.relname,pg_get_indexdef(i.indexrelid)
FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
JOIN pg_class ic ON ic.oid=i.indexrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','programs_private')
UNION ALL
SELECT 'functions', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
concat_ws('|',p.prokind,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,
  COALESCE(p.proacl::text,''),COALESCE(p.proconfig::text,''),
  CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) ELSE p.prosrc END)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','programs_private')
UNION ALL
SELECT 'triggers',n.nspname||'.'||c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid,true)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','programs_private') AND NOT t.tgisinternal
UNION ALL
SELECT 'policies',schemaname||'.'||tablename||'.'||policyname,
concat_ws('|',permissive,roles::text,cmd,COALESCE(qual,''),COALESCE(with_check,''))
FROM pg_policies WHERE schemaname IN ('public','programs_private')
UNION ALL
SELECT 'types',n.nspname||'.'||t.typname,
concat_ws('|',t.typtype,t.typcategory,t.typnotnull,
  COALESCE(t.typdefault,''),COALESCE((
    SELECT string_agg(e.enumlabel,',' ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),''))
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname IN ('public','programs_private') AND t.typrelid=0 AND t.typcategory <> 'A'
UNION ALL
SELECT 'default_grants',n.nspname||'.'||r.rolname||'.'||d.defaclobjtype::text,
COALESCE(d.defaclacl::text,'')
FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole
LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE n.nspname IN ('public','programs_private')
)
SELECT category, count(*)::integer AS object_count,
encode(sha256(convert_to(string_agg(object_name||E'\t'||COALESCE(definition,''),E'\n' ORDER BY object_name), 'UTF8')),'hex') AS sha256
FROM app_objects GROUP BY category ORDER BY category;
