import { z } from "zod";
import { adminRoute } from "@/server/route";
import { createAccount, listTenants } from "@/server/admin";

export const dynamic = "force-dynamic";

export const GET = adminRoute(async (_a, req) => {
  const p = new URL(req.url).searchParams;
  return listTenants({
    type: p.get("type") ?? undefined,
    status: p.get("status") ?? undefined,
    search: p.get("q") ?? undefined,
    plan: p.get("plan") ?? undefined,
  });
});

export const POST = adminRoute(async (a, req) => {
  const b = z
    .object({
      type: z.enum(["company", "individual"]),
      name: z.string().trim().min(1).max(120),
      planName: z.string().min(1),
      adminEmail: z.string().trim().email(),
      adminName: z.string().trim().min(1).max(100),
      planExpiresAt: z.string().datetime().nullable().optional(),
    })
    .parse(await req.json());
  return createAccount(a, { ...b, planExpiresAt: b.planExpiresAt ? new Date(b.planExpiresAt) : null });
}, 201);
