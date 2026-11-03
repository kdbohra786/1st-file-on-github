import type { Permission } from "./permissions";

export type Role = "SUPER_ADMIN" | "COMPANY_ADMIN" | "MEMBER" | "INDIVIDUAL";

export interface Actor {
  id: string;
  role: Role;
  tenantId: string | null;
  /** MEMBER only: id of the member's home folder and the flags on it. */
  homeFolderId?: string | null;
  homeFlags?: readonly Permission[];
  /** MEMBER only: grants on company shared folders (shared root node id -> permissions). */
  sharedGrants?: Readonly<Record<string, readonly Permission[]>>;
}

export interface NodeRef {
  tenantId: string;
  /** Ids from the tenant root down to and including the node itself. */
  pathIds: readonly string[];
}

export type Decision = { ok: true } | { ok: false; reason: "tenant" | "forbidden" };

/**
 * The single authorization decision point. `tenant` mismatch should be surfaced as 404 (no existence leak),
 * `forbidden` as 403. Suspension/read-only state is checked separately by the caller.
 */
export function authorize(actor: Actor, action: Permission, node: NodeRef): Decision {
  if (actor.role === "SUPER_ADMIN") return { ok: true };
  if (!actor.tenantId || actor.tenantId !== node.tenantId) return { ok: false, reason: "tenant" };
  if (actor.role === "COMPANY_ADMIN" || actor.role === "INDIVIDUAL") return { ok: true };

  // MEMBER: home folder flags, or an explicit grant on a shared folder that is an ancestor of the node.
  if (actor.homeFolderId && node.pathIds.includes(actor.homeFolderId) && actor.homeFlags?.includes(action)) {
    return { ok: true };
  }
  for (const [rootId, perms] of Object.entries(actor.sharedGrants ?? {})) {
    if (node.pathIds.includes(rootId) && perms.includes(action)) return { ok: true };
  }
  return { ok: false, reason: "forbidden" };
}
