import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";

export const hashIp = (ip: string | null | undefined) =>
  ip ? createHash("sha256").update(`${process.env.AUTH_SECRET}:${ip}`).digest("hex").slice(0, 32) : null;

export async function audit(e: {
  actorId?: string | null;
  tenantId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}) {
  await getDb()
    .insert(auditLogs)
    .values({
      actorId: e.actorId ?? null,
      tenantId: e.tenantId ?? null,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      metadata: e.metadata ?? {},
      ipHash: hashIp(e.ip),
      userAgent: e.userAgent ?? null,
    });
}
