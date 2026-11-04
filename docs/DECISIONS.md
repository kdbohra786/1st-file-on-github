# Decisions

1. **UUID object keys.** Rename/move/folder ops are metadata-only in Postgres and never copy S3 objects. Trade-off: rclone/S3 tools see UUID keys, not file names.
2. **Two S3 clients.** Internal endpoint for server calls, public endpoint only for presigning, so signatures match the host the browser calls.
3. **Checksum mode `WHEN_REQUIRED`.** Newer AWS SDK versions add CRC32 checksums to presigned requests by default; this breaks browser PUTs and some S3-compatible servers.
4. **Migrations create `citext`/`pgcrypto` extensions** in the migrator (before Drizzle runs) under `pg_advisory_lock`.
5. **Next.js `middleware` is `proxy` in v16.** Use `proxy.ts` for route guards.
6. **Postgres driver:** `postgres` (postgres.js) with drizzle-orm.
7. **Docker daemon in the build sandbox** was started manually with `dockerd`; dev stack ran for real (no native fallback needed).
8. **Quote env values containing `#`** (dotenv treats unquoted `#` as a comment). Applies to seed passwords.
9. **next-auth v5 is only on the `beta` tag**; pinned via package-lock. nodemailer pinned to v8 to satisfy its optional peer range.
10. **Every upload is multipart**, even tiny files (one part), so there is a single code path. Part size is 8 MB, growing for huge files to stay under 9000 parts.
11. **Quota is checked twice.** At init: used bytes + in-flight uploads + this file. At complete: re-checked under a row lock on the tenant, and the object is deleted if it no longer fits.
12. **Upload size is verified** with a HEAD after CompleteMultipart; a mismatch deletes the object and fails the node.
13. **Default blocked extensions** (`.exe .bat .cmd .scr .pif .vbs`) are overridable via the `blocked_extensions` platform setting.
14. **Cross-tenant ids return 404, same-tenant denials 403**, so ids never leak across tenants.
15. **Member 2 "no own folder access"** is modelled as `member_permissions.scope = 'shared'` with no flags.
16. **Per-member storage caps** (`users.storage_cap_bytes`) exist in the schema but are not enforced yet.
17. **Never `pkill -f` a pattern that appears in your own command line** (it kills the calling shell); use `[n]ext` style patterns.
18. **Signup reveals existing emails** ("could not create the account...") so a person is not silently stuck; password reset does not (identical response either way). Signup is rate-limited per IP.
19. **A stale `.next` folder can make the dev server reload pages in a loop** after a production build in the same folder. Fix: stop dev, `rm -rf .next`, restart. Do not run dev and build against the same `.next`.
20. **`"use server"` files may only export async functions**; shared helpers (e.g. `hashToken`) live in `src/server/`.
