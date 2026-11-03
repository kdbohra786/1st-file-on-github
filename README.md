# Infinitive Cloud Bucket

Multi-tenant S3-backed storage for individuals and companies, by Infinitive Cloud.

## Quick start (dev)
```bash
npm i
npm run dev:stack
npm run db:migrate
npm run db:seed   # Phase 1
npm run dev
```
Check storage: `npm run check:s3`. Mail UI: http://localhost:8025. See `CLAUDE.md` and `docs/`.
