import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { nodes, plans, platformSettings, sharedFolderAccess, tenants, uploadSessions, users } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { getStorage, objectKey } from "@/lib/storage";
import { audit } from "./audit";
import { assertWritable, type Ctx } from "./context";
import { ApiError, forbidden, notFound } from "./errors";
import { OBJECT_PREFIX } from "./tenants";

export type NodeRow = typeof nodes.$inferSelect;

const MB = 1024 * 1024;
const DEFAULT_BLOCKED = [".exe", ".bat", ".cmd", ".scr", ".pif", ".vbs"];
const UPLOAD_TTL_MS = 24 * 3600 * 1000;
const PRESIGN_SECONDS = 900;

/** Ids from the tenant root down to the node itself. Tenant-scoped. */
export async function pathIdsFor(tenantId: string, nodeId: string): Promise<string[]> {
  const rows = await getDb().execute(sql`
    WITH RECURSIVE up AS (
      SELECT id, parent_id, 0 AS depth FROM nodes WHERE id = ${nodeId} AND tenant_id = ${tenantId}
      UNION ALL
      SELECT n.id, n.parent_id, up.depth + 1 FROM nodes n JOIN up ON n.id = up.parent_id WHERE n.tenant_id = ${tenantId}
    ) SELECT id FROM up ORDER BY depth DESC`);
  return (rows as unknown as { id: string }[]).map((r) => r.id);
}

/** Loads a node in the caller's tenant and authorizes the action. Cross-tenant ids look like 404s. */
export async function loadAuthorized(
  ctx: Ctx,
  nodeId: string,
  action: Permission,
  opts: { allowTrashed?: boolean } = {},
) {
  const [node] = await getDb()
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.tenantId, ctx.tenantId)))
    .limit(1);
  if (!node || (node.deletedAt && !opts.allowTrashed)) throw notFound();
  const decision = authorize(ctx.actor, action, {
    tenantId: node.tenantId,
    pathIds: await pathIdsFor(ctx.tenantId, node.id),
  });
  if (!decision.ok) throw decision.reason === "tenant" ? notFound() : forbidden();
  return node;
}

async function getTenant(tenantId: string) {
  const [t] = await getDb().select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw notFound();
  return t;
}

async function assertNameFree(tenantId: string, parentId: string | null, name: string, exceptId?: string) {
  const rows = await getDb()
    .select({ id: nodes.id })
    .from(nodes)
    .where(
      and(
        eq(nodes.tenantId, tenantId),
        parentId ? eq(nodes.parentId, parentId) : isNull(nodes.parentId),
        eq(nodes.name, name),
        isNull(nodes.deletedAt),
      ),
    );
  if (rows.some((r) => r.id !== exceptId))
    throw new ApiError(409, "name_taken", `"${name}" already exists in this folder`);
}

export const validName = (n: string) =>
  n.length > 0 && n.length <= 255 && !/[\/\\\u0000]/.test(n) && n !== "." && n !== "..";

export async function listChildren(ctx: Ctx, parentId: string | null) {
  const db = getDb();
  if (!parentId) {
    const base = and(eq(nodes.tenantId, ctx.tenantId), isNull(nodes.parentId), isNull(nodes.deletedAt));
    if (ctx.actor.role !== "MEMBER") return db.select().from(nodes).where(base);
    const a = ctx.actor;
    const ids = [
      a.homeFlags?.includes("view") ? a.homeFolderId : null,
      ...Object.entries(a.sharedGrants ?? {})
        .filter(([, p]) => p.includes("view"))
        .map(([id]) => id),
    ].filter((x): x is string => Boolean(x));
    return ids.length
      ? db
          .select()
          .from(nodes)
          .where(and(base, inArray(nodes.id, ids)))
      : [];
  }
  await loadAuthorized(ctx, parentId, "view");
  return db
    .select()
    .from(nodes)
    .where(
      and(
        eq(nodes.tenantId, ctx.tenantId),
        eq(nodes.parentId, parentId),
        isNull(nodes.deletedAt),
        eq(nodes.status, "ready"),
      ),
    )
    .orderBy(nodes.type, nodes.name);
}

export async function createFolder(ctx: Ctx, parentId: string, name: string) {
  await assertWritable(ctx.tenantId);
  if (!validName(name)) throw new ApiError(400, "invalid_name", "Invalid folder name");
  await loadAuthorized(ctx, parentId, "manage_folders");
  await assertNameFree(ctx.tenantId, parentId, name);
  const [row] = await getDb()
    .insert(nodes)
    .values({ tenantId: ctx.tenantId, parentId, type: "folder", name, ownerId: ctx.actor.id })
    .returning();
  return row;
}

