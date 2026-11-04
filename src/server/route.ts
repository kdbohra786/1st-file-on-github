import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth/config";
import { requireCtx, type Ctx } from "./context";
import { ApiError, forbidden, handle } from "./errors";

export interface AdminCtx {
  id: string;
  ip: string | null;
  userAgent: string | null;
}

/** Super Admin only. Role and status are re-read from the DB, never trusted from the token alone. */
export async function requireAdmin(req: Request): Promise<AdminCtx> {
  const session = await auth();
  if (!session?.user) throw new ApiError(401, "unauthenticated", "Sign in required");
  const [u] = await getDb()
    .select({ role: users.role, status: users.status, deleted: users.deletedAt, mcp: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!u || u.status !== "active" || u.deleted) throw new ApiError(401, "unauthenticated", "Account disabled");
  if (u.role !== "SUPER_ADMIN") throw forbidden();
  if (u.mcp) throw new ApiError(403, "password_change_required", "Change your temporary password first");
  return {
    id: session.user.id,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  };
}

/** Company admin only, scoped to the session's tenant. */
export async function requireCompanyAdmin(req: Request): Promise<Ctx> {
  const ctx = await requireCtx(req);
  if (ctx.actor.role !== "COMPANY_ADMIN") throw forbidden();
  return ctx;
}

type Params = Record<string, string>;
const wrap =
  <C, P extends Params>(guard: (req: Request) => Promise<C>, ok: number) =>
  (fn: (c: C, req: Request, p: P) => Promise<unknown>) =>
  async (req: Request, { params }: { params: Promise<P> }) => {
    try {
      const c = await guard(req);
      const out = await fn(c, req, await params);
      if (out instanceof Response) return out; // handlers may return a raw Response (e.g. CSV)
      return out === undefined ? new NextResponse(null, { status: 204 }) : NextResponse.json(out, { status: ok });
    } catch (e) {
      return handle(e);
    }
  };

export const adminRoute = <P extends Params = Params>(
  fn: (a: AdminCtx, req: Request, p: P) => Promise<unknown>,
  ok = 200,
) => wrap<AdminCtx, P>(requireAdmin, ok)(fn);
export const companyRoute = <P extends Params = Params>(
  fn: (c: Ctx, req: Request, p: P) => Promise<unknown>,
  ok = 200,
) => wrap<Ctx, P>(requireCompanyAdmin, ok)(fn);
