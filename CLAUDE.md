# Infinitive Cloud Bucket: project guide

Multi-tenant object storage product by Infinitive Cloud Private Limited. Control plane + UI in Next.js; file bytes go browser <-> SeaweedFS (S3) via presigned URLs and never pass through the app.

## Stack
Next.js 16 (App Router, TS strict, `output: standalone`), Tailwind 4, Drizzle + Postgres 16, Auth.js v5 credentials (argon2id), `@aws-sdk/client-s3` against SeaweedFS, Nodemailer, node-cron worker, pino logs. Docker Compose on our own Ubuntu server behind Nginx. **No Vercel-only features.**
Read `node_modules/next/dist/docs/` before using Next APIs (this is Next 16, not what training data says).

## Roles / panels
SUPER_ADMIN `/admin`, COMPANY_ADMIN `/company`, MEMBER and INDIVIDUAL `/app`. Role enforced on every server action and API route, never only in UI.

## Hard rules
- Every query filters by `tenant_id` taken from the **session**, never request input. All access goes through one `authorize(user, action, node)` function.
- Objects are stored at `<bucket>/<tenantPrefix>/<fileId>` (UUID). Names and folder tree live in Postgres.
- Two S3 endpoints: `S3_ENDPOINT_INTERNAL` (server calls) and `S3_ENDPOINT_PUBLIC` (presigning only; signed against the exact public host).
- Presigned URLs: single key + method, 5-15 min (60-120 s for public shares), issued only after authz + quota + size + extension checks.
- User content is served from the S3 domain, never the app origin.
- Never log passwords, tokens or presigned URLs. Secrets only in `.env` (git-ignored).
- Free/open-source libraries only. Do not push to a remote until the owner says "push".
- Unspecified design choice: pick the simplest safe option and record it in `docs/DECISIONS.md`.

## Commands
`npm run dev:stack` (postgres, seaweedfs, mailpit) · `npm run db:generate|db:migrate|db:seed` · `npm run dev` · `npm run lint|typecheck|test|build` · `npm run check:s3`

## Status
See `docs/PROGRESS.md`.
