import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { nodes, shareLinkVisits, shareLinks, tenants, users } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getStorage } from "@/lib/storage";
import { audit, hashIp } from "./audit";
import { assertWritable, type Ctx } from "./context";
import { ApiError, notFound } from "./errors";
import { loadAuthorized, pathIdsFor } from "./files";

const PUBLIC_PRESIGN_SECONDS = 90;
const UNLOCK_MINUTES = 30;

export type LinkRow = typeof shareLinks.$inferSelect;
export type LinkState = "ok" | "revoked" | "expired" | "limit_reached" | "unavailable";

// ---------- owner-side management ----------

export async function createLink(
  ctx: Ctx,
  nodeId: string,
  o: { password?: string; expiresAt?: Date | null; maxDownloads?: number | null; allowDownload: boolean },
) {
  await assertWritable(ctx.tenantId);
  const node = await loadAuthorized(ctx, nodeId, "share");
  if (node.status !== "ready") throw new ApiError(400, "not_ready", "That item is not ready to share");
  if (o.expiresAt && o.expiresAt <= new Date())
    throw new ApiError(400, "invalid_expiry", "Expiry must be in the future");
  const token = randomBytes(32).toString("base64url");
  const [row] = await getDb()
    .insert(shareLinks)
    .values({
      tenantId: ctx.tenantId,
      nodeId,
      token,
      createdBy: ctx.actor.id,
      passwordHash: o.password ? await hashPassword(o.password) : null,
      expiresAt: o.expiresAt ?? null,
      maxDownloads: o.maxDownloads ?? null,
      allowDownload: o.allowDownload,
    })
    .returning();
  await audit({
    actorId: ctx.actor.id,
    tenantId: ctx.tenantId,
    action: "share.create",
    targetType: node.type,
    targetId: nodeId,
    metadata: { linkId: row.id, password: Boolean(o.password), expires: o.expiresAt ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return toDto(row);
}

const toDto = (l: LinkRow) => ({
  id: l.id,
  nodeId: l.nodeId,
  url: `${getEnv().APP_URL}/s/${l.token}`,
  hasPassword: Boolean(l.passwordHash),
  expiresAt: l.expiresAt,
  maxDownloads: l.maxDownloads,
  downloadCount: l.downloadCount,
  allowDownload: l.allowDownload,
  revokedAt: l.revokedAt,
  createdBy: l.createdBy,
  createdAt: l.createdAt,
});

/** Links on one node (or every link in the tenant for admins). Members only see their own. */
export async function listLinks(ctx: Ctx, nodeId?: string) {
  if (nodeId) await loadAuthorized(ctx, nodeId, "view");
  const mine = ctx.actor.role === "MEMBER" ? eq(shareLinks.createdBy, ctx.actor.id) : undefined;
  const rows = await getDb()
    .select({ link: shareLinks, nodeName: nodes.name, nodeType: nodes.type, creator: users.email })
    .from(shareLinks)
    .innerJoin(nodes, eq(nodes.id, shareLinks.nodeId))
    .innerJoin(users, eq(users.id, shareLinks.createdBy))
    .where(and(eq(shareLinks.tenantId, ctx.tenantId), nodeId ? eq(shareLinks.nodeId, nodeId) : undefined, mine))
    .orderBy(desc(shareLinks.createdAt));
  return rows.map((r) => ({ ...toDto(r.link), nodeName: r.nodeName, nodeType: r.nodeType, creator: r.creator }));
}

async function ownLinkOrAdmin(ctx: Ctx, id: string) {
  const [l] = await getDb()
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.id, id), eq(shareLinks.tenantId, ctx.tenantId)))
    .limit(1);
  if (!l) throw notFound();
  if (ctx.actor.role === "MEMBER" && l.createdBy !== ctx.actor.id) throw notFound();
  return l;
}

