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

## In progress
- Phase 1 slice 3: file manager UI, then signup/reset, share links, super admin + company admin CRUD

## Pending
- Phase 0 leftovers: Playwright config, CI workflow, Dockerfile/prod compose, deploy docs (DEPLOY, SEAWEEDFS-SETUP, BACKUP-RESTORE, UPGRADE, OPERATIONS)
- Phase 1 remaining: signup + password reset, file manager UI, quota, share links, super admin CRUD, member CRUD, DB-level isolation tests
- Phase 2, Phase 3 as per master prompt