export async function renameNode(ctx: Ctx, id: string, name: string) {
  await assertWritable(ctx.tenantId);
  if (!validName(name)) throw new ApiError(400, "invalid_name", "Invalid name");
  const node = await loadAuthorized(ctx, id, "rename_move");
  await assertNameFree(ctx.tenantId, node.parentId, name, node.id);
  const [row] = await getDb()
    .update(nodes)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(nodes.id, id), eq(nodes.tenantId, ctx.tenantId)))
    .returning();
  return row;
}

export async function moveNode(ctx: Ctx, id: string, newParentId: string) {
  await assertWritable(ctx.tenantId);
  const node = await loadAuthorized(ctx, id, "rename_move");
  await loadAuthorized(ctx, newParentId, "upload");
  if ((await pathIdsFor(ctx.tenantId, newParentId)).includes(id))
    throw new ApiError(400, "invalid_move", "Cannot move a folder into itself");
  await assertNameFree(ctx.tenantId, newParentId, node.name, node.id);
  const [row] = await getDb()
    .update(nodes)
    .set({ parentId: newParentId, updatedAt: new Date() })
    .where(and(eq(nodes.id, id), eq(nodes.tenantId, ctx.tenantId)))
    .returning();
  return row;
}

async function descendantIds(tenantId: string, rootId: string): Promise<string[]> {
  const rows = await getDb().execute(sql`
    WITH RECURSIVE down AS (
      SELECT id FROM nodes WHERE id = ${rootId} AND tenant_id = ${tenantId}
      UNION ALL SELECT n.id FROM nodes n JOIN down ON n.parent_id = down.id WHERE n.tenant_id = ${tenantId}
    ) SELECT id FROM down`);
  return (rows as unknown as { id: string }[]).map((r) => r.id);
}