export async function revokeLink(ctx: Ctx, id: string) {
  const l = await ownLinkOrAdmin(ctx, id);
  await getDb()
    .update(shareLinks)
    .set({ revokedAt: l.revokedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(shareLinks.id, id));
  await audit({
    actorId: ctx.actor.id,
    tenantId: ctx.tenantId,
    action: "share.revoke",
    targetType: "share_link",
    targetId: id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

export async function linkAnalytics(ctx: Ctx, id: string) {
  await ownLinkOrAdmin(ctx, id);
  const db = getDb();
  const [t] = await db
    .select({
      views: sql<number>`COUNT(*) FILTER (WHERE ${shareLinkVisits.action} = 'view')::int`,
      downloads: sql<number>`COUNT(*) FILTER (WHERE ${shareLinkVisits.action} = 'download')::int`,
      unique: sql<number>`COUNT(DISTINCT md5(COALESCE(${shareLinkVisits.ipHash}, '') || COALESCE(${shareLinkVisits.userAgent}, '')))::int`,
    })
    .from(shareLinkVisits)
    .where(eq(shareLinkVisits.linkId, id));
  const countries = await db
    .select({
      country: sql<string>`COALESCE(${shareLinkVisits.country}, 'Unknown')`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(shareLinkVisits)
    .where(eq(shareLinkVisits.linkId, id))
    .groupBy(sql`1`)
    .orderBy(desc(sql`2`));
  const timeline = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${shareLinkVisits.visitedAt}), 'YYYY-MM-DD')`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(shareLinkVisits)
    .where(eq(shareLinkVisits.linkId, id))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return { ...t, countries, timeline };
}

// ---------- public side ----------

export async function resolveLink(token: string) {
  const [link] = await getDb().select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  if (!link) return null;
  const [node] = await getDb()
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, link.nodeId), eq(nodes.tenantId, link.tenantId)))
    .limit(1);
  const [tenant] = await getDb()
    .select({ status: tenants.status, bucket: tenants.bucketName })
    .from(tenants)
    .where(eq(tenants.id, link.tenantId))
    .limit(1);
  let state: LinkState = "ok";
  if (!node || node.deletedAt || !tenant || tenant.status === "suspended" || tenant.status === "deleted")
    state = "unavailable";
  else if (link.revokedAt) state = "revoked";
  else if (link.expiresAt && link.expiresAt < new Date()) state = "expired";
  else if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) state = "limit_reached";
  return { link, node: node!, bucket: tenant?.bucket ?? "", state };
}

const sign = (linkId: string, exp: number) =>
  createHmac("sha256", getEnv().AUTH_SECRET).update(`share:${linkId}:${exp}`).digest("base64url");
export const unlockCookieName = (linkId: string) => `slk_${linkId.slice(0, 8)}`;

export function makeUnlockCookie(linkId: string) {
  const exp = Date.now() + UNLOCK_MINUTES * 60_000;
  return { name: unlockCookieName(linkId), value: `${exp}.${sign(linkId, exp)}`, maxAge: UNLOCK_MINUTES * 60 };
}

export function isUnlocked(link: LinkRow, cookieValue: string | undefined) {
  if (!link.passwordHash) return true;
  if (!cookieValue) return false;
  const [expStr, mac] = cookieValue.split(".");
  const exp = Number(expStr);
  if (!exp || exp < Date.now() || !mac) return false;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(link.id, exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function checkLinkPassword(link: LinkRow, password: string) {
  return link.passwordHash ? verifyPassword(link.passwordHash, password) : true;
}

export async function recordVisit(
  link: LinkRow,
  action: "view" | "download",
  req: { ip: string | null; userAgent: string | null; referrer: string | null; country: string | null },
) {
  await getDb()
    .insert(shareLinkVisits)
    .values({
      linkId: link.id,
      action,
      ipHash: hashIp(req.ip),
      userAgent: req.userAgent?.slice(0, 300),
      referrer: req.referrer?.slice(0, 300),
      country: req.country,
    });
}

/** The node a public request targets: the link's own node, or a descendant when the link is a folder. */
async function targetNode(link: LinkRow, nodeId: string | undefined) {
  if (!nodeId || nodeId === link.nodeId) {
    const [n] = await getDb()
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, link.nodeId), eq(nodes.tenantId, link.tenantId)))
      .limit(1);
    return n;
  }
  const [n] = await getDb()
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.tenantId, link.tenantId), isNull(nodes.deletedAt)))
    .limit(1);
  if (!n) return undefined;
  const path = await pathIdsFor(link.tenantId, n.id);
  return path.includes(link.nodeId) ? n : undefined; // must sit inside the shared folder
}

export async function publicChildren(link: LinkRow, folderId?: string) {
  const folder = await targetNode(link, folderId);
  if (!folder || folder.type !== "folder") throw notFound();
  return getDb()
    .select({ id: nodes.id, name: nodes.name, type: nodes.type, sizeBytes: nodes.sizeBytes, mime: nodes.mime })
    .from(nodes)
    .where(
      and(
        eq(nodes.tenantId, link.tenantId),
        eq(nodes.parentId, folder.id),
        isNull(nodes.deletedAt),
        eq(nodes.status, "ready"),
      ),
    )
    .orderBy(nodes.type, nodes.name);
}

/** Short-lived presigned GET. Downloads consume the download budget atomically; previews do not. */
export async function publicSignedUrl(
  link: LinkRow,
  bucket: string,
  nodeId: string | undefined,
  mode: "download" | "preview",
) {
  if (mode === "download" && !link.allowDownload)
    throw new ApiError(403, "view_only", "Downloads are disabled for this link");
  const n = await targetNode(link, nodeId);
  if (!n || n.type !== "file" || n.status !== "ready") throw notFound();
  if (mode === "download") {
    const [bumped] = await getDb()
      .update(shareLinks)
      .set({ downloadCount: sql`${shareLinks.downloadCount} + 1` })
      .where(
        and(
          eq(shareLinks.id, link.id),
          sql`(${shareLinks.maxDownloads} IS NULL OR ${shareLinks.downloadCount} < ${shareLinks.maxDownloads})`,
        ),
      )
      .returning({ id: shareLinks.id });
    if (!bumped) throw new ApiError(410, "limit_reached", "This link has reached its download limit");
  }
  const url = await getStorage().presignGet(bucket, n.s3Key!, {
    expiresInSeconds: PUBLIC_PRESIGN_SECONDS,
    inline: mode === "preview",
    downloadFileName: mode === "download" ? n.name : undefined,
    contentType: mode === "preview" ? (n.mime ?? undefined) : undefined,
  });
  return { url, name: n.name, size: n.sizeBytes, mime: n.mime };
}

void users;
