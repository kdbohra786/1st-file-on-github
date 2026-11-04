import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { memberPermissions, nodes, sharedFolderAccess, tenants, users } from "@/db/schema";
import { auth } from "@/lib/auth/config";
import type { Actor } from "@/lib/authorize";
import type { Permission } from "@/lib/permissions";
import { ApiError } from "./errors";

export interface Ctx {
  actor: Actor;
  tenantId: string;
  ip: string | null;
  userAgent: string | null;
}

/** Builds the actor from the session + DB (never from request input). Throws 401 when signed out. */
export async function requireCtx(req: Request): Promise<Ctx> {
  const session = await auth();
  if (!session?.user) throw new ApiError(401, "unauthenticated", "Sign in required");
  const { id, role, tenantId } = session.user;
  const db = getDb();
  const [u] = await db
    .select({ status: users.status, deleted: users.deletedAt, mcp: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!u || u.status !== "active" || u.deleted) throw new ApiError(401, "unauthenticated", "Account disabled");
  if (u.mcp) throw new ApiError(403, "password_change_required", "Change your temporary password first");
  if (!tenantId) throw new ApiError(403, "forbidden", "No storage tenant for this account");

  const actor: Actor = { id, role, tenantId };
  if (role === "MEMBER") {
    const [mp] = await db.select().from(memberPermissions).where(eq(memberPermissions.userId, id)).limit(1);
    const [home] = await db
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(eq(nodes.tenantId, tenantId), eq(nodes.ownerId, id), isNull(nodes.parentId), eq(nodes.type, "folder")))
      .limit(1);
    const grants = await db.select().from(sharedFolderAccess).where(eq(sharedFolderAccess.userId, id));
    actor.homeFolderId = home?.id ?? null;
    actor.homeFlags = (mp?.scope === "shared" ? [] : (mp?.flags ?? [])) as Permission[];
    actor.sharedGrants = Object.fromEntries(grants.map((g) => [g.nodeId, g.permissions as Permission[]]));
  }
  return {
    actor,
    tenantId,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  };
}

/** Writes are refused for read-only tenants and expired plans. */
export async function assertWritable(tenantId: string) {
  const [t] = await getDb()
    .select({ status: tenants.status, exp: tenants.planExpiresAt })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!t || t.status === "deleted" || t.status === "suspended")
    throw new ApiError(403, "tenant_suspended", "This account is suspended");
  if (t.status === "read_only" || (t.exp && t.exp < new Date())) {
    throw new ApiError(403, "read_only", "This account is read-only (plan expired). Contact your administrator.");
  }
}