/** Soft delete (Trash). Still counts toward quota until purged. */
export async function trashNode(ctx: Ctx, id: string) {
  await assertWritable(ctx.tenantId);
  const node = await loadAuthorized(ctx, id, "delete");
  if (!node.parentId && node.ownerId) throw new ApiError(400, "invalid_delete", "Home folders cannot be deleted");
  const ids = await descendantIds(ctx.tenantId, id);
  await getDb()
    .update(nodes)
    .set({ deletedAt: new Date(), deletedBy: ctx.actor.id })
    .where(and(eq(nodes.tenantId, ctx.tenantId), inArray(nodes.id, ids), isNull(nodes.deletedAt)));
  await audit({
    actorId: ctx.actor.id,
    tenantId: ctx.tenantId,
    action: "node.trash",
    targetType: node.type,
    targetId: id,
    metadata: { name: node.name },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

export async function restoreNode(ctx: Ctx, id: string) {
  await assertWritable(ctx.tenantId);
  const node = await loadAuthorized(ctx, id, "delete", { allowTrashed: true });
  if (!node.deletedAt) return node;
  if (node.parentId) {
    const [p] = await getDb()
      .select({ d: nodes.deletedAt })
      .from(nodes)
      .where(and(eq(nodes.id, node.parentId), eq(nodes.tenantId, ctx.tenantId)))
      .limit(1);
    if (p?.d) throw new ApiError(409, "parent_trashed", "Restore the parent folder first");
  }
  await assertNameFree(ctx.tenantId, node.parentId, node.name, node.id);
  const ids = await descendantIds(ctx.tenantId, id);
  await getDb()
    .update(nodes)
    .set({ deletedAt: null, deletedBy: null })
    .where(
      and(
        eq(nodes.tenantId, ctx.tenantId),
        inArray(nodes.id, ids),
        eq(nodes.deletedBy, node.deletedBy ?? ctx.actor.id),
      ),
    );
  await audit({
    actorId: ctx.actor.id,
    tenantId: ctx.tenantId,
    action: "node.restore",
    targetType: node.type,
    targetId: id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return node;
}

// ---------- uploads ----------

async function blockedExtensions(): Promise<string[]> {
  const [row] = await getDb()
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, "blocked_extensions"))
    .limit(1);
  return Array.isArray(row?.value) ? (row.value as string[]) : DEFAULT_BLOCKED;
}

export function partSizeFor(size: number) {
  return Math.max(8 * MB, Math.ceil(size / 9000));
}

export async function initUpload(
  ctx: Ctx,
  input: { parentId: string; name: string; size: number; contentType: string },
) {
  await assertWritable(ctx.tenantId);
  if (!validName(input.name)) throw new ApiError(400, "invalid_name", "Invalid file name");
  await loadAuthorized(ctx, input.parentId, "upload");
  const tenant = await getTenant(ctx.tenantId);
  const [plan] = tenant.planId ? await getDb().select().from(plans).where(eq(plans.id, tenant.planId)).limit(1) : [];
  if (plan && input.size > plan.maxFileBytes)
    throw new ApiError(
      413,
      "file_too_large",
      `Maximum file size on your plan is ${Math.floor(plan.maxFileBytes / MB)} MB`,
    );
  const ext = input.name.includes(".") ? `.${input.name.split(".").pop()!.toLowerCase()}` : "";
  if (ext && (await blockedExtensions()).includes(ext))
    throw new ApiError(415, "blocked_extension", `Files of type ${ext} are not allowed`);

  // Quota: confirmed usage + other in-flight uploads + this file.
  const [pending] = await getDb()
    .select({ total: sql<number>`COALESCE(SUM(${nodes.sizeBytes}), 0)::bigint` })
    .from(nodes)
    .where(and(eq(nodes.tenantId, ctx.tenantId), eq(nodes.status, "uploading")));
  if (tenant.usedBytes + Number(pending.total) + input.size > tenant.quotaBytes) {
    throw new ApiError(
      413,
      "quota_exceeded",
      "Storage quota exceeded. Free up space or ask your administrator to increase your quota.",
    );
  }
  if (ctx.actor.role === "MEMBER") {
    const [cap] = await getDb()
      .select({ cap: users.storageCapBytes })
      .from(users)
      .where(eq(users.id, ctx.actor.id))
      .limit(1);
    if (cap?.cap !== null && cap?.cap !== undefined) {
      const [mine] = await getDb()
        .select({ total: sql<number>`COALESCE(SUM(${nodes.sizeBytes}), 0)::bigint` })
        .from(nodes)
        .where(
          and(
            eq(nodes.tenantId, ctx.tenantId),
            eq(nodes.ownerId, ctx.actor.id),
            eq(nodes.type, "file"),
            inArray(nodes.status, ["ready", "uploading"]),
          ),
        );
      if (Number(mine.total) + input.size > cap.cap)
        throw new ApiError(
          413,
          "member_quota_exceeded",
          "You have reached your personal storage limit. Ask your administrator to raise it.",
        );
    }
  }
  await assertNameFree(ctx.tenantId, input.parentId, input.name);

  const fileId = randomUUID();
  const key = objectKey(OBJECT_PREFIX, fileId);
  const uploadId = await getStorage().createMultipart(tenant.bucketName, key, input.contentType);
  const partSize = partSizeFor(input.size);
  const db = getDb();
  const [node] = await db
    .insert(nodes)
    .values({
      id: fileId,
      tenantId: ctx.tenantId,
      parentId: input.parentId,
      type: "file",
      name: input.name,
      ownerId: ctx.actor.id,
      sizeBytes: input.size,
      mime: input.contentType,
      s3Key: key,
      status: "uploading",
    })
    .returning();
  const [session] = await db
    .insert(uploadSessions)
    .values({
      nodeId: node.id,
      tenantId: ctx.tenantId,
      s3UploadId: uploadId,
      expectedSize: input.size,
      partSize,
      expiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
    })
    .returning();
  return {
    uploadSessionId: session.id,
    nodeId: node.id,
    partSize,
    partCount: Math.max(1, Math.ceil(input.size / partSize)),
  };
}

async function loadSession(ctx: Ctx, sessionId: string) {
  const [s] = await getDb()
    .select()
    .from(uploadSessions)
    .where(and(eq(uploadSessions.id, sessionId), eq(uploadSessions.tenantId, ctx.tenantId)))
    .limit(1);
  if (!s) throw notFound();
  const [node] = await getDb()
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, s.nodeId), eq(nodes.tenantId, ctx.tenantId)))
    .limit(1);
  if (!node || node.status !== "uploading") throw notFound();
  // Only the uploader (or someone still allowed to upload there) may continue the session.
  if (node.ownerId !== ctx.actor.id) await loadAuthorized(ctx, node.parentId!, "upload");
  if (s.expiresAt < new Date()) throw new ApiError(410, "upload_expired", "Upload session expired");
  return { s, node };
}

export async function signPart(ctx: Ctx, sessionId: string, partNumber: number) {
  await assertWritable(ctx.tenantId);
  const { s, node } = await loadSession(ctx, sessionId);
  const count = Math.max(1, Math.ceil(s.expectedSize / s.partSize));
  if (partNumber < 1 || partNumber > count) throw new ApiError(400, "invalid_part", `Part must be 1..${count}`);
  const tenant = await getTenant(ctx.tenantId);
  const url = await getStorage().presignUploadPart(
    tenant.bucketName,
    node.s3Key!,
    s.s3UploadId,
    partNumber,
    PRESIGN_SECONDS,
  );
  return { url, expiresInSeconds: PRESIGN_SECONDS };
}

