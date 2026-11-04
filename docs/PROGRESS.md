# Progress

## Done (Phase 0 foundation)
- Next.js 16 scaffold, TS strict, ESLint, Prettier, Vitest, standalone output
- zod env validation (`src/lib/env.ts`), `.env.example`, `.env.production.example`
- Drizzle schema (tenants, users, plans, nodes, share links, audit, rate limits, ...) + first migration; advisory-lock migrator
- `StorageProvider` + `S3StorageProvider` (internal/public endpoints, multipart, presign)
- `npm run check:s3` passing against the dev stack (SeaweedFS 4.50)
- `/api/health` (DB + S3)
- Dev stack `docker-compose.dev.yml` (postgres, seaweedfs, mailpit)

## Done (Phase 1, slice 1: auth and tenancy)
- Auth.js v5 credentials login (argon2id, 5-failure lockout for 15 min, DB rate limit, constant-time unknown-user path, audit entries)
- Route guard `src/proxy.ts` (per-panel role check, forced password change), login and change-password pages, panel shells
- Central `authorize()` + permission templates, with 7 isolation/permission tests
- Tenant + bucket provisioning (`createTenant`, `createUser`), idempotent seed (plans, super admin, demo data)
- Verified live: login good/bad, session claims, guards (anon -> /login, must-change -> /change-password)

## Done (Phase 1, slice 2: file API)
- `/api/v1`: nodes (list, create folder, rename, move, trash, restore), uploads (init, sign-part, complete, abort), download signing, trash list, usage
- Quota (double-checked), plan max file size, blocked extensions, read-only/suspended tenants, presign rate limits, audit entries
- `npm run test:api`: 33 live end-to-end checks (multipart, download bytes, isolation 403/404, shared-folder viewer, trash/restore, quota, read-only), re-runnable

## Done (Phase 1, slice 3: file manager UI)
- `FileManager` component for `/app` and `/company`: breadcrumbs, list view, upload (multi-file, drag-and-drop, 4 parallel parts, retry/backoff, pause/resume/cancel), download, preview (image/video/audio/PDF/text), new folder, rename, delete to Trash, restore, storage meter with 80/90/100% warnings
- Actions are hidden from the listing's `can` permissions; the server still enforces
- `npm run test:ui`: real Chromium run (browser -> SeaweedFS multipart upload with CORS + ETag, preview, download, hidden controls for Contributor and Viewer, route guard)

## Done (Phase 1, slice 4a: self-service auth)
- `/signup` (individual, Free plan, bucket provisioned, rate-limited, honours `signup_enabled` setting), `/forgot-password`, `/reset-password`
- Reset tokens: random 32 bytes, stored hashed, 1 h expiry, atomically single-use; same response for known and unknown emails
- Email via Nodemailer (Mailpit in dev)
- `npm run test:auth`: 13 real-browser checks including the actual email from Mailpit

## Done (Phase 1, slice 4b: share links)
- Owner side: create (password, expiry, max downloads, view-only), list, revoke, per-link analytics (views, downloads, unique visitors, countries, timeline); Share dialog in the file manager
- Public side: `/s/<token>` page (file or folder listing, preview, download), password gate with signed 30-minute cookie, per-link and per-client attempt limits, 90 s presigned GETs, atomic download counting, folder links confined to their own subtree
- Blocked when revoked, expired, over the download limit, tenant suspended, or the item is in Trash; `noindex` headers on `/s/*`
- `npm run test:share`: 24 real-browser checks

## Done (Phase 1, slice 4c-1: Super Admin)
- `/admin`: dashboard (accounts, members, files, storage used vs allocated, uploads/downloads today, signups chart, top 10, DB + storage health), companies and individuals (search, filter, create with emailed temporary password, edit name/status/quota/plan/expiry/max users, suspend, reactivate, soft delete), manual payments, plans CRUD, platform settings (signup on/off, blocked extensions), audit log with filters and CSV export
- Open any bucket: reason required (min 5 chars), recorded in the audit log, valid 30 minutes, downloads audited
- Fixes found by browser tests: login now sends each role to its own panel and to `/change-password` when needed; panel pages re-check the session because server-action redirects skip `proxy.ts`
- `npm run test:admin`: 40 real-browser checks (quota change visible to the company admin at once, suspension blocks login, reason required, CSV export, 403/401 for non-admins)

## Done (Phase 1, slice 4c-2: Company Admin)
- `/company`: overview (usage, users vs limit, file count, plan-expiry warning under 30 days, recent activity), Files (whole-bucket file manager incl. every member's folder and Trash), Members, Shared folders, Share links, Activity log
- Members: create (emailed temporary password, forced change on first login), disable/enable, reset password, soft delete, plan user limit enforced, permission templates (Viewer, Contributor, Editor, Manager) with per-permission tweaks, scope (own + shared, or shared only), optional personal storage cap (enforced at upload)
- Shared folders: create company-wide folders, grant/update/remove a member's permissions per folder; effective immediately
- Share links overview with revoke; activity log with filters and CSV, always scoped to the session's company
- `npm run test:company`: 41 real-browser checks including cross-company 404s and a spoofed `tenantId` query being ignored

## In progress
- Phase 1 finish line: Dockerfile + production compose + CI, then first deploy docs (`DEPLOY`, `SEAWEEDFS-SETUP`, `BACKUP-RESTORE`, `UPGRADE`, `OPERATIONS`), worker container

## Pending
- Phase 0 leftovers: Playwright config, CI workflow, Dockerfile/prod compose, deploy docs (DEPLOY, SEAWEEDFS-SETUP, BACKUP-RESTORE, UPGRADE, OPERATIONS)
- Phase 1 remaining: signup + password reset, share links, super admin CRUD (incl. open any bucket), member CRUD + permissions UI, Dockerfile/compose/CI, first server deploy
- Company: logo/branding, forced password/expiry policy for share links, purge of trash from the UI
- Admin: create/disable other Super Admins, branding settings, platform-wide share link list, optional delete inside an opened bucket
- Share links: folder ZIP download, geo-IP fallback when not behind Cloudflare (country is read from `CF-IPCountry` only), tenant-wide forced password/expiry policy
- Not yet covered by UI tests: pause/resume, folder drag-and-drop, grid view, search, move dialog, starred/recent
- Phase 2, Phase 3 as per master prompt
