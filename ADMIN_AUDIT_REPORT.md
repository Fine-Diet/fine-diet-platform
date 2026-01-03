# Admin UX Consolidation - Security Audit Report

Generated: $(date)

## PART C: Safety Audit

### 1. Admin Pages Audit (`/admin/*`)

#### Unprotected Pages (No RBAC in getServerSideProps)

| Route | Current Protection | Recommended Action | Notes |
|-------|-------------------|-------------------|-------|
| `/admin/navigation` | ❌ None (marked TEMP/DEV) | **admin-only** | Has TEMP/DEV warning banner. API route is protected. |
| `/admin/home` | ❌ None (marked TEMP/DEV) | **admin-only** | Has TEMP/DEV warning banner. API route is protected. |
| `/admin/footer` | ❌ None (marked TEMP/DEV) | **admin-only** | Has TEMP/DEV warning banner. API route is protected. |
| `/admin/waitlist` | ❌ None (marked TEMP/DEV) | **admin-only** | Has TEMP/DEV warning banner. API route is protected. |
| `/admin/products` | ❌ None (marked TEMP/DEV) | **admin-only** | Has TEMP/DEV warning banner. API route is protected. |
| `/admin/products/[slug]/hero` | ❌ None (marked TEMP/DEV) | **admin-only** | Has TEMP/DEV warning banner. API route is protected. |

#### Protected Pages (Have RBAC)

| Route | Protection | Notes |
|-------|-----------|-------|
| `/admin/index` | ✅ editor/admin | Dashboard - properly protected |
| `/admin/global` | ✅ admin-only | **Just fixed in Part B** |
| `/admin/site-settings` | ✅ editor/admin | **Just created in Part A** |
| `/admin/seo/index` | ✅ admin-only | Properly protected |
| `/admin/seo/robots` | ✅ admin-only | Properly protected |
| `/admin/seo/assets` | ✅ admin-only | Properly protected |
| `/admin/assessments` | ✅ editor/admin | Properly protected |
| `/admin/config/feature-flags` | ✅ admin-only | Properly protected |
| `/admin/config/avatar-mapping` | ✅ admin-only | Properly protected |
| `/admin/config/assessments/gut-check-v1` | ✅ admin-only | Properly protected |
| `/admin/config/assessments/gut-check-v2` | ✅ admin-only | Properly protected |
| `/admin/people` | ✅ admin-only | Properly protected |
| `/admin/outbox` | ✅ admin-only | Properly protected |
| `/admin/waitlist-signups` | ✅ editor/admin | Properly protected |
| `/admin/question-sets/*` | ✅ editor/admin | Assessment pages - properly protected |
| `/admin/results-packs/*` | ✅ editor/admin | Assessment pages - properly protected |

#### Debug/Dev Pages

| Route | Current Protection | Recommended Action | Notes |
|-------|-------------------|-------------------|-------|
| `/admin/debug-auth` | ⚠️ Has getServerSideProps but no RBAC check | **restrict to dev env OR remove** | Debug utility - should not be in production |
| `/admin/unauthorized` | ❓ No getServerSideProps (static?) | **keep as-is** | Error page, no auth needed |

---

### 2. API Routes Audit (`/api/admin/*` and `/api/*` writing to site_content)

#### API Routes Writing to `site_content` Table

