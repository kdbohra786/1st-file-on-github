import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, ilike, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs, nodes, payments, plans, platformSettings, tenants, users } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { getStorage } from "@/lib/storage";
import { audit } from "./audit";
import { ApiError, notFound } from "./errors";
import { sendMail } from "./mail";
import type { AdminCtx } from "./route";
import { createTenant, createUser } from "./tenants";

const log = (a: AdminCtx) => ({ actorId: a.id, ip: a.ip, userAgent: a.userAgent });

export function tempPassword() {
  const b = randomBytes(12).toString("base64url").replace(/[-_]/g, "x");
  return `Tp${b}9aA`; // always satisfies the strength rules
}

export async function dashboard() {
  const db = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [byType] = await db
    .select({
      companies: sql<number>`COUNT(*) FILTER (WHERE ${tenants.type} = 'company')::int`,
      individuals: sql<number>`COUNT(*) FILTER (WHERE ${tenants.type} = 'individual')::int`,
      used: sql<number>`COALESCE(SUM(${tenants.usedBytes}), 0)::bigint`,
      allocated: sql<number>`COALESCE(SUM(${tenants.quotaBytes}), 0)::bigint`,
    })
    .from(tenants)
    .where(ne(tenants.status, "deleted"));
  const [members] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "MEMBER"), isNull(users.deletedAt)));
  const [files] = await db
    .select({ n: count() })
    .from(nodes)
    .where(and(eq(nodes.type, "file"), eq(nodes.status, "ready"), isNull(nodes.deletedAt)));
  const [today_] = await db
    .select({
      uploads: sql<number>`COUNT(*) FILTER (WHERE ${auditLogs.action} = 'file.upload')::int`,
      downloads: sql<number>`COUNT(*) FILTER (WHERE ${auditLogs.action} = 'file.download')::int`,
    })
    .from(auditLogs)
    .where(gte(auditLogs.createdAt, today));
  const signups = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${tenants.createdAt}), 'YYYY-MM-DD')`,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(tenants)
    .where(gte(tenants.createdAt, new Date(Date.now() - 14 * 86400_000)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  const top = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      type: tenants.type,
      used: tenants.usedBytes,
      quota: tenants.quotaBytes,
    })
    .from(tenants)
    .where(ne(tenants.status, "deleted"))
    .orderBy(desc(tenants.usedBytes))
    .limit(10);
  let s3 = false;
  try {
    s3 = await getStorage().ping();
  } catch {}
  return {
    companies: byType.companies,
    individuals: byType.individuals,
    members: members.n,
    usedBytes: Number(byType.used),
    allocatedBytes: Number(byType.allocated),
    files: files.n,
    uploadsToday: today_.uploads,
    downloadsToday: today_.downloads,
    signups,
    top,
    health: { db: true, s3 },
  };
}

export async function listTenants(q: { type?: string; status?: string; search?: string; plan?: string }) {
  const db = getDb();
  const where = and(
    q.type ? eq(tenants.type, q.type as "company" | "individual") : undefined,
    q.status ? eq(tenants.status, q.status as "active") : ne(tenants.status, "deleted"),
    q.search ? ilike(tenants.name, `%${q.search.replace(/[%_]/g, "")}%`) : undefined,
    q.plan ? eq(plans.name, q.plan) : undefined,
  );
  const rows = await db
    .select({
      id: tenants.id,
      type: tenants.type,
      name: tenants.name,
      status: tenants.status,
      plan: plans.name,
      used: tenants.usedBytes,
      quota: tenants.quotaBytes,
      planExpiresAt: tenants.planExpiresAt,
      maxUsers: tenants.maxUsers,
      createdAt: tenants.createdAt,
      members: sql<number>`(SELECT COUNT(*) FROM users u WHERE u.tenant_id = ${tenants.id} AND u.deleted_at IS NULL)::int`,
    })
    .from(tenants)
    .leftJoin(plans, eq(plans.id, tenants.planId))
    .where(where)
    .orderBy(desc(tenants.createdAt))
    .limit(200);
  return { items: rows };
}

export async function createAccount(
  a: AdminCtx,
  i: {
    type: "company" | "individual";
    name: string;
    planName: string;
    adminEmail: string;
    adminName: string;
    planExpiresAt?: Date | null;
  },
) {
  const db = getDb();
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, i.adminEmail)).limit(1);
  if (dup) throw new ApiError(409, "email_taken", "That email already has an account");
  const tenant = await createTenant({
    type: i.type,
    name: i.name,
    planName: i.planName,
    planExpiresAt: i.planExpiresAt,
  });
  const pw = tempPassword();
  const user = await createUser({
    email: i.adminEmail,
    name: i.adminName,
    password: pw,
    role: i.type === "company" ? "COMPANY_ADMIN" : "INDIVIDUAL",
    tenantId: tenant.id,
    mustChangePassword: true,
  });
  await audit({
    ...log(a),
    tenantId: tenant.id,
    action: "tenant.create",
    targetType: "tenant",
    targetId: tenant.id,
    metadata: { type: i.type, name: i.name, plan: i.planName },
  });
  const emailed = await sendMail(
    user.email,
    "Your Infinitive Cloud Bucket account",
    `An account was created for you.\n\nSign in: ${getEnv().APP_URL}/login\nEmail: ${user.email}\nTemporary password: ${pw}\n\nYou must change this password on first sign-in.`,
  ).catch(() => false);
  return { tenant, adminEmail: user.email, tempPassword: emailed ? undefined : pw, emailed };
}

export async function getTenantDetail(id: string) {
  const db = getDb();
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!t) throw notFound();
  const members = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(and(eq(users.tenantId, id), isNull(users.deletedAt)));
  const pays = await db.select().from(payments).where(eq(payments.tenantId, id)).orderBy(desc(payments.paidOn));
  const [plan] = t.planId ? await db.select().from(plans).where(eq(plans.id, t.planId)) : [];
  return { tenant: t, plan: plan ?? null, members, payments: pays };
}

export async function updateTenant(
  a: AdminCtx,
  id: string,
  p: {
    name?: string;
    status?: "active" | "suspended" | "read_only";
    quotaBytes?: number;
    planName?: string;
    applyPlan?: boolean;
    planExpiresAt?: Date | null;
    maxUsers?: number;
  },
) {
  const db = getDb();
  const [before] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!before || before.status === "deleted") throw notFound();
  const set: Partial<typeof tenants.$inferInsert> = { updatedAt: new Date() };
  if (p.name !== undefined) set.name = p.name;
  if (p.status !== undefined) set.status = p.status;
  if (p.planExpiresAt !== undefined) set.planExpiresAt = p.planExpiresAt;
  if (p.maxUsers !== undefined) set.maxUsers = p.maxUsers;
  if (p.quotaBytes !== undefined) set.quotaBytes = p.quotaBytes;
  if (p.planName) {
    const [plan] = await db.select().from(plans).where(eq(plans.name, p.planName)).limit(1);
    if (!plan) throw new ApiError(400, "unknown_plan", "Unknown plan");
    set.planId = plan.id;
    if (p.applyPlan) {
      set.quotaBytes = plan.quotaBytes;
      if (before.type === "company") set.maxUsers = plan.maxUsers;
    }
  }
  const [after] = await db.update(tenants).set(set).where(eq(tenants.id, id)).returning();
  const base = { ...log(a), tenantId: id, targetType: "tenant", targetId: id };
  if (after.quotaBytes !== before.quotaBytes)
    await audit({ ...base, action: "quota.change", metadata: { from: before.quotaBytes, to: after.quotaBytes } });
  if (after.status !== before.status)
    await audit({
      ...base,
      action: `tenant.${after.status === "active" ? "reactivate" : after.status}`,
      metadata: { from: before.status, to: after.status },
    });
  if (after.planId !== before.planId) await audit({ ...base, action: "plan.change", metadata: { plan: p.planName } });
  if (String(after.planExpiresAt) !== String(before.planExpiresAt))
    await audit({ ...base, action: "plan.expiry_change", metadata: { to: after.planExpiresAt } });
  return after;
}

/** Soft delete: the account stops working immediately; the worker purges data later. */
export async function deleteTenant(a: AdminCtx, id: string) {
  const db = getDb();
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!t || t.status === "deleted") throw notFound();
  await db.update(tenants).set({ status: "deleted", deletedAt: new Date() }).where(eq(tenants.id, id));
  await db
    .update(users)
    .set({ deletedAt: new Date(), status: "suspended" })
    .where(and(eq(users.tenantId, id), isNull(users.deletedAt)));
  await audit({
    ...log(a),
    tenantId: id,
    action: "tenant.delete",
    targetType: "tenant",
    targetId: id,
    metadata: { name: t.name },
  });
}

export async function recordPayment(
  a: AdminCtx,
  tenantId: string,
  p: { amount: number; currency: string; paidOn: Date; reference?: string; note?: string },
) {
  const [t] = await getDb().select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw notFound();
  const [row] = await getDb()
    .insert(payments)
    .values({ tenantId, ...p, recordedBy: a.id })
    .returning();
  await audit({
    ...log(a),
    tenantId,
    action: "payment.record",
    targetType: "payment",
    targetId: row.id,
    metadata: { amount: p.amount, currency: p.currency, reference: p.reference },
  });
  return row;
}

// ---- open any bucket (reason required, audited) ----

const ACCESS_WINDOW_MS = 30 * 60_000;

export async function startBucketAccess(a: AdminCtx, tenantId: string, reason: string) {
  const [t] = await getDb()
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!t) throw notFound();
  await audit({
    ...log(a),
    tenantId,
    action: "admin.bucket_access",
    targetType: "tenant",
    targetId: tenantId,
    metadata: { reason },
  });
  return { tenantName: t.name, validMinutes: ACCESS_WINDOW_MS / 60_000 };
}

async function requireAccessGrant(a: AdminCtx, tenantId: string) {
  const [g] = await getDb()
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.actorId, a.id),
        eq(auditLogs.tenantId, tenantId),
        eq(auditLogs.action, "admin.bucket_access"),
        gte(auditLogs.createdAt, new Date(Date.now() - ACCESS_WINDOW_MS)),
      ),
    )
    .limit(1);
  if (!g) throw new ApiError(403, "reason_required", "State a reason to open this bucket first");
}

export async function adminListNodes(a: AdminCtx, tenantId: string, parentId: string | null) {
  await requireAccessGrant(a, tenantId);
  return getDb()
    .select()
    .from(nodes)
    .where(
      and(
        eq(nodes.tenantId, tenantId),
        parentId ? eq(nodes.parentId, parentId) : isNull(nodes.parentId),
        isNull(nodes.deletedAt),
        eq(nodes.status, "ready"),
      ),
    )
    .orderBy(nodes.type, nodes.name);
}

export async function adminSignDownload(a: AdminCtx, tenantId: string, nodeId: string) {
  await requireAccessGrant(a, tenantId);
  const db = getDb();
  const [n] = await db
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.tenantId, tenantId)))
    .limit(1);
  if (!n || n.type !== "file" || !n.s3Key) throw notFound();
  const [t] = await db.select({ bucket: tenants.bucketName }).from(tenants).where(eq(tenants.id, tenantId));
  const url = await getStorage().presignGet(t.bucket, n.s3Key, { expiresInSeconds: 300, downloadFileName: n.name });
  await audit({
    ...log(a),
    tenantId,
    action: "admin.bucket_download",
    targetType: "file",
    targetId: nodeId,
    metadata: { name: n.name },
  });
  return { url, name: n.name };
}

// ---- plans / settings / audit ----

export const listPlans = () => getDb().select().from(plans).orderBy(plans.quotaBytes);

export async function upsertPlan(
  a: AdminCtx,
  id: string | null,
  p: {
    name: string;
    quotaBytes: number;
    maxUsers: number;
    maxFileBytes: number;
    priceLabel?: string | null;
    isActive?: boolean;
    features?: Record<string, unknown>;
  },
) {
  const db = getDb();
  const row = id
    ? (
        await db
          .update(plans)
          .set({ ...p, updatedAt: new Date() })
          .where(eq(plans.id, id))
          .returning()
      )[0]
    : (await db.insert(plans).values(p).returning())[0];
  if (!row) throw notFound();
  await audit({
    ...log(a),
    action: id ? "plan.update" : "plan.create",
    targetType: "plan",
    targetId: row.id,
    metadata: { name: p.name, quotaBytes: p.quotaBytes },
  });
  return row;
}

const SETTING_DEFAULTS = {
  signup_enabled: true,
  blocked_extensions: [".exe", ".bat", ".cmd", ".scr", ".pif", ".vbs"],
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSettings() {
  const rows = await getDb().select().from(platformSettings);
  return { ...SETTING_DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

export async function putSettings(a: AdminCtx, s: Partial<Record<SettingKey, unknown>>) {
  for (const [key, value] of Object.entries(s)) {
    await getDb()
      .insert(platformSettings)
      .values({ key, value: value as never })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: value as never, updatedAt: new Date() } });
  }
  await audit({ ...log(a), action: "settings.update", metadata: { keys: Object.keys(s) } });
  return getSettings();
}

export interface AuditQuery {
  actor?: string;
  tenantId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  before?: Date;
}

export async function queryAudit(q: AuditQuery & { scopeTenantId?: string }) {
  const db = getDb();
  const rows = await db
    .select({
      id: auditLogs.id,
      at: auditLogs.createdAt,
      action: auditLogs.action,
      actorId: auditLogs.actorId,
      actorEmail: users.email,
      tenantId: auditLogs.tenantId,
      tenantName: tenants.name,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      metadata: auditLogs.metadata,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .leftJoin(tenants, eq(tenants.id, auditLogs.tenantId))
    .where(
      and(
        q.scopeTenantId
          ? eq(auditLogs.tenantId, q.scopeTenantId)
          : q.tenantId
            ? eq(auditLogs.tenantId, q.tenantId)
            : undefined,
        q.actor ? ilike(users.email, `%${q.actor.replace(/[%_]/g, "")}%`) : undefined,
        q.action ? ilike(auditLogs.action, `${q.action.replace(/[%_]/g, "")}%`) : undefined,
        q.from ? gte(auditLogs.createdAt, q.from) : undefined,
        q.to ? lte(auditLogs.createdAt, q.to) : undefined,
        q.before ? lte(auditLogs.createdAt, q.before) : undefined,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(q.limit ?? 100, 5000));
  return rows;
}

export function parseAuditQuery(req: Request): AuditQuery & { csv: boolean } {
  const p = new URL(req.url).searchParams;
  const d = (k: string) => (p.get(k) ? new Date(p.get(k)!) : undefined);
  const valid = (x?: Date) => (x && !Number.isNaN(x.getTime()) ? x : undefined);
  return {
    actor: p.get("actor") ?? undefined,
    tenantId: p.get("tenantId") ?? undefined,
    action: p.get("action") ?? undefined,
    from: valid(d("from")),
    to: valid(d("to")),
    limit: Number(p.get("limit")) || 100,
    csv: p.get("format") === "csv",
  };
}

const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
};

export function auditToCsv(rows: Awaited<ReturnType<typeof queryAudit>>) {
  const head = ["time", "action", "actor", "tenant", "target_type", "target_id", "details"];
  const lines = rows.map((r) =>
    [r.at.toISOString(), r.action, r.actorEmail, r.tenantName, r.targetType, r.targetId, r.metadata]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

void inArray;
