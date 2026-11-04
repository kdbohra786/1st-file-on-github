import { z } from "zod";
import { adminRoute } from "@/server/route";
import { listPlans, upsertPlan } from "@/server/admin";

export const dynamic = "force-dynamic";
const planSchema = z.object({
  name: z.string().trim().min(1).max(60),
  quotaBytes: z.number().int().min(0),
  maxUsers: z.number().int().min(1),
  maxFileBytes: z.number().int().min(1),
  priceLabel: z.string().max(60).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const GET = adminRoute(async () => ({ items: await listPlans() }));
export const POST = adminRoute(async (a, req) => upsertPlan(a, null, planSchema.parse(await req.json())), 201);