| Route | What It Writes | Current Auth/Role Validation | Key Restrictions | Status |
|-------|---------------|------------------------------|------------------|--------|
| `/api/admin/navigation` | `navigation` key | ✅ `requireRoleFromApi(['editor', 'admin'])` | None | ✅ Protected |
| `/api/admin/home` | `home` key | ✅ `requireRoleFromApi(['editor', 'admin'])` | None | ✅ Protected |
| `/api/admin/footer` | `footer` key | ✅ `requireRoleFromApi(['editor', 'admin'])` | None | ✅ Protected |
| `/api/admin/global` | `global` key | ✅ `requireRoleFromApi(['editor', 'admin'])` | None | ✅ Protected |
| `/api/admin/waitlist` | `waitlist` key | ✅ `requireRoleFromApi(['editor', 'admin'])` | None | ✅ Protected |
| `/api/admin/products` | `product:{slug}` keys | ✅ `requireRoleFromApi(['editor', 'admin'])` | None | ✅ Protected |
| `/api/admin/products/[slug]` | `product:{slug}` key | ✅ `requireRoleFromApi(['editor', 'admin'])` | None | ✅ Protected |
| `/api/admin/seo/global` | `seo:global` key | ✅ `requireRoleFromApi(['admin'])` | None | ✅ Protected |
| `/api/admin/seo/route` | `seo:route:{path}` keys | ✅ `requireRoleFromApi(['admin'])` | None | ✅ Protected |
| `/api/admin/seo/robots` | `seo:robots` key | ✅ `requireRoleFromApi(['admin'])` | None | ✅ Protected |
| `/api/admin/seo/assets` | `seo:assets` key | ✅ `requireRoleFromApi(['admin'])` | None | ✅ Protected |
| `/api/admin/config/feature-flags` | `feature-flags:global` key | ✅ `getCurrentUserWithRoleFromSSR` + admin check | ✅ `isConfigKeyAllowed()` | ✅ Protected |
| `/api/admin/config/avatar-mapping` | `avatar-mapping:global` key | ✅ `getCurrentUserWithRoleFromSSR` + admin check | ✅ `isConfigKeyAllowed()` | ✅ Protected |
| `/api/admin/config/assessment` | `assessment-config:*` keys | ✅ `requireRoleFromApi(['admin'])` | ✅ `isConfigKeyAllowed()` | ✅ Protected |

#### Other Admin API Routes (Not Writing to site_content)

| Route | Purpose | Current Auth/Role Validation | Status |
|-------|---------|------------------------------|--------|
| `/api/admin/people` | User role management | ✅ `requireRoleFromApi(['admin'])` | ✅ Protected |
| `/api/admin/waitlist-signups` | Read-only waitlist entries | ✅ `requireRoleFromApi(['editor', 'admin'])` | ✅ Protected |
| `/api/admin/outbox` | Read-only webhook outbox | ✅ `requireRoleFromApi(['admin'])` | ✅ Protected |
| `/api/admin/metrics/outbox` | Read-only metrics | ✅ `requireRoleFromApi(['admin'])` | ✅ Protected |
| `/api/admin/question-sets/*` | Assessment question sets | ✅ Protected (various RBAC patterns) | ✅ Protected |
| `/api/admin/results-packs/*` | Assessment results packs | ✅ Protected (various RBAC patterns) | ✅ Protected |
| `/api/admin/assessments/*` | Assessment scaffolding | ✅ Protected (various RBAC patterns) | ✅ Protected |

---

## Summary

### Critical Issues (Must Fix)

1. **6 unprotected admin pages** with TEMP/DEV warnings:
   - `/admin/navigation`
   - `/admin/home`
   - `/admin/footer`
   - `/admin/waitlist`
   - `/admin/products`
   - `/admin/products/[slug]/hero`
   
   **Action**: Add RBAC checks in `getServerSideProps` (admin-only) and remove TEMP/DEV warnings.

2. **1 debug page** that should not be in production:
   - `/admin/debug-auth`
   
   **Action**: Either restrict to dev environment only OR remove entirely.

### Good News

- ✅ All API routes that write to `site_content` are properly protected with role checks
- ✅ All config API routes use `isConfigKeyAllowed()` for additional security
- ✅ All assessment-related pages and APIs are properly protected
- ✅ All system/admin-only pages (people, outbox) are properly protected
- ✅ All SEO pages and APIs are properly protected

### Recommended Fix Priority

**High Priority:**
1. Add RBAC to the 6 unprotected pages listed above
2. Handle `/admin/debug-auth` (restrict or remove)

**Low Priority:**
- Consider adding key restrictions to content API routes (similar to config routes) - this is optional hardening
- Consider whether `editor` role should have write access to all content types, or if some should be `admin-only`

---

## Implementation Notes

- All fixes should follow the pattern used in `/admin/global` (just updated in Part B)
- Use `getCurrentUserWithRoleFromSSR(context)` in `getServerSideProps`
- Redirect to `/login?redirect={path}` if unauthorized
- Remove TEMP/DEV warning banners after adding protection
- For `/admin/debug-auth`, consider environment variable check: `if (process.env.NODE_ENV === 'production') return { notFound: true }`