export async function completeUpload(ctx: Ctx, sessionId: string, parts: { PartNumber: number; ETag: string }[]) {
  await assertWritable(ctx.tenantId);
  const { s, node } = await loadSession(ctx, sessionId);
  const tenant = await getTenant(ctx.tenantId);
  const storage = getStorage();
  const count = Math.max(1, Math.ceil(s.expectedSize / s.partSize));
  if (parts.length !== count) throw new ApiError(400, "invalid_parts", `Expected ${count} parts`);
  await storage.completeMultipart(tenant.bucketName, node.s3Key!, s.s3UploadId, parts);
  const head = await storage.headObject(tenant.bucketName, node.s3Key!);
  if (!head || head.size !== s.expectedSize) {
    await storage.deleteObject(tenant.bucketName, node.s3Key!).catch(() => {});
    await getDb().update(nodes).set({ status: "failed" }).where(eq(nodes.id, node.id));
    throw new ApiError(422, "size_mismatch", "Uploaded size did not match the declared size");
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).for("update");
    if (t.usedBytes + s.expectedSize > t.quotaBytes) {
      await storage.deleteObject(tenant.bucketName, node.s3Key!).catch(() => {});
      await tx.update(nodes).set({ status: "failed" }).where(eq(nodes.id, node.id));
      throw new ApiError(413, "quota_exceeded", "Storage quota exceeded");
    }
    await tx
      .update(tenants)
      .set({ usedBytes: sql`${tenants.usedBytes} + ${s.expectedSize}` })
      .where(eq(tenants.id, ctx.tenantId));
    await tx
      .update(nodes)
      .set({ status: "ready", etag: head.etag, updatedAt: new Date() })
      .where(eq(nodes.id, node.id));
    await tx.delete(uploadSessions).where(eq(uploadSessions.id, s.id));
  });
  await audit({
    actorId: ctx.actor.id,
    tenantId: ctx.tenantId,
    action: "file.upload",
    targetType: "file",
    targetId: node.id,
    metadata: { name: node.name, size: s.expectedSize },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return { nodeId: node.id };
}

export async function abortUpload(ctx: Ctx, sessionId: string) {
  const { s, node } = await loadSession(ctx, sessionId);
  const tenant = await getTenant(ctx.tenantId);
  await getStorage()
    .abortMultipart(tenant.bucketName, node.s3Key!, s.s3UploadId)
    .catch(() => {});
  await getDb()
    .delete(nodes)
    .where(and(eq(nodes.id, node.id), eq(nodes.tenantId, ctx.tenantId)));
}

// ---------- downloads ----------

export async function signDownload(ctx: Ctx, id: string, opts: { inline: boolean }) {
  const node = await loadAuthorized(ctx, id, "download");
  if (node.type !== "file" || node.status !== "ready") throw new ApiError(400, "not_a_file", "Not a downloadable file");
  const tenant = await getTenant(ctx.tenantId);
  const url = await getStorage().presignGet(tenant.bucketName, node.s3Key!, {
    expiresInSeconds: PRESIGN_SECONDS,
    inline: opts.inline,
    downloadFileName: opts.inline ? undefined : node.name,
    contentType: opts.inline ? (node.mime ?? undefined) : undefined,
  });
  await audit({
    actorId: ctx.actor.id,
    tenantId: ctx.tenantId,
    action: "file.download",
    targetType: "file",
    targetId: id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return { url, name: node.name, size: node.sizeBytes, mime: node.mime };
}

export async function listTrash(ctx: Ctx) {
  if (ctx.actor.role === "MEMBER") {
    return getDb()
      .select()
      .from(nodes)
      .where(and(eq(nodes.tenantId, ctx.tenantId), isNotNull(nodes.deletedAt), eq(nodes.deletedBy, ctx.actor.id)));
  }
  return getDb()
    .select()
    .from(nodes)
    .where(and(eq(nodes.tenantId, ctx.tenantId), isNotNull(nodes.deletedAt)));
}

void sharedFolderAccess;

/** Which actions the caller may take inside a folder (used to hide UI controls; the server still enforces). */
export async function permissionsIn(ctx: Ctx, folderId: string): Promise<Permission[]> {
  const pathIds = await pathIdsFor(ctx.tenantId, folderId);
  return PERMISSIONS.filter((p) => authorize(ctx.actor, p, { tenantId: ctx.tenantId, pathIds }).ok);
}
