import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { memberPermissions, nodes, sharedFolderAccess, tenants, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { getEnv } from "@/lib/env";
import { PERMISSIONS, TEMPLATES, type Permission } from "@/lib/permissions";
import { audit } from "./audit";
import { tempPassword, queryAudit } from "./admin";
import { assertWritable, type Ctx } from "./context";
import { ApiError, notFound } from "./errors";
import { sendMail } from "./mail";
import { createUser } from "./tenants";

const log = (c: Ctx) => ({ actorId: c.actor.id, tenantId: c.tenantId, ip: c.ip, userAgent: c.userAgent });

export async function overview(c: Ctx) {
  const db = getDb();
  const [t] = await db.select().from(tenants).where(eq(tenants.id, c.tenantId)).limit(1);
  const [m] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.tenantId, c.tenantId), isNull(users.deletedAt)));
  const [files] = await db
    .select({ n: count() })
    .from(nodes)
    .where(
      and(eq(nodes.tenantId, c.tenantId), eq(nodes.type, "file"), eq(nodes.status, "ready"), isNull(nodes.deletedAt)),
    );
  const days = t.planExpiresAt ? Math.ceil((t.planExpiresAt.getTime() - Date.now()) / 86400_000) : null;
  const recent = await queryAudit({ scopeTenantId: c.tenantId, limit: 8 });
  return {
    name: t.name,
    status: t.status,
    usedBytes: t.usedBytes,
    quotaBytes: t.quotaBytes,
    users: m.n,
    maxUsers: t.maxUsers,
    files: files.n,
    planExpiresAt: t.planExpiresAt,
    planExpiresInDays: days,
    recent,
  };
}

// ---------- members ----------

async function memberOf(c: Ctx, id: string) {
  const [u] = await getDb()
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.tenantId, c.tenantId), eq(users.role, "MEMBER"), isNull(users.deletedAt)))
    .limit(1);
  if (!u) throw notFound();
  return u;
}

export async function listMembers(c: Ctx) {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      capBytes: users.storageCapBytes,
      template: memberPermissions.template,
      flags: memberPermissions.flags,
      scope: memberPermissions.scope,
      usedBytes: sql<number>`COALESCE((SELECT SUM(n.size_bytes) FROM nodes n WHERE n.owner_id = ${users.id} AND n.type = 'file' AND n.status IN ('ready','uploading')), 0)::bigint`,
    })
    .from(users)
    .leftJoin(memberPermissions, eq(memberPermissions.userId, users.id))
    .where(and(eq(users.tenantId, c.tenantId), eq(users.role, "MEMBER"), isNull(users.deletedAt)))
    .orderBy(users.name);
  return { items: rows.map((r) => ({ ...r, usedBytes: Number(r.usedBytes) })) };
}

async function deliver(email: string, subject: string, pw: string, intro: string) {
  const sent = await sendMail(
    email,
    subject,
    `${intro}\n\nSign in: ${getEnv().APP_URL}/login\nEmail: ${email}\nTemporary password: ${pw}\n\nYou must change this password on first sign-in.`,
  ).catch(() => false);
  return { emailed: sent, tempPassword: sent ? undefined : pw };
}

export async function createMember(c: Ctx, i: { name: string; email: string; template: keyof typeof TEMPLATES }) {
  await assertWritable(c.tenantId);
  const db = getDb();
  const [t] = await db.select().from(tenants).where(eq(tenants.id, c.tenantId)).limit(1);
  const [n] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.tenantId, c.tenantId), isNull(users.deletedAt)));
  if (n.n >= t.maxUsers)
    throw new ApiError(
      409,
      "user_limit",
      `Your plan allows ${t.maxUsers} users. Ask Infinitive Cloud to raise the limit.`,
    );
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, i.email)).limit(1);
  if (dup) throw new ApiError(409, "email_taken", "That email already has an account");
  const pw = tempPassword();
  const u = await createUser({
    email: i.email,
    name: i.name,
    password: pw,
    role: "MEMBER",
    tenantId: c.tenantId,
    mustChangePassword: true,
    template: i.template,
  });
  await audit({
    ...log(c),
    action: "user.create",
    targetType: "user",
    targetId: u.id,
    metadata: { email: i.email, template: i.template },
  });
  return {
    id: u.id,
    ...(await deliver(u.email, "Your Infinitive Cloud Bucket account", pw, `${t.name} created an account for you.`)),
  };
}

