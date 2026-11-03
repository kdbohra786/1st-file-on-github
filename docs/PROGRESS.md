# Progress

## Done (Phase 0 foundation)
- Next.js 16 scaffold, TS strict, ESLint, Prettier, Vitest, standalone output
- zod env validation (`src/lib/env.ts`), `.env.example`, `.env.production.example`
- Drizzle schema (tenants, users, plans, nodes, share links, audit, rate limits, ...) + first migration; advisory-lock migrator
- `StorageProvider` + `S3StorageProvider` (internal/public endpoints, multipart, presign)
- `npm run check:s3` passing against the dev stack (SeaweedFS 4.50)
- `/api/health` (DB + S3)
- Dev stack `docker-compose.dev.yml` (postgres, seaweedfs, mailpit)

## In progress
- Nothing. Paused for review before Phase 1.

## Pending
- Phase 0 leftovers: Playwright config, CI workflow, Dockerfile/prod compose, deploy docs (DEPLOY, SEAWEEDFS-SETUP, BACKUP-RESTORE, UPGRADE, OPERATIONS)
- Phase 1: auth, roles, tenants/buckets, 3 panels, file manager, quota, seed, isolation tests
- Phase 2, Phase 3 as per master prompt
