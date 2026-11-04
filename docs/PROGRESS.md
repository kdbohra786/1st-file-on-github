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

## In progress
- Phase 1 slice 4b: share links, then super admin + company admin management screens

## Pending
- Phase 0 leftovers: Playwright config, CI workflow, Dockerfile/prod compose, deploy docs (DEPLOY, SEAWEEDFS-SETUP, BACKUP-RESTORE, UPGRADE, OPERATIONS)
- Phase 1 remaining: signup + password reset, share links, super admin CRUD (incl. open any bucket), member CRUD + permissions UI, Dockerfile/compose/CI, first server deploy
- Not yet covered by UI tests: pause/resume, folder drag-and-drop, grid view, search, move dialog, starred/recent
- Phase 2, Phase 3 as per master prompt
