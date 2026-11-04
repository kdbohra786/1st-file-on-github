import { z } from "zod";
import { adminRoute } from "@/server/route";
import { upsertPlan } from "@/server/admin";

export const dynamic = "force-dynamic";

export const PUT = adminRoute<{ id: string }>(async (a, req, p) => {
  const b = z
    .object({
      name: z.string().trim().min(1).max(60),
      quotaBytes: z.number().int().min(0),
      maxUsers: z.number().int().min(1),
      maxFileBytes: z.number().int().min(1),
      priceLabel: z.string().max(60).nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .parse(await req.json());
  return upsertPlan(a, z.string().uuid().parse(p.id), b);
});
