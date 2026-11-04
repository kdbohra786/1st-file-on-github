import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";
import { requireCtx } from "@/server/context";
import { handle } from "@/server/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(req);
    const [t] = await getDb()
      .select({ used: tenants.usedBytes, quota: tenants.quotaBytes, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId));
    return NextResponse.json({
      usedBytes: t.used,
      quotaBytes: t.quota,
      name: t.name,
      percent: t.quota ? Math.round((t.used / t.quota) * 1000) / 10 : 0,
    });
  } catch (e) {
    return handle(e);
  }
}