export async function updateMember(
  c: Ctx,
  id: string,
  p: {
    status?: "active" | "suspended";
    template?: keyof typeof TEMPLATES;
    flags?: Permission[];
    scope?: "own" | "shared";
    capBytes?: number | null;
    name?: string;
  },
) {
  await assertWritable(c.tenantId);
  const u = await memberOf(c, id);
  const db = getDb();
  if (p.status !== undefined || p.name !== undefined || p.capBytes !== undefined) {
    await db
      .update(users)
      .set({
        ...(p.status ? { status: p.status } : {}),
        ...(p.name ? { name: p.name } : {}),
        ...(p.capBytes !== undefined ? { storageCapBytes: p.capBytes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
    if (p.status)
      await audit({
        ...log(c),
        action: p.status === "suspended" ? "user.disable" : "user.enable",
        targetType: "user",
        targetId: id,
      });
    if (p.capBytes !== undefined)
      await audit({
        ...log(c),
        action: "user.cap_change",
        targetType: "user",
        targetId: id,
        metadata: { capBytes: p.capBytes },
      });
  }
  if (p.template !== undefined || p.flags !== undefined || p.scope !== undefined) {
    const [before] = await db.select().from(memberPermissions).where(eq(memberPermissions.userId, id)).limit(1);
    const flags =
      p.flags ?? (p.template ? [...TEMPLATES[p.template]] : ((before?.flags as Permission[] | undefined) ?? []));
    const template = p.template ?? (p.flags ? "Custom" : (before?.template ?? "Contributor"));
    const scope = p.scope ?? before?.scope ?? "own";
    await db
      .insert(memberPermissions)
      .values({ userId: id, template, flags, scope })
      .onConflictDoUpdate({ target: memberPermissions.userId, set: { template, flags, scope, updatedAt: new Date() } });
    await audit({
      ...log(c),
      action: "permission.change",
      targetType: "user",
      targetId: id,
      metadata: {
        email: u.email,
        from: before ? { template: before.template, flags: before.flags, scope: before.scope } : null,
        to: { template, flags, scope },
      },
    });
  }
  return { ok: true };
}

export async function resetMemberPassword(c: Ctx, id: string) {
  const u = await memberOf(c, id);
  const pw = tempPassword();
  await getDb()
    .update(users)
    .set({
      passwordHash: await hashPassword(pw),
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));
  await audit({ ...log(c), action: "user.password_reset", targetType: "user", targetId: id });
  return deliver(
    u.email,
    "Your Infinitive Cloud Bucket password was reset",
    pw,
    "Your administrator reset your password.",
  );
}

export async function deleteMember(c: Ctx, id: string) {
  const u = await memberOf(c, id);
  await getDb().update(users).set({ deletedAt: new Date(), status: "suspended" }).where(eq(users.id, id));
  await audit({ ...log(c), action: "user.delete", targetType: "user", targetId: id, metadata: { email: u.email } });
}

// ---------- shared folders ----------

export async function listShared(c: Ctx) {
  const db = getDb();
  const folders = await db
    .select()
    .from(nodes)
    .where(and(eq(nodes.tenantId, c.tenantId), eq(nodes.isSharedRoot, true), isNull(nodes.deletedAt)))
    .orderBy(nodes.name);
  const ids = folders.map((f) => f.id);
  const access = ids.length
    ? await db
        .select({
          id: sharedFolderAccess.id,
          nodeId: sharedFolderAccess.nodeId,
          userId: sharedFolderAccess.userId,
          permissions: sharedFolderAccess.permissions,
          name: users.name,
          email: users.email,
        })
        .from(sharedFolderAccess)
        .innerJoin(users, eq(users.id, sharedFolderAccess.userId))
        .where(and(inArray(sharedFolderAccess.nodeId, ids), isNull(users.deletedAt)))
    : [];
  return { items: folders.map((f) => ({ id: f.id, name: f.name, access: access.filter((a) => a.nodeId === f.id) })) };
}

export async function createShared(c: Ctx, name: string) {
  await assertWritable(c.tenantId);
  if (!name || /[\/\\]/.test(name)) throw new ApiError(400, "invalid_name", "Invalid folder name");
  const [dup] = await getDb()
    .select({ id: nodes.id })
    .from(nodes)
    .where(
      and(eq(nodes.tenantId, c.tenantId), eq(nodes.isSharedRoot, true), eq(nodes.name, name), isNull(nodes.deletedAt)),
    )
    .limit(1);
  if (dup) throw new ApiError(409, "name_taken", `A shared folder named "${name}" already exists`);
  const [row] = await getDb()
    .insert(nodes)
    .values({ tenantId: c.tenantId, parentId: null, type: "folder", name, ownerId: null, isSharedRoot: true })
    .returning();
  await audit({
    ...log(c),
    action: "shared_folder.create",
    targetType: "folder",
    targetId: row.id,
    metadata: { name },
  });
  return row;
}

export async function setAccess(c: Ctx, nodeId: string, userId: string, permissions: Permission[]) {
  await assertWritable(c.tenantId);
  const db = getDb();
  const [f] = await db
    .select({ id: nodes.id, name: nodes.name })
    .from(nodes)
    .where(
      and(eq(nodes.id, nodeId), eq(nodes.tenantId, c.tenantId), eq(nodes.isSharedRoot, true), isNull(nodes.deletedAt)),
    )
    .limit(1);
  if (!f) throw notFound();
  const u = await memberOf(c, userId);
  const perms = PERMISSIONS.filter((p) => permissions.includes(p));
  if (perms.length === 0) {
    await db
      .delete(sharedFolderAccess)
      .where(and(eq(sharedFolderAccess.nodeId, nodeId), eq(sharedFolderAccess.userId, userId)));
  } else {
    await db
      .insert(sharedFolderAccess)
      .values({ nodeId, userId, permissions: perms })
      .onConflictDoUpdate({
        target: [sharedFolderAccess.nodeId, sharedFolderAccess.userId],
        set: { permissions: perms, updatedAt: new Date() },
      });
  }
  await audit({
    ...log(c),
    action: perms.length ? "shared_folder.grant" : "shared_folder.revoke",
    targetType: "folder",
    targetId: nodeId,
    metadata: { folder: f.name, member: u.email, permissions: perms },
  });
}

void desc;
