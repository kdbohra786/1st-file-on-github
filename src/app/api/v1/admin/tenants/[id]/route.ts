import { z } from "zod";
import { adminRoute } from "@/server/route";
import { deleteTenant, getTenantDetail, updateTenant } from "@/server/admin";

export const dynamic = "force-dynamic";
type P = { id: string };
const id = (p: P) => z.string().uuid().parse(p.id);

export const GET = adminRoute<P>(async (_a, _r, p) => getTenantDetail(id(p)));

export const PATCH = adminRoute<P>(async (a, req, p) => {
  const b = z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      status: z.enum(["active", "suspended", "read_only"]).optional(),
      quotaBytes: z.number().int().min(0).optional(),
      planName: z.string().optional(),
      applyPlan: z.boolean().optional(),
      planExpiresAt: z.string().datetime().nullable().optional(),
      maxUsers: z.number().int().min(1).max(100000).optional(),
    })
    .parse(await req.json());
  return updateTenant(a, id(p), {
    ...b,
    planExpiresAt: b.planExpiresAt === undefined ? undefined : b.planExpiresAt ? new Date(b.planExpiresAt) : null,
  });
});

export const DELETE = adminRoute<P>(async (a, _r, p) => deleteTenant(a, id(p)));
